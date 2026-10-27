import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  isAdminEmail,
  TOKEN_PRICING,
  TOP_UP_TIERS,
  TokenTopUpTierId,
  computeRemainingSettlementTokens,
} from "./shared/tokenEconomy";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // Ignore if already configured
}

export interface CallerIdentity {
  uid: string;
  email: string;
  isAdmin: boolean;
}

export function requireAuthenticatedCaller(request: CallableRequest<any>): CallerIdentity {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Please sign in to continue.");
  }
  const uid = request.auth.uid;
  const email = typeof request.auth.token?.email === "string" ? request.auth.token.email : "";
  return {
    uid,
    email,
    isAdmin: isAdminEmail(email),
  };
}

function getSessionExpiry(): Timestamp {
  return Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
}

/**
 * Simulated Stripe Checkout Top-Up Callable (£5=50T, £10=100T, £15=150T).
 * Credits users/{uid}.tokenBalance atomically and writes an immutable receipt.
 */
export const simulateStripeTopUpCallable = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const tierId = request.data?.tierId as TokenTopUpTierId | undefined;

    if (!tierId || !(tierId in TOP_UP_TIERS)) {
      throw new HttpsError("invalid-argument", "Invalid top-up tier selected.");
    }

    const tier = TOP_UP_TIERS[tierId];
    const userRef = db.collection("users").doc(caller.uid);
    const txRef = userRef.collection("tokenTransactions").doc();

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.exists ? userSnap.data() || {} : {};

      const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
      const prevPurchased = Math.max(0, Math.floor(Number(userData.lifetimeTokensPurchased) || 0));
      const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
      const newBalance = prevBalance + tier.tokens;

      tx.set(
        userRef,
        {
          ...(caller.email ? { email: userData.email || caller.email } : {}),
          tokenBalance: newBalance,
          lifetimeTokensPurchased: prevPurchased + tier.tokens,
          lifetimeTokensSpent: prevSpent,
          lastTopUpAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(!userSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        },
        { merge: true }
      );

      tx.set(txRef, {
        id: txRef.id,
        uid: caller.uid,
        type: "topup_simulated",
        delta: tier.tokens,
        balanceAfter: newBalance,
        amountGbp: tier.amountGbp,
        tierId: tier.id,
        description: `Stripe Checkout Simulation — ${tier.priceDisplay} Top-Up (${tier.tokens} Tokens)`,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        tokenBalance: newBalance,
        addedTokens: tier.tokens,
        tierId: tier.id,
      };
    });

    return {
      success: true,
      ...result,
    };
  }
);

/**
 * Atomic 1-Token Non-Refundable Pre-Flight / Escape-Hatch Lookup Debit.
 * - Initial Pre-Flight ('initial_preflight'): Charges 1 Token ONCE across up to 3 uncached seeds in the batch.
 * - Escape Hatch ('escape_hatch'): Charges 1 Token per manual 'Not this artist?' Flash re-query.
 * - Admin (zcene.online@gmail.com): Bypasses all deductions (0 Tokens).
 */
export async function chargePreFlightLookupIfNeeded(params: {
  caller: CallerIdentity;
  curationSessionId?: string;
  mode?: "initial_preflight" | "escape_hatch";
  expectedProjectCost?: number;
  seedLabel: string;
}): Promise<{ charged: number; tokenBalance: number | null; curationSessionId: string }> {
  const { caller, seedLabel } = params;
  const mode = params.mode === "escape_hatch" ? "escape_hatch" : "initial_preflight";
  const expectedProjectCost: 5 | 10 = params.expectedProjectCost === 10 ? 10 : 5;
  const sessionId =
    typeof params.curationSessionId === "string" && params.curationSessionId.trim().length > 0
      ? params.curationSessionId.trim()
      : db.collection("curationSessions").doc().id;

  if (caller.isAdmin) {
    return { charged: 0, tokenBalance: null, curationSessionId: sessionId };
  }

  const userRef = db.collection("users").doc(caller.uid);
  const sessionRef = db.collection("curationSessions").doc(sessionId);
  const txRef = userRef.collection("tokenTransactions").doc();

  const txResult = await db.runTransaction(async (tx) => {
    const [userSnap, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
    const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));

    if (sessionSnap.exists) {
      const sData = sessionSnap.data() || {};
      if (sData.uid && sData.uid !== caller.uid) {
        throw new HttpsError("permission-denied", "Curation session belongs to another user.");
      }
      if (sData.status && sData.status !== "preflight") {
        throw new HttpsError("failed-precondition", "Curation session has already been settled.");
      }

      // Multi-seed batch protection: up to 3 initial pre-flight seed lookups share the single 1-Token pre-flight fee.
      if (mode === "initial_preflight" && sData.initialPreFlightCharged === true) {
        const callsUsed = Math.max(1, Math.floor(Number(sData.initialPreFlightCallsUsed) || 1));
        if (callsUsed < 3) {
          tx.update(sessionRef, {
            initialPreFlightCallsUsed: callsUsed + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { charged: 0, tokenBalance: currentBalance };
        }
      }
    }

    const fee = TOKEN_PRICING.PREFLIGHT_FLASH_FEE;
    const minRequired =
      mode === "initial_preflight" && !sessionSnap.exists ? expectedProjectCost : fee;

    if (currentBalance < minRequired) {
      throw new HttpsError(
        "failed-precondition",
        `INSUFFICIENT_TOKENS: Requires ${minRequired} Tokens, available ${currentBalance} Tokens.`
      );
    }

    const newBalance = currentBalance - fee;
    const prevSessionData = sessionSnap.exists ? sessionSnap.data() || {} : {};
    const prevPreFlightDeducted = Math.max(0, Math.floor(Number(prevSessionData.preFlightTokensDeducted) || 0));
    const prevEscapeCalls = Math.max(0, Math.floor(Number(prevSessionData.escapeHatchCallsUsed) || 0));
    const prevInitialCalls = Math.max(0, Math.floor(Number(prevSessionData.initialPreFlightCallsUsed) || 0));

    tx.set(
      userRef,
      {
        ...(caller.email ? { email: userData.email || caller.email } : {}),
        tokenBalance: newBalance,
        lifetimeTokensSpent: prevSpent + fee,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      sessionRef,
      {
        sessionId,
        uid: caller.uid,
        expectedProjectCost,
        initialPreFlightCharged:
          mode === "initial_preflight" ? true : Boolean(prevSessionData.initialPreFlightCharged),
        initialPreFlightCallsUsed:
          mode === "initial_preflight" ? prevInitialCalls + 1 : prevInitialCalls,
        escapeHatchCallsUsed:
          mode === "escape_hatch" ? prevEscapeCalls + 1 : prevEscapeCalls,
        preFlightTokensDeducted: prevPreFlightDeducted + fee,
        creditablePreFlightTokens: 1,
        settlementTokensDeducted: 0,
        status: "preflight",
        ...(!sessionSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: getSessionExpiry(),
      },
      { merge: true }
    );

    tx.set(txRef, {
      id: txRef.id,
      uid: caller.uid,
      type: "spend_preflight_lookup",
      delta: -fee,
      balanceAfter: newBalance,
      curationSessionId: sessionId,
      description:
        mode === "escape_hatch"
          ? `Artist Re-Query Lookup: ${seedLabel}`
          : `Artist Lookup (Pre-Flight): ${seedLabel}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { charged: fee, tokenBalance: newBalance };
  });

  return {
    ...txResult,
    curationSessionId: sessionId,
  };
}

/**
 * Shared Split-Debit Settlement Helper used by both authorizeDirectHitCallable (Column 1 Direct Hit)
 * and executeCurationPipeline (Column 2 Live Synthesis).
 */
export async function settleCurationProjectTokens(params: {
  caller: CallerIdentity;
  curationSessionId?: string;
  totalProjectCost: 5 | 10;
  projectId?: string;
  txType: "spend_direct_hit" | "spend_live_synthesis";
  description: string;
  generationTypeToStamp?: string;
}): Promise<{
  tokensSpent: number;
  creditablePreFlight: number;
  settlementCharged: number;
  tokenBalance: number | null;
  curationSessionId: string;
}> {
  const { caller, totalProjectCost, projectId, txType, description, generationTypeToStamp } = params;
  const sessionId =
    typeof params.curationSessionId === "string" && params.curationSessionId.trim().length > 0
      ? params.curationSessionId.trim()
      : db.collection("curationSessions").doc().id;

  if (caller.isAdmin) {
    if (projectId) {
      const projectRef = db.collection("users").doc(caller.uid).collection("projects").doc(projectId);
      await projectRef.set(
        {
          tokensSpent: 0,
          ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    return {
      tokensSpent: 0,
      creditablePreFlight: 0,
      settlementCharged: 0,
      tokenBalance: null,
      curationSessionId: sessionId,
    };
  }

  const userRef = db.collection("users").doc(caller.uid);
  const sessionRef = db.collection("curationSessions").doc(sessionId);
  const txRef = userRef.collection("tokenTransactions").doc();
  const projectRef = projectId
    ? db.collection("users").doc(caller.uid).collection("projects").doc(projectId)
    : null;

  return await db.runTransaction(async (tx) => {
    const [userSnap, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
    const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));

    let preFlightTokensDeducted = 0;
    if (sessionSnap.exists) {
      const sData = sessionSnap.data() || {};
      if (sData.uid && sData.uid !== caller.uid) {
        throw new HttpsError("permission-denied", "Curation session belongs to another user.");
      }
      // Idempotency guard if retried for the exact same project
      if (sData.status === "settled" && projectId && sData.projectId === projectId) {
        return {
          tokensSpent: totalProjectCost,
          creditablePreFlight: Math.min(1, Number(sData.preFlightTokensDeducted) || 0),
          settlementCharged: Number(sData.settlementTokensDeducted) || 0,
          tokenBalance: currentBalance,
          curationSessionId: sessionId,
        };
      }
      if (sData.status && sData.status !== "preflight") {
        throw new HttpsError("failed-precondition", "Curation session has already been consumed.");
      }
      preFlightTokensDeducted = Math.max(0, Math.floor(Number(sData.preFlightTokensDeducted) || 0));
    }

    const { creditablePreFlight, remainingSettlement } = computeRemainingSettlementTokens(
      totalProjectCost,
      preFlightTokensDeducted
    );

    if (currentBalance < remainingSettlement) {
      throw new HttpsError(
        "failed-precondition",
        `INSUFFICIENT_TOKENS: Requires ${remainingSettlement} remaining Tokens (${totalProjectCost} total), available ${currentBalance} Tokens.`
      );
    }

    const newBalance = currentBalance - remainingSettlement;
    const totalActualTokensForProject = totalProjectCost + Math.max(0, preFlightTokensDeducted - creditablePreFlight);

    tx.set(
      userRef,
      {
        ...(caller.email ? { email: userData.email || caller.email } : {}),
        tokenBalance: newBalance,
        lifetimeTokensSpent: prevSpent + remainingSettlement,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      sessionRef,
      {
        sessionId,
        uid: caller.uid,
        expectedProjectCost: totalProjectCost,
        preFlightTokensDeducted,
        creditablePreFlightTokens: creditablePreFlight,
        settlementTokensDeducted: remainingSettlement,
        status: "settled",
        ...(projectId ? { projectId } : {}),
        ...(!sessionSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: getSessionExpiry(),
      },
      { merge: true }
    );

    if (remainingSettlement > 0) {
      tx.set(txRef, {
        id: txRef.id,
        uid: caller.uid,
        type: txType,
        delta: -remainingSettlement,
        balanceAfter: newBalance,
        ...(projectId ? { projectId } : {}),
        curationSessionId: sessionId,
        description:
          creditablePreFlight > 0
            ? `${description} (${remainingSettlement}T balance after 1T pre-flight)`
            : `${description} (${remainingSettlement}T)`,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (projectRef) {
      tx.set(
        projectRef,
        {
          tokensSpent: totalActualTokensForProject,
          ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      tokensSpent: totalActualTokensForProject,
      creditablePreFlight,
      settlementCharged: remainingSettlement,
      tokenBalance: newBalance,
      curationSessionId: sessionId,
    };
  });
}

/**
 * Refunds ONLY settlementTokensDeducted (4T/5T/9T/10T) if Column 2 or Column 3 crashes fatally.
 * Preserves the non-refundable 1-Token Pre-Flight Flash Lookup Fee.
 */
export async function refundProjectSettlementOnError(params: {
  uid: string;
  projectId?: string;
  curationSessionId?: string;
  reason?: string;
}): Promise<void> {
  const { uid, projectId, curationSessionId, reason } = params;
  if (!uid || !curationSessionId) return;

  const userRef = db.collection("users").doc(uid);
  const sessionRef = db.collection("curationSessions").doc(curationSessionId);
  const txRef = userRef.collection("tokenTransactions").doc();
  const projectRef = projectId
    ? db.collection("users").doc(uid).collection("projects").doc(projectId)
    : null;

  try {
    await db.runTransaction(async (tx) => {
      const [userSnap, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
      if (!sessionSnap.exists) return;

      const sData = sessionSnap.data() || {};
      if (sData.uid !== uid || sData.status !== "settled") return;

      const refundAmount = Math.max(0, Math.floor(Number(sData.settlementTokensDeducted) || 0));
      const retainedPreFlight = Math.max(0, Math.floor(Number(sData.preFlightTokensDeducted) || 0));

      tx.update(sessionRef, {
        status: "refunded_settlement",
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (refundAmount > 0 && userSnap.exists) {
        const userData = userSnap.data() || {};
        const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
        const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
        const newBalance = prevBalance + refundAmount;

        tx.update(userRef, {
          tokenBalance: newBalance,
          lifetimeTokensSpent: Math.max(0, prevSpent - refundAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(txRef, {
          id: txRef.id,
          uid,
          type: "refund_pipeline_error",
          delta: refundAmount,
          balanceAfter: newBalance,
          ...(projectId ? { projectId } : {}),
          curationSessionId,
          description: `Automatic Refund (Synthesis Error${reason ? `: ${reason}` : ""})`,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      if (projectRef) {
        tx.set(
          projectRef,
          {
            tokensSpent: retainedPreFlight,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });
  } catch (err) {
    console.error(`[TokenWallet] Failed to refund settlement for session ${curationSessionId}:`, err);
  }
}

/**
 * Column 1 Direct Hit Settlement Callable (Rule 20 & Rule 43).
 * Settles -5 Tokens on pure cached Direct Hits, or -4 Tokens remainder on Post-Validation Cache Intercept hits.
 */
export const authorizeDirectHitCallable = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const { projectId, seedArtistId, projectName, curationSessionId } = request.data || {};

    if (!seedArtistId && !projectName) {
      throw new HttpsError("invalid-argument", "Missing Direct Hit artist identifier.");
    }

    const label = (projectName || seedArtistId || "Zcene").toString().trim();
    const settlement = await settleCurationProjectTokens({
      caller,
      curationSessionId,
      totalProjectCost: TOKEN_PRICING.SINGLE_SEED,
      projectId: typeof projectId === "string" && projectId.trim() ? projectId.trim() : undefined,
      txType: "spend_direct_hit",
      description: `Zcene Curation: ${label}`,
      generationTypeToStamp: "Direct Hit",
    });

    return {
      success: true,
      ...settlement,
    };
  }
);

/**
 * Deep Connections (3-Message Grounded Consult) Unlock Callable (-3 Tokens).
 * Mints a server-verified deepWebSessions/{sessionId} lease with remainingMessages: 3.
 */
export const unlockDeepWebSessionCallable = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const { projectId, nodeId, nodeName } = request.data || {};

    if (!nodeId || typeof nodeId !== "string") {
      throw new HttpsError("invalid-argument", "Missing nodeId for Deep Connections session.");
    }

    const sessionRef = db.collection("deepWebSessions").doc();
    const cleanProjectId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
    const displayLabel = (nodeName || nodeId).toString().trim();

    if (caller.isAdmin) {
      await sessionRef.set({
        sessionId: sessionRef.id,
        uid: caller.uid,
        isAdmin: true,
        projectId: cleanProjectId,
        nodeId,
        remainingMessages: 3,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: getSessionExpiry(),
      });
      return {
        success: true,
        sessionId: sessionRef.id,
        remainingMessages: 3,
        tokenBalance: null,
      };
    }

    const cost = TOKEN_PRICING.DEEP_WEB_CONSULT;
    const userRef = db.collection("users").doc(caller.uid);
    const txRef = userRef.collection("tokenTransactions").doc();
    const projectRef = cleanProjectId
      ? db.collection("users").doc(caller.uid).collection("projects").doc(cleanProjectId)
      : null;

    const result = await db.runTransaction(async (tx) => {
      const [userSnap, projectSnap] = await Promise.all([
        tx.get(userRef),
        projectRef ? tx.get(projectRef) : Promise.resolve(null),
      ]);

      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
      const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));

      if (currentBalance < cost) {
        throw new HttpsError(
          "failed-precondition",
          `INSUFFICIENT_TOKENS: Deep Connections requires ${cost} Tokens, available ${currentBalance} Tokens.`
        );
      }

      const newBalance = currentBalance - cost;

      tx.set(
        userRef,
        {
          ...(caller.email ? { email: userData.email || caller.email } : {}),
          tokenBalance: newBalance,
          lifetimeTokensSpent: prevSpent + cost,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(sessionRef, {
        sessionId: sessionRef.id,
        uid: caller.uid,
        isAdmin: false,
        projectId: cleanProjectId,
        nodeId,
        remainingMessages: 3,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: getSessionExpiry(),
      });

      tx.set(txRef, {
        id: txRef.id,
        uid: caller.uid,
        type: "spend_deep_web",
        delta: -cost,
        balanceAfter: newBalance,
        ...(cleanProjectId ? { projectId: cleanProjectId } : {}),
        description: `Deep Connections (3 Messages): ${displayLabel}`,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (projectRef && projectSnap && projectSnap.exists) {
        const prevProjectSpent = Math.max(0, Math.floor(Number(projectSnap.data()?.tokensSpent) || 0));
        tx.set(
          projectRef,
          {
            tokensSpent: prevProjectSpent + cost,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        sessionId: sessionRef.id,
        remainingMessages: 3,
        tokenBalance: newBalance,
      };
    });

    return {
      success: true,
      ...result,
    };
  }
);

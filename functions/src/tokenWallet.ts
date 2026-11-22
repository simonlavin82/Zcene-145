import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  isAdminUser,
  TOKEN_PRICING,
  TOP_UP_TIERS,
  TokenTopUpTierId,
  TOKEN_UNIT_GBP,
  MIN_TOP_UP_TOKENS,
  MAX_TOP_UP_TOKENS,
  ADMIN_GRANT_MAX_TOKENS,
  formatGbpFromTokens,
  computeRemainingSettlementTokens,
  computeBaseProjectTokenCost,
} from "./shared/tokenEconomy";
import {
  compactDetailsCacheToCanonical,
  parseProjectScenes,
  toSeedArtistsArray,
} from "./shared/multiSceneUtils";
import {
  hasActiveDiscoveryFilters,
  sanitizeDiscoveryFilters,
} from "./services/cacheQualification";

export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";
export const STALE_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes (> 540s Cloud Function hard ceiling)

export interface CurationLockData {
  uid: string;
  projectId?: string | null;
  jobId?: string | null;
  curationSessionId: string;
  status: "active";
  acquiredAt?: any;
  updatedAt?: any;
  expiresAt: Timestamp | { toMillis?: () => number; seconds?: number } | number;
}

export function getTimestampMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  return 0;
}

export function isCurationLockActive(lockData: any, nowMs: number = Date.now()): boolean {
  if (!lockData || lockData.status !== "active") return false;
  const expiresMs = getTimestampMillis(lockData.expiresAt);
  return expiresMs > nowMs;
}

export function computeUncompletedScenesRefundCost(params: {
  scenes?: any[];
  targetSceneId?: string;
  fallbackArtists?: string[];
  fallbackFilters?: any;
}): number | undefined {
  const scenes = Array.isArray(params.scenes) ? params.scenes : [];
  const hasCompletedScenes = scenes.some(
    (s: any) => s?.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0
  );
  if (!hasCompletedScenes) {
    return undefined;
  }

  const uncompletedScenes = scenes.filter(
    (s: any) => !(s?.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0)
  );

  const targetIncluded =
    !params.targetSceneId ||
    uncompletedScenes.some((s: any) => (s.sceneId || s.id) === params.targetSceneId);

  let totalCost = 0;
  for (const sc of uncompletedScenes) {
    const scSeeds = toSeedArtistsArray(sc?.seedArtists);
    const scFilters = sanitizeDiscoveryFilters(sc?.discoveryFilters);
    totalCost += computeBaseProjectTokenCost(
      scSeeds.length || 1,
      hasActiveDiscoveryFilters(scFilters)
    );
  }

  if (!targetIncluded) {
    const fallbackCount = (params.fallbackArtists || []).filter(Boolean).length || 1;
    const fallbackFilters = sanitizeDiscoveryFilters(params.fallbackFilters);
    totalCost += computeBaseProjectTokenCost(
      fallbackCount,
      hasActiveDiscoveryFilters(fallbackFilters)
    );
  }

  return totalCost > 0 ? totalCost : undefined;
}

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
    isAdmin: isAdminUser(uid, email),
  };
}

function getSessionExpiry(): Timestamp {
  return Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
}

/**
 * Core handler for Admin Token Grant Tool (Phase 2).
 * Verifies caller.isAdmin, resolves target user via Firebase Admin Auth getUserByEmail,
 * atomically increments tokenBalance (without touching lifetimeTokensPurchased),
 * and writes an immutable 'admin_grant' audit receipt to users/{targetUid}/tokenTransactions.
 */
export async function executeAdminGrantTokens(
  caller: CallerIdentity,
  data: { email?: unknown; amount?: unknown; reason?: unknown } | undefined
): Promise<{
  success: true;
  targetUid: string;
  targetEmail: string;
  amount: number;
  tokenBalance: number;
  reason: string;
  grantedBy: string;
  transactionId: string;
}> {
  if (!caller.isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required to grant tokens.");
  }

  const rawEmail = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!rawEmail || !rawEmail.includes("@") || rawEmail.length > 256) {
    throw new HttpsError("invalid-argument", "Please provide a valid recipient email address.");
  }

  const parsedAmount = Number(data?.amount);
  if (
    !Number.isFinite(parsedAmount) ||
    !Number.isInteger(parsedAmount) ||
    parsedAmount < 1 ||
    parsedAmount > ADMIN_GRANT_MAX_TOKENS
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Token amount must be a whole integer between 1 and ${ADMIN_GRANT_MAX_TOKENS}.`
    );
  }

  const rawReason = typeof data?.reason === "string" ? data.reason.trim() : "";
  if (rawReason.length > 200) {
    throw new HttpsError("invalid-argument", "Reason note must be 200 characters or fewer.");
  }
  const cleanReason = rawReason || "Goodwill credit";

  let targetUserRecord;
  try {
    targetUserRecord = await getAuth().getUserByEmail(rawEmail);
  } catch (authErr: any) {
    if (authErr?.code === "auth/user-not-found" || String(authErr?.message || "").includes("user-not-found")) {
      throw new HttpsError("not-found", `No Zcene account found for ${rawEmail}.`);
    }
    throw new HttpsError("internal", authErr?.message || "Failed to look up target user.");
  }

  const targetUid = targetUserRecord.uid;
  const targetEmail = (targetUserRecord.email || rawEmail).trim();
  const userRef = db.collection("users").doc(targetUid);
  const txRef = userRef.collection("tokenTransactions").doc();

  const txResult = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
    const newBalance = prevBalance + parsedAmount;

    tx.set(
      userRef,
      {
        email: userData.email || targetEmail,
        tokenBalance: FieldValue.increment(parsedAmount),
        updatedAt: FieldValue.serverTimestamp(),
        ...(!userSnap.exists
          ? {
              createdAt: FieldValue.serverTimestamp(),
              lifetimeTokensPurchased: 0,
              lifetimeTokensSpent: 0,
            }
          : {}),
      },
      { merge: true }
    );

    tx.set(txRef, {
      id: txRef.id,
      uid: targetUid,
      type: "admin_grant",
      amount: parsedAmount,
      delta: parsedAmount,
      balanceAfter: newBalance,
      reason: cleanReason,
      description: `Admin Grant: ${cleanReason}`,
      grantedBy: caller.email,
      grantedByUid: caller.uid,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      tokenBalance: newBalance,
      transactionId: txRef.id,
    };
  });

  return {
    success: true,
    targetUid,
    targetEmail,
    amount: parsedAmount,
    tokenBalance: txResult.tokenBalance,
    reason: cleanReason,
    grantedBy: caller.email,
    transactionId: txResult.transactionId,
  };
}

/**
 * Admin Token Grant Callable (Phase 2).
 */
export const adminGrantTokens = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    return executeAdminGrantTokens(caller, request.data);
  }
);

/**
 * Core handler for Simulated Stripe Checkout Top-Up (Phase 2 Flexible Quantity + Legacy Tier Compat).
 * Strictly gated behind caller.isAdmin && process.env.ALLOW_SIMULATED_TOPUP === "true".
 */
export async function executeSimulatedStripeTopUp(
  caller: CallerIdentity,
  data: { quantity?: unknown; tierId?: TokenTopUpTierId; waiverAccepted?: unknown } | undefined
): Promise<{
  success: true;
  mode: "simulated";
  tokenBalance: number;
  addedTokens: number;
  quantity: number;
  amountGbp: number;
  currency: "GBP";
  tierId?: TokenTopUpTierId;
}> {
  if (!caller.isAdmin || process.env.ALLOW_SIMULATED_TOPUP !== "true") {
    throw new HttpsError(
      "permission-denied",
      "Simulated token top-ups are disabled in this environment."
    );
  }

  let tokensToCredit: number;
  let amountGbp: number;
  let resolvedTierId: TokenTopUpTierId | undefined;
  let priceDisplay: string;

  if (data?.quantity !== undefined && data?.quantity !== null) {
    const parsedQty = Number(data.quantity);
    if (
      !Number.isFinite(parsedQty) ||
      !Number.isInteger(parsedQty) ||
      parsedQty < MIN_TOP_UP_TOKENS ||
      parsedQty > MAX_TOP_UP_TOKENS
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Token quantity must be a whole integer between ${MIN_TOP_UP_TOKENS} and ${MAX_TOP_UP_TOKENS}.`
      );
    }
    if (data.waiverAccepted !== true) {
      throw new HttpsError(
        "failed-precondition",
        "You must accept the immediate digital delivery waiver before completing a top-up."
      );
    }
    tokensToCredit = parsedQty;
    amountGbp = Number((tokensToCredit * TOKEN_UNIT_GBP).toFixed(2));
    priceDisplay = formatGbpFromTokens(tokensToCredit);
    if (data.tierId && data.tierId in TOP_UP_TIERS) {
      resolvedTierId = data.tierId;
    }
  } else {
    const tierId = data?.tierId;
    if (!tierId || !(tierId in TOP_UP_TIERS)) {
      throw new HttpsError("invalid-argument", "Invalid top-up quantity or tier selected.");
    }
    const tier = TOP_UP_TIERS[tierId];
    tokensToCredit = tier.tokens;
    amountGbp = tier.amountGbp;
    resolvedTierId = tier.id;
    priceDisplay = tier.priceDisplay;
  }

  const userRef = db.collection("users").doc(caller.uid);
  const txRef = userRef.collection("tokenTransactions").doc();

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
    const prevPurchased = Math.max(0, Math.floor(Number(userData.lifetimeTokensPurchased) || 0));
    const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
    const newBalance = prevBalance + tokensToCredit;

    tx.set(
      userRef,
      {
        ...(caller.email ? { email: userData.email || caller.email } : {}),
        tokenBalance: newBalance,
        lifetimeTokensPurchased: prevPurchased + tokensToCredit,
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
      delta: tokensToCredit,
      balanceAfter: newBalance,
      amountGbp,
      ...(resolvedTierId ? { tierId: resolvedTierId } : {}),
      waiverAccepted: data?.waiverAccepted === true,
      description: `Stripe Checkout Simulation — ${priceDisplay} Top-Up (${tokensToCredit} Tokens)`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      tokenBalance: newBalance,
      addedTokens: tokensToCredit,
      quantity: tokensToCredit,
      amountGbp,
      ...(resolvedTierId ? { tierId: resolvedTierId } : {}),
    };
  });

  return {
    success: true,
    mode: "simulated",
    currency: "GBP",
    ...result,
  };
}

/**
 * Simulated Stripe Checkout Top-Up Callable (Flexible Quantity + Legacy Tier Compat).
 * Credits users/{uid}.tokenBalance atomically and writes an immutable receipt.
 */
export const simulateStripeTopUpCallable = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    return executeSimulatedStripeTopUp(caller, request.data);
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

      // Multi-seed batch protection: up to 15 initial pre-flight seed lookups share the single 1-Token pre-flight fee across queued scenes.
      if (mode === "initial_preflight" && sData.initialPreFlightCharged === true) {
        const callsUsed = Math.max(1, Math.floor(Number(sData.initialPreFlightCallsUsed) || 1));
        if (callsUsed < 15) {
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
 * Persists and logs Gemini 3.6 Flash apiUsage micro-cost for pre-flight and escape-hatch
 * lookups so Admin USD telemetry accounts for cancelled Box 4 lookups and Rule 11 bouncer blocks.
 */
export async function recordPreFlightApiUsage(params: {
  caller: CallerIdentity;
  curationSessionId?: string;
  seedLabel: string;
  isValid: boolean;
  apiUsage?: {
    model?: string;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
}): Promise<void> {
  const { caller, curationSessionId, seedLabel, isValid, apiUsage } = params;
  if (!apiUsage) return;

  const model = (apiUsage.model || "gemini-3.6-flash").trim();
  const promptTokens = Math.max(0, Math.floor(Number(apiUsage.promptTokenCount) || 0));
  const candidatesTokens = Math.max(0, Math.floor(Number(apiUsage.candidatesTokenCount) || 0));
  const totalTokens = Math.max(
    promptTokens + candidatesTokens,
    Math.floor(Number(apiUsage.totalTokenCount) || 0)
  );
  if (promptTokens === 0 && candidatesTokens === 0 && totalTokens === 0) return;

  const reasoningTokens = Math.max(0, totalTokens - (promptTokens + candidatesTokens));
  const microCostUsd = Number(
    (
      (promptTokens / 1_000_000) * 1.5 +
      ((candidatesTokens + reasoningTokens) / 1_000_000) * 7.5
    ).toFixed(6)
  );

  console.log(
    `[Pre-Flight Telemetry] uid=${caller.uid} email=${caller.email || "unknown"} seed="${seedLabel}" valid=${isValid} model=${model} prompt=${promptTokens} candidates=${candidatesTokens} total=${totalTokens} costUsd=$${microCostUsd.toFixed(6)}`
  );

  try {
    const writes: Promise<any>[] = [];
    const userRef = db.collection("users").doc(caller.uid);
    writes.push(
      userRef.set(
        {
          ...(caller.email ? { email: caller.email } : {}),
          preflightApiUsage: {
            [model]: {
              prompt: FieldValue.increment(promptTokens),
              candidates: FieldValue.increment(candidatesTokens),
              total: FieldValue.increment(totalTokens),
              calls: FieldValue.increment(1),
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    );

    if (typeof curationSessionId === "string" && curationSessionId.trim().length > 0) {
      const sessionRef = db.collection("curationSessions").doc(curationSessionId.trim());
      writes.push(
        sessionRef.set(
          {
            sessionId: curationSessionId.trim(),
            uid: caller.uid,
            preflightApiUsage: {
              [model]: {
                prompt: FieldValue.increment(promptTokens),
                candidates: FieldValue.increment(candidatesTokens),
                total: FieldValue.increment(totalTokens),
                calls: FieldValue.increment(1),
              },
            },
            lastLookupSeed: seedLabel,
            lastLookupValid: isValid,
            updatedAt: FieldValue.serverTimestamp(),
            expireAt: getSessionExpiry(),
          },
          { merge: true }
        )
      );
    }

    await Promise.all(writes);
  } catch (err: any) {
    console.warn(
      `[Pre-Flight Telemetry] Non-fatal persistence warning for uid=${caller.uid}:`,
      err?.message || err
    );
  }
}

export async function updateCurationLockJobId(
  uid: string,
  curationSessionId: string | undefined | null,
  jobId: string
): Promise<void> {
  if (!uid || !curationSessionId || !jobId) return;
  const lockRef = db.collection("curationLocks").doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (data.curationSessionId !== curationSessionId) return;
      tx.update(lockRef, {
        jobId,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + STALE_LOCK_TTL_MS),
      });
    });
  } catch (err: any) {
    console.warn(`[CurationLock] Failed to stamp jobId=${jobId} for uid=${uid}:`, err?.message || err);
  }
}

export async function refreshCurationLock(
  uid: string,
  curationSessionId: string | undefined | null,
  nextJobId?: string | null
): Promise<void> {
  if (!uid || !curationSessionId) return;
  const lockRef = db.collection("curationLocks").doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (data.curationSessionId !== curationSessionId) return;
      tx.update(lockRef, {
        ...(nextJobId ? { jobId: nextJobId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + STALE_LOCK_TTL_MS),
      });
    });
  } catch (err: any) {
    console.warn(`[CurationLock] Failed to refresh lock for uid=${uid}:`, err?.message || err);
  }
}

export async function releaseCurationLock(
  uid: string,
  curationSessionId?: string | null
): Promise<void> {
  if (!uid) return;
  const lockRef = db.collection("curationLocks").doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (curationSessionId && data.curationSessionId && data.curationSessionId !== curationSessionId) {
        return;
      }
      tx.delete(lockRef);
    });
  } catch (err: any) {
    console.warn(`[CurationLock] Failed to release lock for uid=${uid}:`, err?.message || err);
  }
}

export async function recoverStaleCurationLock(
  lockData: {
    uid: string;
    jobId?: string | null;
    projectId?: string | null;
    curationSessionId?: string | null;
  },
  options?: { deleteLockIfMatching?: boolean }
): Promise<{ refunded: boolean; jobMarkedFailed: boolean }> {
  const { uid, jobId, projectId, curationSessionId } = lockData || {};
  if (!uid) return { refunded: false, jobMarkedFailed: false };

  let jobMarkedFailed = false;
  let refunded = false;
  const timeoutMessage = "Curation timed out and spent tokens were automatically refunded.";

  try {
    let jobAlreadyCompleted = false;
    if (jobId) {
      const jobRef = db.collection("curationJobs").doc(jobId);
      const jobSnap = await jobRef.get();
      if (jobSnap.exists) {
        const jData = jobSnap.data() || {};
        if (jData.status === "completed") {
          jobAlreadyCompleted = true;
        } else if (jData.status !== "failed") {
          await jobRef.update({
            status: "failed",
            errorMessage: timeoutMessage,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
          });
          jobMarkedFailed = true;
        }
      }
    }

    if (!jobAlreadyCompleted) {
      let hasCompletedScenes = false;
      let refundAmountOverride: number | undefined = undefined;

      if (projectId) {
        const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
        const projSnap = await projectRef.get();
        if (projSnap.exists) {
          const pData = projSnap.data() || {};
          const scenes = parseProjectScenes(pData.scenes);
          hasCompletedScenes = scenes.some(
            (s: any) => s?.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0
          );
          refundAmountOverride = computeUncompletedScenesRefundCost({
            scenes,
            targetSceneId: pData.activeSceneId,
          });

          await projectRef.set(
            hasCompletedScenes
              ? {
                  status: "completed",
                  activeJobId: null,
                  partialError: timeoutMessage,
                  updatedAt: FieldValue.serverTimestamp(),
                }
              : {
                  status: "failed",
                  activeJobId: null,
                  errorMessage: timeoutMessage,
                  updatedAt: FieldValue.serverTimestamp(),
                },
            { merge: true }
          );
        }
      }

      if (curationSessionId) {
        await refundProjectSettlementOnError({
          uid,
          projectId: projectId || undefined,
          curationSessionId,
          refundAmountOverride,
          reason: "Stale Curation Timeout Auto-Refund",
        });
        refunded = true;
      }
    }

    if (options?.deleteLockIfMatching) {
      await releaseCurationLock(uid, curationSessionId || undefined);
    }
  } catch (err: any) {
    console.error(`[CurationLock] Error recovering stale lock for uid=${uid} session=${curationSessionId}:`, err?.message || err);
  }

  return { refunded, jobMarkedFailed };
}

/**
 * Shared Split-Debit Settlement Helper used by both authorizeDirectHitCallable (Column 1 Direct Hit)
 * and executeCurationPipeline (Column 2 Live Synthesis).
 * Uniformly enforces the 1-at-a-Time per-user curation lock (curationLocks/{uid}) for ALL users including Admin.
 */
export async function settleCurationProjectTokens(params: {
  caller: CallerIdentity;
  curationSessionId?: string;
  totalProjectCost: number;
  projectId?: string;
  targetSceneId?: string;
  sceneTitle?: string;
  txType: "spend_direct_hit" | "spend_live_synthesis";
  description: string;
  generationTypeToStamp?: string;
  seedArtist?: string;
  costUsd?: number;
  apiUsage?: Record<string, any>;
  anchorResolution?: Record<string, any>;
  acquireLock?: boolean;
}): Promise<{
  tokensSpent: number;
  projectTokensSpent: number;
  creditablePreFlight: number;
  settlementCharged: number;
  tokenBalance: number | null;
  curationSessionId: string;
}> {
  const { caller, totalProjectCost, projectId, txType, description, generationTypeToStamp } = params;
  const shouldAcquireLock = params.acquireLock !== false;
  const sessionId =
    typeof params.curationSessionId === "string" && params.curationSessionId.trim().length > 0
      ? params.curationSessionId.trim()
      : db.collection("curationSessions").doc().id;

  const userRef = db.collection("users").doc(caller.uid);
  const lockRef = db.collection("curationLocks").doc(caller.uid);
  const sessionRef = db.collection("curationSessions").doc(sessionId);
  const txRef = userRef.collection("tokenTransactions").doc();
  const projectRef = projectId
    ? db.collection("users").doc(caller.uid).collection("projects").doc(projectId)
    : null;

  let staleLockToRecover: {
    uid: string;
    jobId?: string | null;
    projectId?: string | null;
    curationSessionId?: string | null;
  } | null = null;

  const settlementResult = await db.runTransaction(async (tx) => {
    const [userSnap, sessionSnap, projectSnap, lockSnap] = await Promise.all([
      caller.isAdmin ? Promise.resolve(null) : tx.get(userRef),
      caller.isAdmin ? Promise.resolve(null) : tx.get(sessionRef),
      projectRef ? tx.get(projectRef) : Promise.resolve(null),
      tx.get(lockRef),
    ]);

    const nowMs = Date.now();
    if (lockSnap.exists) {
      const lockData = lockSnap.data() || {};
      const isSameSessionRetry =
        Boolean(lockData.curationSessionId) && lockData.curationSessionId === sessionId;

      if (!isSameSessionRetry) {
        if (isCurationLockActive(lockData, nowMs)) {
          throw new HttpsError(
            "resource-exhausted",
            "ACTIVE_CURATION_IN_PROGRESS: You already have a Zcene curating. Please wait for it to finish before starting another."
          );
        }
        // Expired stale lock -> capture for post-transaction recovery & reclaim cleanly
        staleLockToRecover = {
          uid: caller.uid,
          jobId: lockData.jobId || null,
          projectId: lockData.projectId || null,
          curationSessionId: lockData.curationSessionId || null,
        };
      }
    }

    if (shouldAcquireLock) {
      tx.set(lockRef, {
        uid: caller.uid,
        projectId: projectId || null,
        jobId: null,
        curationSessionId: sessionId,
        status: "active",
        acquiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(nowMs + STALE_LOCK_TTL_MS),
      });
    }

    if (caller.isAdmin) {
      if (projectRef) {
        tx.set(
          projectRef,
          {
            tokensSpent: 0,
            ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      const effectiveGenType = generationTypeToStamp || (txType === "spend_direct_hit" ? "Direct Hit" : "Root Generation");
      tx.set(txRef, {
        id: txRef.id,
        uid: caller.uid,
        type: txType,
        delta: 0,
        balanceAfter: 0,
        isAdminBypass: true,
        ...(projectId ? { projectId } : {}),
        sceneId: params.targetSceneId || "scene-1",
        curationSessionId: sessionId,
        description: `${description} (Admin 0T Wallet Bypass)`,
        generationType: effectiveGenType,
        ...(params.seedArtist ? { seedArtist: params.seedArtist } : {}),
        costUsd: typeof params.costUsd === "number" ? params.costUsd : (txType === "spend_direct_hit" ? 0.0000 : 0),
        apiUsage: params.apiUsage || {},
        anchorResolution: params.anchorResolution || (txType === "spend_direct_hit" ? { cacheHits: 1, cacheMisses: 0 } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        tokensSpent: 0,
        projectTokensSpent: 0,
        creditablePreFlight: 0,
        settlementCharged: 0,
        tokenBalance: null,
        curationSessionId: sessionId,
      };
    }

    const userData = userSnap && userSnap.exists ? userSnap.data() || {} : {};
    const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
    const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
    const prevProjectTokens = projectSnap?.exists
      ? Math.max(0, Math.floor(Number(projectSnap.data()?.tokensSpent) || 0))
      : 0;

    let preFlightTokensDeducted = 0;
    if (sessionSnap && sessionSnap.exists) {
      const sData = sessionSnap.data() || {};
      if (sData.uid && sData.uid !== caller.uid) {
        throw new HttpsError("permission-denied", "Curation session belongs to another user.");
      }
      // Idempotency guard if retried for the exact same project
      if (sData.status === "settled" && projectId && sData.projectId === projectId) {
        return {
          tokensSpent: totalProjectCost,
          projectTokensSpent: prevProjectTokens || totalProjectCost,
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
        ...(!sessionSnap?.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: getSessionExpiry(),
      },
      { merge: true }
    );

    tx.set(txRef, {
      id: txRef.id,
      uid: caller.uid,
      type: txType,
      delta: -remainingSettlement,
      balanceAfter: newBalance,
      ...(projectId ? { projectId } : {}),
      sceneId: params.targetSceneId || "scene-1",
      curationSessionId: sessionId,
      description:
        creditablePreFlight > 0
          ? `${description} (${remainingSettlement}T balance after 1T pre-flight)`
          : `${description} (${remainingSettlement}T)`,
      ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : (txType === "spend_direct_hit" ? { generationType: "Direct Hit" } : {})),
      ...(params.seedArtist ? { seedArtist: params.seedArtist } : {}),
      ...(typeof params.costUsd === "number" ? { costUsd: params.costUsd } : (txType === "spend_direct_hit" ? { costUsd: 0.0000 } : {})),
      ...(params.apiUsage ? { apiUsage: params.apiUsage } : (txType === "spend_direct_hit" ? { apiUsage: {} } : {})),
      ...(params.anchorResolution ? { anchorResolution: params.anchorResolution } : (txType === "spend_direct_hit" ? { anchorResolution: { cacheHits: 1, cacheMisses: 0 } } : {})),
      createdAt: FieldValue.serverTimestamp(),
    });

    const finalProjectTokensSpent = prevProjectTokens + totalActualTokensForProject;

    if (projectRef) {
      tx.set(
        projectRef,
        {
          tokensSpent: finalProjectTokensSpent,
          ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      tokensSpent: totalActualTokensForProject,
      projectTokensSpent: finalProjectTokensSpent,
      creditablePreFlight,
      settlementCharged: remainingSettlement,
      tokenBalance: newBalance,
      curationSessionId: sessionId,
    };
  });

  if (staleLockToRecover) {
    // Reclaimed an expired stale lock inline -> trigger best-effort async cleanup & refund for the crashed job
    recoverStaleCurationLock(staleLockToRecover, { deleteLockIfMatching: false }).catch((err) => {
      console.warn("[CurationLock] Non-fatal stale lock recovery warning:", err?.message || err);
    });
  }

  return settlementResult;
}

/**
 * Refunds ONLY settlementTokensDeducted (4T/5T/9T/10T) if Column 2 or Column 3 crashes fatally.
 * Preserves the non-refundable 1-Token Pre-Flight Flash Lookup Fee.
 */
export async function refundProjectSettlementOnError(params: {
  uid: string;
  projectId?: string;
  curationSessionId?: string;
  refundAmountOverride?: number;
  reason?: string;
}): Promise<void> {
  const { uid, projectId, curationSessionId, refundAmountOverride, reason } = params;
  if (!uid || !curationSessionId) return;

  const userRef = db.collection("users").doc(uid);
  const sessionRef = db.collection("curationSessions").doc(curationSessionId);
  const txRef = userRef.collection("tokenTransactions").doc();
  const projectRef = projectId
    ? db.collection("users").doc(uid).collection("projects").doc(projectId)
    : null;

  try {
    await db.runTransaction(async (tx) => {
      const [userSnap, sessionSnap, projectSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(sessionRef),
        projectRef ? tx.get(projectRef) : Promise.resolve(null),
      ]);
      if (!sessionSnap.exists) return;

      const sData = sessionSnap.data() || {};
      if (sData.uid !== uid || (sData.status !== "settled" && sData.status !== "partially_refunded_settlement")) return;

      const fullSettlementAmount = Math.max(0, Math.floor(Number(sData.settlementTokensDeducted) || 0));
      const alreadyRefunded = Math.max(0, Math.floor(Number(sData.settlementTokensRefunded) || 0));
      const remainingRefundable = Math.max(0, fullSettlementAmount - alreadyRefunded);

      const refundAmount = typeof refundAmountOverride === "number" && refundAmountOverride > 0
        ? Math.min(remainingRefundable, refundAmountOverride)
        : remainingRefundable;

      if (refundAmount <= 0) return;

      const newRefundedTotal = alreadyRefunded + refundAmount;
      const isFullRefund = newRefundedTotal >= fullSettlementAmount;

      tx.update(sessionRef, {
        status: isFullRefund ? "refunded_settlement" : "partially_refunded_settlement",
        settlementTokensRefunded: newRefundedTotal,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (userSnap.exists) {
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
          description: `Automatic Refund (${isFullRefund ? "Full" : "Partial"} Synthesis Error${reason ? `: ${reason}` : ""})`,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      if (projectRef) {
        const prevProjTokens = projectSnap?.exists
          ? Math.max(0, Math.floor(Number(projectSnap.data()?.tokensSpent) || 0))
          : 0;
        const nextProjTokens = Math.max(0, prevProjTokens - refundAmount);
        tx.set(
          projectRef,
          {
            tokensSpent: nextProjTokens,
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
 * Column 1 Direct Hit Settlement Callable (Rule 20, Rule 43 & Rule 44).
 * Settles -5 Tokens on pure cached Direct Hits, or -4 Tokens remainder on Post-Validation Cache Intercept hits.
 * When a Direct Hit is added as Scene >= 2 (scenes.length >= 2), optionally queues an 'overarching_only'
 * background curation job at 0 extra user token cost so Overarching Zine + Cross-Scene Bridges synthesize automatically.
 */
export const authorizeDirectHitCallable = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const {
      projectId,
      seedArtistId,
      projectName,
      curationSessionId,
      targetSceneId,
      scenes,
      detailsCache,
      triggerOverarchingSynthesis,
      overarchingHistory,
    } = request.data || {};

    if (!seedArtistId && !projectName) {
      throw new HttpsError("invalid-argument", "Missing Direct Hit artist identifier.");
    }

    const label = (projectName || seedArtistId || "Zcene").toString().trim();
    const cleanProjectId =
      typeof projectId === "string" && projectId.trim() ? projectId.trim() : undefined;

    const parsedScenes = Array.isArray(scenes)
      ? scenes
      : typeof scenes === "string"
        ? (() => {
            try {
              return JSON.parse(scenes);
            } catch {
              return [];
            }
          })()
        : [];
    const shouldQueueOverarching = Boolean(cleanProjectId && (triggerOverarchingSynthesis || parsedScenes.length >= 2));

    const settlement = await settleCurationProjectTokens({
      caller,
      curationSessionId,
      totalProjectCost: TOKEN_PRICING.SINGLE_SEED,
      projectId: cleanProjectId,
      targetSceneId: targetSceneId || "scene-1",
      txType: "spend_direct_hit",
      description: `Zcene Curation: ${label}`,
      generationTypeToStamp: "Direct Hit",
      seedArtist: label,
      costUsd: 0.0000,
      apiUsage: {},
      anchorResolution: { cacheHits: 1, cacheMisses: 0 },
      acquireLock: shouldQueueOverarching,
    });

    let activeJobId: string | null = null;

    if (shouldQueueOverarching && cleanProjectId) {
      try {
        const jobRef = db.collection("curationJobs").doc();
        activeJobId = jobRef.id;
        await jobRef.set({
          status: "pending",
          jobType: "graph_generation",
          userId: caller.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          inputPayload: {
            mode: "overarching_only",
            projectId: cleanProjectId,
            userId: caller.uid,
            targetSceneId: targetSceneId || `scene-${parsedScenes.length}`,
            scenes: parsedScenes,
            detailsCache: detailsCache ? JSON.stringify(compactDetailsCacheToCanonical(detailsCache)) : null,
            artists: String(seedArtistId || label),
            generationType: "Direct Hit",
            tokensSpent: settlement.tokensSpent,
            curationSessionId: settlement.curationSessionId,
            overarchingHistory: overarchingHistory || null,
          },
        });
        await updateCurationLockJobId(caller.uid, settlement.curationSessionId, activeJobId);
        await db
          .collection("users")
          .doc(caller.uid)
          .collection("projects")
          .doc(cleanProjectId)
          .set({
            status: "curating",
            activeJobId,
            generationType: "Direct Hit",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
      } catch (jobErr) {
        console.warn("[authorizeDirectHitCallable] Non-fatal error queueing overarching_only job:", jobErr);
        await releaseCurationLock(caller.uid, settlement.curationSessionId);
      }
    }

    return {
      success: true,
      ...settlement,
      ...(activeJobId ? { activeJobId } : {}),
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
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const { projectId, nodeId, nodeName } = request.data || {};

    if (!nodeId || typeof nodeId !== "string") {
      throw new HttpsError("invalid-argument", "Missing nodeId for Deep Connections session.");
    }

    const cleanProjectId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
    const normalizedNodeKey = nodeId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64) || "node";
    const scopedProjectKey = (cleanProjectId || "global").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    
    // V38.4: Account-Wide session pass (across all Zcene projects, zero time expiry)
    const canonicalSessionId = `${caller.uid}_global_deepweb_pass`;
    const legacyProjectSessionId = cleanProjectId ? `${caller.uid}_${scopedProjectKey}_deepweb_pass` : null;
    const legacyNodeSessionId = `${caller.uid}_${scopedProjectKey}_${normalizedNodeKey}`;

    const sessionRef = db.collection("deepWebSessions").doc(canonicalSessionId);
    const legacyProjectSessionRef = legacyProjectSessionId ? db.collection("deepWebSessions").doc(legacyProjectSessionId) : null;
    const legacyNodeSessionRef = db.collection("deepWebSessions").doc(legacyNodeSessionId);
    const displayLabel = (nodeName || nodeId).toString().trim();
    const displayProjectLabel = (request.data?.projectName || cleanProjectId || displayLabel || "Zcene").toString().trim();

    if (caller.isAdmin) {
      await sessionRef.set({
        sessionId: sessionRef.id,
        uid: caller.uid,
        isAdmin: true,
        projectId: cleanProjectId,
        projectName: displayProjectLabel,
        lastNodeId: nodeId,
        lastNodeName: displayLabel,
        remainingMessages: 3,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: null,
      });
      return {
        success: true,
        sessionId: sessionRef.id,
        remainingMessages: 3,
        tokenBalance: null,
        resumed: false,
        tokensCharged: 0,
      };
    }

    const cost = TOKEN_PRICING.DEEP_WEB_CONSULT;
    const userRef = db.collection("users").doc(caller.uid);
    const txRef = userRef.collection("tokenTransactions").doc();
    const projectRef = cleanProjectId
      ? db.collection("users").doc(caller.uid).collection("projects").doc(cleanProjectId)
      : null;

    const result = await db.runTransaction(async (tx) => {
      const [userSnap, projectSnap, existingSessionSnap, legacyProjectSessionSnap, legacyNodeSessionSnap] = await Promise.all([
        tx.get(userRef),
        projectRef ? tx.get(projectRef) : Promise.resolve(null),
        tx.get(sessionRef),
        legacyProjectSessionRef ? tx.get(legacyProjectSessionRef) : Promise.resolve(null),
        tx.get(legacyNodeSessionRef),
      ]);

      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
      const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));

      // 1. Check existing canonical global pass (valid until remainingMessages <= 0)
      if (existingSessionSnap.exists) {
        const sData = existingSessionSnap.data() || {};
        const existingRemaining = Math.max(0, Math.floor(Number(sData.remainingMessages) || 0));

        if (sData.uid === caller.uid && existingRemaining > 0) {
          tx.set(
            sessionRef,
            {
              lastNodeId: nodeId,
              lastNodeName: displayLabel,
              ...(cleanProjectId ? { projectId: cleanProjectId, projectName: displayProjectLabel } : {}),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return {
            sessionId: sessionRef.id,
            remainingMessages: existingRemaining,
            tokenBalance: currentBalance,
            resumed: true,
            tokensCharged: 0,
          };
        }
      }

      // 2. Check legacy project-wide pass for seamless auto-migration to global pass
      if (legacyProjectSessionSnap && legacyProjectSessionSnap.exists) {
        const lpData = legacyProjectSessionSnap.data() || {};
        const lpRemaining = Math.max(0, Math.floor(Number(lpData.remainingMessages) || 0));

        if (lpData.uid === caller.uid && lpRemaining > 0) {
          tx.set(sessionRef, {
            sessionId: sessionRef.id,
            uid: caller.uid,
            isAdmin: false,
            projectId: cleanProjectId || lpData.projectId || null,
            projectName: displayProjectLabel || lpData.projectName || "Zcene",
            lastNodeId: nodeId,
            lastNodeName: displayLabel,
            remainingMessages: lpRemaining,
            createdAt: lpData.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expireAt: null,
          });
          if (legacyProjectSessionRef) {
            tx.delete(legacyProjectSessionRef);
          }
          return {
            sessionId: sessionRef.id,
            remainingMessages: lpRemaining,
            tokenBalance: currentBalance,
            resumed: true,
            tokensCharged: 0,
          };
        }
      }

      // 3. Check legacy node-scoped session for seamless auto-migration to global pass
      if (legacyNodeSessionSnap && legacyNodeSessionSnap.exists) {
        const legacyData = legacyNodeSessionSnap.data() || {};
        const legacyRemaining = Math.max(0, Math.floor(Number(legacyData.remainingMessages) || 0));

        if (legacyData.uid === caller.uid && legacyRemaining > 0) {
          tx.set(sessionRef, {
            sessionId: sessionRef.id,
            uid: caller.uid,
            isAdmin: false,
            projectId: cleanProjectId || legacyData.projectId || null,
            projectName: displayProjectLabel || legacyData.projectName || "Zcene",
            lastNodeId: nodeId,
            lastNodeName: displayLabel,
            remainingMessages: legacyRemaining,
            createdAt: legacyData.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expireAt: null,
          });
          tx.delete(legacyNodeSessionRef);
          return {
            sessionId: sessionRef.id,
            remainingMessages: legacyRemaining,
            tokenBalance: currentBalance,
            resumed: true,
            tokensCharged: 0,
          };
        }
      }

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
        projectName: displayProjectLabel,
        lastNodeId: nodeId,
        lastNodeName: displayLabel,
        remainingMessages: 3,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: null,
      });

      tx.set(txRef, {
        id: txRef.id,
        uid: caller.uid,
        type: "spend_deep_web",
        delta: -cost,
        balanceAfter: newBalance,
        ...(cleanProjectId ? { projectId: cleanProjectId } : {}),
        description: `Deep Connections (3 Messages): ${displayProjectLabel}`,
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
        resumed: false,
        tokensCharged: cost,
      };
    });

    return {
      success: true,
      ...result,
    };
  }
);

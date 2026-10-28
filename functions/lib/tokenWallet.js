"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockDeepWebSessionCallable = exports.authorizeDirectHitCallable = exports.simulateStripeTopUpCallable = void 0;
exports.requireAuthenticatedCaller = requireAuthenticatedCaller;
exports.chargePreFlightLookupIfNeeded = chargePreFlightLookupIfNeeded;
exports.recordPreFlightApiUsage = recordPreFlightApiUsage;
exports.settleCurationProjectTokens = settleCurationProjectTokens;
exports.refundProjectSettlementOnError = refundProjectSettlementOnError;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const tokenEconomy_1 = require("./shared/tokenEconomy");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
try {
    db.settings({ ignoreUndefinedProperties: true });
}
catch {
    // Ignore if already configured
}
function requireAuthenticatedCaller(request) {
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Please sign in to continue.");
    }
    const uid = request.auth.uid;
    const email = typeof request.auth.token?.email === "string" ? request.auth.token.email : "";
    return {
        uid,
        email,
        isAdmin: (0, tokenEconomy_1.isAdminEmail)(email),
    };
}
function getSessionExpiry() {
    return firestore_1.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
}
/**
 * Simulated Stripe Checkout Top-Up Callable (£5=50T, £10=100T, £15=150T).
 * Credits users/{uid}.tokenBalance atomically and writes an immutable receipt.
 */
exports.simulateStripeTopUpCallable = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: "256MiB",
}, async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const tierId = request.data?.tierId;
    if (!tierId || !(tierId in tokenEconomy_1.TOP_UP_TIERS)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid top-up tier selected.");
    }
    const tier = tokenEconomy_1.TOP_UP_TIERS[tierId];
    const userRef = db.collection("users").doc(caller.uid);
    const txRef = userRef.collection("tokenTransactions").doc();
    const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
        const prevPurchased = Math.max(0, Math.floor(Number(userData.lifetimeTokensPurchased) || 0));
        const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
        const newBalance = prevBalance + tier.tokens;
        tx.set(userRef, {
            ...(caller.email ? { email: userData.email || caller.email } : {}),
            tokenBalance: newBalance,
            lifetimeTokensPurchased: prevPurchased + tier.tokens,
            lifetimeTokensSpent: prevSpent,
            lastTopUpAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            ...(!userSnap.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
        }, { merge: true });
        tx.set(txRef, {
            id: txRef.id,
            uid: caller.uid,
            type: "topup_simulated",
            delta: tier.tokens,
            balanceAfter: newBalance,
            amountGbp: tier.amountGbp,
            tierId: tier.id,
            description: `Stripe Checkout Simulation — ${tier.priceDisplay} Top-Up (${tier.tokens} Tokens)`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
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
});
/**
 * Atomic 1-Token Non-Refundable Pre-Flight / Escape-Hatch Lookup Debit.
 * - Initial Pre-Flight ('initial_preflight'): Charges 1 Token ONCE across up to 3 uncached seeds in the batch.
 * - Escape Hatch ('escape_hatch'): Charges 1 Token per manual 'Not this artist?' Flash re-query.
 * - Admin (zcene.online@gmail.com): Bypasses all deductions (0 Tokens).
 */
async function chargePreFlightLookupIfNeeded(params) {
    const { caller, seedLabel } = params;
    const mode = params.mode === "escape_hatch" ? "escape_hatch" : "initial_preflight";
    const expectedProjectCost = params.expectedProjectCost === 10 ? 10 : 5;
    const sessionId = typeof params.curationSessionId === "string" && params.curationSessionId.trim().length > 0
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
                throw new https_1.HttpsError("permission-denied", "Curation session belongs to another user.");
            }
            if (sData.status && sData.status !== "preflight") {
                throw new https_1.HttpsError("failed-precondition", "Curation session has already been settled.");
            }
            // Multi-seed batch protection: up to 3 initial pre-flight seed lookups share the single 1-Token pre-flight fee.
            if (mode === "initial_preflight" && sData.initialPreFlightCharged === true) {
                const callsUsed = Math.max(1, Math.floor(Number(sData.initialPreFlightCallsUsed) || 1));
                if (callsUsed < 3) {
                    tx.update(sessionRef, {
                        initialPreFlightCallsUsed: callsUsed + 1,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    return { charged: 0, tokenBalance: currentBalance };
                }
            }
        }
        const fee = tokenEconomy_1.TOKEN_PRICING.PREFLIGHT_FLASH_FEE;
        const minRequired = mode === "initial_preflight" && !sessionSnap.exists ? expectedProjectCost : fee;
        if (currentBalance < minRequired) {
            throw new https_1.HttpsError("failed-precondition", `INSUFFICIENT_TOKENS: Requires ${minRequired} Tokens, available ${currentBalance} Tokens.`);
        }
        const newBalance = currentBalance - fee;
        const prevSessionData = sessionSnap.exists ? sessionSnap.data() || {} : {};
        const prevPreFlightDeducted = Math.max(0, Math.floor(Number(prevSessionData.preFlightTokensDeducted) || 0));
        const prevEscapeCalls = Math.max(0, Math.floor(Number(prevSessionData.escapeHatchCallsUsed) || 0));
        const prevInitialCalls = Math.max(0, Math.floor(Number(prevSessionData.initialPreFlightCallsUsed) || 0));
        tx.set(userRef, {
            ...(caller.email ? { email: userData.email || caller.email } : {}),
            tokenBalance: newBalance,
            lifetimeTokensSpent: prevSpent + fee,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(sessionRef, {
            sessionId,
            uid: caller.uid,
            expectedProjectCost,
            initialPreFlightCharged: mode === "initial_preflight" ? true : Boolean(prevSessionData.initialPreFlightCharged),
            initialPreFlightCallsUsed: mode === "initial_preflight" ? prevInitialCalls + 1 : prevInitialCalls,
            escapeHatchCallsUsed: mode === "escape_hatch" ? prevEscapeCalls + 1 : prevEscapeCalls,
            preFlightTokensDeducted: prevPreFlightDeducted + fee,
            creditablePreFlightTokens: 1,
            settlementTokensDeducted: 0,
            status: "preflight",
            ...(!sessionSnap.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            expireAt: getSessionExpiry(),
        }, { merge: true });
        tx.set(txRef, {
            id: txRef.id,
            uid: caller.uid,
            type: "spend_preflight_lookup",
            delta: -fee,
            balanceAfter: newBalance,
            curationSessionId: sessionId,
            description: mode === "escape_hatch"
                ? `Artist Re-Query Lookup: ${seedLabel}`
                : `Artist Lookup (Pre-Flight): ${seedLabel}`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
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
async function recordPreFlightApiUsage(params) {
    const { caller, curationSessionId, seedLabel, isValid, apiUsage } = params;
    if (!apiUsage)
        return;
    const model = (apiUsage.model || "gemini-3.6-flash").trim();
    const promptTokens = Math.max(0, Math.floor(Number(apiUsage.promptTokenCount) || 0));
    const candidatesTokens = Math.max(0, Math.floor(Number(apiUsage.candidatesTokenCount) || 0));
    const totalTokens = Math.max(promptTokens + candidatesTokens, Math.floor(Number(apiUsage.totalTokenCount) || 0));
    if (promptTokens === 0 && candidatesTokens === 0 && totalTokens === 0)
        return;
    const reasoningTokens = Math.max(0, totalTokens - (promptTokens + candidatesTokens));
    const microCostUsd = Number(((promptTokens / 1_000_000) * 1.5 +
        ((candidatesTokens + reasoningTokens) / 1_000_000) * 7.5).toFixed(6));
    console.log(`[Pre-Flight Telemetry] uid=${caller.uid} email=${caller.email || "unknown"} seed="${seedLabel}" valid=${isValid} model=${model} prompt=${promptTokens} candidates=${candidatesTokens} total=${totalTokens} costUsd=$${microCostUsd.toFixed(6)}`);
    try {
        const writes = [];
        const userRef = db.collection("users").doc(caller.uid);
        writes.push(userRef.set({
            ...(caller.email ? { email: caller.email } : {}),
            preflightApiUsage: {
                [model]: {
                    prompt: firestore_1.FieldValue.increment(promptTokens),
                    candidates: firestore_1.FieldValue.increment(candidatesTokens),
                    total: firestore_1.FieldValue.increment(totalTokens),
                    calls: firestore_1.FieldValue.increment(1),
                },
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true }));
        if (typeof curationSessionId === "string" && curationSessionId.trim().length > 0) {
            const sessionRef = db.collection("curationSessions").doc(curationSessionId.trim());
            writes.push(sessionRef.set({
                sessionId: curationSessionId.trim(),
                uid: caller.uid,
                preflightApiUsage: {
                    [model]: {
                        prompt: firestore_1.FieldValue.increment(promptTokens),
                        candidates: firestore_1.FieldValue.increment(candidatesTokens),
                        total: firestore_1.FieldValue.increment(totalTokens),
                        calls: firestore_1.FieldValue.increment(1),
                    },
                },
                lastLookupSeed: seedLabel,
                lastLookupValid: isValid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                expireAt: getSessionExpiry(),
            }, { merge: true }));
        }
        await Promise.all(writes);
    }
    catch (err) {
        console.warn(`[Pre-Flight Telemetry] Non-fatal persistence warning for uid=${caller.uid}:`, err?.message || err);
    }
}
/**
 * Shared Split-Debit Settlement Helper used by both authorizeDirectHitCallable (Column 1 Direct Hit)
 * and executeCurationPipeline (Column 2 Live Synthesis).
 */
async function settleCurationProjectTokens(params) {
    const { caller, totalProjectCost, projectId, txType, description, generationTypeToStamp } = params;
    const sessionId = typeof params.curationSessionId === "string" && params.curationSessionId.trim().length > 0
        ? params.curationSessionId.trim()
        : db.collection("curationSessions").doc().id;
    if (caller.isAdmin) {
        if (projectId) {
            const projectRef = db.collection("users").doc(caller.uid).collection("projects").doc(projectId);
            await projectRef.set({
                tokensSpent: 0,
                ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
                throw new https_1.HttpsError("permission-denied", "Curation session belongs to another user.");
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
                throw new https_1.HttpsError("failed-precondition", "Curation session has already been consumed.");
            }
            preFlightTokensDeducted = Math.max(0, Math.floor(Number(sData.preFlightTokensDeducted) || 0));
        }
        const { creditablePreFlight, remainingSettlement } = (0, tokenEconomy_1.computeRemainingSettlementTokens)(totalProjectCost, preFlightTokensDeducted);
        if (currentBalance < remainingSettlement) {
            throw new https_1.HttpsError("failed-precondition", `INSUFFICIENT_TOKENS: Requires ${remainingSettlement} remaining Tokens (${totalProjectCost} total), available ${currentBalance} Tokens.`);
        }
        const newBalance = currentBalance - remainingSettlement;
        const totalActualTokensForProject = totalProjectCost + Math.max(0, preFlightTokensDeducted - creditablePreFlight);
        tx.set(userRef, {
            ...(caller.email ? { email: userData.email || caller.email } : {}),
            tokenBalance: newBalance,
            lifetimeTokensSpent: prevSpent + remainingSettlement,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(sessionRef, {
            sessionId,
            uid: caller.uid,
            expectedProjectCost: totalProjectCost,
            preFlightTokensDeducted,
            creditablePreFlightTokens: creditablePreFlight,
            settlementTokensDeducted: remainingSettlement,
            status: "settled",
            ...(projectId ? { projectId } : {}),
            ...(!sessionSnap.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            expireAt: getSessionExpiry(),
        }, { merge: true });
        if (remainingSettlement > 0) {
            tx.set(txRef, {
                id: txRef.id,
                uid: caller.uid,
                type: txType,
                delta: -remainingSettlement,
                balanceAfter: newBalance,
                ...(projectId ? { projectId } : {}),
                curationSessionId: sessionId,
                description: creditablePreFlight > 0
                    ? `${description} (${remainingSettlement}T balance after 1T pre-flight)`
                    : `${description} (${remainingSettlement}T)`,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        if (projectRef) {
            tx.set(projectRef, {
                tokensSpent: totalActualTokensForProject,
                ...(generationTypeToStamp ? { generationType: generationTypeToStamp } : {}),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
async function refundProjectSettlementOnError(params) {
    const { uid, projectId, curationSessionId, reason } = params;
    if (!uid || !curationSessionId)
        return;
    const userRef = db.collection("users").doc(uid);
    const sessionRef = db.collection("curationSessions").doc(curationSessionId);
    const txRef = userRef.collection("tokenTransactions").doc();
    const projectRef = projectId
        ? db.collection("users").doc(uid).collection("projects").doc(projectId)
        : null;
    try {
        await db.runTransaction(async (tx) => {
            const [userSnap, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
            if (!sessionSnap.exists)
                return;
            const sData = sessionSnap.data() || {};
            if (sData.uid !== uid || sData.status !== "settled")
                return;
            const refundAmount = Math.max(0, Math.floor(Number(sData.settlementTokensDeducted) || 0));
            const retainedPreFlight = Math.max(0, Math.floor(Number(sData.preFlightTokensDeducted) || 0));
            tx.update(sessionRef, {
                status: "refunded_settlement",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            if (refundAmount > 0 && userSnap.exists) {
                const userData = userSnap.data() || {};
                const prevBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
                const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
                const newBalance = prevBalance + refundAmount;
                tx.update(userRef, {
                    tokenBalance: newBalance,
                    lifetimeTokensSpent: Math.max(0, prevSpent - refundAmount),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            if (projectRef) {
                tx.set(projectRef, {
                    tokensSpent: retainedPreFlight,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
    }
    catch (err) {
        console.error(`[TokenWallet] Failed to refund settlement for session ${curationSessionId}:`, err);
    }
}
/**
 * Column 1 Direct Hit Settlement Callable (Rule 20 & Rule 43).
 * Settles -5 Tokens on pure cached Direct Hits, or -4 Tokens remainder on Post-Validation Cache Intercept hits.
 */
exports.authorizeDirectHitCallable = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: "256MiB",
}, async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const { projectId, seedArtistId, projectName, curationSessionId } = request.data || {};
    if (!seedArtistId && !projectName) {
        throw new https_1.HttpsError("invalid-argument", "Missing Direct Hit artist identifier.");
    }
    const label = (projectName || seedArtistId || "Zcene").toString().trim();
    const settlement = await settleCurationProjectTokens({
        caller,
        curationSessionId,
        totalProjectCost: tokenEconomy_1.TOKEN_PRICING.SINGLE_SEED,
        projectId: typeof projectId === "string" && projectId.trim() ? projectId.trim() : undefined,
        txType: "spend_direct_hit",
        description: `Zcene Curation: ${label}`,
        generationTypeToStamp: "Direct Hit",
    });
    return {
        success: true,
        ...settlement,
    };
});
/**
 * Deep Connections (3-Message Grounded Consult) Unlock Callable (-3 Tokens).
 * Mints a server-verified deepWebSessions/{sessionId} lease with remainingMessages: 3.
 */
exports.unlockDeepWebSessionCallable = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: "256MiB",
}, async (request) => {
    const caller = requireAuthenticatedCaller(request);
    const { projectId, nodeId, nodeName } = request.data || {};
    if (!nodeId || typeof nodeId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Missing nodeId for Deep Connections session.");
    }
    const cleanProjectId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
    const normalizedNodeKey = nodeId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64) || "node";
    const scopedProjectKey = (cleanProjectId || "global").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const deterministicSessionId = `${caller.uid}_${scopedProjectKey}_${normalizedNodeKey}`;
    const sessionRef = db.collection("deepWebSessions").doc(deterministicSessionId);
    const displayLabel = (nodeName || nodeId).toString().trim();
    if (caller.isAdmin) {
        await sessionRef.set({
            sessionId: sessionRef.id,
            uid: caller.uid,
            isAdmin: true,
            projectId: cleanProjectId,
            nodeId,
            remainingMessages: 3,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            expireAt: getSessionExpiry(),
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
    const cost = tokenEconomy_1.TOKEN_PRICING.DEEP_WEB_CONSULT;
    const userRef = db.collection("users").doc(caller.uid);
    const txRef = userRef.collection("tokenTransactions").doc();
    const projectRef = cleanProjectId
        ? db.collection("users").doc(caller.uid).collection("projects").doc(cleanProjectId)
        : null;
    const result = await db.runTransaction(async (tx) => {
        const [userSnap, projectSnap, existingSessionSnap] = await Promise.all([
            tx.get(userRef),
            projectRef ? tx.get(projectRef) : Promise.resolve(null),
            tx.get(sessionRef),
        ]);
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const currentBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));
        const prevSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
        if (existingSessionSnap.exists) {
            const sData = existingSessionSnap.data() || {};
            const existingRemaining = Math.max(0, Math.floor(Number(sData.remainingMessages) || 0));
            const rawExpireAt = sData.expireAt;
            const expireAtMs = rawExpireAt && typeof rawExpireAt.toDate === "function"
                ? rawExpireAt.toDate().getTime()
                : rawExpireAt instanceof Date
                    ? rawExpireAt.getTime()
                    : null;
            const isNotExpired = expireAtMs === null || expireAtMs > Date.now();
            if (sData.uid === caller.uid && existingRemaining > 0 && isNotExpired) {
                return {
                    sessionId: sessionRef.id,
                    remainingMessages: existingRemaining,
                    tokenBalance: currentBalance,
                    resumed: true,
                    tokensCharged: 0,
                };
            }
        }
        if (currentBalance < cost) {
            throw new https_1.HttpsError("failed-precondition", `INSUFFICIENT_TOKENS: Deep Connections requires ${cost} Tokens, available ${currentBalance} Tokens.`);
        }
        const newBalance = currentBalance - cost;
        tx.set(userRef, {
            ...(caller.email ? { email: userData.email || caller.email } : {}),
            tokenBalance: newBalance,
            lifetimeTokensSpent: prevSpent + cost,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(sessionRef, {
            sessionId: sessionRef.id,
            uid: caller.uid,
            isAdmin: false,
            projectId: cleanProjectId,
            nodeId,
            remainingMessages: 3,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (projectRef && projectSnap && projectSnap.exists) {
            const prevProjectSpent = Math.max(0, Math.floor(Number(projectSnap.data()?.tokensSpent) || 0));
            tx.set(projectRef, {
                tokensSpent: prevProjectSpent + cost,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
});
//# sourceMappingURL=tokenWallet.js.map
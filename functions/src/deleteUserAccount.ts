import crypto from "crypto";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  ENFORCE_APP_CHECK,
  requireAuthenticatedCaller,
  isCurationLockActive,
  computeApiUsageCostUsd,
} from "./tokenWallet";

if (getApps().length === 0) {
  initializeApp();
}

const defaultDb = getFirestore();
try {
  defaultDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // Ignore if already configured
}

export const RECENT_LOGIN_MAX_AGE_SECONDS = 300; // 5 minutes
const FIRESTORE_BATCH_CHUNK_SIZE = 400;

function parseMaybeJson(value: any): any {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? value : null;
}

function roundUsd4(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

async function deleteDocRefsInChunks(db: any, refs: any[]): Promise<number> {
  if (!refs.length) return 0;
  let deleted = 0;
  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_CHUNK_SIZE) {
    const chunk = refs.slice(i, i + FIRESTORE_BATCH_CHUNK_SIZE);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export interface DeleteUserAccountResult {
  ok: true;
  deletedDocsCount: number;
  scrubbedFailuresCount: number;
  archivedTelemetry: boolean;
  archiveId: string | null;
}

export interface DeleteUserAccountDeps {
  db?: any;
  auth?: { deleteUser: (uid: string) => Promise<void> };
  nowMs?: number;
  generateArchiveId?: () => string;
}

/**
 * Server-Side Account Deletion & GDPR Art. 17 Erasure Core (v47.4):
 * 1. Verifies Firebase Auth + recent login (auth_time <= 300s) + no active curation lock.
 * 2. Preserves ONE zero-PII financial summary doc under adminLedger/system/deletedAccountTelemetry/{uuid}
 *    for non-admin accounts with historical billing or AI spend so Admin P&L stays mathematically exact.
 * 3. Hard-deletes all user Firestore collections, legacy projects, sharedZcenes, locks, sessions, and jobs.
 * 4. Scrubs uid / userEmail / projectName on adminLedger/system/curationFailures to "deleted_account".
 * 5. Permanently deletes the Firebase Auth user via Admin SDK.
 */
export async function executeDeleteUserAccount(
  request: CallableRequest<any>,
  deps: DeleteUserAccountDeps = {}
): Promise<DeleteUserAccountResult> {
  const caller = requireAuthenticatedCaller(request);
  const db = deps.db || defaultDb;
  const authClient = deps.auth || getAuth();
  const nowMs = typeof deps.nowMs === "number" ? deps.nowMs : Date.now();
  const generateArchiveId = deps.generateArchiveId || (() => crypto.randomUUID());

  // 1. Verify recent sign-in (auth_time <= 300s) so Admin SDK deleteUser maintains Firebase recency security
  const authTime = Number(request.auth?.token?.auth_time || 0);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isFinite(authTime) || authTime <= 0 || nowSeconds - authTime > RECENT_LOGIN_MAX_AGE_SECONDS) {
    throw new HttpsError(
      "failed-precondition",
      "REQUIRES_RECENT_LOGIN: For your security, please re-authenticate with Google to confirm permanent account deletion.",
      { code: "REQUIRES_RECENT_LOGIN" }
    );
  }

  const uid = caller.uid;

  // 2. Guard against mid-curation deletion (prevent background worker from writing orphan docs post-delete)
  const lockRef = db.collection("curationLocks").doc(uid);
  const lockSnap = await lockRef.get();
  if (lockSnap.exists && isCurationLockActive(lockSnap.data(), nowMs)) {
    throw new HttpsError(
      "failed-precondition",
      "ACTIVE_CURATION_IN_PROGRESS: Please wait for your active curation to finish before deleting your account.",
      { code: "ACTIVE_CURATION_IN_PROGRESS" }
    );
  }

  // 3. Gather user document + subcollections before deletion
  const userRef = db.collection("users").doc(uid);
  const [
    userSnap,
    projectsSnap,
    stackSnap,
    userSessionSnap,
    tokenTxSnap,
    deepWebQueriesSnap,
    topLevelProjectsSnap,
    sharedZcenesSnap,
    curationSessionsSnap,
    curationJobsSnap,
    deepWebSessionsSnap,
    curationFailuresSnap,
  ] = await Promise.all([
    userRef.get(),
    userRef.collection("projects").get(),
    userRef.collection("stack").get(),
    userRef.collection("userSession").get(),
    userRef.collection("tokenTransactions").get(),
    userRef.collection("deepWebQueries").get(),
    db.collection("projects").where("authorId", "==", uid).get().catch(() => ({ docs: [] })),
    db.collection("sharedZcenes").where("authorId", "==", uid).get().catch(() => ({ docs: [] })),
    db.collection("curationSessions").where("uid", "==", uid).get().catch(() => ({ docs: [] })),
    db.collection("curationJobs").where("userId", "==", uid).get().catch(() => ({ docs: [] })),
    db.collection("deepWebSessions").where("uid", "==", uid).get().catch(() => ({ docs: [] })),
    db
      .collection("adminLedger")
      .doc("system")
      .collection("curationFailures")
      .where("uid", "==", uid)
      .get()
      .catch(() => ({ docs: [] })),
  ]);

  // 4. Write ONE zero-PII financial summary doc for non-admin accounts with billing/AI activity
  let archivedTelemetry = false;
  let archiveId: string | null = null;
  if (!caller.isAdmin) {
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const lifetimeTokensPurchased = Math.max(0, Math.floor(Number(userData.lifetimeTokensPurchased) || 0));
    const lifetimeTokensSpent = Math.max(0, Math.floor(Number(userData.lifetimeTokensSpent) || 0));
    const forfeitedTokenBalance = Math.max(0, Math.floor(Number(userData.tokenBalance) || 0));

    let totalAiCostUsd = 0;
    const preflightUsage = parseMaybeJson(userData.preflightApiUsage);
    const userDeepWebUsage = parseMaybeJson(userData.deepWebApiUsage);
    if (preflightUsage) totalAiCostUsd += computeApiUsageCostUsd(preflightUsage).costUsd;
    if (userDeepWebUsage) totalAiCostUsd += computeApiUsageCostUsd(userDeepWebUsage).costUsd;

    let totalCurations = 0;
    let directHitCurations = 0;
    for (const pDoc of projectsSnap.docs || []) {
      const pData = pDoc.data() || {};
      const pApiUsage = parseMaybeJson(pData.apiUsage);
      const pDeepWebUsage = parseMaybeJson(pData.deepWebApiUsage);
      if (pApiUsage) totalAiCostUsd += computeApiUsageCostUsd(pApiUsage).costUsd;
      if (pDeepWebUsage) totalAiCostUsd += computeApiUsageCostUsd(pDeepWebUsage).costUsd;
      if (pData.generationType !== "Clone") {
        totalCurations += 1;
        if (pData.generationType === "Direct Hit") {
          directHitCurations += 1;
        }
      }
    }
    totalAiCostUsd = roundUsd4(totalAiCostUsd);

    const hasFinancialActivity =
      lifetimeTokensPurchased > 0 ||
      lifetimeTokensSpent > 0 ||
      forfeitedTokenBalance > 0 ||
      totalAiCostUsd > 0 ||
      totalCurations > 0;

    if (hasFinancialActivity) {
      archiveId = generateArchiveId();
      const archiveRef = db
        .collection("adminLedger")
        .doc("system")
        .collection("deletedAccountTelemetry")
        .doc(archiveId);

      // Strictly ZERO PII: random UUID key, no uid, no email, no displayName, no project titles/artists
      await archiveRef.set({
        deletedAt: FieldValue.serverTimestamp(),
        deletedAtMs: nowMs,
        lifetimeTokensPurchased,
        lifetimeTokensSpent,
        forfeitedTokenBalance,
        totalAiCostUsd,
        totalCurations,
        directHitCurations,
      });
      archivedTelemetry = true;
    }
  }

  // 5. Scrub PII (uid, userEmail, projectName) on adminLedger/system/curationFailures while keeping sunk USD
  let scrubbedFailuresCount = 0;
  const failureDocs = curationFailuresSnap.docs || [];
  if (failureDocs.length > 0) {
    for (let i = 0; i < failureDocs.length; i += FIRESTORE_BATCH_CHUNK_SIZE) {
      const chunk = failureDocs.slice(i, i + FIRESTORE_BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const fDoc of chunk) {
        batch.update(fDoc.ref, {
          uid: "deleted_account",
          userEmail: null,
          projectName: "deleted_account",
        });
      }
      await batch.commit();
      scrubbedFailuresCount += chunk.length;
    }
  }

  // 6. Chunk-delete all user-owned Firestore documents and subcollections
  const refsToDelete: any[] = [
    ...(projectsSnap.docs || []).map((d: any) => d.ref),
    ...(stackSnap.docs || []).map((d: any) => d.ref),
    ...(userSessionSnap.docs || []).map((d: any) => d.ref),
    ...(tokenTxSnap.docs || []).map((d: any) => d.ref),
    ...(deepWebQueriesSnap.docs || []).map((d: any) => d.ref),
    ...(topLevelProjectsSnap.docs || []).map((d: any) => d.ref),
    ...(sharedZcenesSnap.docs || []).map((d: any) => d.ref),
    ...(curationSessionsSnap.docs || []).map((d: any) => d.ref),
    ...(curationJobsSnap.docs || []).map((d: any) => d.ref),
    ...(deepWebSessionsSnap.docs || []).map((d: any) => d.ref),
  ];
  if (lockSnap.exists) {
    refsToDelete.push(lockRef);
  }
  if (userSnap.exists) {
    refsToDelete.push(userRef);
  }

  const deletedDocsCount = await deleteDocRefsInChunks(db, refsToDelete);

  // 7. Permanently delete Firebase Auth identity via Admin SDK
  try {
    await authClient.deleteUser(uid);
  } catch (authErr: any) {
    const code = authErr?.code || "";
    if (code !== "auth/user-not-found") {
      throw new HttpsError(
        "internal",
        "User data was cleared, but authentication removal failed. Please contact support@zcene.online."
      );
    }
  }

  return {
    ok: true,
    deletedDocsCount,
    scrubbedFailuresCount,
    archivedTelemetry,
    archiveId,
  };
}

export const deleteUserAccount = onCall(
  {
    enforceAppCheck: ENFORCE_APP_CHECK,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request) => executeDeleteUserAccount(request)
);

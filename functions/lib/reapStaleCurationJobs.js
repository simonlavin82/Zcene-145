"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reapStaleCurationJobs = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const tokenWallet_1 = require("./tokenWallet");
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
/**
 * Proactive Stale-Job Safety Valve (Phase 1):
 * Runs every 5 minutes to detect expired curationLocks/{uid} documents (> 10 minutes old),
 * mark timed-out curationJobs & projects as failed (or completed if partial scenes exist),
 * trigger idempotent auto-refunds, and release the expired lock.
 */
exports.reapStaleCurationJobs = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    timeoutSeconds: 120,
    memory: "256MiB",
}, async () => {
    const now = firestore_1.Timestamp.now();
    const expiredSnap = await db
        .collection("curationLocks")
        .where("expiresAt", "<=", now)
        .limit(50)
        .get();
    if (expiredSnap.empty) {
        return;
    }
    console.log(`[reapStaleCurationJobs] Found ${expiredSnap.size} expired curation lock(s). Reaping...`);
    for (const lockDoc of expiredSnap.docs) {
        const data = lockDoc.data() || {};
        const uid = typeof data.uid === "string" && data.uid ? data.uid : lockDoc.id;
        const result = await (0, tokenWallet_1.recoverStaleCurationLock)({
            uid,
            jobId: data.jobId || null,
            projectId: data.projectId || null,
            curationSessionId: data.curationSessionId || null,
        }, { deleteLockIfMatching: true });
        console.log(`[reapStaleCurationJobs] Reaped uid=${uid} job=${data.jobId || "none"} session=${data.curationSessionId || "none"} (refunded=${result.refunded}, jobMarkedFailed=${result.jobMarkedFailed})`);
    }
});
//# sourceMappingURL=reapStaleCurationJobs.js.map
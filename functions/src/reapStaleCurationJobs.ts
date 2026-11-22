import { onSchedule } from "firebase-functions/v2/scheduler";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { recoverStaleCurationLock } from "./tokenWallet";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // Ignore if already configured
}

/**
 * Proactive Stale-Job Safety Valve (Phase 1):
 * Runs every 5 minutes to detect expired curationLocks/{uid} documents (> 10 minutes old),
 * mark timed-out curationJobs & projects as failed (or completed if partial scenes exist),
 * trigger idempotent auto-refunds, and release the expired lock.
 */
export const reapStaleCurationJobs = onSchedule(
  {
    schedule: "every 5 minutes",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const now = Timestamp.now();
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
      const result = await recoverStaleCurationLock(
        {
          uid,
          jobId: data.jobId || null,
          projectId: data.projectId || null,
          curationSessionId: data.curationSessionId || null,
        },
        { deleteLockIfMatching: true }
      );
      console.log(
        `[reapStaleCurationJobs] Reaped uid=${uid} job=${data.jobId || "none"} session=${data.curationSessionId || "none"} (refunded=${result.refunded}, jobMarkedFailed=${result.jobMarkedFailed})`
      );
    }
  }
);

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { executeDeleteUserAccount, RECENT_LOGIN_MAX_AGE_SECONDS } from "../src/deleteUserAccount";
import { computeAggregateMetrics, type DeletedAccountTelemetryRecord, type UserTelemetry } from "../../components/UsageAnalyticsPage";
import { ADMIN_EMAIL, ADMIN_UID } from "../../shared/tokenEconomy";

/**
 * Lightweight in-memory Firestore double supporting nested subcollections,
 * `.where(field, "==", value).get()`, `.doc().get()/.set()`, and chunked `.batch()`.
 */
function createMockFirestore(initialDocs: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(initialDocs));

  const makeDocRef = (docPath: string): any => ({
    path: docPath,
    id: docPath.split("/").pop(),
    get: async () => ({
      exists: store.has(docPath),
      id: docPath.split("/").pop(),
      ref: makeDocRef(docPath),
      data: () => (store.has(docPath) ? store.get(docPath) : undefined),
    }),
    set: async (data: any) => {
      store.set(docPath, { ...data });
    },
    update: async (patch: any) => {
      const prev = store.get(docPath) || {};
      store.set(docPath, { ...prev, ...patch });
    },
    delete: async () => {
      store.delete(docPath);
    },
    collection: (sub: string) => makeCollectionRef(`${docPath}/${sub}`),
  });

  const makeCollectionRef = (colPath: string): any => {
    const listDirectDocs = () => {
      const prefix = `${colPath}/`;
      const results: any[] = [];
      for (const [key, val] of store.entries()) {
        if (!key.startsWith(prefix)) continue;
        const remainder = key.slice(prefix.length);
        if (remainder.includes("/")) continue; // direct children only
        results.push({
          id: remainder,
          ref: makeDocRef(key),
          exists: true,
          data: () => val,
        });
      }
      return results;
    };

    return {
      doc: (id?: string) => makeDocRef(`${colPath}/${id || `auto_${Math.random().toString(36).slice(2, 10)}`}`),
      get: async () => {
        const docs = listDirectDocs();
        return { empty: docs.length === 0, size: docs.length, docs };
      },
      where: (field: string, op: string, value: any) => ({
        get: async () => {
          const docs = listDirectDocs().filter((d) => op === "==" && d.data()?.[field] === value);
          return { empty: docs.length === 0, size: docs.length, docs };
        },
      }),
    };
  };

  const db = {
    collection: (name: string) => makeCollectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        delete: (ref: any) => {
          ops.push(() => store.delete(ref.path));
        },
        update: (ref: any, patch: any) => {
          ops.push(() => {
            const prev = store.get(ref.path) || {};
            store.set(ref.path, { ...prev, ...patch });
          });
        },
        commit: async () => {
          ops.forEach((fn) => fn());
        },
      };
    },
  };

  return { db, store };
}

describe("V47.4 Server-Side deleteUserAccount, GDPR Erasure & Anonymised P&L", () => {
  const NOW_MS = 1_760_000_000_000;
  const NOW_SEC = Math.floor(NOW_MS / 1000);

  it("1. Rejects unauthenticated callers with unauthenticated", async () => {
    const { db } = createMockFirestore();
    await expect(
      executeDeleteUserAccount({ auth: undefined, data: {} } as any, {
        db,
        auth: { deleteUser: vi.fn() },
        nowMs: NOW_MS,
      })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("2. Rejects stale sign-ins (auth_time > 300s) with REQUIRES_RECENT_LOGIN", async () => {
    const { db } = createMockFirestore();
    const staleAuthTime = NOW_SEC - (RECENT_LOGIN_MAX_AGE_SECONDS + 30);
    await expect(
      executeDeleteUserAccount(
        {
          auth: {
            uid: "user_stale",
            token: { email: "stale@example.com", auth_time: staleAuthTime },
          },
          data: {},
        } as any,
        {
          db,
          auth: { deleteUser: vi.fn() },
          nowMs: NOW_MS,
        }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("REQUIRES_RECENT_LOGIN"),
    });
  });

  it("3. Blocks deletion while an active non-expired curationLocks/{uid} exists", async () => {
    const uid = "user_curating";
    const { db } = createMockFirestore({
      [`curationLocks/${uid}`]: {
        uid,
        status: "active",
        expiresAt: NOW_MS + 120_000,
      },
    });
    const deleteUser = vi.fn();

    await expect(
      executeDeleteUserAccount(
        {
          auth: {
            uid,
            token: { email: "busy@example.com", auth_time: NOW_SEC - 10 },
          },
          data: {},
        } as any,
        { db, auth: { deleteUser }, nowMs: NOW_MS }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("ACTIVE_CURATION_IN_PROGRESS"),
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("4. Erases all user collections/Auth, scrubs curationFailures, and writes one zero-PII deletedAccountTelemetry summary", async () => {
    const uid = "user_paid_123";
    const { db, store } = createMockFirestore({
      [`users/${uid}`]: {
        email: "listener@example.com",
        displayName: "Vinyl Collector",
        tokenBalance: 35,
        lifetimeTokensPurchased: 100,
        lifetimeTokensSpent: 65,
        preflightApiUsage: { "gemini-3-flash-preview": { prompt: 2000, candidates: 500, total: 2500 } },
      },
      [`users/${uid}/projects/proj_1`]: {
        name: "90s Emo Map",
        tokensSpent: 10,
        generationType: "Live Synthesis",
        apiUsage: JSON.stringify({ "gemini-3.1-pro-preview": { prompt: 10000, candidates: 3000, total: 13000 } }),
      },
      [`users/${uid}/projects/proj_2`]: {
        name: "Direct Hit Cache",
        tokensSpent: 5,
        generationType: "Direct Hit",
      },
      [`users/${uid}/stack/stack_1`]: { id: "fugazi", type: "artist" },
      [`users/${uid}/userSession/current`]: { activeProjectId: "proj_1" },
      [`users/${uid}/tokenTransactions/tx_1`]: { type: "top_up", tokens: 100 },
      [`users/${uid}/deepWebQueries/q_1`]: { query: "Private user question about Fugazi" },
      "projects/legacy_1": { authorId: uid, name: "Legacy Project" },
      "sharedZcenes/share_1": { authorId: uid, seedArtists: "Fugazi" },
      [`curationLocks/${uid}`]: { uid, status: "active", expiresAt: NOW_MS - 10_000 }, // expired lock is deleted
      "curationSessions/sess_1": { uid, projectId: "proj_1" },
      "curationJobs/job_1": { userId: uid, projectId: "proj_1" },
      "deepWebSessions/dws_1": { uid, remainingMessages: 2 },
      "adminLedger/system/curationFailures/fail_1": {
        uid,
        userEmail: "listener@example.com",
        projectName: "Broken Emo Map",
        sunkCostUsd: 0.0412,
        tokensRefunded: 10,
      },
      // Unrelated user's docs must remain untouched
      "users/other_user": { email: "other@example.com", tokenBalance: 50 },
      "sharedZcenes/share_other": { authorId: "other_user", seedArtists: "Bane" },
    });

    const deleteUser = vi.fn(async () => {});
    const res = await executeDeleteUserAccount(
      {
        auth: {
          uid,
          token: { email: "listener@example.com", auth_time: NOW_SEC - 20 },
        },
        data: {},
      } as any,
      {
        db,
        auth: { deleteUser },
        nowMs: NOW_MS,
        generateArchiveId: () => "anon-archive-uuid-001",
      }
    );

    expect(res.ok).toBe(true);
    expect(res.archivedTelemetry).toBe(true);
    expect(res.archiveId).toBe("anon-archive-uuid-001");
    expect(res.scrubbedFailuresCount).toBe(1);
    expect(deleteUser).toHaveBeenCalledWith(uid);

    // Every single user-owned doc & subcollection is gone
    expect(store.has(`users/${uid}`)).toBe(false);
    expect(store.has(`users/${uid}/projects/proj_1`)).toBe(false);
    expect(store.has(`users/${uid}/projects/proj_2`)).toBe(false);
    expect(store.has(`users/${uid}/stack/stack_1`)).toBe(false);
    expect(store.has(`users/${uid}/userSession/current`)).toBe(false);
    expect(store.has(`users/${uid}/tokenTransactions/tx_1`)).toBe(false);
    expect(store.has(`users/${uid}/deepWebQueries/q_1`)).toBe(false);
    expect(store.has("projects/legacy_1")).toBe(false);
    expect(store.has("sharedZcenes/share_1")).toBe(false);
    expect(store.has(`curationLocks/${uid}`)).toBe(false);
    expect(store.has("curationSessions/sess_1")).toBe(false);
    expect(store.has("curationJobs/job_1")).toBe(false);
    expect(store.has("deepWebSessions/dws_1")).toBe(false);

    // Unrelated user untouched
    expect(store.has("users/other_user")).toBe(true);
    expect(store.has("sharedZcenes/share_other")).toBe(true);

    // curationFailures PII scrubbed while retaining sunk USD & refunded tokens
    const scrubbedFailure = store.get("adminLedger/system/curationFailures/fail_1");
    expect(scrubbedFailure.uid).toBe("deleted_account");
    expect(scrubbedFailure.userEmail).toBeNull();
    expect(scrubbedFailure.projectName).toBe("deleted_account");
    expect(scrubbedFailure.sunkCostUsd).toBe(0.0412);
    expect(scrubbedFailure.tokensRefunded).toBe(10);

    // Zero-PII financial archive written cleanly
    const archive = store.get("adminLedger/system/deletedAccountTelemetry/anon-archive-uuid-001");
    expect(archive).toBeDefined();
    expect(archive.lifetimeTokensPurchased).toBe(100);
    expect(archive.lifetimeTokensSpent).toBe(65);
    expect(archive.forfeitedTokenBalance).toBe(35);
    expect(archive.totalCurations).toBe(2);
    expect(archive.directHitCurations).toBe(1);
    expect(archive.totalAiCostUsd).toBeGreaterThan(0);
    // Strict zero-PII check
    const serialized = JSON.stringify(archive);
    expect(serialized).not.toContain(uid);
    expect(serialized).not.toContain("listener@example.com");
    expect(serialized).not.toContain("Vinyl Collector");
    expect(serialized).not.toContain("90s Emo");
  });

  it("5. Skips deletedAccountTelemetry archival for zero-activity non-admin accounts", async () => {
    const uid = "user_zero_activity";
    const { db, store } = createMockFirestore({
      [`users/${uid}`]: {
        email: "newuser@example.com",
        tokenBalance: 0,
        lifetimeTokensPurchased: 0,
        lifetimeTokensSpent: 0,
      },
    });
    const deleteUser = vi.fn(async () => {});
    const res = await executeDeleteUserAccount(
      {
        auth: {
          uid,
          token: { email: "newuser@example.com", auth_time: NOW_SEC - 5 },
        },
        data: {},
      } as any,
      { db, auth: { deleteUser }, nowMs: NOW_MS }
    );

    expect(res.ok).toBe(true);
    expect(res.archivedTelemetry).toBe(false);
    expect(res.archiveId).toBeNull();
    expect(store.has(`users/${uid}`)).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith(uid);
  });

  it("6. computeAggregateMetrics folds anonymised deletedAccountTelemetry into Admin P&L without inflating active float", () => {
    const activeUser: UserTelemetry = {
      uid: "u_active",
      email: "active@example.com",
      tokenBalance: 20,
      lifetimeTokensPurchased: 50,
      lifetimeTokensSpent: 30,
      projectsCount: 1,
      hasExactCost: true,
      exactCost: 0.25,
      actionTriggers: { createCount: 1, updateCount: 0 },
      artistSearches: { globalCount: 1, topSearches: [] },
      cacheEfficiency: { cacheHits: 0, liveQueries: 1 },
      deepCutsOpened: 0,
      projects: [{ id: "p1", name: "Active Map", createdAt: 1, generationType: "Live Synthesis", cost: 0.25, isEstimate: false } as any],
    };

    const deletedArchives: DeletedAccountTelemetryRecord[] = [
      {
        id: "anon-archive-uuid-001",
        deletedAtMs: NOW_MS,
        lifetimeTokensPurchased: 100,
        lifetimeTokensSpent: 65,
        forfeitedTokenBalance: 35,
        totalAiCostUsd: 0.45,
        totalCurations: 2,
        directHitCurations: 1,
      },
    ];

    const metrics = computeAggregateMetrics([activeUser], [], [], deletedArchives);
    expect(metrics.customerTokensSpent).toBe(95); // 30 active + 65 deleted
    expect(metrics.customerGrossPurchasedTokens).toBe(150); // 50 active + 100 deleted
    expect(metrics.customerUnspentFloatTokens).toBe(20); // Active ONLY (35T forfeited is NOT active float!)
    expect(metrics.customerAiCostUsd).toBeCloseTo(0.7, 4); // 0.25 + 0.45
    expect(metrics.totalPlatformAiCostUsd).toBeCloseTo(0.7, 4);
    expect(metrics.totalCurations).toBe(3); // 1 active + 2 deleted
    expect(metrics.directHitCurations).toBe(1);
    expect(metrics.deletedAccountsCount).toBe(1);
    expect(metrics.forfeitedTokensFromDeletedAccounts).toBe(35);
  });

  it("7. Locks firestore.rules: users/{userId} delete is Admin-only (blocking sole Admin UID), stack/userSession remain owner-deletable, deletedAccountTelemetry is Admin-read/server-write-only", () => {
    const rulesSrc = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf-8");

    const usersBlock = rulesSrc.slice(
      rulesSrc.indexOf("match /users/{userId}"),
      rulesSrc.indexOf("match /tokenTransactions/{txId}")
    );
    expect(usersBlock).toContain(`allow delete: if isAdmin() && userId != '${ADMIN_UID}';`);
    expect(usersBlock).not.toContain("allow delete: if isOwner(userId)");

    const stackBlock = rulesSrc.slice(
      rulesSrc.indexOf("match /stack/{itemId}"),
      rulesSrc.indexOf("match /userSession/{sessionId}")
    );
    expect(stackBlock).toContain("allow delete: if isOwner(userId) || isAdmin();");

    const sessionBlock = rulesSrc.slice(
      rulesSrc.indexOf("match /userSession/{sessionId}"),
      rulesSrc.indexOf("match /deepWebQueries/{queryId}")
    );
    expect(sessionBlock).toContain("allow delete: if isOwner(userId) || isAdmin();");

    const deletedTelemetryBlock = rulesSrc.slice(
      rulesSrc.indexOf("match /adminLedger/system/deletedAccountTelemetry/{archiveId}"),
      rulesSrc.indexOf("match /curationSessions/{sessionId}")
    );
    expect(deletedTelemetryBlock).toContain("allow read: if isAdmin();");
    expect(deletedTelemetryBlock).toContain("allow write: if false;");
  });

  it("8. Wires App.tsx Delete Account modal & Header.tsx to deleteUserAccount callable, Admin protection guards, Design System anatomy (<ModalHeader>/<ModalFooter>/<Checkbox>) & token forfeiture warning", () => {
    const appSrc = fs.readFileSync(path.resolve(__dirname, "../../App.tsx"), "utf-8");
    const headerSrc = fs.readFileSync(path.resolve(__dirname, "../../components/Header.tsx"), "utf-8");
    expect(appSrc).toContain("httpsCallable(functions, 'deleteUserAccount'");
    expect(appSrc).toContain("reauthenticateWithGoogle()");
    expect(appSrc).toContain("REQUIRES_RECENT_LOGIN");
    expect(appSrc).toContain("ACTIVE_CURATION_IN_PROGRESS");
    expect(appSrc).toContain("ADMIN_ACCOUNT_PROTECTED");
    expect(appSrc).toContain("if (!user || isProtectedAdmin) return;");
    expect(appSrc).toContain("{isDeleteAccountModalOpen && !isProtectedAdmin && (");
    expect(headerSrc).toContain("!(isAdmin || isProtectedAdminIdentity(user?.uid, user?.email))");

    const modalSlice = appSrc.slice(
      appSrc.indexOf('data-testid="delete-account-modal"'),
      appSrc.indexOf('data-testid="delete-account-modal"') + 4500
    );
    expect(modalSlice).toContain("<ModalHeader");
    expect(modalSlice).toContain("<ModalFooter");
    expect(modalSlice).toContain("<Checkbox");
    expect(modalSlice).toContain("text-red-400");
    expect(modalSlice).toContain("bg-red-500");
    expect(modalSlice).toContain('data-testid="delete-account-token-warning"');
    expect(modalSlice).toContain('data-testid="delete-account-confirm-checkbox"');
    expect(modalSlice).toContain('data-testid="delete-account-error"');
    expect(modalSlice).toContain("disabled={isDeletingAccount || !deleteAccountConfirmed}");
  });

  it("9. Hard-blocks sole Admin self-deletion fail-closed (ADMIN_UID || ADMIN_EMAIL) before auth_time, DB, or Auth calls", async () => {
    const dbSpy = {
      collection: vi.fn(() => {
        throw new Error("DB should never be touched for protected Admin self-deletion");
      }),
    };
    const deleteUser = vi.fn();

    const cases = [
      // Full Admin UID + email (fresh auth_time)
      { uid: ADMIN_UID, email: ADMIN_EMAIL, auth_time: NOW_SEC - 5 },
      // Admin UID alone with different email (OR fail-closed)
      { uid: ADMIN_UID, email: "other@example.com", auth_time: NOW_SEC - 5 },
      // Admin email alone with different UID + mixed case (OR fail-closed)
      { uid: "some_other_uid", email: ADMIN_EMAIL.toUpperCase(), auth_time: NOW_SEC - 5 },
      // Admin with stale auth_time — must still reject as permission-denied BEFORE auth_time check
      { uid: ADMIN_UID, email: ADMIN_EMAIL, auth_time: NOW_SEC - 99999 },
    ];

    for (const c of cases) {
      await expect(
        executeDeleteUserAccount(
          {
            auth: {
              uid: c.uid,
              token: { email: c.email, auth_time: c.auth_time },
            },
            data: {},
          } as any,
          { db: dbSpy, auth: { deleteUser }, nowMs: NOW_MS }
        )
      ).rejects.toMatchObject({
        code: "permission-denied",
        message: expect.stringContaining("ADMIN_ACCOUNT_PROTECTED"),
      });
    }

    expect(dbSpy.collection).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

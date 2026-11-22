import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store, mockFirestoreDb, resetMockCounter } = vi.hoisted(() => {
  const store = new Map<string, Record<string, any>>();
  let autoDocCounter = 0;

  function cloneVal(v: any): any {
    if (v === null || v === undefined || typeof v !== 'object') return v;
    if (typeof v.toMillis === 'function') return v;
    if (v.__sentinel) return v;
    if (Array.isArray(v)) return v.map(cloneVal);
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) {
      if (v[k] !== undefined) out[k] = cloneVal(v[k]);
    }
    return out;
  }

  function applyData(existing: Record<string, any> | undefined, incoming: Record<string, any>, merge: boolean): Record<string, any> {
    const base = merge && existing ? cloneVal(existing) : {};
    for (const [k, rawVal] of Object.entries(incoming)) {
      if (rawVal === undefined) continue;
      if (rawVal && rawVal.__sentinel === 'increment') {
        base[k] = (Number(base[k]) || 0) + rawVal.amount;
      } else if (rawVal && rawVal.__sentinel === 'serverTimestamp') {
        base[k] = { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) };
      } else {
        base[k] = cloneVal(rawVal);
      }
    }
    return base;
  }

  function makeDocRef(docPath: string) {
    const parts = docPath.split('/');
    const id = parts[parts.length - 1];
    const ref: any = {
      id,
      path: docPath,
      collection: (sub: string) => makeCollectionRef(`${docPath}/${sub}`),
      get: async () => {
        const data = store.get(docPath);
        return {
          id,
          ref,
          exists: data !== undefined,
          data: () => (data !== undefined ? cloneVal(data) : undefined),
        };
      },
      set: async (data: Record<string, any>, opts?: { merge?: boolean }) => {
        store.set(docPath, applyData(store.get(docPath), data, Boolean(opts?.merge)));
      },
      update: async (data: Record<string, any>) => {
        const existing = store.get(docPath);
        if (!existing) throw new Error(`NOT_FOUND: ${docPath}`);
        store.set(docPath, applyData(existing, data, true));
      },
      delete: async () => {
        store.delete(docPath);
      },
    };
    return ref;
  }

  function makeCollectionRef(colPath: string) {
    return {
      doc: (docId?: string) => {
        const resolvedId = docId || `auto_${++autoDocCounter}`;
        return makeDocRef(`${colPath}/${resolvedId}`);
      },
      where: (field: string, op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs: any[] = [];
            const prefix = `${colPath}/`;
            for (const [k, v] of store.entries()) {
              if (!k.startsWith(prefix)) continue;
              if (k.slice(prefix.length).includes('/')) continue;
              const fVal = typeof v[field]?.toMillis === 'function' ? v[field].toMillis() : v[field];
              const cmpVal = typeof value?.toMillis === 'function' ? value.toMillis() : value;
              if (op === '<=' && fVal <= cmpVal) {
                const id = k.slice(prefix.length);
                docs.push({ id, ref: makeDocRef(k), exists: true, data: () => cloneVal(v) });
              }
            }
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        }),
      }),
    };
  }

  let txChain: Promise<any> = Promise.resolve();

  const mockFirestoreDb = {
    settings: vi.fn(),
    collection: (name: string) => makeCollectionRef(name),
    runTransaction: async <T,>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const run = async () => {
        const stagedOps: Array<() => void> = [];
        const tx = {
          get: async (ref: any) => ref.get(),
          set: (ref: any, data: Record<string, any>, opts?: { merge?: boolean }) => {
            stagedOps.push(() => {
              store.set(ref.path, applyData(store.get(ref.path), data, Boolean(opts?.merge)));
            });
          },
          update: (ref: any, data: Record<string, any>) => {
            stagedOps.push(() => {
              const existing = store.get(ref.path);
              if (!existing) throw new Error(`NOT_FOUND: ${ref.path}`);
              store.set(ref.path, applyData(existing, data, true));
            });
          },
          delete: (ref: any) => {
            stagedOps.push(() => {
              store.delete(ref.path);
            });
          },
        };
        const res = await fn(tx);
        for (const op of stagedOps) op();
        return res;
      };
      const next = txChain.then(run, run);
      txChain = next.catch(() => {});
      return next;
    },
  };

  const resetMockCounter = () => {
    autoDocCounter = 0;
  };

  return { store, mockFirestoreDb, resetMockCounter };
});

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{ name: 'mock' }],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockFirestoreDb,
  FieldValue: {
    serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
    increment: (amount: number) => ({ __sentinel: 'increment', amount }),
  },
  Timestamp: {
    fromMillis: (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) }),
    now: () => {
      const ms = Date.now();
      return { toMillis: () => ms, seconds: Math.floor(ms / 1000) };
    },
  },
}));

import {
  STALE_LOCK_TTL_MS,
  isCurationLockActive,
  computeUncompletedScenesRefundCost,
  settleCurationProjectTokens,
  refundProjectSettlementOnError,
  updateCurationLockJobId,
  refreshCurationLock,
  releaseCurationLock,
  recoverStaleCurationLock,
  requireAuthenticatedCaller,
  mergeApiUsageMaps,
  computeApiUsageCostUsd,
  recordCurationFailureAudit,
} from '../src/tokenWallet';
import { ADMIN_EMAIL, ADMIN_UID } from '../src/shared/tokenEconomy';

describe('Phase 1 Backend Atomic 1-at-a-Time Curation Lock, Stale-Job Safety Valve & Auto-Refunds', () => {
  beforeEach(() => {
    store.clear();
    resetMockCounter();
  });

  it('enforces uniform 1-at-a-time concurrency lock inside settleCurationProjectTokens for standard users with 0 tokens deducted on rejection', async () => {
    store.set('users/user-1', { email: 'u1@test.com', tokenBalance: 50, lifetimeTokensSpent: 0 });
    store.set('users/user-1/projects/proj-A', { name: 'A', seedArtists: 'Turnstile', tokensSpent: 0 });
    store.set('users/user-1/projects/proj-B', { name: 'B', seedArtists: 'Fugazi', tokensSpent: 0 });

    const caller = { uid: 'user-1', email: 'u1@test.com', isAdmin: false };

    const [res1, res2] = await Promise.allSettled([
      settleCurationProjectTokens({
        caller,
        curationSessionId: 'sess-A',
        totalProjectCost: 5,
        projectId: 'proj-A',
        txType: 'spend_live_synthesis',
        description: 'Zcene Synthesis: Turnstile',
      }),
      settleCurationProjectTokens({
        caller,
        curationSessionId: 'sess-B',
        totalProjectCost: 5,
        projectId: 'proj-B',
        txType: 'spend_live_synthesis',
        description: 'Zcene Synthesis: Fugazi',
      }),
    ]);

    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('rejected');
    if (res2.status === 'rejected') {
      expect(res2.reason.code).toBe('resource-exhausted');
      expect(res2.reason.message).toContain('ACTIVE_CURATION_IN_PROGRESS');
    }

    // Only 5T deducted (never double-spent)
    expect(store.get('users/user-1')?.tokenBalance).toBe(45);
    expect(store.get('curationLocks/user-1')?.curationSessionId).toBe('sess-A');
    expect(store.get('curationLocks/user-1')?.status).toBe('active');
  });

  it('enforces the exact same 1-at-a-time concurrency lock uniformly for Admin (no admin bypass)', async () => {
    const adminCaller = { uid: ADMIN_UID, email: ADMIN_EMAIL, isAdmin: true };

    await settleCurationProjectTokens({
      caller: adminCaller,
      curationSessionId: 'admin-sess-1',
      totalProjectCost: 5,
      projectId: 'admin-proj-1',
      txType: 'spend_live_synthesis',
      description: 'Admin Scene 1',
    });

    expect(store.get(`curationLocks/${ADMIN_UID}`)?.curationSessionId).toBe('admin-sess-1');

    await expect(
      settleCurationProjectTokens({
        caller: adminCaller,
        curationSessionId: 'admin-sess-2',
        totalProjectCost: 5,
        projectId: 'admin-proj-2',
        txType: 'spend_live_synthesis',
        description: 'Admin Scene 2',
      })
    ).rejects.toThrow(/ACTIVE_CURATION_IN_PROGRESS/);
  });

  it('reclaims expired stale lock (> 10 min) inline, allows new curation, and auto-refunds crashed stale job idempotently', async () => {
    const expiredMs = Date.now() - STALE_LOCK_TTL_MS - 60_000;
    store.set('users/user-stale', { email: 'stale@test.com', tokenBalance: 45, lifetimeTokensSpent: 5 });
    store.set('curationSessions/sess-stale', {
      sessionId: 'sess-stale',
      uid: 'user-stale',
      status: 'settled',
      preFlightTokensDeducted: 1,
      settlementTokensDeducted: 4,
      projectId: 'proj-stale',
    });
    store.set('curationJobs/job-stale', {
      status: 'processing',
      userId: 'user-stale',
      inputPayload: { projectId: 'proj-stale', curationSessionId: 'sess-stale' },
    });
    store.set('users/user-stale/projects/proj-stale', {
      name: 'Stale Project',
      status: 'curating',
      activeJobId: 'job-stale',
      tokensSpent: 5,
      scenes: JSON.stringify([{ sceneId: 'scene-1', seedArtists: 'Turnstile', graphData: { nodes: [], links: [] } }]),
    });
    store.set('curationLocks/user-stale', {
      uid: 'user-stale',
      projectId: 'proj-stale',
      jobId: 'job-stale',
      curationSessionId: 'sess-stale',
      status: 'active',
      expiresAt: { toMillis: () => expiredMs },
    });

    expect(isCurationLockActive(store.get('curationLocks/user-stale'))).toBe(false);

    const settlement = await settleCurationProjectTokens({
      caller: { uid: 'user-stale', email: 'stale@test.com', isAdmin: false },
      curationSessionId: 'sess-fresh',
      totalProjectCost: 5,
      projectId: 'proj-fresh',
      txType: 'spend_live_synthesis',
      description: 'Fresh Curation',
    });

    // Wait briefly for the post-tx async stale lock recovery to finish
    await new Promise((r) => setTimeout(r, 25));

    expect(settlement.curationSessionId).toBe('sess-fresh');
    // Lock now belongs to sess-fresh (NOT deleted by stale recovery!)
    expect(store.get('curationLocks/user-stale')?.curationSessionId).toBe('sess-fresh');
    // Old job marked failed, old project unlocked, old 4T settlement refunded (+4T -> 45 - 5 + 4 = 44T)
    expect(store.get('curationJobs/job-stale')?.status).toBe('failed');
    expect(store.get('users/user-stale/projects/proj-stale')?.status).toBe('failed');
    expect(store.get('users/user-stale/projects/proj-stale')?.activeJobId).toBeNull();
    expect(store.get('curationSessions/sess-stale')?.status).toBe('refunded_settlement');
    expect(store.get('users/user-stale')?.tokenBalance).toBe(44);

    // Calling recoverStaleCurationLock a second time is strictly idempotent (no double-refund)
    await recoverStaleCurationLock({
      uid: 'user-stale',
      jobId: 'job-stale',
      projectId: 'proj-stale',
      curationSessionId: 'sess-stale',
    });
    expect(store.get('users/user-stale')?.tokenBalance).toBe(44);
  });

  it('supports stamp, chained hop refresh, and compare-and-release lock lifecycle safely', async () => {
    const caller = { uid: 'user-chain', email: 'chain@test.com', isAdmin: false };
    store.set('users/user-chain', { email: 'chain@test.com', tokenBalance: 50, lifetimeTokensSpent: 0 });

    await settleCurationProjectTokens({
      caller,
      curationSessionId: 'sess-chain-1',
      totalProjectCost: 10,
      projectId: 'proj-chain',
      txType: 'spend_live_synthesis',
      description: 'Multi-Scene Batch',
    });

    await updateCurationLockJobId('user-chain', 'sess-chain-1', 'job-hop-1');
    expect(store.get('curationLocks/user-chain')?.jobId).toBe('job-hop-1');

    await refreshCurationLock('user-chain', 'sess-chain-1', 'job-hop-2');
    expect(store.get('curationLocks/user-chain')?.jobId).toBe('job-hop-2');

    // Wrong session cannot release another session's lock
    await releaseCurationLock('user-chain', 'sess-wrong');
    expect(store.get('curationLocks/user-chain')).toBeDefined();

    // Matching session releases lock cleanly
    await releaseCurationLock('user-chain', 'sess-chain-1');
    expect(store.get('curationLocks/user-chain')).toBeUndefined();
  });

  it('sums refund cost across ALL remaining uncurated scenes on mid-hop batch failure (Scene 2 + unstarted Scene 3)', () => {
    const scenes = [
      {
        sceneId: 'scene-1',
        seedArtists: 'Turnstile',
        discoveryFilters: {},
        graphData: { nodes: [{ id: 'turnstile-us' }, { id: 'trapped-under-ice-us' }], links: [] },
      },
      {
        sceneId: 'scene-2',
        seedArtists: 'Fugazi',
        discoveryFilters: {},
        graphData: { nodes: [], links: [] },
      },
      {
        sceneId: 'scene-3',
        seedArtists: 'Converge::Botch',
        discoveryFilters: {},
        graphData: { nodes: [], links: [] },
      },
    ];

    // Scene 2 (5T) + unstarted Scene 3 (10T complex multi-seed) = 15T refunded!
    const refundCost = computeUncompletedScenesRefundCost({
      scenes,
      targetSceneId: 'scene-2',
      fallbackArtists: ['Fugazi'],
      fallbackFilters: {},
    });
    expect(refundCost).toBe(15);

    // If 0 scenes completed -> returns undefined for full settlement refund
    const fullFailCost = computeUncompletedScenesRefundCost({
      scenes: [{ sceneId: 'scene-1', seedArtists: 'Turnstile', graphData: { nodes: [], links: [] } }],
      targetSceneId: 'scene-1',
    });
    expect(fullFailCost).toBeUndefined();
  });

  it('preserves prior scenes project.tokensSpent when refunding Scene 2 on an existing multi-scene project', async () => {
    // Existing project already had Scene 1 (5T) + new Scene 2 settled (1T preflight + 4T settlement = 10T cumulative)
    store.set('users/user-ms', { email: 'ms@test.com', tokenBalance: 40, lifetimeTokensSpent: 10 });
    store.set('users/user-ms/projects/proj-ms', { name: 'Multi', tokensSpent: 10 });
    store.set('curationSessions/sess-scene2', {
      sessionId: 'sess-scene2',
      uid: 'user-ms',
      status: 'settled',
      preFlightTokensDeducted: 1,
      settlementTokensDeducted: 4,
      projectId: 'proj-ms',
    });

    await refundProjectSettlementOnError({
      uid: 'user-ms',
      projectId: 'proj-ms',
      curationSessionId: 'sess-scene2',
      reason: 'Scene 2 Pipeline Error',
    });

    // Wallet refunded +4T (40 -> 44)
    expect(store.get('users/user-ms')?.tokenBalance).toBe(44);
    // Project tokensSpent decremented by 4T (10 -> 6: Scene 1's 5T + Scene 2's 1T pre-flight)
    expect(store.get('users/user-ms/projects/proj-ms')?.tokensSpent).toBe(6);
  });

  it('returns cumulative projectTokensSpent when settling Scene 2 on an existing project', async () => {
    store.set('users/user-cum', { email: 'cum@test.com', tokenBalance: 50, lifetimeTokensSpent: 5 });
    store.set('users/user-cum/projects/proj-cum', { name: 'Existing', tokensSpent: 5 });

    const settlement = await settleCurationProjectTokens({
      caller: { uid: 'user-cum', email: 'cum@test.com', isAdmin: false },
      curationSessionId: 'sess-s2',
      totalProjectCost: 5,
      projectId: 'proj-cum',
      txType: 'spend_live_synthesis',
      description: 'Scene 2 Addition',
    });

    expect(settlement.tokensSpent).toBe(5);
    expect(settlement.projectTokensSpent).toBe(10);
    expect(store.get('users/user-cum/projects/proj-cum')?.tokensSpent).toBe(10);
  });

  it('captures checkpointed partialApiUsage + foregroundApiUsage on stale-reaper timeout into adminLedger/system/curationFailures and refund tx idempotently', async () => {
    store.set('users/user-sunk', { email: 'sunk@test.com', tokenBalance: 40, lifetimeTokensSpent: 10 });
    store.set('curationSessions/sess-sunk', {
      sessionId: 'sess-sunk',
      uid: 'user-sunk',
      status: 'settled',
      preFlightTokensDeducted: 1,
      settlementTokensDeducted: 4,
      projectId: 'proj-sunk',
    });
    store.set('users/user-sunk/projects/proj-sunk', {
      name: 'Fugazi',
      status: 'curating',
      activeJobId: 'job-sunk',
      tokensSpent: 5,
      scenes: JSON.stringify([{ sceneId: 'scene-1', seedArtists: 'Fugazi', graphData: { nodes: [], links: [] } }]),
    });
    store.set('curationJobs/job-sunk', {
      status: 'processing',
      userId: 'user-sunk',
      inputPayload: {
        projectId: 'proj-sunk',
        projectName: 'Fugazi',
        targetSceneId: 'scene-1',
        curationSessionId: 'sess-sunk',
        foregroundApiUsage: {
          'gemini-3.1-pro-preview': { prompt: 10_000, candidates: 2_000, total: 12_000 },
        },
      },
      partialApiUsage: {
        'gemini-3.6-flash': { prompt: 20_000, candidates: 4_000, total: 24_000 },
      },
    });

    // Verify helper math directly
    const merged = mergeApiUsageMaps(
      { 'gemini-3.1-pro-preview': { prompt: 10_000, candidates: 2_000, total: 12_000 } },
      { 'gemini-3.6-flash': { prompt: 20_000, candidates: 4_000, total: 24_000 } }
    );
    const computed = computeApiUsageCostUsd(merged);
    // Pro: (10k/1M)*3.5 + (2k/1M)*10.5 = 0.035 + 0.021 = 0.056
    // Flash: (20k/1M)*1.5 + (4k/1M)*7.5 = 0.030 + 0.030 = 0.060 -> total = 0.116
    expect(computed.costUsd).toBeCloseTo(0.116, 4);
    expect(computed.totalTokens).toBe(36_000);

    await recoverStaleCurationLock({
      uid: 'user-sunk',
      jobId: 'job-sunk',
      projectId: 'proj-sunk',
      curationSessionId: 'sess-sunk',
    });

    const failureDoc = store.get('adminLedger/system/curationFailures/sess-sunk');
    expect(failureDoc).toBeDefined();
    expect(failureDoc?.source).toBe('stale_reaper');
    expect(failureDoc?.uid).toBe('user-sunk');
    expect(failureDoc?.userEmail).toBe('sunk@test.com');
    expect(failureDoc?.projectName).toBe('Fugazi');
    expect(failureDoc?.tokensRefunded).toBe(4);
    expect(failureDoc?.isFullRefund).toBe(true);
    expect(failureDoc?.sunkTotalTokens).toBe(36_000);
    expect(failureDoc?.sunkCostUsd).toBeCloseTo(0.116, 4);

    // Verify refund_pipeline_error tx also carries sunkCostUsd
    const txEntries = Array.from(store.entries()).filter(([k]) =>
      k.startsWith('users/user-sunk/tokenTransactions/')
    );
    expect(txEntries).toHaveLength(1);
    expect(txEntries[0][1].type).toBe('refund_pipeline_error');
    expect(txEntries[0][1].sunkCostUsd).toBeCloseTo(0.116, 4);

    // Re-running recordCurationFailureAudit for the same session is idempotent and preserves higher sunk cost
    await recordCurationFailureAudit({
      source: 'column3_worker_error',
      uid: 'user-sunk',
      curationSessionId: 'sess-sunk',
      tokensRefunded: 0,
      isFullRefund: false,
      reason: 'Duplicate retry',
      sunkApiUsage: {},
    });
    const afterDuplicate = store.get('adminLedger/system/curationFailures/sess-sunk');
    expect(afterDuplicate?.sunkCostUsd).toBeCloseTo(0.116, 4);
    expect(afterDuplicate?.tokensRefunded).toBe(4);
  });

  it('rejects unauthenticated requests via requireAuthenticatedCaller', () => {
    expect(() => requireAuthenticatedCaller({ auth: undefined } as any)).toThrow(/Please sign in/);
  });
});

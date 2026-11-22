import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { store, mockFirestoreDb, mockGetUserByEmail, resetMocks } = vi.hoisted(() => {
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
        const resolvedId = docId || `tx_${++autoDocCounter}`;
        return makeDocRef(`${colPath}/${resolvedId}`);
      },
    };
  }

  const mockFirestoreDb = {
    settings: vi.fn(),
    collection: (name: string) => makeCollectionRef(name),
    runTransaction: async <T,>(fn: (tx: any) => Promise<T>): Promise<T> => {
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
          stagedOps.push(() => store.delete(ref.path));
        },
      };
      const res = await fn(tx);
      for (const op of stagedOps) op();
      return res;
    },
  };

  const mockGetUserByEmail = vi.fn();

  const resetMocks = () => {
    store.clear();
    autoDocCounter = 0;
    mockGetUserByEmail.mockReset();
  };

  return { store, mockFirestoreDb, mockGetUserByEmail, resetMocks };
});

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{ name: 'mock' }],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUserByEmail: mockGetUserByEmail,
  }),
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
  executeAdminGrantTokens,
  executeSimulatedStripeTopUp,
} from '../src/tokenWallet';
import { ADMIN_EMAIL, ADMIN_UID } from '../src/shared/tokenEconomy';

describe('Phase 2 Backend: adminGrantTokens & Flexible Simulated Top-Up', () => {
  const adminCaller = { uid: ADMIN_UID, email: ADMIN_EMAIL, isAdmin: true };
  const standardCaller = { uid: 'user-regular', email: 'member@example.com', isAdmin: false };
  const originalAllowSim = process.env.ALLOW_SIMULATED_TOPUP;

  beforeEach(() => {
    resetMocks();
    delete process.env.ALLOW_SIMULATED_TOPUP;
  });

  afterEach(() => {
    if (originalAllowSim === undefined) delete process.env.ALLOW_SIMULATED_TOPUP;
    else process.env.ALLOW_SIMULATED_TOPUP = originalAllowSim;
  });

  describe('adminGrantTokens (executeAdminGrantTokens)', () => {
    it('strictly rejects non-admin callers with permission-denied', async () => {
      await expect(
        executeAdminGrantTokens(standardCaller, {
          email: 'target@example.com',
          amount: 25,
          reason: 'Goodwill credit',
        })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('validates email, integer amount (1..10000), reason length, and unknown auth users', async () => {
      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'not-an-email', amount: 10 })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'a@b.com', amount: 0 })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'a@b.com', amount: -5 })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'a@b.com', amount: 1.5 })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'a@b.com', amount: 10001 })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'a@b.com', amount: 10, reason: 'x'.repeat(201) })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      mockGetUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found', message: 'user-not-found' });
      await expect(
        executeAdminGrantTokens(adminCaller, { email: 'missing@example.com', amount: 10 })
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('atomically increments tokenBalance (preserving lifetimeTokensPurchased) and writes admin_grant audit receipt', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({ uid: 'target-uid-42', email: 'fan@example.com' });
      store.set('users/target-uid-42', {
        email: 'fan@example.com',
        tokenBalance: 15,
        lifetimeTokensPurchased: 50,
        lifetimeTokensSpent: 35,
      });

      const res = await executeAdminGrantTokens(adminCaller, {
        email: '  FAN@EXAMPLE.COM ',
        amount: 25,
        reason: 'Goodwill credit for failed beta run',
      });

      expect(mockGetUserByEmail).toHaveBeenCalledWith('fan@example.com');
      expect(res).toMatchObject({
        success: true,
        targetUid: 'target-uid-42',
        targetEmail: 'fan@example.com',
        amount: 25,
        tokenBalance: 40,
        reason: 'Goodwill credit for failed beta run',
        grantedBy: ADMIN_EMAIL,
      });

      // Wallet incremented atomically WITHOUT inflating lifetimeTokensPurchased
      const userDoc = store.get('users/target-uid-42');
      expect(userDoc?.tokenBalance).toBe(40);
      expect(userDoc?.lifetimeTokensPurchased).toBe(50);

      // Immutable audit receipt written to users/{uid}/tokenTransactions
      const txDoc = store.get(`users/target-uid-42/tokenTransactions/${res.transactionId}`);
      expect(txDoc).toMatchObject({
        id: res.transactionId,
        uid: 'target-uid-42',
        type: 'admin_grant',
        amount: 25,
        delta: 25,
        balanceAfter: 40,
        reason: 'Goodwill credit for failed beta run',
        description: 'Admin Grant: Goodwill credit for failed beta run',
        grantedBy: ADMIN_EMAIL,
        grantedByUid: ADMIN_UID,
      });
      expect(txDoc?.timestamp).toBeDefined();
      expect(txDoc?.createdAt).toBeDefined();
    });
  });

  describe('simulateStripeTopUpCallable (executeSimulatedStripeTopUp)', () => {
    it('blocks non-admin callers and blocks even admin when ALLOW_SIMULATED_TOPUP !== "true"', async () => {
      process.env.ALLOW_SIMULATED_TOPUP = 'true';
      await expect(
        executeSimulatedStripeTopUp(standardCaller, { quantity: 100, waiverAccepted: true })
      ).rejects.toMatchObject({ code: 'permission-denied' });

      delete process.env.ALLOW_SIMULATED_TOPUP;
      await expect(
        executeSimulatedStripeTopUp(adminCaller, { quantity: 100, waiverAccepted: true })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('enforces min 50 integer quantity and required waiverAccepted === true for flexible top-ups', async () => {
      process.env.ALLOW_SIMULATED_TOPUP = 'true';

      await expect(
        executeSimulatedStripeTopUp(adminCaller, { quantity: 49, waiverAccepted: true })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeSimulatedStripeTopUp(adminCaller, { quantity: 75.5, waiverAccepted: true })
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      await expect(
        executeSimulatedStripeTopUp(adminCaller, { quantity: 100, waiverAccepted: false })
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('credits flexible quantity (e.g. 75T = £7.50) atomically and returns Stripe-ready payload', async () => {
      process.env.ALLOW_SIMULATED_TOPUP = 'true';
      store.set(`users/${ADMIN_UID}`, {
        email: ADMIN_EMAIL,
        tokenBalance: 10,
        lifetimeTokensPurchased: 10,
        lifetimeTokensSpent: 0,
      });

      const res = await executeSimulatedStripeTopUp(adminCaller, {
        quantity: 75,
        waiverAccepted: true,
      });

      expect(res).toMatchObject({
        success: true,
        mode: 'simulated',
        currency: 'GBP',
        tokenBalance: 85,
        addedTokens: 75,
        quantity: 75,
        amountGbp: 7.5,
      });

      expect(store.get(`users/${ADMIN_UID}`)?.tokenBalance).toBe(85);
      expect(store.get(`users/${ADMIN_UID}`)?.lifetimeTokensPurchased).toBe(85);
    });
  });
});

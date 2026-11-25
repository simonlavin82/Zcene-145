/**
 * Stateful Closed-Loop In-Memory Firestore Harness for Vitest Integration Tests.
 *
 * Mirrors production Firestore reactivity without requiring the Java Emulator:
 * - Every client `setDoc` / `updateDoc` / `deleteDoc` / `addDoc` / `writeBatch.commit`
 *   mutates the in-memory document store and asynchronously fans out `onSnapshot`
 *   deliveries via `queueMicrotask` to all subscribed doc and collection listeners.
 * - `serverWrite(path, patch)` simulates out-of-band Cloud Functions writes
 *   (e.g., `processCurationJob`) without incrementing client write telemetry.
 * - Enforces a hard `maxWritesCircuitBreaker` (default: 25 client writes per doc)
 *   so runaway `onSnapshot -> updateDoc -> onSnapshot` loops fail fast with a trace.
 */

export interface MockDocRef {
  __type: 'doc';
  path: string;
  id: string;
  parentPath: string;
}

export interface MockCollectionRef {
  __type: 'collection';
  path: string;
  id: string;
}

export interface MockQueryConstraint {
  __constraint: 'where' | 'orderBy' | 'limit';
  field?: string;
  op?: string;
  value?: any;
  direction?: 'asc' | 'desc';
  limitCount?: number;
}

export interface MockQueryRef {
  __type: 'query';
  path: string;
  constraints: MockQueryConstraint[];
}

const SERVER_TIMESTAMP_SENTINEL = { __sentinel: 'serverTimestamp' };
const DELETE_FIELD_SENTINEL = { __sentinel: 'deleteField' };

function makeIncrementSentinel(delta: number) {
  return { __sentinel: 'increment', delta };
}

function makeTimestamp(ms: number) {
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    toDate: () => new Date(ms),
    toMillis: () => ms,
  };
}

function cloneAndResolveSentinels(
  value: any,
  existingValue: any,
  nowMs: number
): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (value.__sentinel === 'serverTimestamp') {
    return makeTimestamp(nowMs);
  }
  if (value.__sentinel === 'increment') {
    const prev = typeof existingValue === 'number' ? existingValue : 0;
    return prev + (value.delta ?? 0);
  }
  if (typeof value.toMillis === 'function' && typeof value.toDate === 'function') {
    return makeTimestamp(value.toMillis());
  }
  if (value instanceof Date) {
    return makeTimestamp(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneAndResolveSentinels(item, undefined, nowMs));
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = cloneAndResolveSentinels(
      v,
      existingValue && typeof existingValue === 'object' ? existingValue[k] : undefined,
      nowMs
    );
  }
  return out;
}

function deepCloneDoc(docData: any): any {
  if (docData === null || docData === undefined) return docData;
  if (typeof docData !== 'object') return docData;
  if (typeof docData.toMillis === 'function' && typeof docData.toDate === 'function') {
    return makeTimestamp(docData.toMillis());
  }
  if (Array.isArray(docData)) {
    return docData.map((v) => deepCloneDoc(v));
  }
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(docData)) {
    copy[k] = deepCloneDoc(v);
  }
  return copy;
}

function normalizePath(segments: string[]): string {
  return segments
    .flatMap((s) => String(s).split('/'))
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

function splitPath(fullPath: string): { id: string; parentPath: string } {
  const parts = fullPath.split('/').filter(Boolean);
  const id = parts[parts.length - 1] || '';
  const parentPath = parts.slice(0, -1).join('/');
  return { id, parentPath };
}

function getFieldValue(docId: string, data: Record<string, any>, field: string): any {
  if (field === '__name__') return docId;
  if (!field.includes('.')) return data[field];
  return field.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), data);
}

function setNestedField(target: Record<string, any>, field: string, value: any): void {
  if (!field.includes('.')) {
    target[field] = value;
    return;
  }
  const parts = field.split('.');
  let cur: Record<string, any> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function compareValues(a: any, b: any): number {
  const norm = (v: any) => {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    return v;
  };
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 0;
  if (na === undefined || na === null) return -1;
  if (nb === undefined || nb === null) return 1;
  if (typeof na === 'string' && typeof nb === 'string') return na < nb ? -1 : 1;
  return na < nb ? -1 : 1;
}

function matchesWhere(docId: string, data: Record<string, any>, c: MockQueryConstraint): boolean {
  const val = getFieldValue(docId, data, c.field || '');
  switch (c.op) {
    case '==':
      return val === c.value;
    case '!=':
      return val !== c.value;
    case '>=':
      return val !== undefined && val !== null && compareValues(val, c.value) >= 0;
    case '<=':
      return val !== undefined && val !== null && compareValues(val, c.value) <= 0;
    case '>':
      return val !== undefined && val !== null && compareValues(val, c.value) > 0;
    case '<':
      return val !== undefined && val !== null && compareValues(val, c.value) < 0;
    case 'in':
      return Array.isArray(c.value) && c.value.includes(val);
    case 'array-contains':
      return Array.isArray(val) && val.includes(c.value);
    default:
      return true;
  }
}

type DocListenerEntry = {
  path: string;
  cb: (snap: any) => void;
};

type CollectionListenerEntry = {
  path: string;
  constraints: MockQueryConstraint[];
  cb: (snap: any) => void;
};

export class StatefulFirestoreHarness {
  public store = new Map<string, Record<string, any>>();
  public writeCountByDoc = new Map<string, number>();
  public snapshotDeliveriesByDoc = new Map<string, number>();
  public lastPayloadByDoc = new Map<string, Record<string, any>>();
  public maxWritesCircuitBreaker = 25;

  private docListeners = new Map<string, Set<DocListenerEntry>>();
  private collectionListeners = new Map<string, Set<CollectionListenerEntry>>();
  private autoIdCounter = 0;

  public reset(): void {
    this.store.clear();
    this.writeCountByDoc.clear();
    this.snapshotDeliveriesByDoc.clear();
    this.lastPayloadByDoc.clear();
    this.docListeners.clear();
    this.collectionListeners.clear();
    this.autoIdCounter = 0;
    this.maxWritesCircuitBreaker = 25;
  }

  public nextAutoId(prefix = 'auto-doc'): string {
    this.autoIdCounter += 1;
    return `${prefix}-${this.autoIdCounter}`;
  }

  public seedDoc(path: string, data: Record<string, any>): void {
    const norm = normalizePath([path]);
    const resolved = cloneAndResolveSentinels(data, undefined, Date.now());
    this.store.set(norm, resolved);
  }

  public getRawDoc(path: string): Record<string, any> | undefined {
    const norm = normalizePath([path]);
    const raw = this.store.get(norm);
    return raw ? deepCloneDoc(raw) : undefined;
  }

  public listCollectionDocs(collectionPath: string): Array<{ id: string; path: string; data: Record<string, any> }> {
    const normCol = normalizePath([collectionPath]);
    const results: Array<{ id: string; path: string; data: Record<string, any> }> = [];
    for (const [docPath, data] of this.store.entries()) {
      const { id, parentPath } = splitPath(docPath);
      if (parentPath === normCol) {
        results.push({ id, path: docPath, data: deepCloneDoc(data) });
      }
    }
    return results;
  }

  public totalClientWrites(): number {
    let sum = 0;
    for (const c of this.writeCountByDoc.values()) sum += c;
    return sum;
  }

  /**
   * Simulates an out-of-band server/Cloud Function write (does NOT count as a client write
   * and does NOT trip the client write circuit breaker), while triggering all subscribed
   * client `onSnapshot` listeners asynchronously just like production Firestore.
   */
  public serverWrite(path: string, patch: Record<string, any>, options: { merge?: boolean } = { merge: true }): void {
    const norm = normalizePath([path]);
    const nowMs = Date.now();
    const existing = this.store.get(norm);
    let next: Record<string, any>;
    if (options.merge !== false && existing) {
      next = deepCloneDoc(existing);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        const resolvedVal = cloneAndResolveSentinels(v, getFieldValue('', next, k), nowMs);
        setNestedField(next, k, resolvedVal);
      }
    } else {
      next = cloneAndResolveSentinels(patch, existing, nowMs);
    }
    this.store.set(norm, next);
    this.notifyAsync(norm);
  }

  public makeDocSnapshot(docPath: string): any {
    const norm = normalizePath([docPath]);
    const { id, parentPath } = splitPath(norm);
    const data = this.store.get(norm);
    const ref: MockDocRef = { __type: 'doc', path: norm, id, parentPath };
    return {
      id,
      ref,
      exists: () => data !== undefined,
      data: () => (data !== undefined ? deepCloneDoc(data) : undefined),
    };
  }

  public makeQuerySnapshot(collectionPath: string, constraints: MockQueryConstraint[] = []): any {
    const normCol = normalizePath([collectionPath]);
    let docs = this.listCollectionDocs(normCol);

    for (const c of constraints) {
      if (c.__constraint === 'where') {
        docs = docs.filter((d) => matchesWhere(d.id, d.data, c));
      }
    }
    for (const c of constraints) {
      if (c.__constraint === 'orderBy' && c.field) {
        const dir = c.direction === 'desc' ? -1 : 1;
        docs.sort((a, b) => dir * compareValues(getFieldValue(a.id, a.data, c.field!), getFieldValue(b.id, b.data, c.field!)));
      }
    }
    for (const c of constraints) {
      if (c.__constraint === 'limit' && typeof c.limitCount === 'number') {
        docs = docs.slice(0, c.limitCount);
      }
    }

    const docSnaps = docs.map((d) => this.makeDocSnapshot(d.path));
    return {
      empty: docSnaps.length === 0,
      size: docSnaps.length,
      docs: docSnaps,
      forEach: (fn: (snap: any) => void) => docSnaps.forEach(fn),
    };
  }

  private recordClientWrite(normPath: string, payload: Record<string, any>): void {
    const nextCount = (this.writeCountByDoc.get(normPath) || 0) + 1;
    this.writeCountByDoc.set(normPath, nextCount);
    this.lastPayloadByDoc.set(normPath, deepCloneDoc(payload));
    if (nextCount > this.maxWritesCircuitBreaker) {
      throw new Error(
        `[StatefulFirestoreHarness] INFINITE WRITE LOOP CIRCUIT BREAKER TRIPPED on "${normPath}": ${nextCount} client writes exceeded limit (${this.maxWritesCircuitBreaker}).`
      );
    }
  }

  private notifyAsync(docPath: string): void {
    const norm = normalizePath([docPath]);
    const { parentPath } = splitPath(norm);

    const docSubs = Array.from(this.docListeners.get(norm) || []);
    const colSubs = Array.from(this.collectionListeners.get(parentPath) || []);

    queueMicrotask(() => {
      for (const entry of docSubs) {
        if (!this.docListeners.get(norm)?.has(entry)) continue;
        this.snapshotDeliveriesByDoc.set(norm, (this.snapshotDeliveriesByDoc.get(norm) || 0) + 1);
        entry.cb(this.makeDocSnapshot(norm));
      }
      for (const entry of colSubs) {
        if (!this.collectionListeners.get(parentPath)?.has(entry)) continue;
        this.snapshotDeliveriesByDoc.set(parentPath, (this.snapshotDeliveriesByDoc.get(parentPath) || 0) + 1);
        entry.cb(this.makeQuerySnapshot(entry.path, entry.constraints));
      }
    });
  }

  public clientSetDoc(docPath: string, data: Record<string, any>, options?: { merge?: boolean }): void {
    const norm = normalizePath([docPath]);
    const nowMs = Date.now();
    const existing = this.store.get(norm);
    let next: Record<string, any>;
    if (options?.merge && existing) {
      next = deepCloneDoc(existing);
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        const resolvedVal = cloneAndResolveSentinels(v, getFieldValue('', next, k), nowMs);
        setNestedField(next, k, resolvedVal);
      }
    } else {
      next = cloneAndResolveSentinels(data, existing, nowMs);
    }
    this.recordClientWrite(norm, next);
    this.store.set(norm, next);
    this.notifyAsync(norm);
  }

  public clientUpdateDoc(docPath: string, patch: Record<string, any>): void {
    const norm = normalizePath([docPath]);
    const nowMs = Date.now();
    const existing = this.store.get(norm);
    const next = existing ? deepCloneDoc(existing) : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && v.__sentinel === 'deleteField') {
        delete next[k];
        continue;
      }
      const resolvedVal = cloneAndResolveSentinels(v, getFieldValue('', next, k), nowMs);
      setNestedField(next, k, resolvedVal);
    }
    this.recordClientWrite(norm, next);
    this.store.set(norm, next);
    this.notifyAsync(norm);
  }

  public clientDeleteDoc(docPath: string): void {
    const norm = normalizePath([docPath]);
    this.recordClientWrite(norm, { __deleted: true });
    this.store.delete(norm);
    this.notifyAsync(norm);
  }

  public subscribe(refOrQuery: MockDocRef | MockCollectionRef | MockQueryRef, cb: (snap: any) => void): () => void {
    if (refOrQuery.__type === 'doc') {
      const norm = normalizePath([refOrQuery.path]);
      const entry: DocListenerEntry = { path: norm, cb };
      if (!this.docListeners.has(norm)) this.docListeners.set(norm, new Set());
      this.docListeners.get(norm)!.add(entry);

      queueMicrotask(() => {
        if (!this.docListeners.get(norm)?.has(entry)) return;
        this.snapshotDeliveriesByDoc.set(norm, (this.snapshotDeliveriesByDoc.get(norm) || 0) + 1);
        entry.cb(this.makeDocSnapshot(norm));
      });

      return () => {
        this.docListeners.get(norm)?.delete(entry);
      };
    }

    const colPath = normalizePath([refOrQuery.path]);
    const constraints = refOrQuery.__type === 'query' ? refOrQuery.constraints : [];
    const entry: CollectionListenerEntry = { path: colPath, constraints, cb };
    if (!this.collectionListeners.has(colPath)) this.collectionListeners.set(colPath, new Set());
    this.collectionListeners.get(colPath)!.add(entry);

    queueMicrotask(() => {
      if (!this.collectionListeners.get(colPath)?.has(entry)) return;
      this.snapshotDeliveriesByDoc.set(colPath, (this.snapshotDeliveriesByDoc.get(colPath) || 0) + 1);
      entry.cb(this.makeQuerySnapshot(colPath, constraints));
    });

    return () => {
      this.collectionListeners.get(colPath)?.delete(entry);
    };
  }
}

export function createFirestoreModuleMock(harness: StatefulFirestoreHarness) {
  const collection = (_db: any, ...segments: string[]): MockCollectionRef => {
    const p = normalizePath(segments);
    const { id } = splitPath(p);
    return { __type: 'collection', path: p, id };
  };

  const doc = (first: any, ...segments: string[]): MockDocRef => {
    if (first && typeof first === 'object' && first.__type === 'collection') {
      const id = segments.length > 0 ? normalizePath(segments) : harness.nextAutoId('proj');
      const p = normalizePath([first.path, id]);
      return { __type: 'doc', path: p, id, parentPath: first.path };
    }
    const p = normalizePath(segments);
    const { id, parentPath } = splitPath(p);
    return { __type: 'doc', path: p, id, parentPath };
  };

  const where = (field: string, op: string, value: any): MockQueryConstraint => ({
    __constraint: 'where',
    field,
    op,
    value,
  });

  const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): MockQueryConstraint => ({
    __constraint: 'orderBy',
    field,
    direction,
  });

  const limit = (limitCount: number): MockQueryConstraint => ({
    __constraint: 'limit',
    limitCount,
  });

  const query = (
    ref: MockCollectionRef | MockQueryRef,
    ...constraints: MockQueryConstraint[]
  ): MockQueryRef => ({
    __type: 'query',
    path: ref.path,
    constraints: [...(ref.__type === 'query' ? ref.constraints : []), ...constraints],
  });

  const getDoc = async (ref: MockDocRef) => harness.makeDocSnapshot(ref.path);
  const getDocFromServer = async (ref: MockDocRef) => harness.makeDocSnapshot(ref.path);
  const getDocFromCache = async (ref: MockDocRef) => harness.makeDocSnapshot(ref.path);

  const getDocs = async (refOrQuery: MockCollectionRef | MockQueryRef) =>
    harness.makeQuerySnapshot(
      refOrQuery.path,
      refOrQuery.__type === 'query' ? refOrQuery.constraints : []
    );

  const setDoc = async (ref: MockDocRef, data: Record<string, any>, options?: { merge?: boolean }) => {
    harness.clientSetDoc(ref.path, data, options);
  };

  const updateDoc = async (ref: MockDocRef, patch: Record<string, any>) => {
    harness.clientUpdateDoc(ref.path, patch);
  };

  const deleteDoc = async (ref: MockDocRef) => {
    harness.clientDeleteDoc(ref.path);
  };

  const addDoc = async (colRef: MockCollectionRef, data: Record<string, any>) => {
    const newRef = doc(colRef);
    harness.clientSetDoc(newRef.path, data);
    return newRef;
  };

  const onSnapshot = (
    refOrQuery: MockDocRef | MockCollectionRef | MockQueryRef,
    next: (snap: any) => void,
    _error?: (err: any) => void
  ) => harness.subscribe(refOrQuery, next);

  const writeBatch = (_db: any) => {
    const ops: Array<() => void> = [];
    return {
      set: (ref: MockDocRef, data: Record<string, any>, options?: { merge?: boolean }) => {
        ops.push(() => harness.clientSetDoc(ref.path, data, options));
      },
      update: (ref: MockDocRef, patch: Record<string, any>) => {
        ops.push(() => harness.clientUpdateDoc(ref.path, patch));
      },
      delete: (ref: MockDocRef) => {
        ops.push(() => harness.clientDeleteDoc(ref.path));
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  };

  return {
    getFirestore: () => ({}),
    connectFirestoreEmulator: () => {},
    collection,
    doc,
    query,
    where,
    orderBy,
    limit,
    documentId: () => '__name__',
    getDoc,
    getDocFromServer,
    getDocFromCache,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    onSnapshot,
    writeBatch,
    serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
    deleteField: () => DELETE_FIELD_SENTINEL,
    increment: (delta: number) => makeIncrementSentinel(delta),
    Timestamp: {
      now: () => makeTimestamp(Date.now()),
      fromDate: (d: Date) => makeTimestamp(d.getTime()),
      fromMillis: (ms: number) => makeTimestamp(ms),
    },
  };
}

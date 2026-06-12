// Mock Document and Collection References
export class DocumentReference {
  constructor(public path: string) {}
  get id() {
    const parts = this.path.split('/');
    return parts[parts.length - 1];
  }
}

export class CollectionReference {
  constructor(public path: string) {}
  get id() {
    const parts = this.path.split('/');
    return parts[parts.length - 1];
  }
}

export function getFirestore() {
  console.log('[Offline Sandbox] Initialized Mock Firestore');
  return { type: 'firestore' };
}

export function doc(dbOrRef: any, ...pathParts: string[]) {
  let basePath = '';
  if (dbOrRef instanceof CollectionReference || dbOrRef instanceof DocumentReference) {
    basePath = dbOrRef.path;
  } else if (typeof dbOrRef === 'string') {
    // If first arg is path and no other parts, or it's a string
    basePath = dbOrRef;
  }
  const fullPath = [basePath, ...pathParts].filter(Boolean).join('/').replace(/\/+/g, '/');
  return new DocumentReference(fullPath);
}

export function collection(dbOrRef: any, ...pathParts: string[]) {
  let basePath = '';
  if (dbOrRef instanceof CollectionReference || dbOrRef instanceof DocumentReference) {
    basePath = dbOrRef.path;
  } else if (typeof dbOrRef === 'string') {
    basePath = dbOrRef;
  }
  const fullPath = [basePath, ...pathParts].filter(Boolean).join('/').replace(/\/+/g, '/');
  return new CollectionReference(fullPath);
}

// Global listeners registry for real-time updates
type SnapshotCallback = (snap: any) => void;
const listeners = new Set<{
  target: DocumentReference | CollectionReference | any;
  callback: SnapshotCallback;
}>();

// Helper to notify listeners
function notifyListeners(changedPath: string) {
  listeners.forEach(item => {
    if (item.target instanceof DocumentReference) {
      if (item.target.path === changedPath) {
        getDoc(item.target).then(snap => item.callback(snap));
      }
    } else if (item.target instanceof CollectionReference) {
      // If collection is a parent of changed path (e.g. users/uid/projects/projid has collection users/uid/projects)
      if (changedPath.startsWith(item.target.path + '/') && changedPath.split('/').length === item.target.path.split('/').length + 1) {
        getDocs(item.target).then(snap => item.callback(snap));
      }
    } else if (item.target && item.target._collectionRef) {
      // It's a query
      const colPath = item.target._collectionRef.path;
      if (changedPath.startsWith(colPath + '/') && changedPath.split('/').length === colPath.split('/').length + 1) {
        getDocs(item.target).then(snap => item.callback(snap));
      }
    }
  });
}

// Process data placeholders: serverTimestamp, increment
function processData(newData: any, existingData: any): any {
  if (!newData) return newData;
  if (typeof newData !== 'object') return newData;

  const result = { ...newData };

  for (const key in result) {
    const val = result[key];
    if (val && typeof val === 'object') {
      if (val._type === 'serverTimestamp') {
        result[key] = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
      } else if (val._type === 'increment') {
        const prev = existingData?.[key] || 0;
        result[key] = prev + val.value;
      } else if (Array.isArray(val)) {
        result[key] = val.map(item => processData(item, null));
      } else {
        result[key] = processData(val, existingData?.[key]);
      }
    }
  }
  return result;
}

// Operations
export async function getDoc(docRef: DocumentReference) {
  const key = `zcene_mock_db:${docRef.path}`;
  const raw = localStorage.getItem(key);
  const data = raw ? JSON.parse(raw) : null;

  return {
    exists: () => data !== null,
    data: () => data,
    id: docRef.id,
    ref: docRef
  };
}

export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;

export async function setDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }) {
  const key = `zcene_mock_db:${docRef.path}`;
  let finalData = data;

  if (options?.merge) {
    const existingRaw = localStorage.getItem(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    finalData = { ...existing, ...data };
    finalData = processData(finalData, existing);
  } else {
    finalData = processData(finalData, null);
  }

  localStorage.setItem(key, JSON.stringify(finalData));
  console.log(`[Offline Sandbox] setDoc at: ${docRef.path}`, finalData);
  
  // Asynchronously notify to prevent call stack issues
  setTimeout(() => notifyListeners(docRef.path), 0);
}

export async function updateDoc(docRef: DocumentReference, data: any) {
  await setDoc(docRef, data, { merge: true });
}

export async function deleteDoc(docRef: DocumentReference) {
  const key = `zcene_mock_db:${docRef.path}`;
  localStorage.removeItem(key);
  console.log(`[Offline Sandbox] deleteDoc at: ${docRef.path}`);
  
  setTimeout(() => notifyListeners(docRef.path), 0);
}

export async function addDoc(collectionRef: CollectionReference, data: any) {
  const randomId = Math.random().toString(36).substring(2, 15);
  const docRef = new DocumentReference(`${collectionRef.path}/${randomId}`);
  await setDoc(docRef, data);
  return docRef;
}

export async function getDocs(collectionOrQuery: any) {
  const colRef = collectionOrQuery._collectionRef || collectionOrQuery;
  const colPath = colRef.path;

  const docs: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`zcene_mock_db:${colPath}/`)) {
      const remainingPath = key.substring(`zcene_mock_db:${colPath}/`.length);
      // Ensure it is a direct child document, not in a deeper subcollection
      if (!remainingPath.includes('/')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const docId = remainingPath;
          const data = JSON.parse(raw);
          const docRef = new DocumentReference(`${colPath}/${docId}`);
          
          docs.push({
            exists: () => true,
            data: () => data,
            id: docId,
            ref: docRef
          });
        }
      }
    }
  }

  // Apply basic mock query filters if constraints exist
  let filteredDocs = docs;
  if (collectionOrQuery._whereConstraints) {
    collectionOrQuery._whereConstraints.forEach((c: any) => {
      filteredDocs = filteredDocs.filter(d => {
        const dData = d.data();
        const actualVal = dData?.[c.field];
        if (c.op === '==') {
          return actualVal === c.value;
        }
        return true;
      });
    });
  }

  return {
    docs: filteredDocs,
    forEach: (cb: (doc: any) => void) => filteredDocs.forEach(cb),
    get empty() { return filteredDocs.length === 0; },
    get size() { return filteredDocs.length; }
  };
}

export function query(collectionRef: CollectionReference, ...constraints: any[]) {
  const whereConstraints: any[] = [];
  constraints.forEach(c => {
    if (c && c._type === 'where') {
      whereConstraints.push(c);
    }
  });

  return {
    _collectionRef: collectionRef,
    _whereConstraints: whereConstraints,
    _type: 'query'
  };
}

export function where(field: string, op: string, value: any) {
  return {
    _type: 'where',
    field,
    op,
    value
  };
}

export function orderBy(field: string, direction?: 'asc' | 'desc') {
  return {
    _type: 'orderBy',
    field,
    direction: direction || 'asc'
  };
}

export function limit(n: number) {
  return {
    _type: 'limit',
    n
  };
}

export function onSnapshot(
  target: DocumentReference | CollectionReference | any,
  callback: SnapshotCallback,
  errorCallback?: (err: any) => void
) {
  const listenerItem = { target, callback };
  listeners.add(listenerItem);

  // Initial trigger
  if (target instanceof DocumentReference) {
    getDoc(target).then(snap => callback(snap)).catch(err => errorCallback?.(err));
  } else {
    getDocs(target).then(snap => callback(snap)).catch(err => errorCallback?.(err));
  }

  // Return unsubscribe function
  return () => {
    listeners.delete(listenerItem);
  };
}

export function writeBatch() {
  const operations: (() => Promise<void>)[] = [];
  return {
    set: (docRef: DocumentReference, data: any, options?: any) => {
      operations.push(async () => { await setDoc(docRef, data, options); });
    },
    update: (docRef: DocumentReference, data: any) => {
      operations.push(async () => { await updateDoc(docRef, data); });
    },
    delete: (docRef: DocumentReference) => {
      operations.push(async () => { await deleteDoc(docRef); });
    },
    commit: async () => {
      for (const op of operations) {
        await op();
      }
    }
  };
}

export function serverTimestamp() {
  return { _type: 'serverTimestamp' };
}

export function increment(n: number) {
  return { _type: 'increment', value: n };
}

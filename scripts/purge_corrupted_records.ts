import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Query, Firestore } from 'firebase-admin/firestore';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

try {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  console.error("Failed to initialize firebase admin:", e);
  process.exit(1);
}

const db = getFirestore();

async function deleteCollection(collectionPath: string) {
  console.log(`Starting deletion of collection: ${collectionPath}`);
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(500);

  return new Promise<void>((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db: Firestore, query: Query, resolve: () => void) {
  const snapshot = await query.get();
  
  if (snapshot.size === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`Deleted ${snapshot.size} documents...`);
  
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function run() {
  try {
    await deleteCollection('artists');
    console.log('✅ Successfully purged artists collection.');
    
    await deleteCollection('labels');
    console.log('✅ Successfully purged labels collection.');
    
    console.log('Purge script finished successfully.');
    process.exit(0);
  } catch (error) {
    console.error("Error purging records:", error);
    process.exit(1);
  }
}

run();

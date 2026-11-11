/**
 * purge_collections.cjs
 *
 * Deletes ALL documents from the following zcene-production Firestore collections:
 *   - artists
 *   - labels
 *   - curationJobs
 *
 * Uses firebase-admin with the local service account key.
 * Documents are deleted in batches of 400 to stay within Firestore limits.
 *
 * Usage:
 *   node scripts/purge_collections.cjs
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const COLLECTIONS_TO_PURGE = ['artists', 'labels', 'curationJobs'];
const BATCH_SIZE = 400; // Firestore max batch write is 500; 400 gives headroom

/**
 * Deletes all documents in a collection in batches.
 * Returns the total number of documents deleted.
 */
async function purgeCollection(collectionName) {
  let totalDeleted = 0;
  let round = 0;

  console.log(`\n[Purge] ▶ Starting purge of "${collectionName}"...`);

  while (true) {
    round++;
    const snapshot = await db.collection(collectionName).limit(BATCH_SIZE).get();

    if (snapshot.empty) {
      console.log(`[Purge] ✓ "${collectionName}" is now empty (${totalDeleted} docs deleted across ${round - 1} batch(es)).`);
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.docs.length;
    console.log(`[Purge]   Round ${round}: deleted ${snapshot.docs.length} docs (running total: ${totalDeleted})`);
  }

  return totalDeleted;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Zcene Production — Firestore Collection Purge Script  ');
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Collections: ${COLLECTIONS_TO_PURGE.join(', ')}`);
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════\n');

  const totals = {};

  for (const collection of COLLECTIONS_TO_PURGE) {
    try {
      totals[collection] = await purgeCollection(collection);
    } catch (err) {
      console.error(`[Purge] ✗ FAILED on collection "${collection}":`, err.message);
      process.exit(1);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PURGE COMPLETE — Summary');
  console.log('═══════════════════════════════════════════════════════');
  for (const [col, count] of Object.entries(totals)) {
    console.log(`  ${col.padEnd(20)} ${count} document(s) deleted`);
  }
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(20)} ${grandTotal} document(s) deleted`);
  console.log(`\n  Completed at: ${new Date().toISOString()}`);
  console.log('  ✅ Database is clean. You may now initiate the fresh frontend test.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[Purge] Fatal error:', err);
  process.exit(1);
}).finally(() => process.exit(0));

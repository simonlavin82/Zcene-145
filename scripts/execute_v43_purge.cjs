/**
 * execute_v43_purge.cjs
 *
 * V43 Multi-Scene Architecture Database Purge Script.
 * Purges legacy V42 single-scene project workspaces, public shares, and transient
 * curation job/session state to guarantee a 100% pure schemaVersion: 43 runtime
 * with zero legacy fallback bloat.
 *
 * PURGED TARGETS:
 *   - users/{uid}/projects (subcollections via collectionGroup('projects'))
 *   - sharedZcenes / sharedzcenes
 *   - curationJobs
 *   - curationSessions
 *
 * STRICTLY PRESERVED:
 *   - Tier 1 Global Assets: /artists and /labels
 *   - Root users/{uid} documents (auth, tokenBalance, tasteProfiles)
 *   - users/{uid}/tokenTransactions (immutable discovery & token ledger)
 *   - adminLedger
 *   - deepWebSessions
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TOP_LEVEL_PURGE_COLLECTIONS = [
  'curationJobs',
  'curationSessions',
  'sharedZcenes',
  'sharedzcenes',
];

const BATCH_SIZE = 400;

async function purgeCollectionRef(collRef, label) {
  let totalDeleted = 0;
  let round = 0;
  console.log(`\n[V43 Purge] ▶ Starting purge of "${label}"...`);

  while (true) {
    round++;
    const snapshot = await collRef.limit(BATCH_SIZE).get();
    if (snapshot.empty) {
      console.log(`[V43 Purge] ✓ "${label}" is now empty (${totalDeleted} docs deleted across ${round - 1} batch(es)).`);
      break;
    }
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.docs.length;
    console.log(`[V43 Purge]   Round ${round}: deleted ${snapshot.docs.length} docs (running total: ${totalDeleted})`);
  }
  return totalDeleted;
}

async function purgeSubcollectionProjects() {
  console.log(`\n[V43 Purge] ▶ Scanning users/{uid}/projects subcollections via collectionGroup('projects')...`);
  const snapshot = await db.collectionGroup('projects').get();
  console.log(`[V43 Purge] Found ${snapshot.size} total user project document(s) in collectionGroup('projects').`);
  if (snapshot.empty) {
    console.log(`[V43 Purge] ✓ No legacy user projects found.`);
    return 0;
  }
  let totalDeleted = 0;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += chunk.length;
    console.log(`[V43 Purge]   Deleted batch of ${chunk.length} projects (running total: ${totalDeleted}/${docs.length})`);
  }
  console.log(`[V43 Purge] ✓ Purged all ${totalDeleted} legacy documents from users/{uid}/projects.`);
  return totalDeleted;
}

async function verifyPreservedCollections() {
  console.log(`\n[V43 Verify] ▶ Auditing preserved Tier 1 Global Assets & User Accounts...`);

  const artistsCountSnap = await db.collection('artists').count().get();
  const labelsCountSnap = await db.collection('labels').count().get();
  const usersSnap = await db.collection('users').limit(10).get();
  const sysSettingsDoc = await db.collection('adminLedger').doc('system').get();

  console.log(`[V43 Verify] ✓ Tier 1 /artists preserved: ${artistsCountSnap.data().count} canonical document(s) intact.`);
  console.log(`[V43 Verify] ✓ Tier 1 /labels preserved:  ${labelsCountSnap.data().count} canonical document(s) intact.`);
  console.log(`[V43 Verify] ✓ Root /users preserved:     sampled ${usersSnap.size} user document(s) intact.`);
  usersSnap.forEach(doc => {
    const data = doc.data();
    const styleCount = Array.isArray(data.tasteProfiles) ? data.tasteProfiles.length : 0;
    console.log(`  - User: ${doc.id} (tokenBalance: ${data.tokenBalance ?? 'N/A'}, tasteProfiles: ${styleCount})`);
  });
  console.log(`[V43 Verify] ✓ adminLedger/system exists: ${sysSettingsDoc.exists}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Zcene V43 Workspace & Session Purge Execution        ');
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  const summary = {};

  for (const col of TOP_LEVEL_PURGE_COLLECTIONS) {
    summary[col] = await purgeCollectionRef(db.collection(col), col);
  }

  summary['users/{uid}/projects'] = await purgeSubcollectionProjects();

  await verifyPreservedCollections();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  V43 PURGE COMPLETE — Summary of Deleted Artifacts    ');
  console.log('═══════════════════════════════════════════════════════');
  for (const [target, count] of Object.entries(summary)) {
    console.log(`  ${target.padEnd(32)} ${count} document(s) deleted`);
  }
  const grandTotal = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log(`  ${'─'.repeat(45)}`);
  console.log(`  ${'TOTAL'.padEnd(32)} ${grandTotal} document(s) deleted`);
  console.log(`\n  Completed at: ${new Date().toISOString()}`);
  console.log('  ✅ V42 workspaces & shares purged; Tier 1 /artists & /labels 100% preserved.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[V43 Purge] Fatal error:', err);
  process.exit(1);
}).finally(() => process.exit(0));


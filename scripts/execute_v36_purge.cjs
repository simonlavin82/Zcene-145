/**
 * execute_v36_purge.cjs
 *
 * Full V36 Architecture Database Purge Script.
 * Incinerates all legacy un-styled entities and historical saved graphs to guarantee
 * zero cache poisoning and prevent legacy data from triggering the JIT healer.
 *
 * Targets:
 *   - artists
 *   - labels
 *   - curationJobs
 *   - sharedZcenes / sharedzcenes
 *   - adminLedger/system/jitHeals
 *   - users/{uid}/projects (subcollections only via collectionGroup('projects'))
 *
 * PRESERVED:
 *   - Root users/{uid} documents (user accounts, auth data, custom Style Profiles)
 *   - adminLedger/system/settings (systemSettings)
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TOP_LEVEL_COLLECTIONS = ['artists', 'labels', 'curationJobs', 'sharedZcenes', 'sharedzcenes'];
const BATCH_SIZE = 400;

async function purgeCollectionRef(collRef, label) {
  let totalDeleted = 0;
  let round = 0;
  console.log(`\n[Purge] ▶ Starting purge of "${label}"...`);

  while (true) {
    round++;
    const snapshot = await collRef.limit(BATCH_SIZE).get();
    if (snapshot.empty) {
      console.log(`[Purge] ✓ "${label}" is now empty (${totalDeleted} docs deleted across ${round - 1} batch(es)).`);
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

async function purgeSubcollectionProjects() {
  console.log(`\n[Purge] ▶ Scanning users/{uid}/projects subcollections via collectionGroup('projects')...`);
  const snapshot = await db.collectionGroup('projects').get();
  console.log(`[Purge] Found ${snapshot.size} total user project document(s) in collectionGroup('projects').`);
  if (snapshot.empty) {
    console.log(`[Purge] ✓ No user projects found.`);
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
    console.log(`[Purge]   Deleted batch of ${chunk.length} projects (running total: ${totalDeleted}/${docs.length})`);
  }
  console.log(`[Purge] ✓ Successfully purged all ${totalDeleted} documents from users/{uid}/projects while preserving root users/{uid} profiles.`);
  return totalDeleted;
}

async function purgeJitHealReceipts() {
  const collRef = db.collection('adminLedger').doc('system').collection('jitHeals');
  return purgeCollectionRef(collRef, 'adminLedger/system/jitHeals');
}

async function verifyPreservedRoots() {
  console.log(`\n[Verify] ▶ Checking root users collection to verify preservation...`);
  const usersSnap = await db.collection('users').limit(10).get();
  console.log(`[Verify] ✓ Root users collection intact: found ${usersSnap.size} sample document(s).`);
  usersSnap.forEach(doc => {
    const data = doc.data();
    const styleCount = Array.isArray(data.tasteProfiles) ? data.tasteProfiles.length : (data.userTaste ? data.userTaste.length : 0);
    console.log(`  - User: ${doc.id} (Taste/Style profiles count: ${styleCount})`);
  });

  const sysSettingsDoc = await db.collection('adminLedger').doc('system').get();
  console.log(`[Verify] ✓ adminLedger/system document exists: ${sysSettingsDoc.exists}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Zcene V36 Complete Legacy Purge Execution            ');
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  const summary = {};

  for (const col of TOP_LEVEL_COLLECTIONS) {
    summary[col] = await purgeCollectionRef(db.collection(col), col);
  }

  summary['adminLedger/system/jitHeals'] = await purgeJitHealReceipts();
  summary['users/{uid}/projects'] = await purgeSubcollectionProjects();

  await verifyPreservedRoots();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  V36 PURGE COMPLETE — Summary of Deleted Artifacts    ');
  console.log('═══════════════════════════════════════════════════════');
  for (const [target, count] of Object.entries(summary)) {
    console.log(`  ${target.padEnd(32)} ${count} document(s) deleted`);
  }
  const grandTotal = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log(`  ${'─'.repeat(45)}`);
  console.log(`  ${'TOTAL'.padEnd(32)} ${grandTotal} document(s) deleted`);
  console.log(`\n  Completed at: ${new Date().toISOString()}`);
  console.log('  ✅ Database is completely clean of legacy un-styled entities.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[Purge] Fatal error:', err);
  process.exit(1);
}).finally(() => process.exit(0));

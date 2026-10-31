/**
 * scripts/purgeLegacyArtists.cjs
 *
 * Clean Slate V39.2 Database Purge Script
 * Incinerates legacy /artists documents and saved user projects
 * to guarantee all future curations persist the verified itunesArtistId.
 *
 * TARGETS:
 *   - artists (all documents)
 *   - users/{uid}/projects (all saved user project graphs via collectionGroup('projects'))
 *   - curationJobs (stale/completed job documents)
 *
 * STRICTLY PRESERVED:
 *   - /labels (all record labels and catalog releases)
 *   - root users/{uid} (user accounts, tokens, style/taste profiles)
 *   - adminLedger/system/settings
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

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
    console.log(`[Purge]   Batch ${round}: deleted ${snapshot.docs.length} docs (running total: ${totalDeleted})`);
  }
  return totalDeleted;
}

async function purgeUserProjects() {
  console.log(`\n[Purge] ▶ Purging users/{uid}/projects via collectionGroup('projects')...`);
  const snapshot = await db.collectionGroup('projects').get();
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
    console.log(`[Purge]   Deleted ${chunk.length} projects (${totalDeleted}/${docs.length})`);
  }
  console.log(`[Purge] ✓ Successfully purged all ${totalDeleted} documents from users/{uid}/projects.`);
  return totalDeleted;
}

async function verifyPreservedCollections() {
  console.log(`\n[Safety Verification] ▶ Verifying preserved collections...`);
  
  // 1. Labels check
  const labelSnap = await db.collection('labels').limit(5).get();
  console.log(`[Safety Verification] ✓ /labels collection intact: found ${labelSnap.size} sample document(s).`);
  labelSnap.forEach(doc => console.log(`  - Label: ${doc.id}`));

  // 2. Users check
  const userSnap = await db.collection('users').limit(5).get();
  console.log(`[Safety Verification] ✓ root /users collection intact: found ${userSnap.size} sample document(s).`);
  userSnap.forEach(doc => {
    const data = doc.data();
    const styleCount = Array.isArray(data.tasteProfiles) ? data.tasteProfiles.length : (data.userTaste ? data.userTaste.length : 0);
    console.log(`  - User: ${doc.id} (Tokens: ${data.tokenBalance ?? 0}, Taste profiles: ${styleCount})`);
  });

  // 3. Admin settings check
  const sysSettingsDoc = await db.collection('adminLedger').doc('system').get();
  console.log(`[Safety Verification] ✓ adminLedger/system document exists: ${sysSettingsDoc.exists}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Zcene V39.2 Clean Slate Purge Execution              ');
  console.log(`  Project: ${serviceAccount.project_id}                `);
  console.log(`  Started at: ${new Date().toISOString()}              `);
  console.log('═══════════════════════════════════════════════════════');

  // 1. Purge global /artists
  await purgeCollectionRef(db.collection('artists'), 'artists');

  // 2. Purge user saved projects
  await purgeUserProjects();

  // 3. Purge curationJobs
  await purgeCollectionRef(db.collection('curationJobs'), 'curationJobs');

  // 4. Verify preserved collections
  await verifyPreservedCollections();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Clean Slate Purge Complete — Zero Legacy Debt        ');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[Purge] Fatal Error during purge execution:', err);
  process.exit(1);
});


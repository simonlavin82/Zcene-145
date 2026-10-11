// scripts/purge_flawed_healed_assets.cjs
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function purgeFlawedHealedAssets(dryRun = true) {
  console.log(`\n======================================================`);
  console.log(`Targeted Purge Scan (Mode: ${dryRun ? 'DRY-RUN' : 'LIVE PURGE'})`);
  console.log(`Query: _healedBy == "JIT_Asset_Healer_V22"`);
  console.log(`======================================================\n`);

  const collections = ['labels', 'artists'];
  let totalFound = 0;
  const docsToDelete = [];

  for (const collName of collections) {
    const snap = await db.collection(collName)
      .where('_healedBy', '==', 'JIT_Asset_Healer_V22')
      .get();

    console.log(`Checked '${collName}': Found ${snap.size} document(s) tagged for healing.`);

    snap.docs.forEach(doc => {
      totalFound++;
      const data = doc.data();
      const isStringified = typeof data.detailsCache === 'string';
      const hasArtistIdOnLabel = collName === 'labels' && !!data.artistId;
      const isMissingCacheVersion = data.cacheVersion !== 4;

      console.log(`  - [FLAGGED] ${collName}/${doc.id}`);
      console.log(`    Disparities: [stringifiedJSON: ${isStringified}, missingCacheVersion: ${isMissingCacheVersion}, artistIdOnLabel: ${hasArtistIdOnLabel}]`);

      docsToDelete.push(doc.ref);
    });
  }

  console.log(`\nScan Complete: ${totalFound} corrupted document(s) identified across Tier 1.`);

  if (totalFound === 0) {
    console.log(`No corrupted documents found.\n`);
    return;
  }

  if (dryRun) {
    console.log(`\nDRY-RUN ONLY: 0 documents deleted.`);
    console.log(`To delete these ${totalFound} documents, re-run with:`);
    console.log(`node scripts/purge_flawed_healed_assets.cjs --execute\n`);
  } else {
    console.log(`\nExecuting batch delete for ${docsToDelete.length} document(s)...`);
    const batch = db.batch();
    docsToDelete.forEach(ref => batch.delete(ref));
    await batch.commit();
    console.log(`SUCCESS: Permanently purged ${docsToDelete.length} corrupted document(s).\n`);
  }
}

const isExecute = process.argv.includes('--execute');
purgeFlawedHealedAssets(!isExecute)
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`Purge execution error:`, err);
    process.exit(1);
  });

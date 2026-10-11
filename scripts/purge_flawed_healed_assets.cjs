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
  console.log(`Targets:`);
  console.log(`  1. _healedBy == "JIT_Asset_Healer_V22"`);
  console.log(`  2. _isStub == true`);
  console.log(`  3. Explicit legacy stubs (artists/darko, artists/radiohead)`);
  console.log(`======================================================\n`);

  const collections = ['labels', 'artists'];
  const docsToDeleteMap = new Map();

  // 1. Scan for _healedBy == "JIT_Asset_Healer_V22"
  for (const collName of collections) {
    const snap = await db.collection(collName)
      .where('_healedBy', '==', 'JIT_Asset_Healer_V22')
      .get();

    console.log(`Checked '${collName}' for _healedBy: Found ${snap.size} document(s).`);

    snap.docs.forEach(doc => {
      console.log(`  - [FLAGGED _healedBy] ${collName}/${doc.id}`);
      docsToDeleteMap.set(doc.ref.path, doc.ref);
    });
  }

  // 2. Scan for _isStub == true
  for (const collName of collections) {
    const snap = await db.collection(collName)
      .where('_isStub', '==', true)
      .get();

    console.log(`Checked '${collName}' for _isStub: Found ${snap.size} document(s).`);

    snap.docs.forEach(doc => {
      console.log(`  - [FLAGGED _isStub] ${collName}/${doc.id}`);
      docsToDeleteMap.set(doc.ref.path, doc.ref);
    });
  }

  // 3. Explicit legacy stubs
  const explicitDocs = [
    { coll: 'artists', id: 'darko' },
    { coll: 'artists', id: 'radiohead' }
  ];

  for (const item of explicitDocs) {
    const docRef = db.collection(item.coll).doc(item.id);
    const snap = await docRef.get();
    if (snap.exists) {
      console.log(`  - [FLAGGED explicit] ${item.coll}/${item.id} (exists: true, isStub: ${snap.data()?._isStub})`);
      docsToDeleteMap.set(docRef.path, docRef);
    }
  }

  const totalFound = docsToDeleteMap.size;
  console.log(`\nScan Complete: ${totalFound} unique document(s) identified for purge.`);

  if (totalFound === 0) {
    console.log(`No matching documents found.\n`);
    return;
  }

  const docsToDelete = Array.from(docsToDeleteMap.values());

  if (dryRun) {
    console.log(`\nDRY-RUN ONLY: 0 documents deleted.`);
    console.log(`To delete these ${totalFound} documents, re-run with:`);
    console.log(`node scripts/purge_flawed_healed_assets.cjs --execute\n`);
  } else {
    console.log(`\nExecuting batch delete for ${docsToDelete.length} document(s)...`);
    // Firestore batch limit is 500
    for (let i = 0; i < docsToDelete.length; i += 400) {
      const chunk = docsToDelete.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    console.log(`SUCCESS: Permanently purged ${docsToDelete.length} document(s).\n`);
  }
}

const isExecute = process.argv.includes('--execute');
purgeFlawedHealedAssets(!isExecute)
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`Purge execution error:`, err);
    process.exit(1);
  });

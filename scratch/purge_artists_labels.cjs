const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (fs.existsSync('firebase-service-account.json')) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
}
admin.initializeApp();
const db = getFirestore();

async function countCollectionDocs(colRef) {
  const snap = await colRef.count().get();
  return snap.data().count;
}

async function main() {
  console.log("=================================================");
  console.log("   ZCENE FIRESTORE PURGE: /artists & /labels");
  console.log("=================================================\n");

  console.log("1. Executing Pre-Purge Audit Counts...");
  const preArtists = await countCollectionDocs(db.collection('artists'));
  const preLabels = await countCollectionDocs(db.collection('labels'));
  console.log(`   - /artists: ${preArtists} docs`);
  console.log(`   - /labels:  ${preLabels} docs\n`);

  console.log("2. Purging Root Collections via recursiveDelete...");
  const collectionsToPurge = ['artists', 'labels'];
  for (const colName of collectionsToPurge) {
    console.log(`   Purging collection /${colName}...`);
    await db.recursiveDelete(db.collection(colName));
    console.log(`   ✔ Completed /${colName}`);
  }

  console.log("\n3. Executing Post-Purge Verification Audit...");
  const postArtists = await countCollectionDocs(db.collection('artists'));
  const postLabels = await countCollectionDocs(db.collection('labels'));
  console.log(`   - /artists: ${postArtists} docs (Expected: 0)`);
  console.log(`   - /labels:  ${postLabels} docs (Expected: 0)\n`);

  if (postArtists === 0 && postLabels === 0) {
    console.log("=================================================");
    console.log("   ✔ /artists & /labels COMPLETELY WIPED!");
    console.log("=================================================");
  } else {
    console.error("⚠ WARNING: Some documents remained!");
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Error during purge:", e);
  process.exit(1);
});

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
  console.log("   ZCENE FIRESTORE PURGE: /curationJobs");
  console.log("=================================================\n");

  console.log("1. Executing Pre-Purge Audit Counts...");
  const preJobs = await countCollectionDocs(db.collection('curationJobs'));
  console.log(`   - /curationJobs: ${preJobs} docs\n`);

  console.log("2. Purging Root Collections via recursiveDelete...");
  const collectionsToPurge = ['curationJobs'];
  for (const colName of collectionsToPurge) {
    console.log(`   Purging collection /${colName}...`);
    await db.recursiveDelete(db.collection(colName));
    console.log(`   ✔ Completed /${colName}`);
  }

  console.log("\n3. Executing Post-Purge Verification Audit...");
  const postJobs = await countCollectionDocs(db.collection('curationJobs'));
  console.log(`   - /curationJobs: ${postJobs} docs (Expected: 0)\n`);

  if (postJobs === 0) {
    console.log("=================================================");
    console.log("   ✔ /curationJobs COMPLETELY WIPED!");
    console.log("=================================================");
  } else {
    console.error("⚠ WARNING: Some documents remained!");
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Error during purge:", e);
  process.exit(1);
});

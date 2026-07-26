const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Initialize Firebase Admin
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
  console.log("=========================================================");
  console.log("   ZCENE FIRESTORE PURGE: /artists & /labels");
  console.log("=========================================================\n");

  console.log("1. Checking pre-purge document counts...");
  const preArtists = await countCollectionDocs(db.collection('artists'));
  const preLabels = await countCollectionDocs(db.collection('labels'));
  console.log(`   - /artists: ${preArtists} docs`);
  console.log(`   - /labels:  ${preLabels} docs\n`);

  console.log("2. Executing recursive batch deletion on root collections...");
  console.log("   Purging /artists (including any subcollections)...");
  await db.recursiveDelete(db.collection('artists'));
  console.log("   ✔ Completed purging /artists.");

  console.log("   Purging /labels (including any subcollections)...");
  await db.recursiveDelete(db.collection('labels'));
  console.log("   ✔ Completed purging /labels.\n");

  console.log("3. Verifying deletion completion...");
  const postArtists = await countCollectionDocs(db.collection('artists'));
  const postLabels = await countCollectionDocs(db.collection('labels'));
  console.log(`   - /artists: ${postArtists} docs (Expected: 0)`);
  console.log(`   - /labels:  ${postLabels} docs (Expected: 0)\n`);

  if (postArtists === 0 && postLabels === 0) {
    console.log("=========================================================");
    console.log("   ✔ BOTH COLLECTIONS COMPLETELY WIPED! READY FOR TEST.");
    console.log("=========================================================");
  } else {
    console.error("⚠ WARNING: Collections were not completely empty after delete!");
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Error during purge:", e);
  process.exit(1);
});

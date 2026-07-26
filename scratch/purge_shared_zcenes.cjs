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
  console.log("   TARGETED PURGE: sharedzcenes / sharedZcenes");
  console.log("=================================================\n");

  const colNames = ['sharedzcenes', 'sharedZcenes'];

  for (const colName of colNames) {
    const preCount = await countCollectionDocs(db.collection(colName));
    console.log(`Pre-purge count for /${colName}: ${preCount} docs`);
    if (preCount > 0) {
      console.log(`Purging /${colName} via recursiveDelete...`);
      await db.recursiveDelete(db.collection(colName));
      console.log(`✔ Purged /${colName}`);
    }
    const postCount = await countCollectionDocs(db.collection(colName));
    console.log(`Post-purge count for /${colName}: ${postCount} docs (Expected: 0)\n`);
  }

  console.log("✔ Targeted cleanup completed!");
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Error during targeted purge:", e);
  process.exit(1);
});

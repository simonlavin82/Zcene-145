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

async function countAllUserProjects() {
  const usersSnap = await db.collection('users').get();
  let totalProjects = 0;
  for (const userDoc of usersSnap.docs) {
    const projCount = await countCollectionDocs(userDoc.ref.collection('projects'));
    totalProjects += projCount;
  }
  return totalProjects;
}

async function main() {
  console.log("=================================================");
  console.log("   ZCENE FIRESTORE CLEAN SLATE RESET SCRIPT");
  console.log("=================================================\n");

  console.log("1. Executing Pre-Purge Audit Counts...");
  const preArtists = await countCollectionDocs(db.collection('artists'));
  const preLabels = await countCollectionDocs(db.collection('labels'));
  const preJobs = await countCollectionDocs(db.collection('curationJobs'));
  const preShares = await countCollectionDocs(db.collection('sharedZscenes'));
  const preUsers = await countCollectionDocs(db.collection('users'));
  const preProjects = await countAllUserProjects();

  console.log(`   - /artists:        ${preArtists} docs`);
  console.log(`   - /labels:         ${preLabels} docs`);
  console.log(`   - /curationJobs:   ${preJobs} docs`);
  console.log(`   - /sharedZscenes:  ${preShares} docs`);
  console.log(`   - /users (root):   ${preUsers} docs (WILL BE PRESERVED)`);
  console.log(`   - /users/*/projects: ${preProjects} docs\n`);

  console.log("2. Purging Legacy Root Collections via recursiveDelete...");
  const rootCollectionsToPurge = ['artists', 'labels', 'curationJobs', 'sharedZscenes'];
  for (const colName of rootCollectionsToPurge) {
    console.log(`   Purging collection /${colName}...`);
    await db.recursiveDelete(db.collection(colName));
    console.log(`   ✔ Completed /${colName}`);
  }

  console.log("\n3. Purging User Project Subcollections (Preserving User Profiles)...");
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const projectsRef = userDoc.ref.collection('projects');
    const projCount = await countCollectionDocs(projectsRef);
    if (projCount > 0) {
      console.log(`   Purging ${projCount} projects for user: ${userDoc.id} (${userDoc.data().email || 'no email'})...`);
      await db.recursiveDelete(projectsRef);
    }
  }
  console.log("   ✔ Completed all user projects purging.\n");

  console.log("4. Executing Post-Purge Verification Audit...");
  const postArtists = await countCollectionDocs(db.collection('artists'));
  const postLabels = await countCollectionDocs(db.collection('labels'));
  const postJobs = await countCollectionDocs(db.collection('curationJobs'));
  const postShares = await countCollectionDocs(db.collection('sharedZscenes'));
  const postUsers = await countCollectionDocs(db.collection('users'));
  const postProjects = await countAllUserProjects();

  console.log(`   - /artists:        ${postArtists} docs (Expected: 0)`);
  console.log(`   - /labels:         ${postLabels} docs (Expected: 0)`);
  console.log(`   - /curationJobs:   ${postJobs} docs (Expected: 0)`);
  console.log(`   - /sharedZscenes:  ${postShares} docs (Expected: 0)`);
  console.log(`   - /users (root):   ${postUsers} docs (Expected: ${preUsers} - preserved!)`);
  console.log(`   - /users/*/projects: ${postProjects} docs (Expected: 0)\n`);

  if (postArtists === 0 && postLabels === 0 && postJobs === 0 && postShares === 0 && postProjects === 0 && postUsers === preUsers) {
    console.log("=================================================");
    console.log("   ✔ CLEAN SLATE RESET SUCCESSFULLY COMPLETED!");
    console.log("=================================================");
  } else {
    console.error("⚠ WARNING: Some counts did not match expected values!");
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Error during reset:", e);
  process.exit(1);
});

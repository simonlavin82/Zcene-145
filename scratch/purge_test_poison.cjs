const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}

initializeApp({
  credential: cert(require(serviceAccountPath))
});

const db = getFirestore();

async function run() {
  const idsToDelete = ['militatie-gun', 'turnstile-usa'];
  
  for (const id of idsToDelete) {
    console.log(`Deleting poisoned test cache: ${id}...`);
    await db.collection('artists').doc(id).delete();
  }
  
  // Also clear test projects and jobs
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
      const projectsSnap = await db.collection(`users/${userDoc.id}/projects`).get();
      for (const projDoc of projectsSnap.docs) {
          const data = projDoc.data();
          if (data.seedArtists && data.seedArtists.toLowerCase().includes('militatie')) {
             console.log(`Deleting poisoned project: ${projDoc.id}`);
             await projDoc.ref.delete();
          }
      }
  }
  
  const jobsSnap = await db.collection('curationJobs').get();
  for (const job of jobsSnap.docs) {
      await job.ref.delete();
  }
  console.log("Done.");
}

run().catch(console.error);

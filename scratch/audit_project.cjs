const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const projectId = 'A2n30YTkCjZrAAk2SWka';
  
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const projectDoc = await db.collection('users').doc(userDoc.id).collection('projects').doc(projectId).get();
    if (projectDoc.exists) {
      const data = projectDoc.data();
      console.log(`\n── Project: ${projectDoc.id} ──`);
      console.log(`  Name: ${data.name}`);
      console.log(`  seedImageUrl: ${data.seedImageUrl}`);
      console.log(`  detailsCache keys:`, data.detailsCache ? Object.keys(JSON.parse(data.detailsCache) || {}) : 'No detailsCache');
      return;
    }
  }
  console.log("Project not found");
}
run().catch(console.error).finally(() => process.exit(0));

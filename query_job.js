const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-zcene';
initializeApp();
const db = getFirestore();
async function run() {
  const snapshot = await db.collection('curationJobs').orderBy('createdAt', 'desc').limit(1).get();
  if (snapshot.empty) {
    console.log('No jobs found.');
    return;
  }
  const doc = snapshot.docs[0];
  console.log('Job ID:', doc.id);
  console.log('Status:', doc.data().status);
  console.log('Error Message:', doc.data().errorMessage);
  console.log('Error Details:', JSON.stringify(doc.data().errorDetails, null, 2));
}
run().catch(console.error);

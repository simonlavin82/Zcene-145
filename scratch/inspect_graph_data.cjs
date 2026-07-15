const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  const jobId = 'job-1784136168919-sxi0lva5k';
  const snap = await db.collection('curationJobs').doc(jobId).get();
  const data = snap.data();
  console.log("Full graphData:");
  console.log(JSON.stringify(data.result?.graphData, null, 2));
}

inspect().catch(console.error);

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  const jobId = 'job-1784136168919-sxi0lva5k';
  console.log(`Inspecting curation job ${jobId}...`);
  const snap = await db.collection('curationJobs').doc(jobId).get();
  if (!snap.exists) {
    console.log("Job does not exist!");
    return;
  }
  const data = snap.data();
  console.log("Job fields:");
  console.log(`- status: ${data.status}`);
  console.log(`- userId: ${data.userId}`);
  console.log(`- jobType: ${data.jobType}`);
  console.log(`- inputPayload:`, JSON.stringify(data.inputPayload, null, 2));
  console.log(`- createdAt: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'N/A'}`);
  console.log(`- updatedAt: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'N/A'}`);
  console.log(`- completedAt: ${data.completedAt ? data.completedAt.toDate().toISOString() : 'N/A'}`);
  console.log(`- errorMessage: ${data.errorMessage}`);
  console.log(`- errorDetails: ${data.errorDetails}`);
  console.log(`- result: ${data.result ? 'Exists (Keys: ' + Object.keys(data.result) + ')' : 'None'}`);
  if (data.result && data.result.graphData) {
    console.log(`- result.graphData:`, JSON.stringify(data.result.graphData).substring(0, 500));
  }
}

inspect().catch(console.error);

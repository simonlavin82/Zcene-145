const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  console.log("Fetching curationJobs...");
  const jobsSnap = await db.collection('curationJobs')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  
  if (jobsSnap.empty) {
    console.log("No jobs found.");
    return;
  }

  jobsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`\nJob ID: ${doc.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Artists: ${data.inputPayload?.artists}`);
    console.log(`Created At: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'N/A'}`);
    if (data.status === 'failed') {
      console.log(`Error Message: ${data.errorMessage}`);
      console.log(`Error Details:`);
      console.log(data.errorDetails);
    }
  });
}

inspect().catch(console.error);

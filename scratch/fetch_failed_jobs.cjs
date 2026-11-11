const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'zcene-production' });
const db = getFirestore();

async function fetchLastFailedJob() {
  const jobs = await db.collection('curationJobs')
    .where('status', '==', 'failed')
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();

  if (jobs.empty) {
    console.log("No failed jobs found.");
    return;
  }
  const job = jobs.docs[0].data();
  console.log(JSON.stringify(job, null, 2));
}

fetchLastFailedJob().catch(console.error);

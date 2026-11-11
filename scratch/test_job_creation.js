const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'zcene-production' });
const db = admin.firestore();

async function createTestJob() {
  const jobId = "test-job-" + Date.now();
  console.log("Creating job", jobId);
  await db.collection('curationJobs').doc(jobId).set({
    status: 'pending',
    jobType: 'graph_generation',
    userId: 'test_user',
    inputPayload: {
      artists: 'spaced',
      filters: {},
      useMocks: true
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log("Job created, waiting for function...");
  
  // listen for status change
  return new Promise((resolve, reject) => {
    const unsub = db.collection('curationJobs').doc(jobId).onSnapshot(snap => {
      const data = snap.data();
      if (!data) return;
      console.log("Status changed to:", data.status);
      if (data.status === 'failed') {
        console.error("Job failed!", data.errorMessage);
        unsub();
        resolve(data);
      } else if (data.status === 'completed') {
        console.log("Job completed!");
        unsub();
        resolve(data);
      }
    });
  });
}

createTestJob().catch(console.error);

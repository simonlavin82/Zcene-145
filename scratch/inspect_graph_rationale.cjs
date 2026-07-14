const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  const doc = await db.collection('artists').doc('blindside').get();
  const data = doc.data();
  console.log("artists/blindside raw doc synthesisRationale:", data.synthesisRationale);
  
  if (data.graphData) {
    const graph = JSON.parse(data.graphData);
    console.log("Parsed graph keys:", Object.keys(graph));
    console.log("graph.synthesisRationale:", graph.synthesisRationale);
    console.log("graph.synthesis_rationale:", graph.synthesis_rationale);
  }
  
  // Also check the curationJobs result
  const jobs = await db.collection('curationJobs')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  jobs.forEach(jobDoc => {
    const job = jobDoc.data();
    console.log(`\nLast job ID: ${jobDoc.id}`);
    console.log("job.result.graphData keys:", Object.keys(job.result?.graphData || {}));
    console.log("job.result.graphData.synthesisRationale:", job.result?.graphData?.synthesisRationale);
    console.log("job.result.graphData.synthesis_rationale:", job.result?.graphData?.synthesis_rationale);
  });
}

inspect().catch(console.error);

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function queryJob() {
  const snap = await db.collection('curationJobs').orderBy('createdAt', 'desc').limit(1).get();
  if (!snap.empty) {
    const data = snap.docs[0].data();
    if (data.result && data.result.graphData) {
      console.log(JSON.stringify(data.result.graphData, null, 2));
    } else {
      console.log("No graph data found in recent job.");
    }
  } else {
    console.log("No jobs found.");
  }
}
queryJob().catch(console.error).finally(() => process.exit(0));

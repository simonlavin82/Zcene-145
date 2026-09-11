const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: "zcene-production" });
const db = getFirestore();

async function getJob() {
  const query = await db.collection('curationJobs')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
    
  if (query.empty) {
    console.log("No jobs found");
    return;
  }
  
  const doc = query.docs[0];
  console.log("Job ID:", doc.id);
  console.log(JSON.stringify(doc.data(), null, 2));
}

getJob().catch(console.error);

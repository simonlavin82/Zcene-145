import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    projectId: 'zcene-production'
  });
}

const db = getFirestore();

async function run() {
  console.log("Fetching artists/slam-coke-jp...");
  const doc = await db.collection('artists').doc('slam-coke-jp').get();
  
  if (!doc.exists) {
    console.log("Document does not exist.");
    return;
  }

  const data = doc.data();
  console.log(JSON.stringify(data, null, 2));

  console.log("\nFetching curation job for Words of Concrete...");
  const snapshot = await db.collection('curationJobs')
    .where('seedArtists', '==', 'Words of Concrete')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log("No curation job found for Words of Concrete.");
    return;
  }

  const jobData = snapshot.docs[0].data();
  console.log("Job ID:", snapshot.docs[0].id);
  
  const nodes = jobData.graphData?.nodes || [];
  const slamCokeNode = nodes.find((n: any) => n.id === 'slam-coke-jp' || n.id === 'Slam Coke' || n.id === 'slam-coke' || n.label === 'Slam Coke');
  
  console.log("Slam Coke Node in Graph:");
  console.log(JSON.stringify(slamCokeNode, null, 2));
}

run().catch(console.error);

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'zcene-production'
  });
}

const db = getFirestore();

async function run() {
  console.log("Fetching artists/slam-coke-jp...");
  const doc = await db.collection('artists').doc('slam-coke-jp').get();
  
  if (!doc.exists) {
    console.log("Document artists/slam-coke-jp does not exist.");
  } else {
    const data = doc.data();
    console.log("=== artists/slam-coke-jp ===");
    console.log(JSON.stringify(data, null, 2));
  }

  console.log("\nFetching curation job for Words of Concrete...");
  const snapshot = await db.collection('curationJobs')
    .where('seedArtists', '==', 'Words of Concrete')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log("No curation job found for Words of Concrete.");
  } else {
    const jobData = snapshot.docs[0].data();
    console.log("=== Curation Job ID:", snapshot.docs[0].id, "===");
    
    const nodes = jobData.graphData?.nodes || [];
    const slamCokeNode = nodes.find((n) => n.id === 'slam-coke-jp' || n.id === 'Slam Coke' || n.id === 'slam-coke' || n.label === 'Slam Coke');
    
    if (slamCokeNode) {
      console.log("Slam Coke Node in Graph:");
      console.log(JSON.stringify(slamCokeNode, null, 2));
    } else {
      console.log("Slam Coke Node NOT FOUND in graphData.nodes");
    }
  }
}

run().catch(console.error);

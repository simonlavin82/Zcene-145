const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function queryProjects() {
  console.log("Fetching projects...");
  const snap = await db.collection('projects').get();
  console.log("Total projects:", snap.size);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log("Project ID:", doc.id);
    if (data.graphData) {
      const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      console.log("Nodes:", g.nodes.map(n => n.id));
    }
  });
}
queryProjects().catch(console.error).finally(() => process.exit(0));

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const p3Id = 'FrpPku2zXQXF3AkmbsGw';
    const query1 = await db.collectionGroup('projects').get();
    
    let p3Data;
    query1.docs.forEach(doc => {
      if (doc.id === p3Id) p3Data = doc.data();
    });
    
    console.log("=== PROJECT 3 (New Direct Hit) ===");
    console.log("ID:", p3Id);
    console.log("artistIds:", JSON.stringify(p3Data?.artistIds));
    console.log("activeNodes:", JSON.stringify(p3Data?.activeNodes));
    if (p3Data?.graphData) {
        try {
            const gd = JSON.parse(p3Data.graphData);
            console.log("Graph Nodes Count:", gd.nodes?.length);
            console.log("Graph artist nodes:", gd.nodes?.filter(n => n.type === 'artist' || !n.type).map(n => n.id).join(', '));
        } catch (e) {}
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

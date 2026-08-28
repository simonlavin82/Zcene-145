const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const query1 = await db.collectionGroup('projects').get();
    
    let p2Data;
    let actualP2Id;
    query1.docs.forEach(doc => {
      if (doc.id.startsWith('1Gojx')) {
         p2Data = doc.data();
         actualP2Id = doc.id;
      }
    });
    
    console.log("\n=== PROJECT 2 (Direct Hit) ===");
    console.log("ID:", actualP2Id);
    console.log("artistIds:", JSON.stringify(p2Data?.artistIds));
    console.log("activeNodes:", JSON.stringify(p2Data?.activeNodes));
    if (p2Data?.graphData) {
        try {
            const gd = JSON.parse(p2Data.graphData);
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

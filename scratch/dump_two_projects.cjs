const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const p1Id = 'eQM61BjfJnzTsTVHH7Ry';
    const p2Id = '1GojxNJlqoElwkpO0plu';
    
    // We don't know the user ID, so we use collectionGroup to find them
    const query1 = await db.collectionGroup('projects').get();
    
    let p1Data, p2Data;
    query1.docs.forEach(doc => {
      if (doc.id === p1Id) p1Data = doc.data();
      if (doc.id === p2Id) p2Data = doc.data();
    });
    
    console.log("=== PROJECT 1 (Root Generation) ===");
    console.log("ID:", p1Id);
    console.log("artistIds:", JSON.stringify(p1Data?.artistIds));
    console.log("activeNodes:", JSON.stringify(p1Data?.activeNodes));
    if (p1Data?.graphData) {
        try {
            const gd = JSON.parse(p1Data.graphData);
            console.log("Graph Nodes Count:", gd.nodes?.length);
            console.log("Graph artist nodes:", gd.nodes?.filter(n => n.type === 'artist' || !n.type).map(n => n.id).join(', '));
        } catch (e) {}
    }
    
    console.log("\n=== PROJECT 2 (Direct Hit) ===");
    console.log("ID:", p2Id);
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

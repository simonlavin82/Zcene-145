const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function queryDocs() {
  const shareIds = ['d8PcP0rUeNknp7780Dk3', 'cLiokb8Cby0tcIzNopyO', 'cLiokb8CbyQtcIzNopyO', 'cLiOKb8CbyQtcIzNopyO'];
  
  // also get all documents since I might have typed the ID wrong
  const snap = await db.collection('sharedZcenes').orderBy('createdAt', 'desc').limit(5).get();
  snap.forEach(doc => {
      console.log(`\n--- RECENT SHARED ZCENE: ${doc.id} ---`);
      const data = doc.data();
      
      console.log(`Seed Artists: ${data.seedArtists}`);
      console.log(`Active Nodes Count: ${data.activeNodes ? data.activeNodes.length : 0}`);
      
      let graphNodes = [];
      if (data.graphData) {
          const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
          if (g.nodes) {
              graphNodes = g.nodes;
              console.log(`Graph Nodes Count: ${graphNodes.length}`);
          }
      }
      
      // Let's see what activeNodes filters out from the graph
      if (data.activeNodes && graphNodes.length > 0) {
          const graphNodeIds = new Set(graphNodes.map(n => n.id.toLowerCase()));
          const activeNodeIdsSet = new Set(data.activeNodes.map(n => typeof n === 'string' ? n.toLowerCase() : n.id.toLowerCase()));
          
          let missingFromActive = [];
          graphNodes.forEach(n => {
             if (!activeNodeIdsSet.has(n.id.toLowerCase())) {
                 missingFromActive.push({ id: n.id, type: n.type });
             } 
          });
          console.log(`Nodes in graph missing from activeNodes: ${missingFromActive.length}`);
      }
  });
}

queryDocs().catch(console.error).finally(() => process.exit(0));

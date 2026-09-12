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
  const userId = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
  const projectId = '3vMFnc2sFb896grkDB4C';
  
  const projectDoc = await db.collection('users').doc(userId).collection('projects').doc(projectId).get();
  const pdata = projectDoc.data();
  
  let graph;
  try {
    graph = typeof pdata.graphData === 'string' ? JSON.parse(pdata.graphData) : pdata.graphData;
  } catch(e) { console.log("Parse error:", e); return; }
  
  const slamNode = graph.nodes.find(n => n.id === 'slam-coke-at');
  console.log("=== Slam Coke Node in Graph ===");
  console.log(JSON.stringify(slamNode, null, 2));
  
  // Find links from/to Slam Coke
  const links = graph.links.filter(l => {
    const sId = typeof l.source === 'string' ? l.source : l.source?.id;
    const tId = typeof l.target === 'string' ? l.target : l.target?.id;
    return sId === 'slam-coke-at' || tId === 'slam-coke-at';
  });
  console.log("\n=== Slam Coke Links ===");
  links.forEach(l => {
    const sId = typeof l.source === 'string' ? l.source : l.source?.id;
    const tId = typeof l.target === 'string' ? l.target : l.target?.id;
    console.log(`  ${sId} -> ${tId}`);
  });
  
  // Connected node types
  const connectedNodeIds = links.flatMap(l => {
    const sId = typeof l.source === 'string' ? l.source : l.source?.id;
    const tId = typeof l.target === 'string' ? l.target : l.target?.id;
    return [sId, tId].filter(id => id !== 'slam-coke-at');
  });
  const connectedNodes = graph.nodes.filter(n => connectedNodeIds.includes(n.id));
  console.log("\n=== Connected Nodes ===");
  connectedNodes.forEach(n => console.log(` type=${n.type} id=${n.id} label=${n.label}`));
  
  // Also check if slam-coke-at exists in artists collection
  console.log("\n=== Checking artists/slam-coke-at in Firestore ===");
  const slamCokeAt = await db.collection('artists').doc('slam-coke-at').get();
  console.log("Exists:", slamCokeAt.exists);
  if (slamCokeAt.exists) {
    const d = slamCokeAt.data();
    console.log("Keys:", Object.keys(d));
    console.log("hasDetailsCache:", !!d.detailsCache);
    console.log("redirectTo:", d.redirectTo);
  }
  
  // Also check if slam-coke exists
  console.log("\n=== Checking artists/slam-coke in Firestore ===");
  const slamCoke = await db.collection('artists').doc('slam-coke').get();
  console.log("Exists:", slamCoke.exists);
  if (slamCoke.exists) {
    const d = slamCoke.data();
    console.log("Keys:", Object.keys(d));
    console.log("hasDetailsCache:", !!d.detailsCache);
    console.log("redirectTo:", d.redirectTo);
  }
  
  // Check what the detailsCache in the project says for slam-coke-at
  const detailsCache = pdata.detailsCache;
  if (detailsCache) {
    console.log("\n=== Project detailsCache type ===", typeof detailsCache);
    if (Array.isArray(detailsCache)) {
      console.log("Is array, entries:", detailsCache.length);
      const slamEntry = detailsCache.find(e => {
        const key = Array.isArray(e) ? e[0] : e?.key || e?.id;
        return key && (key.toLowerCase().includes('slam') || key.toLowerCase().includes('coke'));
      });
      console.log("Slam entry:", JSON.stringify(slamEntry, null, 2));
    } else {
      console.log("Keys:", Object.keys(detailsCache).filter(k => k.toLowerCase().includes('slam')));
    }
  }
}

run().catch(console.error);

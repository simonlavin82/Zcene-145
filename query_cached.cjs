const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function queryDocs() {
  const doc = await db.collection('artists').doc('spaced-us').get();
  const data = doc.data();
  if (data && data.graphData) {
      const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      console.log(`Cached Graph Nodes Count: ${g.nodes.length}`);
      console.log(`Cached Graph Types: ${Array.from(new Set(g.nodes.map(n => n.type))).join(', ')}`);
  } else {
      console.log("No graphData in spaced-us cache");
  }
}

queryDocs().catch(console.error).finally(() => process.exit(0));

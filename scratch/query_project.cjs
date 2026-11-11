const admin = require('firebase-admin');
const config = require('../firebase-service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(config) });
}
const db = admin.firestore();

async function run() {
  const snapshot = await db.collectionGroup('projects').orderBy('createdAt', 'desc').limit(2).get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log('Project ID:', doc.id);
    console.log('Name:', data.name);
    console.log('Seed Artists:', data.seedArtists);
    console.log('Active Nodes (first 5):', data.activeNodes?.slice(0, 5));
    if (data.graphData) {
      const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      console.log('Graph Nodes Count:', graph.nodes?.length);
      console.log('Graph Nodes (first 5):', graph.nodes?.slice(0, 5).map(n => n.id));
      const spacedNode = graph.nodes?.find(n => n.id.includes('spaced'));
      console.log('Is spaced in graph?', !!spacedNode, spacedNode?.id);
    }
    console.log('---------------------------');
  });
}
run().catch(console.error);

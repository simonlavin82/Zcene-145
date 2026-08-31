const admin = require('firebase-admin');
const config = require('../firebase-service-account.json');
const app = admin.initializeApp({ credential: admin.credential.cert(config) });
const db = admin.firestore();
db.collectionGroup('projects').orderBy('createdAt', 'desc').limit(1).get().then(snap => {
  snap.forEach(doc => {
    const data = doc.data();
    console.log('Project ID:', doc.id);
    console.log('Seed Artists:', data.seedArtists);
    console.log('Active Nodes (first 5):', data.activeNodes?.slice(0, 5));
    if (data.graphData) {
      const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      console.log('Graph Nodes (first 5):', graph.nodes?.slice(0, 5).map(n => n.id));
    }
  });
}).catch(console.error);

const admin = require('firebase-admin');
const config = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(config) });
const db = admin.firestore();

async function run() {
  const doc1 = await db.collection('artists').doc('spaced').get();
  const doc2 = await db.collection('artists').doc('spaced-us').get();
  
  if (doc1.exists) {
    console.log('SPACED DOC EXISTS');
    const graph = typeof doc1.data().graphData === 'string' ? JSON.parse(doc1.data().graphData) : doc1.data().graphData;
    console.log('Spaced nodes:', graph?.nodes?.map(n => n.id).slice(0, 5));
  }
  
  if (doc2.exists) {
    console.log('SPACED-US DOC EXISTS');
    const graph = typeof doc2.data().graphData === 'string' ? JSON.parse(doc2.data().graphData) : doc2.data().graphData;
    console.log('Spaced-us nodes:', graph?.nodes?.map(n => n.id).slice(0, 5));
  }
}
run().catch(console.error);

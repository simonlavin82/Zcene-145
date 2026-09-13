const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount),
  projectId: 'zcene-production'
});

const db = getFirestore();

async function check() {
  const snapshot = await db.collectionGroup('projects').get();
  const doc = snapshot.docs.find(d => d.id === 'aGvMprmZKuIA69tvESCw');
  
  const data = doc.data();
  const graphData = JSON.parse(data.graphData);
  
  const ukLinks = graphData.links.filter(l => l.source === 'uk' || l.target === 'uk' || l.source.id === 'uk' || l.target.id === 'uk');
  console.log('Links referencing UK:', JSON.stringify(ukLinks, null, 2));
  
  process.exit(0);
}

check().catch(console.error);

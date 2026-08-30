const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  const sharedId = 'W1mIhXKQEP9x4xNMhKU3'; 
  const sharedRef = await db.collection('sharedZcenes').doc(sharedId).get();
  
  if (sharedRef.exists) {
      const data = sharedRef.data();
      const graphData = JSON.parse(data.graphData);
      console.log(`graphData nodes: ${graphData.nodes.length}`);
      console.log(`graphData links: ${graphData.links.length}`);
      if (graphData.links.length > 0) {
          console.log(`Sample link:`, graphData.links[0]);
      }
  }

  process.exit(0);
}

run();

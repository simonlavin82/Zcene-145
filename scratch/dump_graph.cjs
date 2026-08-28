const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const doc = await db.collection('artists').doc('spaced-us').get();
    const gd = JSON.parse(doc.data().graphData);
    
    console.log("Nodes matching 'spaced':");
    const spacedNodes = gd.nodes.filter(n => n.id.includes('spaced'));
    console.log(JSON.stringify(spacedNodes, null, 2));
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

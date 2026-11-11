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
    let gd = JSON.parse(doc.data().graphData);
    
    // Remove "spaced" node, keep "spaced-us"
    gd.nodes = gd.nodes.filter(n => n.id !== 'spaced');
    
    // Also remove any links referencing 'spaced'
    gd.links = gd.links.filter(l => l.source !== 'spaced' && l.target !== 'spaced');
    
    await db.collection('artists').doc('spaced-us').update({
      graphData: JSON.stringify(gd)
    });
    
    console.log("Cleaned artists/spaced-us DB entry!");
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

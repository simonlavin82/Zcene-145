const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const spacedUs = await db.collection('artists').doc('spaced-us').get();
    
    console.log("artists/spaced-us seedArtists:", spacedUs.data()?.seedArtists);
    console.log("artists/spaced-us artistId:", spacedUs.data()?.artistId);
    console.log("artists/spaced-us graphData nodes:", JSON.parse(spacedUs.data()?.graphData || '{"nodes":[]}').nodes.map(n => n.id).join(', '));
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

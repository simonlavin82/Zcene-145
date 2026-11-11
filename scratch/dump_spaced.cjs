const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const spaced = await db.collection('artists').doc('spaced').get();
    const spacedUs = await db.collection('artists').doc('spaced-us').get();
    
    console.log("artists/spaced exists:", spaced.exists);
    console.log("artists/spaced redirectTo:", spaced.data()?.redirectTo);
    console.log("artists/spaced has graphData:", !!spaced.data()?.graphData);
    
    console.log("artists/spaced-us exists:", spacedUs.exists);
    console.log("artists/spaced-us redirectTo:", spacedUs.data()?.redirectTo);
    console.log("artists/spaced-us has graphData:", !!spacedUs.data()?.graphData);
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

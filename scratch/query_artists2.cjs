const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  const spacedSnap = await db.collection('artists').doc('spaced').get();
  console.log(JSON.stringify(spacedSnap.data(), null, 2));
  process.exit(0);
}
main();

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  const spacedSnap = await db.collection('artists').doc('spaced').get();
  console.log("artists/spaced redirectTo:", spacedSnap.data()?.redirectTo);
  console.log("artists/spaced-usa exists:", (await db.collection('artists').doc('spaced-usa').get()).exists);
  console.log("artists/spaced-us exists:", (await db.collection('artists').doc('spaced-us').get()).exists);
  process.exit(0);
}
main();

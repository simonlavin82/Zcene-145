const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), projectId: 'zcene-production' });
}
const db = getFirestore();

async function run() {
  console.log("Deleting manual redirect stubs...");
  await db.collection('artists').doc('slam-coke-at').delete();
  console.log("Deleted artists/slam-coke-at");
  await db.collection('artists').doc('slam-coke').delete();
  console.log("Deleted artists/slam-coke");
  console.log("Database integrity restored.");
}
run().catch(console.error);

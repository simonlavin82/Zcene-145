const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  const globalSnap = await db.collection('artists').doc('korn-united-states').get();
  if (globalSnap.exists) {
    const data = globalSnap.data();
    console.log(JSON.stringify(data, null, 2));
  }
}

run().catch(console.error).finally(() => process.exit(0));

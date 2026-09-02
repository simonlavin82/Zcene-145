const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'zcene-production' });
const db = getFirestore();

async function run() {
  const bugginSnap = await db.collection('artists').doc('buggin').get();
  console.log('buggin:', bugginSnap.exists ? bugginSnap.data() : 'Not found');
  
  const bugginUsSnap = await db.collection('artists').doc('buggin-us').get();
  console.log('buggin-us:', bugginUsSnap.exists ? bugginUsSnap.data() : 'Not found');
}
run().catch(console.error);

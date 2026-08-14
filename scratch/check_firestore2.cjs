const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: "zcene-production" });
const db = getFirestore();
async function run() {
  const doc = await db.collection('artists').doc('spaced-usa').get();
  console.log("Spaced-usa exists?", doc.exists);
  if (doc.exists) console.log(Object.keys(doc.data()));
}
run();

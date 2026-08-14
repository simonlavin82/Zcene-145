const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: "zcene-production" });
const db = getFirestore();
async function run() {
  const q = await db.collection('artists').where('cacheKey', '>=', 'spaced').where('cacheKey', '<=', 'spaced\uf8ff').get();
  console.log(q.docs.map(d => ({id: d.id, cacheKey: d.data().cacheKey, redirectTo: d.data().redirectTo})));
}
run();

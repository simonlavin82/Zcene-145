const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkDoc() {
  const docRef = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ');
  const snap = await docRef.get();
  const data = snap.data();
  console.log('graphData exact value:', data.graphData);
  console.log('activeNodes exact value:', data.activeNodes);
  console.log('detailsCache first 200 chars:', typeof data.detailsCache === 'string' ? data.detailsCache.slice(0, 200) : data.detailsCache);
}

checkDoc().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


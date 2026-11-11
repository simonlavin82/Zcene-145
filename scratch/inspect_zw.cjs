const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkZw() {
  const docRef = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/Zw6eIbpePvWeYmopgWhS');
  const snap = await docRef.get();
  const data = snap.data();
  console.log('Project ID: Zw6eIbpePvWeYmopgWhS');
  console.log('status:', data.status);
  console.log('typeof graphData:', typeof data.graphData);
  if (typeof data.graphData === 'object' && data.graphData !== null) {
    console.log('graphData.nodes length:', data.graphData.nodes?.length);
  } else if (typeof data.graphData === 'string') {
    console.log('graphData string length:', data.graphData.length);
  }
  console.log('activeNodes length:', data.activeNodes?.length);
  console.log('scenes length:', typeof data.scenes === 'string' ? JSON.parse(data.scenes).length : data.scenes?.length);
}

checkZw().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


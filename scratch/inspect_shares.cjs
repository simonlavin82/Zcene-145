const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkShares() {
  for (const id of ['VZos2giGBfivNVfjc0Fm', 'AJosq7HfMTH3f95MmFmI']) {
    const snap = await db.doc(`sharedZcenes/${id}`).get();
    if (!snap.exists) continue;
    const data = snap.data();
    console.log(`Share ID: ${id}`);
    console.log('  typeof graphData:', typeof data.graphData);
    if (typeof data.graphData === 'object' && data.graphData !== null) {
      console.log('  graphData.nodes length:', data.graphData.nodes?.length);
    } else if (typeof data.graphData === 'string') {
      console.log('  graphData string length:', data.graphData.length);
    }
  }
}

checkShares().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


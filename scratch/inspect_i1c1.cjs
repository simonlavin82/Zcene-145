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
  if (!snap.exists) {
    console.log('Not found');
    return;
  }
  const data = snap.data();
  console.log('Project ID: i1c1KFgYdXr6flXT7lLQ');
  console.log('status:', data.status);
  console.log('title:', data.title);
  console.log('seedArtists:', data.seedArtists);
  console.log('typeof graphData:', typeof data.graphData);
  if (typeof data.graphData === 'object' && data.graphData !== null) {
    console.log('graphData.nodes length:', data.graphData.nodes ? data.graphData.nodes.length : 'none');
    console.log('graphData.links length:', data.graphData.links ? data.graphData.links.length : 'none');
  } else if (typeof data.graphData === 'string') {
    console.log('graphData string length:', data.graphData.length);
  }
  console.log('typeof scenes:', typeof data.scenes);
  if (Array.isArray(data.scenes)) {
    console.log('scenes length:', data.scenes.length);
  } else if (typeof data.scenes === 'string') {
    console.log('scenes string length:', data.scenes.length);
  }
  console.log('activeNodes:', data.activeNodes);
  console.log('artistIds:', data.artistIds);
  console.log('labelIds:', data.labelIds);
  
  console.log('\ndetailsCache summary:');
  console.log('typeof detailsCache:', typeof data.detailsCache);
  if (Array.isArray(data.detailsCache)) {
    console.log('detailsCache is Array with length:', data.detailsCache.length);
    console.log('First 5 keys:', data.detailsCache.slice(0, 5).map(([k]) => k));
  } else if (typeof data.detailsCache === 'object' && data.detailsCache !== null) {
    console.log('detailsCache is Map/Object with keys:', Object.keys(data.detailsCache).slice(0, 5));
  }
}

checkDoc().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkScenes() {
  const docRef = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ');
  const snap = await docRef.get();
  const data = snap.data();
  let scenes = data.scenes;
  if (typeof scenes === 'string') scenes = JSON.parse(scenes);
  
  console.log('Scenes count:', scenes.length);
  scenes.forEach((s, idx) => {
    console.log(`Scene ${idx + 1} (${s.sceneId}):`);
    console.log(`  title: ${s.title}`);
    console.log(`  seedArtists: ${s.seedArtists}`);
    console.log(`  status: ${s.status}`);
    console.log(`  nodes in graphData: ${s.graphData?.nodes ? s.graphData.nodes.length : 0}`);
    console.log(`  links in graphData: ${s.graphData?.links ? s.graphData.links.length : 0}`);
  });
}

checkScenes().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


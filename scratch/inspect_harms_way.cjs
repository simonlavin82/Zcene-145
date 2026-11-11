const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

const KNOWN_USERS = [
  "K3QqtNRg48X7I3C0Zu2PVPzRBSH3",
];

async function findProjectDoc(projectId) {
  for (const uid of KNOWN_USERS) {
    const doc = await db.doc(`users/${uid}/projects/${projectId}`).get();
    if (doc.exists) return doc;
  }
  // Fallback: search across users collection
  const usersSnap = await db.collection('users').get();
  for (const uDoc of usersSnap.docs) {
    const pDoc = await db.doc(`users/${uDoc.id}/projects/${projectId}`).get();
    if (pDoc.exists) return pDoc;
  }
  return null;
}

async function inspectProject(projectId) {
  console.log(`\n======================================================`);
  console.log(`INSPECTING PROJECT: ${projectId}`);
  console.log(`======================================================`);
  
  const projectDoc = await findProjectDoc(projectId);
  if (!projectDoc) {
    console.log(`Project ${projectId} not found!`);
    return;
  }
  
  const pData = projectDoc.data();
  console.log(`Project Ref Path: ${projectDoc.ref.path}`);
  console.log(`Project Title/Name: ${pData.name || pData.title || pData.projectName}`);
  console.log(`Seed Artists: ${JSON.stringify(pData.seedArtists)}`);
  
  let detailsCacheObj = pData.detailsCache;
  if (typeof detailsCacheObj === 'string') {
    try {
      detailsCacheObj = JSON.parse(detailsCacheObj);
    } catch (e) {
      console.log('Failed to parse detailsCache JSON');
    }
  }
  
  let entries = [];
  if (Array.isArray(detailsCacheObj)) {
    entries = detailsCacheObj;
  } else if (detailsCacheObj && typeof detailsCacheObj === 'object') {
    entries = Object.entries(detailsCacheObj);
  }
  
  console.log(`Total detailsCache entries: ${entries.length}`);
  
  const targetKeys = ['nails', 'knocked-loose', 'code-orange', 'twitching-tongues', 'terror', 'vein-fm', 'vein'];
  
  for (const [key, details] of entries) {
    const isTarget = targetKeys.some(tk => key.toLowerCase().includes(tk));
    if (isTarget) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Key: ${key} (Artist: ${details?.details?.artist || details?.artist})`);
      console.log(`members:`, JSON.stringify(details?.members));
      console.log(`notableArtists:`, JSON.stringify(details?.details?.notableArtists));
      console.log(`summary:`);
      console.log(details?.summary);
    }
  }
}

async function inspectArtistDoc(artistId) {
  const doc = await db.collection('artists').doc(artistId).get();
  console.log(`\n======================================================`);
  console.log(`INSPECTING GLOBAL ARTIST DOC: artists/${artistId}`);
  console.log(`Exists: ${doc.exists}`);
  if (doc.exists) {
    const data = doc.data();
    console.log(`cacheKey: ${data.cacheKey}, artistId: ${data.artistId}`);
    const details = data.detailsCache;
    console.log(`members:`, JSON.stringify(details?.members));
    console.log(`notableArtists:`, JSON.stringify(details?.details?.notableArtists));
    console.log(`summary:`);
    console.log(details?.summary);
  }
}

async function main() {
  try {
    await inspectProject('o8JDNr43qbzRO7N8bpp9');
    await inspectProject('I08wvBH905SICoSGKSjY');
    await inspectArtistDoc('vein-fm-us');
    await inspectArtistDoc('vein-fm');
    await inspectArtistDoc('knocked-loose-us');
    await inspectArtistDoc('nails-us');
    await inspectArtistDoc('code-orange-us');
    await inspectArtistDoc('terror-us');
    await inspectArtistDoc('twitching-tongues-us');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();

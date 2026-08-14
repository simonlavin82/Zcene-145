const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: "zcene-production" });
const db = getFirestore();

async function searchDisambiguationCandidates(queryStr) {
  const normQuery = queryStr.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const snapshot = await db.collection('artists')
    .where('cacheKey', '>=', normQuery)
    .where('cacheKey', '<=', normQuery + '\uf8ff')
    .get();
  
  let snapshotDocs = snapshot.docs;
  if (snapshotDocs.length === 0) {
    const exactSnap = await db.collection('artists').doc(normQuery).get();
    if (exactSnap.exists) {
      if (exactSnap.data().redirectTo) {
        const targetSnap = await db.collection('artists').doc(exactSnap.data().redirectTo).get();
        if (targetSnap.exists) snapshotDocs = [targetSnap];
      } else {
        snapshotDocs = [exactSnap];
      }
    }
  }

  const candidatesMap = new Map();
  for (const docSnap of snapshotDocs) {
    const data = docSnap.data();
    if (data.redirectTo) continue;
    
    let originVal = "";
    if (data.detailsCache) {
      let parsed = JSON.parse(data.detailsCache);
      originVal = parsed.details?.origin || parsed.origin || "";
    }
    candidatesMap.set(docSnap.id, { id: docSnap.id, origin: originVal });
  }
  return Array.from(candidatesMap.values());
}

searchDisambiguationCandidates('spaced').then(console.log);

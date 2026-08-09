const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function queryRedirects() {
  const ids = ['spaced', 'gel', 'one-step-closer'];
  for (const id of ids) {
    const docRef = db.collection('artists').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      console.log(`\n--- Document: ${id} ---`);
      const data = docSnap.data();
      console.log(JSON.stringify({
        artistId: data.artistId,
        cacheKey: data.cacheKey,
        redirectTo: data.redirectTo,
        hasDetailsCache: !!data.detailsCache,
        hasMembers: !!data.members,
        hasGraphData: !!data.filters?.graphData
      }, null, 2));
    } else {
      console.log(`\n--- Document: ${id} (NOT FOUND) ---`);
    }
  }
}

queryRedirects().catch(console.error);

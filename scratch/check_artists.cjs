const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
async function run() {
  const artistSnap = await db.collection('artists').doc('spaced-us').get();
  if (artistSnap.exists) {
    const d = artistSnap.data();
    console.log('Spaced-us keys:', Object.keys(d));
    if (d.detailsCache) {
       console.log('Spaced-us detailsCache keys:', Object.keys(d.detailsCache));
       console.log('Spaced-us detailsCache imageUrl:', d.detailsCache.imageUrl);
       console.log('Spaced-us detailsCache.details.imageUrl:', d.detailsCache.details?.imageUrl);
    }
  }
}
run().catch(console.error);

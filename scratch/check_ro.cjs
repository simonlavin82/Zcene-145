const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
(async () => {
  const checkGlobal = ['restraining-order', 'restraining-order-usa'];
  for (const id of checkGlobal) {
    const doc = await db.collection('artists').doc(id).get();
    if (doc.exists) {
       const data = doc.data();
       if (data.detailsCache) {
         let parsed = data.detailsCache;
         if (typeof parsed === 'string') parsed = JSON.parse(parsed);
         console.log('Global cache for ' + id + ':');
         console.log('  imageUrl: ' + parsed.imageUrl);
       } else {
         console.log('Global cache for ' + id + ' exists, but detailsCache is missing.');
       }
    } else {
       console.log('Global cache for ' + id + ' does not exist.');
    }
  }
})();

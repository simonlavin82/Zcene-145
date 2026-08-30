const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function queryDocs() {
  const shareIds = ['dBPcP0rUeNknp7780Dk3', 'cLioKb8Cby0tcIzNopyO'];
  
  for (const id of shareIds) {
      console.log(`\n--- RECENT SHARED ZCENE: ${id} ---`);
      const doc = await db.collection('sharedZcenes').doc(id).get();
      const data = doc.data();
      
      console.log(`Has detailsCache:`, !!data.detailsCache);
      if (data.detailsCache) {
          const parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
          console.log(`detailsCache elements:`, parsed.length);
      }
  }
}

queryDocs().catch(console.error).finally(() => process.exit(0));

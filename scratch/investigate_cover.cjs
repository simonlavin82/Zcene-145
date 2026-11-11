const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const rootGenShared = await db.collection('sharedZcenes').doc('8psxh6Jok4xl3m8LQsht').get();
  console.log('--- Root Gen Shared (8psxh6Jok4xl3m8LQsht) ---');
  if (rootGenShared.exists) {
    const data = rootGenShared.data();
    console.log('Keys:', Object.keys(data));
    console.log('coverUrl:', data.coverUrl);
    console.log('seedImage:', data.seedImage);
    console.log('seedImageUrl:', data.seedImageUrl);
  }
  
  const directHitSharedRecent = await db.collection('sharedZcenes').orderBy('createdAt', 'desc').limit(10).get();
  console.log('\n--- Recent Shared Zcenes (looking for Direct Hit) ---');
  directHitSharedRecent.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Name: ${data.name}, coverUrl: ${data.coverUrl}, seedImage: ${data.seedImage}, seedImageUrl: ${data.seedImageUrl}`);
  });
}

run().catch(console.error);

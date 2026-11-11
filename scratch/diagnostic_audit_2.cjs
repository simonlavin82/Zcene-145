const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const usersSnap = await db.collection('users').limit(1).get();
  
  for (const userDoc of usersSnap.docs) {
    const projectsSnap = await db.collection('users').doc('9FBuWDALnNfUAjxV0pRe3RnKwJy1').collection('projects')
      .orderBy('updatedAt', 'desc').limit(2).get();
    
    for (const projectDoc of projectsSnap.docs) {
      const data = projectDoc.data();
      console.log(`\n── Project: ${projectDoc.id} ──`);
      console.log(`  Name: ${data.name}`);
      console.log(`  seedImageUrl: ${data.seedImageUrl}`);
      console.log(`  activeNodes[0]: ${data.activeNodes && data.activeNodes[0]}`);
      if (data.detailsCache) {
          const parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
          if (Array.isArray(parsed) && parsed.length > 0) {
             const seedItem = parsed.find(item => item[0].includes('spaced'));
             if (seedItem) {
                 console.log(`  Cache Seed Key: ${seedItem[0]}`);
                 console.log(`  Cache Seed imageUrl: ${seedItem[1]?.imageUrl}`);
                 console.log(`  Cache Seed details.imageUrl: ${seedItem[1]?.details?.imageUrl}`);
             } else {
                 console.log(`  Cache Seed NOT FOUND. First item: ${parsed[0][0]}`);
             }
          }
      }
    }
  }
}
run().catch(console.error).finally(() => process.exit(0));

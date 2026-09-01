const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'zcene-production'
  });
}

const db = admin.firestore();

async function checkDocs() {
  const rootGenShared = await db.collection('sharedZcenes').doc('8psxh6Jok4xl3m8LQsht').get().catch(() => null);
  
  const recentShared = await db.collection('sharedZcenes').orderBy('createdAt', 'desc').limit(5).get();
  
  console.log('--- Root Gen Shared (8psxh6Jok4xl3m8LQsht) ---');
  if (rootGenShared?.exists) {
    const data = rootGenShared.data();
    console.log('Keys:', Object.keys(data));
    console.log('Cover URL:', data.coverUrl);
    console.log('Seed Image:', data.seedImage);
    console.log('Name:', data.name);
  } else {
    console.log('Not found');
  }
  
  console.log('\n--- Recent Shared Zcenes ---');
  recentShared.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`Name: ${data.name}`);
    console.log(`Cover URL: ${data.coverUrl}`);
    console.log(`Seed Image: ${data.seedImage}`);
    console.log('Keys:', Object.keys(data));
    console.log('---');
  });
}

checkDocs().catch(console.error);

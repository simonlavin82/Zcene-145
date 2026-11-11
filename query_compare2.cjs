const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  const masterId = 'eQM61BjfJnzTsTVHH7Ry'; 
  const userId = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
  const sharedId = 'ewcKMNVzF2JqKNGZbHEk'; 

  console.log(`Fetching master project: ${masterId}...`);
  const masterDoc = await db.collection('users').doc(userId).collection('projects').doc(masterId).get();
  
  if (masterDoc.exists) {
      console.log('\nMaster Project Keys:');
      const data = masterDoc.data();
      const keys = Object.keys(data).sort();
      keys.forEach(k => {
          let val = data[k];
          let type = typeof val;
          let len = Array.isArray(val) ? `Array(${val.length})` : (type === 'string' ? `String(${val.length})` : type);
          console.log(`  - ${k}: ${len}`);
      });
  } else {
      console.log('Master project not found in any users collection.');
  }

  console.log(`\nFetching shared project: ${sharedId}...`);
  const sharedRef = await db.collection('sharedZcenes').doc(sharedId).get();
  if (sharedRef.exists) {
      console.log('\nShared Project Keys:');
      const data = sharedRef.data();
      const keys = Object.keys(data).sort();
      keys.forEach(k => {
          let val = data[k];
          let type = typeof val;
          let len = Array.isArray(val) ? `Array(${val.length})` : (type === 'string' ? `String(${val.length})` : type);
          console.log(`  - ${k}: ${len}`);
      });
  } else {
      console.log('Shared project not found.');
  }

  process.exit(0);
}

run();

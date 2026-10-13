const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function inspectGunmoll() {
  console.log('--- Inspecting artists/gunmoll ---');
  const gunmollDoc = await db.collection('artists').doc('gunmoll').get();
  if (gunmollDoc.exists) {
    console.log('artists/gunmoll exists:');
    console.log(JSON.stringify(gunmollDoc.data(), null, 2));
  } else {
    console.log('artists/gunmoll does NOT exist.');
  }

  console.log('\n--- Inspecting artists/gunmoll-jp ---');
  const gunmollJpDoc = await db.collection('artists').doc('gunmoll-jp').get();
  if (gunmollJpDoc.exists) {
    console.log('artists/gunmoll-jp exists:');
    console.log(JSON.stringify(gunmollJpDoc.data(), null, 2));
  } else {
    console.log('artists/gunmoll-jp does NOT exist.');
  }
}

inspectGunmoll().catch(console.error);

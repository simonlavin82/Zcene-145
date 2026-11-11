const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function queryProject() {
  const snap = await db.collection('users').doc('9FBuWDALnNfUAjxV0pRe3RnKwJy1').collection('projects').where('seedArtists', '==', 'limp-bizkit').get();
  
  if (!snap.empty) {
    const data = snap.docs[0].data();
    console.log('Found Project:', snap.docs[0].id);
    console.log('Project apiUsage:', JSON.stringify(data.apiUsage, null, 2));
  } else {
    console.log('No project found for limp-bizkit.');
  }
}
queryProject().catch(console.error).finally(() => process.exit(0));

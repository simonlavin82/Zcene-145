const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function queryJob() {
  const snap = await db.collection('curationJobs')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
    
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.inputPayload && data.inputPayload.artists && data.inputPayload.artists.includes('limp-bizkit')) {
      console.log('Found Limp Bizkit Job:', doc.id);
      console.log('Result apiUsage:', JSON.stringify(data.result?.apiUsage, null, 2));
      console.log('InputPayload foregroundApiUsage:', JSON.stringify(data.inputPayload?.foregroundApiUsage, null, 2));
    }
  }
}
queryJob().catch(console.error).finally(() => process.exit(0));

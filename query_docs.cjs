const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function queryDocs() {
  const docsToQuery = ['spaced', 'spaced-usa', 'scowl', 'scowl-usa', 'jivebomb', 'jivebomb-usa', 'gel', 'gel-usa'];
  
  for (const id of docsToQuery) {
    const snap = await db.collection('artists').doc(id).get();
    if (snap.exists) {
      console.log(`\n--- DOCUMENT: ${id} ---`);
      const data = snap.data();
      // Truncate detailsCache string if it's too long so we don't spam the console, but show its existence
      if (data.detailsCache && typeof data.detailsCache === 'string') {
        data.detailsCache = `[STRING LENGTH: ${data.detailsCache.length}] ${data.detailsCache.substring(0, 50)}...`;
      } else if (data.detailsCache) {
        data.detailsCache = '[OBJECT PRESENT]';
      }
      
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`\n--- DOCUMENT: ${id} NOT FOUND ---`);
    }
  }
}

queryDocs().catch(console.error).finally(() => process.exit(0));

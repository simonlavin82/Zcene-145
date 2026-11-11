const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Initialize Firebase Admin
if (fs.existsSync('./firebase-service-account.json')) {
  const serviceAccount = require('../firebase-service-account.json');
  initializeApp({ credential: cert(serviceAccount) });
} else {
  initializeApp(); // Use application default credentials
}

// Point to emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const db = getFirestore();

async function clearTurnstile() {
  const collections = ['artists', 'labels'];
  const ids = ['turnstile', 'turnstile-usa', 'turnstile-global', 'turnstile-usa-exc_origins:russia,united-kingdom']; // common variations

  let deleted = 0;
  for (const coll of collections) {
    for (const id of ids) {
      const docRef = db.collection(coll).doc(id);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.delete();
        console.log(`Deleted ${coll}/${id}`);
        deleted++;
      }
      
      // Also query by cacheKey just in case
      const querySnap = await db.collection(coll).where('cacheKey', '==', id).get();
      for (const doc of querySnap.docs) {
          if (doc.id !== id) {
             await doc.ref.delete();
             console.log(`Deleted ${coll}/${doc.id} (matched cacheKey ${id})`);
             deleted++;
          }
      }
    }
  }

  if (deleted === 0) {
    console.log("No Turnstile cache documents found in emulator.");
  } else {
    console.log(`Successfully cleared ${deleted} documents.`);
  }
}

clearTurnstile().catch(console.error);

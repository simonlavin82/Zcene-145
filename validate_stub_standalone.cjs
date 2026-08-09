const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function testStub() {
  const artistId = 'test-alias-usa';
  const cleanCanonicalId = 'test-alias';
  
  // This is the EXACT logic now in server.js and onCurationJobCreated.ts
  await db.collection('artists').doc(artistId).set({
    cacheKey: artistId,
    artistId: artistId,
    seedArtists: artistId,
    cacheVersion: 2,
    cachedAt: new Date(),
    redirectTo: cleanCanonicalId
  });
  
  const snap = await db.collection('artists').doc(artistId).get();
  console.log("Written Document:", JSON.stringify(snap.data(), null, 2));
}

testStub().then(() => process.exit(0));

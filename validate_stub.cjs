const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function runValidation() {
  const dummyArtistId = 'dummy-artist-usa';
  const canonicalId = 'dummy-artist';
  
  console.log(`Setting up corrupted alias document for ${dummyArtistId}...`);
  await db.collection('artists').doc(dummyArtistId).set({
    artistId: dummyArtistId,
    cacheKey: dummyArtistId,
    detailsCache: "{}", // Corrupted to trigger healing
    youtubeVideoId: 'invalid'
  });
  
  console.log('Triggering proxy endpoint to initiate healing/re-synthesis...');
  try {
    const fetch = globalThis.fetch;
    const res = await fetch(`http://localhost:8080/api/artist/${dummyArtistId}`);
    console.log(`Proxy response status: ${res.status}`);
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
  
  // Wait a moment for background re-synthesis to complete
  console.log('Waiting for background re-synthesis to complete (3 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Fetching healed documents from Firestore...');
  const aliasSnap = await db.collection('artists').doc(dummyArtistId).get();
  
  if (aliasSnap.exists) {
    const aliasData = aliasSnap.data();
    console.log(`\n✅ ALIAS POINTER (${dummyArtistId}):`);
    console.log(JSON.stringify(aliasData, null, 2));
    
    if (aliasData.detailsCache || aliasData.graphData || aliasData.members) {
      console.error('❌ FAIL: Alias pointer contains bloat!');
    } else {
      console.log('✅ PASS: Alias pointer is a lightweight stub!');
    }
  } else {
    console.log(`❌ Alias pointer ${dummyArtistId} not found.`);
  }
}

runValidation().catch(console.error).finally(() => process.exit(0));

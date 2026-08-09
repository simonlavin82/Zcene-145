const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function runValidation() {
  const dummyArtistId = 'turnstile-usa';
  const canonicalId = 'turnstile';
  
  console.log(`Setting up corrupted alias document for ${dummyArtistId}...`);
  // Setting cacheKey to canonicalId makes the server treat it as an alias
  await db.collection('artists').doc(dummyArtistId).set({
    artistId: dummyArtistId,
    cacheKey: canonicalId, 
    detailsCache: JSON.stringify({}), // Corrupted to trigger healing
    youtubeVideoId: 'invalid'
  });
  
  console.log('Triggering proxy endpoint to initiate healing/re-synthesis via Gemini...');
  try {
    const fetch = globalThis.fetch;
    const res = await fetch(`http://localhost:8080/api/artist/${dummyArtistId}`);
    console.log(`Proxy response status: ${res.status}`);
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
  
  console.log('Waiting for background Gemini re-synthesis to complete (20 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('Fetching healed documents from Firestore...');
  const aliasSnap = await db.collection('artists').doc(dummyArtistId).get();
  
  if (aliasSnap.exists) {
    const aliasData = aliasSnap.data();
    console.log(`\n✅ ALIAS POINTER (${dummyArtistId}):`);
    console.log(JSON.stringify(aliasData, null, 2));
    
    if (aliasData.detailsCache || aliasData.graphData || aliasData.members || aliasData.youtubeVideoId) {
      console.error('❌ FAIL: Alias pointer contains bloat!');
    } else {
      console.log('✅ PASS: Alias pointer is a lightweight stub!');
    }
  } else {
    console.log(`❌ Alias pointer ${dummyArtistId} not found.`);
  }
}

runValidation().catch(console.error).finally(() => process.exit(0));

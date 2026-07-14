const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function check() {
  const normId = 'blindside';
  console.log(`Checking Firestore doc artists/${normId}...`);
  const doc = await db.collection('artists').doc(normId).get();
  if (!doc.exists) {
    console.log("Doc does not exist!");
    return;
  }
  const data = doc.data();
  console.log("Document fields:");
  console.log(`- cacheKey: ${data.cacheKey}`);
  console.log(`- artistId: ${data.artistId}`);
  console.log(`- seedArtists: ${data.seedArtists}`);
  console.log(`- isDeep: ${data.isDeep}`);
  console.log(`- cacheVersion: ${data.cacheVersion}`);
  console.log(`- cachedAt: ${data.cachedAt ? data.cachedAt.toDate().toISOString() : 'N/A'}`);
  console.log(`- filters:`, data.filters);
  
  if (data.detailsCache) {
    try {
      const parsed = JSON.parse(data.detailsCache);
      console.log(`- detailsCache count: ${parsed.length}`);
      console.log(`- first detail entry artist name: ${parsed[0]?.[0]}`);
      console.log(`- first detail entry summary snippet: ${parsed[0]?.[1]?.summary?.substring(0, 100)}`);
    } catch(e) {
      console.log("- detailsCache not parseable as JSON!");
    }
  } else {
    console.log("- detailsCache is missing!");
  }
}

check().catch(console.error);

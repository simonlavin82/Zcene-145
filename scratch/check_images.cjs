const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function checkImages() {
  console.log("Checking labels...");
  const labels = await db.collection('labels').limit(10).get();
  labels.forEach(doc => {
    const data = doc.data();
    let img = data.imageUrl || data.image;
    if (data.detailsCache) {
      let parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = parsed[0][1];
      }
      img = img || parsed?.imageUrl || parsed?.image;
    }
    console.log(`Label [${doc.id}]: img = ${img || 'NONE'}`);
  });

  console.log("\nChecking artists...");
  const artists = await db.collection('artists').limit(20).get();
  artists.forEach(doc => {
    const data = doc.data();
    let img = data.imageUrl || data.image;
    if (data.detailsCache) {
      let parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = parsed[0][1];
      }
      img = img || parsed?.imageUrl || parsed?.image;
    }
    console.log(`Artist [${doc.id}]: img = ${img || 'NONE'}`);
  });
}

checkImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

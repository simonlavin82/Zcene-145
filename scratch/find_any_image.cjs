const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function findImages() {
  console.log("=== ALL LABELS WITH IMAGES ===");
  const labels = await db.collection('labels').get();
  labels.forEach(doc => {
    const d = doc.data();
    let img = d.imageUrl || d.image;
    if (d.detailsCache) {
      let parsed = typeof d.detailsCache === 'string' ? JSON.parse(d.detailsCache) : d.detailsCache;
      if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0][1];
      img = img || parsed?.imageUrl || parsed?.image;
    }
    if (img) console.log(`Label [${doc.id}]: ${img}`);
  });

  console.log("\n=== ALL ARTISTS WITH IMAGES ===");
  const artists = await db.collection('artists').get();
  let count = 0;
  artists.forEach(doc => {
    const d = doc.data();
    let img = d.imageUrl || d.image;
    if (d.detailsCache) {
      let parsed = typeof d.detailsCache === 'string' ? JSON.parse(d.detailsCache) : d.detailsCache;
      if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0][1];
      img = img || parsed?.imageUrl || parsed?.image;
    }
    if (img) {
      count++;
      if (count <= 15) console.log(`Artist [${doc.id}]: ${img}`);
    }
  });
  console.log(`Total artists with images: ${count}`);
}

findImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

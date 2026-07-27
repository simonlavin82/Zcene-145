const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function checkTimestamps() {
  const ids = ['drug-church-united-states', 'gel-united-states', 'militarie-gun-united-states', 'jivebomb-united-states', 'scowl-united-states', 'flatspot-records'];
  for (const id of ids) {
    let doc = await db.collection('artists').doc(id).get();
    if (!doc.exists) doc = await db.collection('labels').doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      const ts = d.cachedAt ? d.cachedAt.toDate().toISOString() : 'N/A';
      let img = d.imageUrl || d.image;
      if (d.detailsCache) {
        let parsed = typeof d.detailsCache === 'string' ? JSON.parse(d.detailsCache) : d.detailsCache;
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0][1];
        img = img || parsed?.imageUrl || parsed?.image;
      }
      console.log(`[${id}] cachedAt: ${ts} | img: ${img || 'NONE'}`);
    } else {
      console.log(`[${id}] NOT FOUND`);
    }
  }
}

checkTimestamps().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

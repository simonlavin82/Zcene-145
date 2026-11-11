const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const query = await db.collectionGroup('projects')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    
    if (query.empty) {
      console.log("No projects found.");
      return;
    }
    
    const doc = query.docs[0];
    const data = doc.data();
    console.log("PROJECT ID:", doc.id);
    console.log("SEED ARTISTS:", data.seedArtists);
    
    if (data.detailsCache) {
       try {
         const parsed = JSON.parse(data.detailsCache);
         console.log("DETAILS CACHE:", JSON.stringify(parsed, null, 2));
       } catch (e) {
         console.log("DETAILS CACHE RAW:", data.detailsCache);
       }
    } else {
       console.log("NO detailsCache present.");
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

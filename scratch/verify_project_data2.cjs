const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const query = await db.collectionGroup('projects').get();
    
    // Sort in memory by updatedAt
    const projects = query.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
         const tA = a.updatedAt?._seconds || 0;
         const tB = b.updatedAt?._seconds || 0;
         return tB - tA; // Descending
      });
      
    // Find the most recent project that has Spaced
    const targetProject = projects.find(p => p.seedArtists && p.seedArtists.toLowerCase().includes('spaced'));
    
    if (targetProject.detailsCache) {
       const parsed = JSON.parse(targetProject.detailsCache);
       console.log("PROJECT SEED ARTISTS:", targetProject.seedArtists);
       console.log("KEYS IN detailsCache:");
       parsed.forEach(e => {
         console.log(`- "${e[0]}"`);
       });
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

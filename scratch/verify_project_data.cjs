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
    
    if (query.empty) {
      console.log("No projects found in any user's subcollection.");
      return;
    }
    
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
    
    if (!targetProject) {
      console.log("Found", projects.length, "projects, but none containing 'Spaced' as a seed artist.");
      return;
    }
    
    console.log(`FOUND PROJECT: ${targetProject.id} (Name: ${targetProject.name || 'Untitled'})`);
    console.log(`SEED ARTISTS: ${targetProject.seedArtists}`);
    
    if (targetProject.detailsCache) {
       try {
         const parsed = JSON.parse(targetProject.detailsCache);
         const spacedEntry = parsed.find(e => e[0].includes('spaced'));
         if (spacedEntry) {
            console.log("\nFound detailsCache entry for spaced!");
            const details = spacedEntry[1];
            console.log(`imageUrl is strictly: "${details.imageUrl}"`);
            if (details.imageUrl === 'not-found') {
               console.log("✅ HYPOTHESIS CONFIRMED: imageUrl is 'not-found' inside the project's detailsCache.");
            }
         } else {
            console.log("Spaced is not in detailsCache entries.");
         }
       } catch (e) {
         console.log("DETAILS CACHE RAW:", targetProject.detailsCache);
       }
    } else {
       console.log("NO detailsCache present on this project.");
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

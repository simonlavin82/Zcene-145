const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function auditUserProjects() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', 'zcene.online@gmail.com').get();
  
  if (snapshot.empty) {
    console.log("No matching user found for zcene.online@gmail.com");
    process.exit(0);
  }
  
  const userDoc = snapshot.docs[0];
  const uid = userDoc.id;
  console.log(`Found zcene.online UID: ${uid}`);
  
  const projectsRef = db.collection(`users/${uid}/projects`);
  const projectsSnap = await projectsRef.get();
  
  console.log(`Found ${projectsSnap.size} projects for zcene.online.`);
  
  projectsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`\nProject ID: ${doc.id}`);
    console.log(`Name: ${data.name}`);
    console.log(`Seed Artists: ${data.seedArtists}`);
    console.log(`Cache Key: ${data.cacheKey}`);
    console.log(`Schema Version: ${data.schemaVersion}`);
    
    // Check sizes to avoid blowing up console
    const graphStr = data.graphData || "{}";
    const detailsStr = data.detailsCache || "[]";
    console.log(`GraphData Length: ${graphStr.length} chars`);
    console.log(`DetailsCache Length: ${detailsStr.length} chars`);
    
    if (data.detailsCache) {
      try {
        const parsed = JSON.parse(data.detailsCache);
        if (Array.isArray(parsed)) {
          console.log(`DetailsCache Keys: ${parsed.map(e => e[0]).join(', ')}`);
        } else {
          console.log(`DetailsCache Keys: ${Object.keys(parsed).join(', ')}`);
        }
      } catch(e) {
        console.log("Could not parse DetailsCache.");
      }
    }
  });
}

auditUserProjects().catch(console.error);

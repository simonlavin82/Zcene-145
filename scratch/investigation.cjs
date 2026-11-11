const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function runInvestigation() {
  console.log("--- PROJECT DOCUMENT ---");
  const projectsQuery = await db.collectionGroup('projects').where('__name__', '==', db.doc('users/simonlavin/projects/54rHg5K5qMM8TS9Yj2fF').path).get();
  // Actually, we can just do a normal get if we know the user is 'simon.lavin' or we can just query all projects with that ID.
  const allProjectsQuery = await db.collectionGroup('projects').get();
  const projectDoc = allProjectsQuery.docs.find(d => d.id === '54rHg5K5qMM8TS9Yj2fF');
  
  if (projectDoc) {
    console.log("Project Path:", projectDoc.ref.path);
    const data = projectDoc.data();
    console.log("Project Data Keys:", Object.keys(data));
    if (data.canvasLayout) {
      try {
        const layout = JSON.parse(data.canvasLayout);
        const spacedNode = layout.find(n => n.nodeId === 'spaced' || n.nodeId === 'spaced-usa' || n.id === 'spaced' || n.id === 'spaced-usa');
        console.log("Spaced canvas node:", JSON.stringify(spacedNode, null, 2));
      } catch (e) {
        console.log("Could not parse canvasLayout");
      }
    }
    
    if (data.artistIds) {
      console.log("artistIds:", data.artistIds);
    }
    
    if (data.detailsCache) {
      let parsed = data.detailsCache;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      const spacedDetails = parsed['spaced'] || parsed['spaced-usa'];
      console.log("Spaced detailsCache entry:", JSON.stringify(spacedDetails, null, 2));
    }
    
    if (data.graphData) {
      let parsed = data.graphData;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      const spacedNode = parsed.nodes?.find(n => n.id === 'spaced' || n.id === 'spaced-usa');
      console.log("Spaced graphData node:", JSON.stringify(spacedNode, null, 2));
    }
  } else {
    console.log("Project not found globally!");
  }

  console.log("\n--- ARTIST GLOBAL CACHE ---");
  const docsToQuery = ['spaced', 'spaced-usa'];
  for (const id of docsToQuery) {
    const snap = await db.collection('artists').doc(id).get();
    if (snap.exists) {
      console.log(`\nDocument: ${id}`);
      const data = snap.data();
      if (data.detailsCache) {
        let details = data.detailsCache;
        if (typeof details === 'string') {
          try {
            details = JSON.parse(details);
            console.log(`detailsCache for ${id}:`, JSON.stringify(details, null, 2));
          } catch(e) {}
        } else {
            console.log(`detailsCache for ${id}:`, JSON.stringify(details, null, 2));
        }
      } else {
          console.log(`NO detailsCache for ${id}`);
      }
      console.log("dataIntegrityStatus:", data.dataIntegrityStatus);
      console.log("cacheVersion:", data.cacheVersion);
    } else {
      console.log(`\nDocument: ${id} NOT FOUND`);
    }
  }
}

runInvestigation().catch(console.error).finally(() => process.exit(0));

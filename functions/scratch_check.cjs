const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) {
  initializeApp({
    projectId: 'zcene-production'
  });
}
const db = getFirestore();

async function checkProjects() {
  const snapshot = await db.collection('users').get();
  for (const userDoc of snapshot.docs) {
    const projectsSnap = await userDoc.ref.collection('projects')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    
    for (const projectDoc of projectsSnap.docs) {
      const data = projectDoc.data();
      if (data.name && data.name.toLowerCase().includes('spaced')) {
        console.log(`--- User: ${userDoc.id} | Project: ${projectDoc.id} ---`);
        console.log(`Name: ${data.name}`);
        console.log(`seedArtists: ${data.seedArtists}`);
        console.log(`seedImageUrl: ${data.seedImageUrl}`);
        console.log(`coverUrl: ${data.coverUrl}`);
        console.log(`seedImage: ${data.seedImage}`);
        if (data.detailsCache) {
            console.log(`detailsCache length: ${data.detailsCache.length}`);
        } else {
            console.log(`detailsCache: undefined`);
        }
        if (data.graphData) {
            console.log(`graphData length: ${data.graphData.length}`);
            const parsed = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
            console.log(`nodes count: ${parsed.nodes ? parsed.nodes.length : 0}`);
            if (parsed.nodes && parsed.nodes.length > 0) {
                console.log(`first node imageUrl: ${parsed.nodes[0].imageUrl}`);
            }
        }
        console.log('');
      }
    }
  }
}

checkProjects().catch(console.error);

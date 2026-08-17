const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  console.log("--- GLOBAL ---");
  const globalSnap = await db.collection('artists').doc('korn-united-states').get();
  if (globalSnap.exists) {
    const data = globalSnap.data();
    console.log("Global imageUrl:", data.detailsCache?.imageUrl);
  } else {
    const kornSnap = await db.collection('artists').doc('korn').get();
    if (kornSnap.exists) {
      console.log("Found korn instead. imageUrl:", kornSnap.data().detailsCache?.imageUrl);
    }
  }

  console.log("--- PROJECT ---");
  const projs = await db.collectionGroup('projects').get();
  // Find project that has korn-united-states
  const proj = projs.docs.find(d => {
    try {
      const details = JSON.parse(d.data().detailsCache || "[]");
      return details.some(x => x[0] === 'korn' || x[0] === 'korn-united-states');
    } catch(e) { return false; }
  });

  if (proj) {
    const details = JSON.parse(proj.data().detailsCache || "[]");
    const korn = details.find(x => x[0] === 'korn' || x[0] === 'korn-united-states');
    console.log("Project entry key:", korn[0]);
    console.log("Project imageUrl:", korn[1]?.imageUrl);
  } else {
    console.log("Project not found");
  }
}

run().catch(console.error).finally(() => process.exit(0));

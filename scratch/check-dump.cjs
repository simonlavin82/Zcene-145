const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  const projs = await db.collectionGroup('projects').get();
  const proj = projs.docs.find(d => {
    try {
      const details = JSON.parse(d.data().detailsCache || "[]");
      return details.some(x => x[0] === 'korn' || x[0] === 'korn-united-states');
    } catch(e) { return false; }
  });

  if (proj) {
    const details = JSON.parse(proj.data().detailsCache || "[]");
    const korns = details.filter(x => x[0] === 'korn' || x[0] === 'korn-united-states');
    console.log(JSON.stringify(korns, null, 2));
  }
}

run().catch(console.error).finally(() => process.exit(0));

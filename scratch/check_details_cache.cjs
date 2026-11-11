const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: "zcene-production" });
const db = getFirestore();

async function run() {
  const projectsSnap = await db.collection('users').doc('9FBuWDALnNfUAjxV0pRe3RnKwJy1').collection('projects').orderBy('updatedAt', 'desc').limit(5).get();
  for (const proj of projectsSnap.docs) {
    console.log("Project:", proj.id, proj.data().name);
    console.log("seedImageUrl:", proj.data().seedImageUrl);
    const cacheStr = proj.data().detailsCache;
    if (cacheStr) {
      try {
        const parsed = typeof cacheStr === 'string' ? JSON.parse(cacheStr) : cacheStr;
        if (Array.isArray(parsed) && parsed.length > 0) {
           console.log("First item key:", parsed[0][0]);
           if (parsed[0][1] && parsed[0][1].imageUrl) {
               console.log("First item imageUrl:", parsed[0][1].imageUrl);
           } else {
               console.log("First item imageUrl is missing. Keys:", Object.keys(parsed[0][1] || {}));
               if (parsed[0][1].details && parsed[0][1].details.imageUrl) {
                   console.log("First item details.imageUrl:", parsed[0][1].details.imageUrl);
               }
           }
        }
      } catch (e) {
         console.log("Failed to parse details cache");
      }
    }
    console.log("-----------------------");
  }
}
run().catch(console.error).finally(() => process.exit(0));

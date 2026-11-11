const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: "zcene-production" });
const db = getFirestore();

async function run() {
  const usersSnapshot = await db.collection('users').limit(10).get();
  let latestProject = null;
  for (const user of usersSnapshot.docs) {
    const projectsSnap = await db.collection('users').doc(user.id).collection('projects').orderBy('updatedAt', 'desc').limit(1).get();
    if (!projectsSnap.empty) {
      const proj = projectsSnap.docs[0];
      if (!latestProject || proj.data().updatedAt.toMillis() > latestProject.data().updatedAt.toMillis()) {
        latestProject = proj;
      }
    }
  }
  if (latestProject) {
    console.log("Latest Project ID:", latestProject.id);
    console.log("Name:", latestProject.data().name);
    console.log("seedImageUrl:", latestProject.data().seedImageUrl);
    console.log("Status:", latestProject.data().status);
    console.log("Active Nodes:", latestProject.data().activeNodes);
    
    const cacheStr = latestProject.data().detailsCache;
    if (cacheStr) {
      try {
        const parsed = typeof cacheStr === 'string' ? JSON.parse(cacheStr) : cacheStr;
        console.log("Parsed Cache is array?", Array.isArray(parsed));
        if (Array.isArray(parsed) && parsed.length > 0) {
           console.log("First item key:", parsed[0][0]);
           if (parsed[0][1] && parsed[0][1].imageUrl) {
               console.log("First item imageUrl:", parsed[0][1].imageUrl);
           }
        }
      } catch (e) {
         console.log("Failed to parse details cache");
      }
    }
  } else {
    console.log("No projects found.");
  }
}
run().catch(console.error).finally(() => process.exit(0));

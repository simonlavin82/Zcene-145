const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const users = await db.collection('users').get();
  let targetUser = null;
  for (const doc of users.docs) {
    const data = doc.data();
    if (data.email && (data.email.includes('zcene.online') || data.email.includes('zine.online'))) {
      targetUser = doc;
      break;
    }
  }

  if (!targetUser) {
    console.log("User not found!");
    return;
  }
  
  console.log("Found user:", targetUser.data().email);

  const projectsQuery = await db.collection('users').doc(targetUser.id).collection('projects').orderBy('createdAt', 'desc').limit(1).get();
  
  let targetProject = null;
  for (const doc of projectsQuery.docs) {
    targetProject = doc;
    break;
  }

  if (targetProject) {
    console.log("--- PROJECT DATA ---");
    console.log("Project Path:", targetProject.ref.path);
    const data = targetProject.data();
    
    if (data.detailsCache) {
      let parsed = data.detailsCache;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      
      const checkNodes = ['spaced', 'spaced-usa', 'flatspot-records', 'initiate', 'restraining-order', 'sunami'];
      for (const nodeId of checkNodes) {
        if (parsed[nodeId]) {
           console.log(`\nProject detailsCache for ${nodeId}:`, JSON.stringify(parsed[nodeId], null, 2));
        } else {
           console.log(`\nProject detailsCache missing for ${nodeId}`);
        }
      }
    }
  } else {
    console.log("No projects found.");
  }

  console.log("\n--- GLOBAL CACHE ---");
  const checkGlobal = ['spaced-usa', 'spaced', 'flatspot-records', 'initiate', 'restraining-order', 'sunami'];
  for (const id of checkGlobal) {
    for (const coll of ['artists', 'labels']) {
      const doc = await db.collection(coll).doc(id).get();
      if (doc.exists) {
         console.log(`Global ${coll}/${id}: detailsCache present?`, !!doc.data().detailsCache);
         if (doc.data().detailsCache) {
           let parsed = doc.data().detailsCache;
           if (typeof parsed === 'string') parsed = JSON.parse(parsed);
           console.log(`  imageUrl:`, parsed.imageUrl);
           console.log(`  summary snippet:`, parsed.summary?.substring(0, 50));
           console.log(`  synthesisRationale snippet:`, parsed.synthesisRationale?.substring(0, 50));
         }
      }
    }
  }
}
run().catch(console.error);

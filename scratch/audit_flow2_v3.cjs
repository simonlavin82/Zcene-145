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
      
      console.log("All IDs in project detailsCache:");
      for (const [id, details] of parsed) {
         console.log("- " + id);
         if (id.toLowerCase().includes('flatspot') || id.toLowerCase().includes('initiate') || id.toLowerCase().includes('restraining')) {
            console.log(`\nProject detailsCache for ${id}:`, JSON.stringify(details, null, 2));
         }
      }
    }
  }
}
run().catch(console.error);

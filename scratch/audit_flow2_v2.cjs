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
      
      // parsed is an array of [id, details]
      const checkNodes = ['spaced', 'spaced-usa', 'flatspot-records', 'initiate', 'restraining-order', 'sunami', 'Flatspot Records', 'Spaced', 'Initiate', 'Sunami', 'Torena', 'Gel'];
      for (const [id, details] of parsed) {
         if (checkNodes.includes(id) || checkNodes.includes(id.toLowerCase())) {
           console.log(`\nProject detailsCache for ${id}:`, JSON.stringify(details, null, 2));
         }
      }
    }
  }
}
run().catch(console.error);

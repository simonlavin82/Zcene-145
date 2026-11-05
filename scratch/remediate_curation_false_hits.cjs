const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function remediate() {
  console.log('=== Step 1: Purging global /artists cache & router stubs ===');
  const docsToPurge = [
    'artists/reason-to-believe-us',
    'artists/state-of-the-nation-us',
    'artists/reason-to-believe',
    'artists/state-of-the-nation'
  ];

  for (const docPath of docsToPurge) {
    const ref = db.doc(docPath);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`[DELETED] ${docPath}`);
    } else {
      console.log(`[NOT FOUND - ALREADY CLEAN] ${docPath}`);
    }
  }

  console.log('\n=== Step 2: Patching project Hnc4upweD8ZRzRYQ1SSi detailsCache ===');
  const projectRef = db.doc('users/K3QqtNRg48X7I3C0Zu2PVPzRBSH3/projects/Hnc4upweD8ZRzRYQ1SSi');
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new Error('Project Hnc4upweD8ZRzRYQ1SSi does not exist!');
  }

  const projectData = projectSnap.data();
  let detailsCacheRaw = projectData.detailsCache;
  let isString = typeof detailsCacheRaw === 'string';
  let detailsCache = isString ? JSON.parse(detailsCacheRaw) : detailsCacheRaw;

  let patchedCount = 0;
  if (Array.isArray(detailsCache)) {
    // Array of [key, payload] pairs or objects
    for (const item of detailsCache) {
      if (Array.isArray(item) && (item[0] === 'reason-to-believe-us' || item[0] === 'state-of-the-nation-us')) {
        console.log(`Patching pair [${item[0]}] in detailsCache...`);
        item[1].imageUrl = 'not-found';
        item[1].discography = [];
        item[1].itunesArtistId = null;
        patchedCount++;
      } else if (item && typeof item === 'object' && (item.id === 'reason-to-believe-us' || item.id === 'state-of-the-nation-us')) {
        console.log(`Patching object [${item.id}] in detailsCache...`);
        item.imageUrl = 'not-found';
        item.discography = [];
        item.itunesArtistId = null;
        patchedCount++;
      }
    }
  } else if (detailsCache && typeof detailsCache === 'object') {
    if (detailsCache['reason-to-believe-us']) {
      console.log('Patching key [reason-to-believe-us] in detailsCache...');
      detailsCache['reason-to-believe-us'].imageUrl = 'not-found';
      detailsCache['reason-to-believe-us'].discography = [];
      detailsCache['reason-to-believe-us'].itunesArtistId = null;
      patchedCount++;
    }
    if (detailsCache['state-of-the-nation-us']) {
      console.log('Patching key [state-of-the-nation-us] in detailsCache...');
      detailsCache['state-of-the-nation-us'].imageUrl = 'not-found';
      detailsCache['state-of-the-nation-us'].discography = [];
      detailsCache['state-of-the-nation-us'].itunesArtistId = null;
      patchedCount++;
    }
  }

  const updatedDetailsCache = isString ? JSON.stringify(detailsCache) : detailsCache;
  await projectRef.update({
    detailsCache: updatedDetailsCache,
    updatedAt: new Date()
  });
  console.log(`[SUCCESS] Patched ${patchedCount} entries in project Hnc4upweD8ZRzRYQ1SSi`);

  console.log('\n=== Step 3: Verification ===');
  const verifyProjectSnap = await projectRef.get();
  const verifyData = verifyProjectSnap.data();
  const verifyDc = typeof verifyData.detailsCache === 'string' ? JSON.parse(verifyData.detailsCache) : verifyData.detailsCache;
  if (Array.isArray(verifyDc)) {
    const rtb = verifyDc.find(pair => pair[0] === 'reason-to-believe-us');
    const sotn = verifyDc.find(pair => pair[0] === 'state-of-the-nation-us');
    console.log('Verified RTB:', rtb ? { id: rtb[0], imageUrl: rtb[1].imageUrl, discography: rtb[1].discography, itunesArtistId: rtb[1].itunesArtistId } : 'Missing');
    console.log('Verified SOTN:', sotn ? { id: sotn[0], imageUrl: sotn[1].imageUrl, discography: sotn[1].discography, itunesArtistId: sotn[1].itunesArtistId } : 'Missing');
  }

  for (const docPath of docsToPurge) {
    const snap = await db.doc(docPath).get();
    console.log(`Verified global ${docPath}: exists = ${snap.exists}`);
  }
}

remediate().then(() => {
  console.log('\nRemediation completed successfully!');
  process.exit(0);
}).catch(err => {
  console.error('\nRemediation failed:', err);
  process.exit(1);
});


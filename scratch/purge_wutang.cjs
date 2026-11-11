const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');


if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

async function purge() {
  console.log("Starting Firestore purge...");
  
  // 1. Purge Wu-Tang Clan unslugged entities
  const artistsRef = db.collection('artists');
  const artistsSnap = await artistsRef.get();
  
  let deletedCount = 0;
  for (const doc of artistsSnap.docs) {
    const id = doc.id;
    // Check if it's "wu-tang-clan" unslugged, or any other un-slugged legacy data
    // Assuming un-slugged means it doesn't end with -xx where x is a letter
    const isUnslugged = !/-[a-z]{2}$/.test(id);
    const isWuTang = id.includes('wu-tang-clan');
    
    if (isWuTang || isUnslugged) {
      await doc.ref.delete();
      console.log(`Deleted artist document: ${id}`);
      deletedCount++;
    }
  }

  // 2. Purge curation jobs for Wu-Tang Clan
  const jobsRef = db.collection('curationJobs');
  const jobsSnap = await jobsRef.get();
  for (const doc of jobsSnap.docs) {
    const data = doc.data();
    if (data.seedArtist && data.seedArtist.toLowerCase().includes('wu-tang clan')) {
      await doc.ref.delete();
      console.log(`Deleted curation job: ${doc.id}`);
      deletedCount++;
    }
  }

  console.log(`Purge complete. Total documents deleted: ${deletedCount}`);
}

purge().catch(console.error);

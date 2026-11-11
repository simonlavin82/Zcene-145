import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Query, Firestore } from 'firebase-admin/firestore';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

try {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  console.error("Failed to initialize firebase admin:", e);
  process.exit(1);
}

const db = getFirestore();

async function run() {
  console.log("Starting targeted database cleanup...");

  // 1. Find and delete corrupted artists (those ending in -after-YYYY or similar)
  const pollutedSuffixRegex = /(?:-|\s*\(?)?(?:after|before)\s*-?\d{4}\)?$/i;
  const artistsRef = db.collection('artists');
  const artistsSnap = await artistsRef.get();
  
  let deletedArtistsCount = 0;
  const batch1 = db.batch();
  artistsSnap.forEach(doc => {
    if (pollutedSuffixRegex.test(doc.id)) {
      console.log(`Deleting corrupted artist: ${doc.id}`);
      batch1.delete(doc.ref);
      deletedArtistsCount++;
    }
  });
  
  if (deletedArtistsCount > 0) {
    await batch1.commit();
    console.log(`Deleted ${deletedArtistsCount} corrupted artists.`);
  } else {
    console.log("No corrupted artists found.");
  }

  // 2. Delete all test project documents under all users
  const usersRef = db.collection('users');
  const usersSnap = await usersRef.get();
  
  let deletedProjectsCount = 0;
  for (const userDoc of usersSnap.docs) {
      const projectsSnap = await db.collection(`users/${userDoc.id}/projects`).get();
      if (projectsSnap.size > 0) {
          const batch2 = db.batch();
          projectsSnap.forEach(projDoc => {
              batch2.delete(projDoc.ref);
              deletedProjectsCount++;
          });
          await batch2.commit();
      }
  }
  console.log(`Deleted ${deletedProjectsCount} project documents.`);
  
  // 3. Clear curationJobs as they are likely tied to old buggy runs
  const jobsRef = db.collection('curationJobs');
  const jobsSnap = await jobsRef.get();
  if (jobsSnap.size > 0) {
      let jobsDeleted = 0;
      let batch3 = db.batch();
      for (const doc of jobsSnap.docs) {
          batch3.delete(doc.ref);
          jobsDeleted++;
          if (jobsDeleted % 400 === 0) {
            await batch3.commit();
            batch3 = db.batch();
          }
      }
      if (jobsDeleted % 400 !== 0) {
        await batch3.commit();
      }
      console.log(`Deleted ${jobsDeleted} curation jobs.`);
  } else {
      console.log("No curation jobs found.");
  }

  console.log("Targeted cleanup completed successfully.");
  process.exit(0);
}

run().catch(error => {
  console.error("Error purging records:", error);
  process.exit(1);
});

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

// SAFETY MEASURE: Ensure we are running against the emulator!
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST is not set!");
  console.error("Please run with: FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/deep_purge_corrupted_records.ts");
  process.exit(1);
}

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

// The regex for legacy suffixed slugs (e.g. militarie-gun-after-2020)
const pollutedSuffixRegex = /(?:-|\s*\(?)?(?:after|before)\s*-?\d{4}\)?$/i;

async function run() {
  console.log("Starting DEEP targeted database cleanup on local emulator...");

  let deletedDocs = 0;
  let scrubbedDocs = 0;

  // 1. Process artists and labels
  const collectionsToClean = ['artists', 'labels'];
  
  for (const collName of collectionsToClean) {
    console.log(`\nProcessing collection: ${collName}`);
    const snap = await db.collection(collName).get();
    
    for (const doc of snap.docs) {
      if (pollutedSuffixRegex.test(doc.id)) {
        console.log(`[DELETE] Corrupted document: ${collName}/${doc.id}`);
        await doc.ref.delete();
        deletedDocs++;
        continue;
      }
      
      // Document ID is clean. Now check graphData payload.
      const data = doc.data();
      if (data.graphData) {
        let isPolluted = false;
        let parsed = null;
        try {
          parsed = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
        } catch (e) {
          console.warn(`[WARN] Failed to parse graphData for ${collName}/${doc.id}`);
          continue;
        }

        if (parsed && parsed.nodes) {
          const originalNodeCount = parsed.nodes.length;
          const originalLinkCount = (parsed.links || []).length;
          
          parsed.nodes = parsed.nodes.filter((n: any) => {
            if (pollutedSuffixRegex.test(n.id)) {
              isPolluted = true;
              return false;
            }
            return true;
          });
          
          parsed.links = (parsed.links || []).filter((l: any) => {
            const sId = typeof l.source === 'string' ? l.source : (l.source?.id || "");
            const tId = typeof l.target === 'string' ? l.target : (l.target?.id || "");
            if (pollutedSuffixRegex.test(sId) || pollutedSuffixRegex.test(tId)) {
              isPolluted = true;
              return false;
            }
            return true;
          });

          if (isPolluted) {
            console.log(`[SCRUB] Cleaned ${originalNodeCount - parsed.nodes.length} nodes and ${originalLinkCount - parsed.links.length} links from ${collName}/${doc.id}`);
            await doc.ref.update({ graphData: JSON.stringify(parsed) });
            scrubbedDocs++;
          }
        }
      }
    }
  }

  // 2. Delete test project documents containing polluted data
  console.log(`\nProcessing user projects...`);
  const usersSnap = await db.collection('users').get();
  
  let deletedProjectsCount = 0;
  for (const userDoc of usersSnap.docs) {
      const projectsSnap = await db.collection(`users/${userDoc.id}/projects`).get();
      for (const projDoc of projectsSnap.docs) {
        const pData = projDoc.data();
        let shouldDelete = false;
        
        if (pollutedSuffixRegex.test(pData.seedArtists || "")) shouldDelete = true;
        if ((pData.activeNodes || []).some((n: string) => pollutedSuffixRegex.test(n))) shouldDelete = true;
        
        if (!shouldDelete && pData.graphData) {
          try {
            const parsed = typeof pData.graphData === 'string' ? JSON.parse(pData.graphData) : pData.graphData;
            if (parsed && parsed.nodes && parsed.nodes.some((n: any) => pollutedSuffixRegex.test(n.id))) {
              shouldDelete = true;
            }
          } catch(e) {}
        }
        
        if (shouldDelete) {
           console.log(`[DELETE] Corrupted project: users/${userDoc.id}/projects/${projDoc.id}`);
           await projDoc.ref.delete();
           deletedProjectsCount++;
        }
      }
  }
  
  // 3. Clear all curationJobs
  console.log(`\nProcessing curationJobs...`);
  const jobsSnap = await db.collection('curationJobs').get();
  let jobsDeleted = 0;
  for (const doc of jobsSnap.docs) {
      await doc.ref.delete();
      jobsDeleted++;
  }
  
  console.log("\n=============================================");
  console.log(`Deep cleanup completed successfully.`);
  console.log(`Deleted Documents (Artists/Labels): ${deletedDocs}`);
  console.log(`Scrubbed Documents (Artists/Labels): ${scrubbedDocs}`);
  console.log(`Deleted Projects: ${deletedProjectsCount}`);
  console.log(`Deleted Jobs: ${jobsDeleted}`);
  console.log("=============================================\n");
  
  process.exit(0);
}

run().catch(error => {
  console.error("Error purging records:", error);
  process.exit(1);
});

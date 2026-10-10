const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount), projectId: 'zcene-production' });
const db = getFirestore();

async function run() {
  const isDryRun = !process.argv.includes('--execute');
  console.log(`Starting corruption scan... (Dry run: ${isDryRun})`);
  if (isDryRun) console.log('Run with --execute to perform actual deletions.\n');

  // 1. Build a set of all valid label IDs
  console.log('Fetching labels...');
  const labelsSnap = await db.collection('labels').get();
  const validLabels = new Set();
  let missingDetailsCount = 0;

  labelsSnap.docs.forEach(doc => {
    const data = doc.data();
    // A label is considered valid if it has the detailsCache and details object
    if (data && data.detailsCache && data.detailsCache.details) {
      validLabels.add(doc.id);
    } else {
      missingDetailsCount++;
    }
  });

  console.log(`Found ${labelsSnap.size} total labels.`);
  console.log(`Valid labels: ${validLabels.size}`);
  console.log(`Labels missing detailsCache: ${missingDetailsCount}\n`);

  // 2. Scan the global artists collection
  console.log('Scanning global artists collection for corrupted references...');
  const artistsSnap = await db.collection('artists').get();
  
  const flaggedArtists = [];

  artistsSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data && data.graphData) {
      let parsed;
      try {
        parsed = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      } catch (e) {
        return; // Ignore parse errors
      }

      if (parsed && parsed.nodes) {
        // Check all nodes of type 'label'
        const labelNodes = parsed.nodes.filter(n => n.type === 'label');
        for (const labelNode of labelNodes) {
          if (!validLabels.has(labelNode.id)) {
            // Flag this artist because it references an invalid or non-existent label
            flaggedArtists.push({
              artistId: doc.id,
              missingLabelId: labelNode.id
            });
            break; // We only need one missing reference to flag the entire artist cache
          }
        }
      }
    }
  });

  console.log(`\nFound ${flaggedArtists.length} corrupted artist documents requiring deletion.`);
  flaggedArtists.forEach(f => {
    console.log(`  - Artist: ${f.artistId} (Missing Label Reference: ${f.missingLabelId})`);
  });

  // 3. Execution Phase
  if (!isDryRun) {
    console.log('\n--- Phase 3: Deleting Corrupted Artists ---');
    let deletedCount = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const flagged of flaggedArtists) {
      batch.delete(db.collection('artists').doc(flagged.artistId));
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
      }
      deletedCount++;
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    console.log(`Deleted ${deletedCount} corrupted artist documents.`);
  }

  console.log('\nScan complete.');
}

run().catch(console.error);

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Rule 36 normalization logic for labels
const UNNORMALIZED_SUFFIX_REGEX = /-(records|music|company|recording-company|recordings|entertainment|media|group|productions)$/i;

async function runLegacyPurge(dryRun = true) {
  console.log(`Starting Legacy Project Scan (Mode: ${dryRun ? 'DRY-RUN' : 'LIVE PURGE'})...`);
  
  // Scan all project subcollections across users (Collection Group)
  const snapshot = await db.collectionGroup('projects').get();
  console.log(`Auditing ${snapshot.size} total user projects in collectionGroup('projects')...`);

  let flaggedCount = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.graphData) continue;

    let graph;
    try {
      graph = typeof data.graphData === 'string' 
        ? JSON.parse(data.graphData) 
        : data.graphData;
    } catch (e) {
      console.warn(`[PARSE ERROR] Project: ${doc.id} (Path: ${doc.ref.path}) - Malformed JSON graphData`);
      continue;
    }

    const nodes = graph?.nodes || [];
    const violatingNodes = nodes.filter(n => 
      n.type === 'label' && UNNORMALIZED_SUFFIX_REGEX.test(n.id)
    );

    if (violatingNodes.length > 0) {
      flaggedCount++;
      console.log(`[FLAGGED] Project: ${doc.id} (Path: ${doc.ref.path})`);
      console.log(`  Reason: Contains ${violatingNodes.length} un-normalized label IDs:`, violatingNodes.map(n => n.id));

      if (!dryRun) {
        batch.delete(doc.ref);
      }
    }
  }

  // Also scan flat / root shared projects if any exist
  const rootSnapshot = await db.collection('projects').get();
  for (const doc of rootSnapshot.docs) {
    const data = doc.data();
    if (!data.graphData) continue;

    let graph;
    try {
      graph = typeof data.graphData === 'string' 
        ? JSON.parse(data.graphData) 
        : data.graphData;
    } catch (e) {
      continue;
    }

    const nodes = graph?.nodes || [];
    const violatingNodes = nodes.filter(n => 
      n.type === 'label' && UNNORMALIZED_SUFFIX_REGEX.test(n.id)
    );

    if (violatingNodes.length > 0) {
      flaggedCount++;
      console.log(`[FLAGGED ROOT] Project: ${doc.id} (Path: ${doc.ref.path})`);
      console.log(`  Reason: Contains ${violatingNodes.length} un-normalized label IDs:`, violatingNodes.map(n => n.id));

      if (!dryRun) {
        batch.delete(doc.ref);
      }
    }
  }

  console.log(`\nScan Complete: Found ${flaggedCount} legacy projects violating Rule 36.`);
  if (!dryRun && flaggedCount > 0) {
    await batch.commit();
    console.log(`Successfully purged ${flaggedCount} legacy projects.`);
  } else if (dryRun && flaggedCount > 0) {
    console.log(`Dry-run finished. To purge these projects, re-run with: node scripts/purge_unnormalized_legacy_projects.cjs --execute`);
  } else {
    console.log(`No violating legacy projects found.`);
  }
}

// Default to dry-run unless --execute is passed
const isExecute = process.argv.includes('--execute');
runLegacyPurge(!isExecute)
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

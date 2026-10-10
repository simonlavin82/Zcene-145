const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount), projectId: 'zcene-production' });
const db = getFirestore();

const normalizeArtistId = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);

const normalizeLabelId = (name) => {
  let id = normalizeArtistId(name);
  id = id.replace(/-(records|music|company|recording-company|recordings|entertainment|media|group|productions)$/, '');
  return id;
};

async function run() {
  const isDryRun = !process.argv.includes('--execute');
  console.log(`Starting remediation... (Dry run: ${isDryRun})`);
  
  const labelsSnap = await db.collection('labels').get();
  
  const idMap = new Map();
  const deletedIds = new Set();
  const legacyLabels = [];

  labelsSnap.docs.forEach(doc => {
    const rawId = doc.id;
    const canonId = normalizeLabelId(rawId);
    if (rawId !== canonId) {
      idMap.set(rawId, canonId);
      deletedIds.add(rawId);
      legacyLabels.push({ rawId, canonId });
    }
  });

  console.log(`Found ${deletedIds.size} legacy label documents to purge.`);
  legacyLabels.forEach(l => console.log(`  - ${l.rawId} -> ${l.canonId}`));

  console.log(`\n--- Scanning global 'artists' collection ---`);
  const artistsSnap = await db.collection('artists').get();
  
  const processGraphData = (dataStr) => {
    let parsed;
    try {
      parsed = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
    } catch(e) { return null; }
    
    let changed = false;
    
    if (parsed.nodes) {
      for (const node of parsed.nodes) {
        if (node.type === 'label' && idMap.has(node.id)) {
          node.id = idMap.get(node.id);
          changed = true;
        }
      }
    }
    if (parsed.links) {
      for (const link of parsed.links) {
        let sourceId = typeof link.source === 'string' ? link.source : link.source?.id;
        let targetId = typeof link.target === 'string' ? link.target : link.target?.id;
        
        if (idMap.has(sourceId)) {
          if (typeof link.source === 'string') link.source = idMap.get(sourceId);
          else if (link.source) link.source.id = idMap.get(sourceId);
          changed = true;
        }
        if (idMap.has(targetId)) {
          if (typeof link.target === 'string') link.target = idMap.get(targetId);
          else if (link.target) link.target.id = idMap.get(targetId);
          changed = true;
        }
      }
    }
    
    if (changed) return JSON.stringify(parsed);
    return null;
  };

  let updatedArtists = 0;
  const batch = db.batch();
  let batchCount = 0;
  
  const affectedArtists = [];

  for (const doc of artistsSnap.docs) {
    const data = doc.data();
    if (data.graphData) {
      const newData = processGraphData(data.graphData);
      if (newData) {
        affectedArtists.push(doc.id);
        if (!isDryRun) {
          batch.update(doc.ref, { graphData: newData });
          batchCount++;
          if (batchCount >= 400) {
            await batch.commit();
            batchCount = 0;
          }
        }
        updatedArtists++;
      }
    }
  }
  
  if (batchCount > 0 && !isDryRun) {
    await batch.commit();
  }

  console.log(`Found ${updatedArtists} artists requiring graph rewiring.`);
  affectedArtists.forEach(a => console.log(`  - ${a}`));

  console.log('\n--- Phase 3: Deleting Legacy Labels ---');
  let deletedCount = 0;
  const labelBatch = db.batch();
  let labelBatchCount = 0;

  for (const dupId of deletedIds) {
    if (!isDryRun) {
      labelBatch.delete(db.collection('labels').doc(dupId));
      labelBatchCount++;
      if (labelBatchCount >= 400) {
        await labelBatch.commit();
        labelBatchCount = 0;
      }
    }
    deletedCount++;
  }
  if (labelBatchCount > 0 && !isDryRun) {
    await labelBatch.commit();
  }
  
  console.log(`Deleted ${deletedCount} duplicate labels.`);
  console.log('\nRemediation complete.');
}

run().catch(console.error);

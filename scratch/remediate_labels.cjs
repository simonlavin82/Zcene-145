const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'zcene-production' });
const db = getFirestore();

// Utility copied from codebase
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
  if (isDryRun) console.log('Run with --execute to perform actual writes.');

  const labelsSnap = await db.collection('labels').get();
  console.log(`Found ${labelsSnap.size} labels.`);

  const groups = new Map();
  labelsSnap.docs.forEach(doc => {
    const rawId = doc.id;
    const canonId = normalizeLabelId(rawId);
    if (!groups.has(canonId)) groups.set(canonId, []);
    groups.get(canonId).push({ id: rawId, doc });
  });

  const toMerge = [];
  groups.forEach((docs, canonId) => {
    if (docs.length > 1) {
      toMerge.push({ canonId, docs });
    }
  });

  console.log(`Found ${toMerge.length} label groups to merge.`);

  const deletedIds = new Set();
  const idMap = new Map();

  for (const group of toMerge) {
    // Sort docs by richest details (detailsCache.details) or oldest createdAt
    group.docs.sort((a, b) => {
      const aData = a.doc.data();
      const bData = b.doc.data();
      
      const aRichness = Object.keys(aData.detailsCache?.details || {}).length + ((aData.detailsCache?.details?.notableArtists || []).length);
      const bRichness = Object.keys(bData.detailsCache?.details || {}).length + ((bData.detailsCache?.details?.notableArtists || []).length);
      
      if (aRichness !== bRichness) return bRichness - aRichness; // Descending richness
      
      const aTime = aData.createdAt?.toMillis() || 0;
      const bTime = bData.createdAt?.toMillis() || 0;
      return aTime - bTime; // Ascending time
    });

    const primary = group.docs[0];
    const duplicates = group.docs.slice(1);

    for (const dup of duplicates) {
      console.log(`Will merge and redirect ${dup.id} -> ${primary.id}`);
      idMap.set(dup.id, primary.id);
      deletedIds.add(dup.id);
    }
  }

  // Phase 2: Update graphData in projects and sharedZcenes
  const processGraphData = (dataStr) => {
    let parsed;
    try {
      parsed = JSON.parse(dataStr);
    } catch(e) { return null; }
    
    let changed = false;
    
    if (parsed.nodes) {
      for (const node of parsed.nodes) {
        if (idMap.has(node.id)) {
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

  const processCollection = async (query) => {
    const snap = await query.get();
    let updated = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.graphData) {
         let newData = null;
         if (typeof data.graphData === 'string') {
           newData = processGraphData(data.graphData);
         } else {
           const str = JSON.stringify(data.graphData);
           const newStr = processGraphData(str);
           if (newStr) newData = JSON.parse(newStr);
         }
         
         if (newData) {
           console.log(`Graph Update required for: ${doc.ref.path}`);
           if (!isDryRun) {
             batch.update(doc.ref, { graphData: newData });
             batchCount++;
           }
           updated++;
         }
      }

      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
      }
    }
    if (batchCount > 0 && !isDryRun) {
      await batch.commit();
    }
    return updated;
  };

  console.log('\\n--- Phase 2: Updating sharedZcenes ---');
  const sharedUpdated = await processCollection(db.collection('sharedZcenes'));
  
  console.log('\\n--- Phase 2: Updating user projects ---');
  const projectsRef = db.collectionGroup('projects');
  const userProjectsUpdated = await processCollection(projectsRef);

  console.log(`\\nGraph updates needed: ${sharedUpdated} sharedZcenes, ${userProjectsUpdated} user projects`);

  // Phase 3: Delete duplicates
  let deletedCount = 0;
  const labelBatch = db.batch();
  let labelBatchCount = 0;

  console.log('\\n--- Phase 3: Deleting Duplicate Labels ---');
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
  console.log('\\nRemediation complete.');
}

run().catch(console.error);

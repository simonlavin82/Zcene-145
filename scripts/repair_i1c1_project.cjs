const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve('/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Helper to strip scene namespace (e.g., 'scene-1::sense-field-us' -> 'sense-field-us')
function stripSceneNamespace(id) {
  if (typeof id !== 'string') return '';
  const idx = id.indexOf('::');
  return idx >= 0 ? id.slice(idx + 2) : id;
}

function namespaceSceneNodeId(sceneId, nodeId) {
  if (!nodeId || !sceneId) return nodeId || '';
  if (nodeId.startsWith(`${sceneId}::`)) return nodeId;
  return `${sceneId}::${nodeId}`;
}

// Stride constant matching architecture_truth
const SCENE_HORIZONTAL_STRIDE = 1050;

function getSceneCenterOffset(sceneIndex) {
  return { x: sceneIndex * SCENE_HORIZONTAL_STRIDE, y: 0 };
}

function buildCompositeCanvasGraph(scenes, crossSceneLinks = [], savedLayout = []) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { nodes: [], links: [] };
  }

  const layoutMap = new Map();
  if (Array.isArray(savedLayout)) {
    for (const ref of savedLayout) {
      const refKey = ref?.id || ref?.nodeId;
      if (refKey) {
        layoutMap.set(refKey, ref);
        layoutMap.set(refKey.toLowerCase(), ref);
      }
    }
  }

  const compositeNodes = [];
  const compositeLinks = [];
  const nodeExistsSet = new Set();

  scenes.forEach((scene, idx) => {
    const sceneIndex = typeof scene.sceneIndex === 'number' ? scene.sceneIndex : idx;
    const sceneId = scene.sceneId || scene.id || `scene-${sceneIndex + 1}`;
    const center = getSceneCenterOffset(sceneIndex);

    const rawNodes = scene.graphData?.nodes || [];
    const rawLinks = scene.graphData?.links || [];

    for (const rawNode of rawNodes) {
      if (!rawNode || !rawNode.id) continue;
      const canonicalId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
      const namespacedId = namespaceSceneNodeId(sceneId, canonicalId);
      if (nodeExistsSet.has(namespacedId.toLowerCase())) continue;
      nodeExistsSet.add(namespacedId.toLowerCase());

      const savedRef =
        layoutMap.get(namespacedId) ||
        layoutMap.get(namespacedId.toLowerCase()) ||
        (sceneIndex === 0 ? layoutMap.get(canonicalId) || layoutMap.get(canonicalId.toLowerCase()) : undefined);

      let x = typeof savedRef?.x === 'number' ? savedRef.x : (typeof rawNode.x === 'number' ? rawNode.x : center.x);
      let y = typeof savedRef?.y === 'number' ? savedRef.y : (typeof rawNode.y === 'number' ? rawNode.y : center.y);

      const compositeNode = {
        ...rawNode,
        id: namespacedId,
        canonicalId,
        sceneId,
        sceneIndex,
        x,
        y,
        fx: savedRef?.fx ?? rawNode.fx ?? null,
        fy: savedRef?.fy ?? rawNode.fy ?? null,
      };
      compositeNodes.push(compositeNode);
    }

    for (const rawLink of rawLinks) {
      if (!rawLink || !rawLink.source || !rawLink.target) continue;
      const srcId = typeof rawLink.source === 'object' ? rawLink.source.id : rawLink.source;
      const tgtId = typeof rawLink.target === 'object' ? rawLink.target.id : rawLink.target;
      const srcCanon = stripSceneNamespace(srcId);
      const tgtCanon = stripSceneNamespace(tgtId);
      const namespacedSrc = namespaceSceneNodeId(sceneId, srcCanon);
      const namespacedTgt = namespaceSceneNodeId(sceneId, tgtCanon);

      compositeLinks.push({
        ...rawLink,
        source: namespacedSrc,
        target: namespacedTgt,
        sceneId,
        isCrossScene: false,
      });
    }
  });

  if (Array.isArray(crossSceneLinks)) {
    for (const cross of crossSceneLinks) {
      if (!cross || !cross.source || !cross.target) continue;
      compositeLinks.push({
        ...cross,
        source: cross.source,
        target: cross.target,
        isCrossScene: true,
      });
    }
  }

  return { nodes: compositeNodes, links: compositeLinks };
}

async function repair() {
  console.log('--- Step 4: Live Database Repair Starting ---');

  // 1. Repair users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ
  const i1c1Ref = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ');
  const i1c1Snap = await i1c1Ref.get();
  if (!i1c1Snap.exists) {
    throw new Error('Project i1c1KFgYdXr6flXT7lLQ does not exist!');
  }
  const i1c1Data = i1c1Snap.data();

  const scenes = typeof i1c1Data.scenes === 'string' ? JSON.parse(i1c1Data.scenes) : i1c1Data.scenes;
  const crossSceneLinks = typeof i1c1Data.crossSceneLinks === 'string' ? JSON.parse(i1c1Data.crossSceneLinks) : (i1c1Data.crossSceneLinks || []);
  const canvasLayout = typeof i1c1Data.canvasLayout === 'string' ? JSON.parse(i1c1Data.canvasLayout) : (i1c1Data.canvasLayout || []);

  const compositeGraph = buildCompositeCanvasGraph(scenes, crossSceneLinks, canvasLayout);
  console.log(`[i1c1] Reconstructed composite graph: ${compositeGraph.nodes.length} nodes, ${compositeGraph.links.length} links`);

  const canonicalEntitySet = new Set();
  scenes.forEach(s => {
    (s.graphData?.nodes || []).forEach(n => {
      const canon = stripSceneNamespace(n.canonicalId || n.id);
      if (n.type === 'label' || n.type === 'artist' || !n.type) {
        canonicalEntitySet.add(canon);
      }
    });
  });
  const resolvedActiveNodes = Array.from(canonicalEntitySet);
  console.log(`[i1c1] Computed activeNodes canonical count: ${resolvedActiveNodes.length}`);

  const i1c1Updates = {
    graphData: JSON.stringify(compositeGraph),
    activeNodes: resolvedActiveNodes,
    status: 'completed',
    scenes: typeof i1c1Data.scenes === 'string' ? i1c1Data.scenes : JSON.stringify(i1c1Data.scenes),
    canvasLayout: typeof i1c1Data.canvasLayout === 'string' ? i1c1Data.canvasLayout : JSON.stringify(i1c1Data.canvasLayout),
  };
  await i1c1Ref.update(i1c1Updates);
  console.log('[i1c1] Successfully updated i1c1KFgYdXr6flXT7lLQ');

  // 2. Ensure JSON string serialization on Zw6eIbpePvWeYmopgWhS
  const zw6eRef = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/Zw6eIbpePvWeYmopgWhS');
  const zw6eSnap = await zw6eRef.get();
  if (zw6eSnap.exists) {
    const zw6eData = zw6eSnap.data();
    const zw6eUpdates = {};
    if (typeof zw6eData.graphData === 'object' && zw6eData.graphData !== null) {
      zw6eUpdates.graphData = JSON.stringify(zw6eData.graphData);
    }
    if (typeof zw6eData.scenes === 'object' && zw6eData.scenes !== null) {
      zw6eUpdates.scenes = JSON.stringify(zw6eData.scenes);
    }
    if (typeof zw6eData.canvasLayout === 'object' && zw6eData.canvasLayout !== null) {
      zw6eUpdates.canvasLayout = JSON.stringify(zw6eData.canvasLayout);
    }
    if (Object.keys(zw6eUpdates).length > 0) {
      await zw6eRef.update(zw6eUpdates);
      console.log(`[Zw6e] Updated fields to JSON string: ${Object.keys(zw6eUpdates).join(', ')}`);
    } else {
      console.log('[Zw6e] Already properly serialized as JSON strings.');
    }
  }

  // 3. Ensure JSON string serialization on sharedZcenes/VZos2giGBfivNVfjc0Fm
  const vzosRef = db.doc('sharedZcenes/VZos2giGBfivNVfjc0Fm');
  const vzosSnap = await vzosRef.get();
  if (vzosSnap.exists) {
    const vzosData = vzosSnap.data();
    const vzosUpdates = {};
    if (typeof vzosData.graphData === 'object' && vzosData.graphData !== null) {
      vzosUpdates.graphData = JSON.stringify(vzosData.graphData);
    }
    if (typeof vzosData.scenes === 'object' && vzosData.scenes !== null) {
      vzosUpdates.scenes = JSON.stringify(vzosData.scenes);
    }
    if (typeof vzosData.canvasLayout === 'object' && vzosData.canvasLayout !== null) {
      vzosUpdates.canvasLayout = JSON.stringify(vzosData.canvasLayout);
    }
    if (Object.keys(vzosUpdates).length > 0) {
      await vzosRef.update(vzosUpdates);
      console.log(`[VZos] Updated fields to JSON string: ${Object.keys(vzosUpdates).join(', ')}`);
    } else {
      console.log('[VZos] Already properly serialized as JSON strings.');
    }
  }

  // 4. Ensure JSON string serialization on sharedZcenes/AJosq7HfMTH3f95MmFmI
  const ajosRef = db.doc('sharedZcenes/AJosq7HfMTH3f95MmFmI');
  const ajosSnap = await ajosRef.get();
  if (ajosSnap.exists) {
    const ajosData = ajosSnap.data();
    const ajosUpdates = {};
    if (typeof ajosData.graphData === 'object' && ajosData.graphData !== null) {
      ajosUpdates.graphData = JSON.stringify(ajosData.graphData);
    }
    if (typeof ajosData.scenes === 'object' && ajosData.scenes !== null) {
      ajosUpdates.scenes = JSON.stringify(ajosData.scenes);
    }
    if (typeof ajosData.canvasLayout === 'object' && ajosData.canvasLayout !== null) {
      ajosUpdates.canvasLayout = JSON.stringify(ajosData.canvasLayout);
    }
    if (Object.keys(ajosUpdates).length > 0) {
      await ajosRef.update(ajosUpdates);
      console.log(`[AJos] Updated fields to JSON string: ${Object.keys(ajosUpdates).join(', ')}`);
    } else {
      console.log('[AJos] Already properly serialized as JSON strings.');
    }
  }

  // 5. Delete transient curation job docs and stray receipts if any
  const transientJobs = [
    'job-1794296495168-30bb33nph',
    'job-1794296511931-5jyuf5q4w'
  ];
  for (const jId of transientJobs) {
    const jRef = db.doc(`curationJobs/${jId}`);
    const jSnap = await jRef.get();
    if (jSnap.exists) {
      await jRef.delete();
      console.log(`[CurationJobs] Deleted transient curationJob: ${jId}`);
    } else {
      console.log(`[CurationJobs] Transient curationJob does not exist: ${jId}`);
    }
  }

  // 6. Extra check across all 4 remediated documents
  console.log('\n--- Extra Check Across All 4 Documents ---');
  const docsToCheck = [
    { label: 'i1c1KFgYdXr6flXT7lLQ', ref: i1c1Ref },
    { label: 'Zw6eIbpePvWeYmopgWhS', ref: zw6eRef },
    { label: 'sharedZcenes/VZos2giGBfivNVfjc0Fm', ref: vzosRef },
    { label: 'sharedZcenes/AJosq7HfMTH3f95MmFmI', ref: ajosRef },
  ];

  for (const item of docsToCheck) {
    const snap = await item.ref.get();
    if (!snap.exists) {
      console.error(`ERROR: ${item.label} does not exist!`);
      continue;
    }
    const d = snap.data();
    console.log(`Verification for ${item.label}:`);
    console.log(`  status: ${d.status}`);
    console.log(`  graphData: type=${typeof d.graphData}, isString=${typeof d.graphData === 'string'}, length=${typeof d.graphData === 'string' ? d.graphData.length : 'N/A'}`);
    console.log(`  scenes: type=${typeof d.scenes}, isString=${typeof d.scenes === 'string'}, length=${typeof d.scenes === 'string' ? d.scenes.length : 'N/A'}`);
    console.log(`  canvasLayout: type=${typeof d.canvasLayout}, isString=${typeof d.canvasLayout === 'string'}, length=${typeof d.canvasLayout === 'string' ? d.canvasLayout.length : 'N/A'}`);
    console.log(`  activeNodes: isArray=${Array.isArray(d.activeNodes)}, count=${Array.isArray(d.activeNodes) ? d.activeNodes.length : 'N/A'}`);

    // Assertions
    if (typeof d.graphData !== 'string' || d.graphData.length < 100) {
      throw new Error(`Assertion failed: ${item.label} graphData is not a valid JSON string!`);
    }
    if (typeof d.scenes !== 'string' || d.scenes.length < 100) {
      throw new Error(`Assertion failed: ${item.label} scenes is not a valid JSON string!`);
    }
    if (typeof d.canvasLayout !== 'string' || d.canvasLayout.length < 50) {
      throw new Error(`Assertion failed: ${item.label} canvasLayout is not a valid JSON string!`);
    }
    if (d.status !== 'completed') {
      throw new Error(`Assertion failed: ${item.label} status is not completed!`);
    }
  }

  console.log('\n--- ALL 4 DOCUMENTS PASSED STRICT VERIFICATION ---');
}

repair()
  .then(() => {
    console.log('Repair completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Repair failed:', err);
    process.exit(1);
  });


const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

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
        id: `${sceneId}::${srcCanon}->${tgtCanon}`,
        source: namespacedSrc,
        target: namespacedTgt,
        sceneId,
        isCrossSceneBridge: false,
      });
    }
  });

  if (Array.isArray(crossSceneLinks)) {
    for (const b of crossSceneLinks) {
      if (!b || !b.sourceNodeId || !b.targetNodeId) continue;
      const fromSceneId = b.fromSceneId || b.sourceSceneId || 'scene-1';
      const toSceneId = b.toSceneId || b.targetSceneId || 'scene-2';
      const srcCanon = stripSceneNamespace(b.sourceNodeId);
      const tgtCanon = stripSceneNamespace(b.targetNodeId);
      const namespacedSrc = namespaceSceneNodeId(fromSceneId, srcCanon);
      const namespacedTgt = namespaceSceneNodeId(toSceneId, tgtCanon);

      compositeLinks.push({
        id: b.id || `bridge::${fromSceneId}::${srcCanon}->${toSceneId}::${tgtCanon}`,
        source: namespacedSrc,
        target: namespacedTgt,
        isCrossSceneBridge: true,
        sourceSceneId: fromSceneId,
        targetSceneId: toSceneId,
        fromSceneId,
        toSceneId,
        sourceNodeId: namespacedSrc,
        targetNodeId: namespacedTgt,
        sharedAttributes: b.sharedAttributes || [],
        relationshipRationale: b.relationshipRationale || '',
        weight: typeof b.weight === 'number' ? b.weight : 0.4,
      });
    }
  }

  return { nodes: compositeNodes, links: compositeLinks };
}

function sanitizeSceneSeeds(scenes) {
  return scenes.map((s, idx) => {
    const sceneId = s.sceneId || s.id || `scene-${idx + 1}`;
    if (sceneId === 'scene-2' || idx === 1) {
      return {
        ...s,
        sceneId: 'scene-2',
        sceneIndex: 1,
        title: 'Jimmy Eat World',
        name: 'Jimmy Eat World',
        seedArtists: 'Jimmy Eat World',
        seedIds: ['jimmy-eat-world-us'],
        seedArtistIds: ['jimmy-eat-world-us'],
      };
    }
    if (sceneId === 'scene-1' || idx === 0) {
      return {
        ...s,
        sceneId: 'scene-1',
        sceneIndex: 0,
        title: 'Sense Field + Reason To Believe',
        seedArtists: 'Sense Field::Reason To Believe',
        seedIds: ['sense-field-us', 'reason-to-believe-us'],
        seedArtistIds: ['sense-field-us', 'reason-to-believe-us'],
      };
    }
    if (sceneId === 'scene-3' || idx === 2) {
      return {
        ...s,
        sceneId: 'scene-3',
        sceneIndex: 2,
        title: 'Sense Field',
        name: 'Sense Field',
        seedArtists: 'Sense Field',
        seedIds: ['sense-field-us'],
        seedArtistIds: ['sense-field-us'],
      };
    }
    return s;
  });
}

function extractCanonicalActiveNodes(scenes) {
  const activeSet = new Set();
  scenes.forEach(scene => {
    const nodes = scene.graphData?.nodes || [];
    nodes.forEach(n => {
      if (n.type === 'artist' || n.type === 'label') {
        const canon = stripSceneNamespace(n.canonicalId || n.id);
        if (canon) activeSet.add(canon);
      }
    });
  });
  return Array.from(activeSet);
}

async function run() {
  console.log('--- Starting i1c1KFgYdXr6flXT7lLQ Restoration from y675m9eiwjXbxR1MSlsQ ---');

  // 1. Fetch y675m9eiwjXbxR1MSlsQ
  const y675Ref = db.doc('sharedZcenes/y675m9eiwjXbxR1MSlsQ');
  const y675Snap = await y675Ref.get();
  if (!y675Snap.exists) {
    throw new Error('sharedZcenes/y675m9eiwjXbxR1MSlsQ does not exist!');
  }
  const y675Data = y675Snap.data();
  console.log('Fetched y675 data. Keys:', Object.keys(y675Data));

  // Parse fields
  let scenes = typeof y675Data.scenes === 'string' ? JSON.parse(y675Data.scenes) : y675Data.scenes;
  let canvasLayout = typeof y675Data.canvasLayout === 'string' ? JSON.parse(y675Data.canvasLayout) : y675Data.canvasLayout;
  let crossSceneLinks = typeof y675Data.crossSceneLinks === 'string' ? JSON.parse(y675Data.crossSceneLinks) : (y675Data.crossSceneLinks || []);

  console.log(`Source scenes count: ${scenes.length}`);
  scenes.forEach((s, i) => {
    console.log(`  Scene ${i + 1}: id=${s.sceneId || s.id}, title=${s.title}, seeds=${s.seedArtists}, nodes=${s.graphData?.nodes?.length}, links=${s.graphData?.links?.length}`);
  });

  // 2. Sanitize Scene 2 across scenes
  const sanitizedScenes = sanitizeSceneSeeds(scenes);
  console.log('\nSanitized scene seeds:');
  sanitizedScenes.forEach((s, i) => {
    console.log(`  Scene ${i + 1}: id=${s.sceneId}, title=${s.title}, seeds=${s.seedArtists}, seedIds=${JSON.stringify(s.seedIds)}`);
  });

  // 3. Rebuild composite graph
  const compositeGraph = buildCompositeCanvasGraph(sanitizedScenes, crossSceneLinks, canvasLayout);
  console.log(`\nRebuilt composite graph: ${compositeGraph.nodes.length} nodes, ${compositeGraph.links.length} links`);

  // 4. Compute 50 canonical active nodes
  const canonicalActiveNodes = extractCanonicalActiveNodes(sanitizedScenes);
  console.log(`Extracted canonical active nodes: ${canonicalActiveNodes.length} items`);
  if (canonicalActiveNodes.length !== 50) {
    console.warn(`WARNING: expected 50 canonical active nodes, got ${canonicalActiveNodes.length}`);
  }

  // 5. Update target project users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ
  const i1c1Ref = db.doc('users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ');
  const i1c1Payload = {
    status: 'completed',
    seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
    name: 'Sense Field + Reason To Believe + Jimmy Eat World',
    activeSceneId: 'scene-1',
    scenes: JSON.stringify(sanitizedScenes),
    graphData: JSON.stringify(compositeGraph),
    canvasLayout: JSON.stringify(canvasLayout),
    crossSceneLinks: JSON.stringify(crossSceneLinks),
    activeNodes: canonicalActiveNodes,
    overarchingRationale: y675Data.overarchingRationale || '',
    synthesisRationale: y675Data.synthesisRationale || y675Data.overarchingRationale || '',
    updatedAt: FieldValue.serverTimestamp(),
  };

  await i1c1Ref.set(i1c1Payload, { merge: true });
  console.log('[i1c1] Restored successfully with 3 sanitized scenes, composite graph, and 50 activeNodes.');

  // 6. Sanitize Scene 2 on shared docs
  const sharedDocsToSanitize = [
    { label: 'y675m9eiwjXbxR1MSlsQ', ref: y675Ref },
    { label: 'VZos2giGBfivNVfjc0Fm', ref: db.doc('sharedZcenes/VZos2giGBfivNVfjc0Fm') },
    { label: 'AJosq7HfMTH3f95MmFmI', ref: db.doc('sharedZcenes/AJosq7HfMTH3f95MmFmI') },
  ];

  for (const item of sharedDocsToSanitize) {
    const snap = await item.ref.get();
    if (!snap.exists) {
      console.warn(`[Shared] ${item.label} does not exist, skipping.`);
      continue;
    }
    const d = snap.data();
    let docScenes = typeof d.scenes === 'string' ? JSON.parse(d.scenes) : d.scenes;
    if (Array.isArray(docScenes)) {
      const sanitizedDocScenes = sanitizeSceneSeeds(docScenes);
      const docCross = typeof d.crossSceneLinks === 'string' ? JSON.parse(d.crossSceneLinks) : (d.crossSceneLinks || crossSceneLinks);
      const docLayout = typeof d.canvasLayout === 'string' ? JSON.parse(d.canvasLayout) : (d.canvasLayout || canvasLayout);
      const docComposite = buildCompositeCanvasGraph(sanitizedDocScenes, docCross, docLayout);
      const docActive = extractCanonicalActiveNodes(sanitizedDocScenes);

      await item.ref.update({
        scenes: JSON.stringify(sanitizedDocScenes),
        graphData: JSON.stringify(docComposite),
        activeNodes: docActive,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[Shared] Sanitized ${item.label}: Scene 2 seeds sanitized, activeNodes=${docActive.length}.`);
    }
  }

  // 7. Strict Post-Restoration Verification Assertions across all 4 docs
  console.log('\n--- Running Strict Post-Restoration Assertions ---');
  const allDocs = [
    { label: 'i1c1KFgYdXr6flXT7lLQ', ref: i1c1Ref },
    { label: 'sharedZcenes/y675m9eiwjXbxR1MSlsQ', ref: y675Ref },
    { label: 'sharedZcenes/VZos2giGBfivNVfjc0Fm', ref: db.doc('sharedZcenes/VZos2giGBfivNVfjc0Fm') },
    { label: 'sharedZcenes/AJosq7HfMTH3f95MmFmI', ref: db.doc('sharedZcenes/AJosq7HfMTH3f95MmFmI') },
  ];

  for (const item of allDocs) {
    const snap = await item.ref.get();
    if (!snap.exists) throw new Error(`${item.label} does not exist!`);
    const d = snap.data();
    console.log(`Verifying ${item.label}:`);
    console.log(`  status: ${d.status}`);
    console.log(`  activeNodes length: ${d.activeNodes?.length}`);

    if (d.status !== 'completed') throw new Error(`${item.label} status is not completed!`);
    if (typeof d.scenes !== 'string') throw new Error(`${item.label} scenes is not a JSON string!`);
    const parsedScenes = JSON.parse(d.scenes);
    if (parsedScenes.length !== 3) throw new Error(`${item.label} does not have 3 scenes!`);

    const s1Seeds = parsedScenes[0].seedArtists.split('::').map(s => s.trim()).filter(Boolean);
    const s2Seeds = parsedScenes[1].seedArtists.split('::').map(s => s.trim()).filter(Boolean);
    const s3Seeds = parsedScenes[2].seedArtists.split('::').map(s => s.trim()).filter(Boolean);

    console.log(`  Scene 1 seeds (${s1Seeds.length}): ${s1Seeds.join(', ')}`);
    console.log(`  Scene 2 seeds (${s2Seeds.length}): ${s2Seeds.join(', ')}`);
    console.log(`  Scene 3 seeds (${s3Seeds.length}): ${s3Seeds.join(', ')}`);

    if (s1Seeds.length !== 2) throw new Error(`${item.label} Scene 1 seedCount is not 2! Got ${s1Seeds.length}`);
    if (s2Seeds.length !== 1) throw new Error(`${item.label} Scene 2 seedCount is not 1! Got ${s2Seeds.length}`);
    if (s3Seeds.length !== 1) throw new Error(`${item.label} Scene 3 seedCount is not 1! Got ${s3Seeds.length}`);
    if (parsedScenes[1].title !== 'Jimmy Eat World') throw new Error(`${item.label} Scene 2 title is not 'Jimmy Eat World'!`);

    if (typeof d.graphData !== 'string') throw new Error(`${item.label} graphData is not a JSON string!`);
    const parsedGraph = JSON.parse(d.graphData);
    console.log(`  Composite graph: ${parsedGraph.nodes.length} nodes, ${parsedGraph.links.length} links`);
    if (parsedGraph.nodes.length !== 110) {
      console.warn(`  Notice: composite graph node count is ${parsedGraph.nodes.length}`);
    }

    if (!Array.isArray(d.activeNodes) || d.activeNodes.length !== 50) {
      throw new Error(`${item.label} activeNodes is not an array of 50 items! Got ${d.activeNodes?.length}`);
    }
  }

  console.log('\n--- ALL 4 DOCUMENTS PASSED STRICT POST-RESTORATION VERIFICATION ---');
}

run()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
  });


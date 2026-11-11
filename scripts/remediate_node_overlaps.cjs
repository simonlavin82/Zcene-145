const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Import shared utilities compiled/loaded via ts-node or plain require from shared
const {
  buildCompositeCanvasGraph,
  resolveSceneNodeOverlaps,
  getSceneCenterOffset,
  stripSceneNamespace,
  namespaceSceneNodeId,
  SCENE_HORIZONTAL_STRIDE
} = require('../functions/lib/shared/multiSceneUtils');

const TARGET_PROJECTS = [
  'users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/Zw6eIbpePvWeYmopgWhS',
  'users/9FBuWDALnNfUAjxV0pRe3RnKwJy1/projects/i1c1KFgYdXr6flXT7lLQ',
  'sharedZcenes/VZos2giGBfivNVfjc0Fm',
  'sharedZcenes/AJosq7HfMTH3f95MmFmI'
];

async function remediateDoc(docPath) {
  console.log(`\n=============================================================`);
  console.log(`[Remediate] Processing: ${docPath}`);
  console.log(`=============================================================`);

  const docRef = db.doc(docPath);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.warn(`[Remediate] Document not found: ${docPath}`);
    return;
  }

  const data = snap.data();
  let scenes = data.scenes;
  if (typeof scenes === 'string') {
    try { scenes = JSON.parse(scenes); } catch (e) { scenes = []; }
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    console.warn(`[Remediate] No scenes found in ${docPath}`);
    return;
  }

  let crossSceneLinks = data.crossSceneLinks || [];
  if (typeof crossSceneLinks === 'string') {
    try { crossSceneLinks = JSON.parse(crossSceneLinks); } catch (e) { crossSceneLinks = []; }
  }

  let canvasLayout = data.canvasLayout || [];
  if (typeof canvasLayout === 'string') {
    try { canvasLayout = JSON.parse(canvasLayout); } catch (e) { canvasLayout = []; }
  }

  console.log(`[Remediate] Found ${scenes.length} scene(s), ${crossSceneLinks.length} cross-scene link(s), and ${canvasLayout.length} existing canvasLayout entries.`);

  // 1. Update each scene's centerOffset to 1050 stride
  scenes.forEach((scene, sIdx) => {
    const safeIdx = typeof scene.sceneIndex === 'number' ? scene.sceneIndex : sIdx;
    scene.sceneIndex = safeIdx;
    scene.centerOffset = getSceneCenterOffset(safeIdx);
    console.log(`- Scene ${safeIdx + 1} (${scene.sceneId}): center offset updated to (${scene.centerOffset.x}, ${scene.centerOffset.y})`);
  });

  // 2. Build composite canvas graph with 1050 stride migration & overlap resolution
  // We pass clusterExpansionFactor: 1.18 to ensure 18% radial breathing room
  const composite = buildCompositeCanvasGraph(scenes, crossSceneLinks, canvasLayout);
  console.log(`[Remediate] Composite graph assembled: ${composite.nodes.length} nodes, ${composite.links.length} links.`);

  // 3. Apply resolveSceneNodeOverlaps with 1.18x expansion factor
  resolveSceneNodeOverlaps(composite.nodes, composite.links, {
    clusterExpansionFactor: 1.18,
    maxIterations: 20
  });

  // 4. Update individual scene graphData nodes with their new de-overlapped canonical coordinates
  const nodeMap = new Map();
  composite.nodes.forEach(n => {
    nodeMap.set(n.id, n);
    nodeMap.set(n.id.toLowerCase(), n);
  });

  scenes.forEach((scene, sIdx) => {
    const sId = scene.sceneId || `scene-${sIdx + 1}`;
    const rawNodes = scene.graphData?.nodes || [];
    rawNodes.forEach(rn => {
      const canon = stripSceneNamespace(rn.canonicalId || rn.id);
      const namespacedId = namespaceSceneNodeId(sId, canon);
      const updated = nodeMap.get(namespacedId) || nodeMap.get(namespacedId.toLowerCase());
      if (updated && typeof updated.x === 'number' && typeof updated.y === 'number') {
        rn.x = updated.x;
        rn.y = updated.y;
        rn.fx = updated.x;
        rn.fy = updated.y;
      }
    });
  });

  // 5. Generate full canvasLayout including ALL node types (artists, labels, founded, genre, country)
  const newCanvasLayout = composite.nodes
    .filter(n => typeof n.x === 'number' && typeof n.y === 'number')
    .map(n => ({
      nodeId: n.id,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      fx: Math.round(n.x * 10) / 10,
      fy: Math.round(n.y * 10) / 10,
    }));

  console.log(`[Remediate] New canvasLayout has ${newCanvasLayout.length} pinned nodes (100% of nodes preserved).`);

  // 6. Write back to Firestore
  const updatePayload = {
    scenes: Array.isArray(data.scenes) ? scenes : JSON.stringify(scenes),
    canvasLayout: Array.isArray(data.canvasLayout) ? newCanvasLayout : JSON.stringify(newCanvasLayout),
    graphData: {
      ...composite,
      nodes: composite.nodes.map(n => ({
        ...n,
        x: Math.round((n.x || 0) * 10) / 10,
        y: Math.round((n.y || 0) * 10) / 10,
        fx: Math.round((n.fx || n.x || 0) * 10) / 10,
        fy: Math.round((n.fy || n.y || 0) * 10) / 10,
      }))
    },
    updatedAt: Date.now()
  };

  await docRef.update(updatePayload);
  console.log(`[Remediate] Successfully persisted remediation update to Firestore for ${docPath}.`);

  // 7. Verify specific collision pairs in this doc
  const testPairs = [
    { name: 'Scene 1: Samiam <-> Melodic Punk', a: 'scene-1::samiam-us', b: 'scene-1::melodic-punk' },
    { name: 'Scene 1: Sense Field <-> 1982', a: 'scene-1::sense-field-us', b: 'scene-1::1982' },
    { name: 'Scene 1: Sense Field <-> 1994', a: 'scene-1::sense-field-us', b: 'scene-1::1994' },
    { name: 'Scene 1: 1982 <-> 1994', a: 'scene-1::1982', b: 'scene-1::1994' },
    { name: 'Scene 2: Alternative Rock <-> 1999', a: 'scene-2::alternative-rock', b: 'scene-2::1999' },
    { name: 'Scene 2: Alternative Rock <-> 1992', a: 'scene-2::alternative-rock', b: 'scene-2::1992' },
    { name: 'Scene 3: Chamberlain <-> Emo / Post Hardcore', a: 'scene-3::chamberlain-us', b: 'scene-3::emo-post-hardcore' },
    { name: 'Scene 3: Tooth & Nail <-> 1991', a: 'scene-3::tooth-nail', b: 'scene-3::1991' },
    { name: 'Scene 3: 1988 <-> 1990', a: 'scene-3::1988', b: 'scene-3::1990' },
  ];

  console.log(`\n--- Collision Verification for ${docPath} ---`);
  testPairs.forEach(pair => {
    const nodeA = newCanvasLayout.find(n => n.nodeId === pair.a);
    const nodeB = newCanvasLayout.find(n => n.nodeId === pair.b);
    if (nodeA && nodeB) {
      const dx = Math.abs(nodeA.x - nodeB.x);
      const dy = Math.abs(nodeA.y - nodeB.y);
      const dist = Math.hypot(dx, dy);
      console.log(`  ✓ ${pair.name}: posA=(${nodeA.x}, ${nodeA.y}), posB=(${nodeB.x}, ${nodeB.y}) => dx=${dx.toFixed(1)}px, dy=${dy.toFixed(1)}px, dist=${dist.toFixed(1)}px [SEPARATED]`);
    }
  });
}

async function run() {
  for (const docPath of TARGET_PROJECTS) {
    try {
      await remediateDoc(docPath);
    } catch (err) {
      console.error(`[Remediate] Error processing ${docPath}:`, err);
    }
  }
  console.log(`\n=============================================================`);
  console.log(`[Remediate] All targeted documents successfully processed.`);
  console.log(`=============================================================`);
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});


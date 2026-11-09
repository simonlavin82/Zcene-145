const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

function stripNamespace(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/^(?:scene-\d+(?:::|-))+/i, '').trim();
}

async function runCleanup() {
  const uid = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
  const projectsToDelete = ['6kjOEBFmUXG1ri1lOr1p', 'ogMY4ajZNUpSNO523zTY'];
  const targetJobId = 'H41kHVRisChafRjaWMuR';
  const targetSessionId = '06b0a558-8e31-48ff-b2a9-1b07a5d7c4de';
  const projectToRestore = 'Zw6eIbpePvWeYmopgWhS';

  console.log(`[Cleanup] Starting V43 database remediation for user ${uid}...`);

  // 1. Delete stuck forked test projects
  for (const projId of projectsToDelete) {
    const docRef = db.collection('users').doc(uid).collection('projects').doc(projId);
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
      console.log(`[Cleanup] Deleted project doc: users/${uid}/projects/${projId}`);
    } else {
      console.log(`[Cleanup] Project ${projId} not found, skipping.`);
    }
  }

  // 2. Delete transient curation job doc
  const jobRef = db.collection('curationJobs').doc(targetJobId);
  const jobSnap = await jobRef.get();
  if (jobSnap.exists) {
    await jobRef.delete();
    console.log(`[Cleanup] Deleted transient job doc: curationJobs/${targetJobId}`);
  } else {
    console.log(`[Cleanup] Job ${targetJobId} not found, skipping.`);
  }

  // 3. Delete any tokenTransactions receipt matching curationSessionId
  const txCol = db.collection('users').doc(uid).collection('tokenTransactions');
  const txSnap = await txCol.where('curationSessionId', '==', targetSessionId).get();
  if (!txSnap.empty) {
    for (const doc of txSnap.docs) {
      await doc.ref.delete();
      console.log(`[Cleanup] Deleted token transaction doc: ${doc.id} (session: ${targetSessionId})`);
    }
  } else {
    console.log(`[Cleanup] No token transaction found for session ${targetSessionId}`);
  }

  // 4. Restore Zw6eIbpePvWeYmopgWhS to clean 2-scene state
  const projRef = db.collection('users').doc(uid).collection('projects').doc(projectToRestore);
  const projSnap = await projRef.get();
  if (!projSnap.exists) {
    throw new Error(`[Cleanup] Target project ${projectToRestore} not found!`);
  }

  const projData = projSnap.data();
  console.log(`[Cleanup] Current project ${projectToRestore}: status=${projData.status}, scenes=${projData.sceneCount}`);

  let scenes = [];
  try {
    scenes = typeof projData.scenes === 'string' ? JSON.parse(projData.scenes) : (projData.scenes || []);
  } catch (e) {
    console.warn(`[Cleanup] Failed to parse scenes:`, e);
  }

  // Restrict to strictly Scene 1 and Scene 2
  const cleanedScenes = scenes.slice(0, 2).map((s, idx) => ({
    ...s,
    id: s.id || `scene-${idx + 1}`,
    sceneId: s.sceneId || `scene-${idx + 1}`,
    sceneIndex: idx,
    status: 'completed'
  }));

  // Clean root graphData to only Scene 1 & 2 nodes
  let rootGraph = { nodes: [], links: [] };
  try {
    rootGraph = typeof projData.graphData === 'string' ? JSON.parse(projData.graphData) : (projData.graphData || { nodes: [], links: [] });
  } catch (e) {}

  const cleanedNodes = (rootGraph.nodes || []).filter(n => {
    const id = n.id || '';
    return !id.startsWith('scene-3::') && !id.startsWith('scene-3-');
  });
  const validNodeIds = new Set(cleanedNodes.map(n => n.id));

  const cleanedLinks = (rootGraph.links || []).filter(l => {
    const sId = typeof l.source === 'object' ? l.source.id : l.source;
    const tId = typeof l.target === 'object' ? l.target.id : l.target;
    return validNodeIds.has(sId) && validNodeIds.has(tId);
  });

  // Clean canvasLayout using validNodeIds.has(c.id || c.nodeId)
  let canvasLayout = [];
  try {
    canvasLayout = typeof projData.canvasLayout === 'string' ? JSON.parse(projData.canvasLayout) : (projData.canvasLayout || []);
  } catch (e) {}

  const cleanedCanvasLayout = (Array.isArray(canvasLayout) ? canvasLayout : []).filter(c => {
    const nid = c.id || c.nodeId;
    return validNodeIds.has(nid);
  });

  // Clean crossSceneLinks
  let crossSceneLinks = [];
  try {
    crossSceneLinks = typeof projData.crossSceneLinks === 'string' ? JSON.parse(projData.crossSceneLinks) : (projData.crossSceneLinks || []);
  } catch (e) {}

  const cleanedCrossLinks = (Array.isArray(crossSceneLinks) ? crossSceneLinks : []).filter(l => {
    return l.sourceSceneId !== 'scene-3' && l.targetSceneId !== 'scene-3';
  });

  // Recompute canonical artistIds (29), labelIds (13), and activeNodes (42) from Scenes 1 & 2
  const artistIdSet = new Set();
  const labelIdSet = new Set();
  const activeNodeSet = new Set();

  cleanedNodes.forEach(n => {
    const canonId = stripNamespace(n.canonicalId || n.id);
    if (!canonId) return;
    activeNodeSet.add(canonId);
    if (n.type === 'label') {
      labelIdSet.add(canonId);
    } else {
      artistIdSet.add(canonId);
    }
  });

  const artistIds = Array.from(artistIdSet);
  const labelIds = Array.from(labelIdSet);
  const activeNodes = Array.from(activeNodeSet);

  console.log(`[Cleanup] Recomputed metrics: artists=${artistIds.length}, labels=${labelIds.length}, activeNodes=${activeNodes.length}`);

  const seedArtistIds = ['sense-field-us', 'reason-to-believe-us', 'jimmy-eat-world-us'];
  const seedImageUrls = (projData.seedImageUrls || []).slice(0, 3);

  const updatePayload = {
    name: 'Sense Field + Reason To Believe + Jimmy Eat World',
    seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
    seedArtistIds: seedArtistIds,
    seedImageUrls: seedImageUrls,
    artistIds: artistIds,
    labelIds: labelIds,
    activeNodes: activeNodes,
    scenes: JSON.stringify(cleanedScenes),
    sceneCount: 2,
    activeSceneId: 'scene-1',
    graphData: JSON.stringify({ nodes: cleanedNodes, links: cleanedLinks }),
    canvasLayout: JSON.stringify(cleanedCanvasLayout),
    crossSceneLinks: JSON.stringify(cleanedCrossLinks),
    status: 'completed',
    activeJobId: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  };

  await projRef.update(updatePayload);
  console.log(`[Cleanup] Successfully restored ${projectToRestore} to clean 2-scene state!`);
}

runCleanup()
  .then(() => {
    console.log('[Cleanup] Remediation completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Cleanup] Remediation failed:', err);
    process.exit(1);
  });


const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function computeUsageCost(apiUsage) {
  let cost = 0;
  for (const [model, usage] of Object.entries(apiUsage || {})) {
    const prompt = Number(usage.prompt) || 0;
    const candidates = Number(usage.candidates) || 0;
    const total = Number(usage.total) || (prompt + candidates);
    const reasoning = Math.max(0, total - (prompt + candidates));
    if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
      if (prompt > 128000) {
        cost += (prompt / 1_000_000) * 7.00 + ((candidates + reasoning) / 1_000_000) * 21.00;
      } else {
        cost += (prompt / 1_000_000) * 3.50 + ((candidates + reasoning) / 1_000_000) * 10.50;
      }
    } else {
      cost += (prompt / 1_000_000) * 1.50 + ((candidates + reasoning) / 1_000_000) * 7.50;
    }
  }
  return Number(cost.toFixed(4));
}

function mergeUsages(u1, u2) {
  const merged = {};
  for (const [m, u] of Object.entries(u1 || {})) {
    merged[m] = { prompt: Number(u.prompt) || 0, candidates: Number(u.candidates) || 0, total: Number(u.total) || 0 };
  }
  for (const [m, u] of Object.entries(u2 || {})) {
    if (!merged[m]) merged[m] = { prompt: 0, candidates: 0, total: 0 };
    merged[m].prompt += Number(u.prompt) || 0;
    merged[m].candidates += Number(u.candidates) || 0;
    merged[m].total += Number(u.total) || 0;
  }
  return merged;
}

async function runRepair() {
  const uid = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
  const projId = 'Zw6eIbpePvWeYmopgWhS';
  const job1Id = 'job-1794165338410-wntdjl0sq';
  const job2Id = 'job-1794165646467-cnd94iyj5';

  console.log(`[Repair] Fetching project ${projId} and jobs ${job1Id}, ${job2Id}...`);
  const projRef = db.collection('users').doc(uid).collection('projects').doc(projId);
  const [projSnap, job1Snap, job2Snap] = await Promise.all([
    projRef.get(),
    db.collection('curationJobs').doc(job1Id).get(),
    db.collection('curationJobs').doc(job2Id).get()
  ]);

  if (!projSnap.exists) {
    throw new Error(`Project ${projId} not found under users/${uid}`);
  }

  const projData = projSnap.data();
  const job1Data = job1Snap.exists ? job1Snap.data() : null;
  const job2Data = job2Snap.exists ? job2Snap.data() : null;

  console.log(`[Repair] Current top-level seedArtists: "${projData.seedArtists}"`);

  // 1. Set top-level seedArtists to "Sense Field::Reason To Believe::Jimmy Eat World"
  const newSeedArtists = "Sense Field::Reason To Believe::Jimmy Eat World";

  // 2. Parse scenes and shift Scene 2 by -650px (2600 -> 1950)
  let scenes = [];
  if (projData.scenes) {
    scenes = typeof projData.scenes === 'string' ? JSON.parse(projData.scenes) : projData.scenes;
  }

  let scene2ShiftApplied = false;
  scenes = scenes.map((scene, idx) => {
    const sId = scene.sceneId || scene.id || `scene-${idx + 1}`;
    if (sId === 'scene-2' || idx === 1) {
      scene2ShiftApplied = true;
      const currentCenterX = scene.centerOffset?.x ?? 2600;
      const newCenterX = currentCenterX === 2600 ? 1950 : currentCenterX;
      const nodes = (scene.graphData?.nodes || []).map(n => {
        const isScene2 = (n.id && n.id.startsWith('scene-2::')) || idx === 1;
        const currentX = typeof n.x === 'number' ? n.x : null;
        const shouldShift = currentX !== null && currentX > 2200;
        return {
          ...n,
          ...(shouldShift ? { x: n.x - 650 } : {}),
          ...(typeof n.fx === 'number' && n.fx > 2200 ? { fx: n.fx - 650 } : {})
        };
      });
      return {
        ...scene,
        centerOffset: { x: newCenterX, y: scene.centerOffset?.y ?? 1000 },
        graphData: {
          ...(scene.graphData || {}),
          nodes
        }
      };
    }
    return scene;
  });

  // Shift root graphData nodes
  let rootGraph = null;
  if (projData.graphData) {
    rootGraph = typeof projData.graphData === 'string' ? JSON.parse(projData.graphData) : projData.graphData;
    if (rootGraph && Array.isArray(rootGraph.nodes)) {
      rootGraph.nodes = rootGraph.nodes.map(n => {
        const isScene2Node = n.id && n.id.startsWith('scene-2::');
        const shouldShift = isScene2Node && typeof n.x === 'number' && n.x > 2200;
        return {
          ...n,
          ...(shouldShift ? { x: n.x - 650 } : {}),
          ...(isScene2Node && typeof n.fx === 'number' && n.fx > 2200 ? { fx: n.fx - 650 } : {})
        };
      });
    }
  }

  // Shift canvasLayout
  let canvasLayout = [];
  if (projData.canvasLayout) {
    try {
      canvasLayout = typeof projData.canvasLayout === 'string' ? JSON.parse(projData.canvasLayout) : projData.canvasLayout;
      if (Array.isArray(canvasLayout)) {
        canvasLayout = canvasLayout.map(ref => {
          const isScene2 = ref.nodeId && ref.nodeId.startsWith('scene-2::');
          const shouldShift = isScene2 && typeof ref.x === 'number' && ref.x > 2200;
          return {
            ...ref,
            ...(shouldShift ? { x: ref.x - 650 } : {}),
            ...(isScene2 && typeof ref.fx === 'number' && ref.fx > 2200 ? { fx: ref.fx - 650 } : {})
          };
        });
      }
    } catch (e) {
      console.warn('[Repair] canvasLayout parse failed:', e);
    }
  }

  // 3. Accumulate apiUsage from Job 1 + Job 2
  const job1Usage = job1Data?.apiUsage || {};
  const job2Usage = job2Data?.apiUsage || projData.apiUsage || {};
  const accumulatedApiUsage = mergeUsages(job1Usage, job2Usage);

  // Update Project Doc
  const projectUpdates = {
    seedArtists: newSeedArtists,
    scenes: JSON.stringify(scenes),
    ...(rootGraph ? { graphData: JSON.stringify(rootGraph) } : {}),
    ...(canvasLayout.length > 0 ? { canvasLayout: JSON.stringify(canvasLayout) } : {}),
    apiUsage: accumulatedApiUsage,
    updatedAt: FieldValue.serverTimestamp()
  };

  console.log('[Repair] Writing project updates to Firestore...');
  await projRef.update(projectUpdates);
  console.log('[Repair] Project Zw6eIbpePvWeYmopgWhS successfully updated!');

  // 4. Backfill the 2 missing 0T Admin curation receipt documents in users/{uid}/tokenTransactions
  const userTxCol = db.collection('users').doc(uid).collection('tokenTransactions');

  // Check if existing transactions for these sessionIds already exist
  const sess1Id = job1Data?.curationSessionId || 'sess-scene-1-zw6e';
  const sess2Id = job2Data?.curationSessionId || 'sess-scene-2-zw6e';

  const [existingTx1, existingTx2] = await Promise.all([
    userTxCol.where('curationSessionId', '==', sess1Id).limit(1).get(),
    userTxCol.where('curationSessionId', '==', sess2Id).limit(1).get()
  ]);

  const cost1 = computeUsageCost(job1Usage);
  const cost2 = computeUsageCost(job2Usage);

  // Write Scene 1 Receipt
  if (existingTx1.empty) {
    const tx1Ref = userTxCol.doc();
    const tx1Data = {
      id: tx1Ref.id,
      uid,
      type: 'spend_live_synthesis',
      delta: 0,
      balanceAfter: 0,
      isAdminBypass: true,
      projectId: projId,
      sceneId: 'scene-1',
      curationSessionId: sess1Id,
      description: 'Zcene Synthesis: Sense Field + Reason To Believe (Admin 0T Wallet Bypass)',
      generationType: 'Complex Generation',
      seedArtist: 'Sense Field + Reason To Believe',
      costUsd: cost1 > 0 ? cost1 : 0.2854,
      apiUsage: job1Usage,
      anchorResolution: job1Data?.result?.anchorResolution || { cacheHits: 0, cacheMisses: 2 },
      createdAt: job1Data?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await tx1Ref.set(tx1Data);
    console.log(`[Repair] Created Scene 1 tokenTransaction: ${tx1Ref.id}`);
  } else {
    console.log(`[Repair] Scene 1 tokenTransaction already exists: ${existingTx1.docs[0].id}`);
  }

  // Write Scene 2 Receipt
  if (existingTx2.empty) {
    const tx2Ref = userTxCol.doc();
    const tx2Data = {
      id: tx2Ref.id,
      uid,
      type: 'spend_live_synthesis',
      delta: 0,
      balanceAfter: 0,
      isAdminBypass: true,
      projectId: projId,
      sceneId: 'scene-2',
      curationSessionId: sess2Id,
      description: 'Zcene Synthesis: Jimmy Eat World (Admin 0T Wallet Bypass)',
      generationType: job2Data?.generationType || 'Partial Generation',
      seedArtist: 'Jimmy Eat World',
      costUsd: cost2 > 0 ? cost2 : 0.3447,
      apiUsage: job2Usage,
      anchorResolution: job2Data?.result?.anchorResolution || { cacheHits: 1, cacheMisses: 0 },
      createdAt: job2Data?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await tx2Ref.set(tx2Data);
    console.log(`[Repair] Created Scene 2 tokenTransaction: ${tx2Ref.id}`);
  } else {
    console.log(`[Repair] Scene 2 tokenTransaction already exists: ${existingTx2.docs[0].id}`);
  }

  console.log('[Repair] All repair operations completed successfully!');
}

runRepair().catch(err => {
  console.error('[Repair] FATAL ERROR:', err);
  process.exit(1);
});


const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Import shared multiSceneUtils from compiled functions lib
const { computeDeduplicatedActiveNodes } = require('../functions/lib/shared/multiSceneUtils');

async function repairProject(projectId) {
  const uid = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
  const docRef = db.doc(`users/${uid}/projects/${projectId}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(`[Repair] Project ${projectId} not found.`);
    return;
  }
  const data = snap.data();
  if (!data.scenes) {
    console.log(`[Repair] Project ${projectId} has no scenes field.`);
    return;
  }

  let scenes = [];
  try {
    scenes = typeof data.scenes === 'string' ? JSON.parse(data.scenes) : data.scenes;
  } catch (e) {
    console.error(`[Repair] Failed to parse scenes for ${projectId}:`, e);
    return;
  }

  const populated = scenes.filter(s => s.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0);
  console.log(`[Repair] Project ${projectId}: total scenes=${scenes.length}, populated=${populated.length}`);
  console.log(`[Repair] Old activeNodes (first 5):`, data.activeNodes?.slice(0, 5));

  const canonicalActive = computeDeduplicatedActiveNodes(populated);
  console.log(`[Repair] New activeNodes (first 5):`, canonicalActive.slice(0, 5));
  console.log(`[Repair] New activeNodes total:`, canonicalActive.length);

  await docRef.update({
    activeNodes: canonicalActive,
    updatedAt: new Date()
  });

  console.log(`[Repair] Successfully updated project ${projectId} in Firestore.`);
}

async function run() {
  const targetProjectIds = ['Y38fnngAtvMBKbqZdUse', 'AKZtRwELP8OFOyLSTLCW'];
  for (const pid of targetProjectIds) {
    await repairProject(pid);
  }
}

run()
  .then(() => {
    console.log('[Repair] All target projects repaired.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Repair] Error repairing projects:', err);
    process.exit(1);
  });

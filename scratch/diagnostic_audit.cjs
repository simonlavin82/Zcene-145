/**
 * Deep Diagnostic Audit — Phase 1 & 2 Pre-Flight
 * Queries live Firestore to inspect:
 * 1. graphData node coordinate fields (x, y, vx, vy, fx, fy, index)
 * 2. activeNodes ordering (seed vs non-seed)
 * for recent Root Generation and Direct Hit projects.
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const COORD_FIELDS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'];

function auditGraph(graphData, label) {
  const g = typeof graphData === 'string' ? JSON.parse(graphData) : graphData;
  if (!g || !Array.isArray(g.nodes)) {
    console.log(`  [${label}] graphData has no nodes array.`);
    return;
  }
  console.log(`  [${label}] Total nodes: ${g.nodes.length}, Total links: ${(g.links || []).length}`);
  
  let coordHitCount = 0;
  const coordSample = [];
  g.nodes.forEach((node, i) => {
    const found = COORD_FIELDS.filter(f => node[f] !== undefined && node[f] !== null);
    if (found.length > 0) {
      coordHitCount++;
      if (coordSample.length < 3) {
        const sample = { id: node.id, type: node.type };
        found.forEach(f => sample[f] = node[f]);
        coordSample.push(sample);
      }
    }
  });
  
  if (coordHitCount === 0) {
    console.log(`  [${label}] ✅ CLEAN — No D3 coordinate fields found in any node.`);
  } else {
    console.log(`  [${label}] ❌ DIRTY — ${coordHitCount}/${g.nodes.length} nodes carry D3 coordinates.`);
    console.log(`  [${label}] Sample dirty nodes:`, JSON.stringify(coordSample, null, 2));
  }
}

function auditActiveNodes(activeNodes, seedArtists, label) {
  if (!activeNodes || !Array.isArray(activeNodes) || activeNodes.length === 0) {
    console.log(`  [${label}] activeNodes: EMPTY ARRAY`);
    return;
  }
  const seeds = (seedArtists || '').split('::').map(s => s.trim().toLowerCase()).filter(Boolean);
  const firstNode = activeNodes[0]?.toLowerCase() || '';
  const isSeedFirst = seeds.some(s => firstNode.includes(s) || s.includes(firstNode));
  
  console.log(`  [${label}] activeNodes count: ${activeNodes.length}`);
  console.log(`  [${label}] Seed artists: ${JSON.stringify(seeds)}`);
  console.log(`  [${label}] activeNodes[0]: "${activeNodes[0]}" — ${isSeedFirst ? '✅ IS seed' : '❌ NOT seed (scrambled)'}`);
  console.log(`  [${label}] First 5 active nodes: ${JSON.stringify(activeNodes.slice(0, 5))}`);
}

async function run() {
  // ── 1. Fetch the most recent user projects (Root Gen vs Direct Hit) ──────
  console.log('\n════════════════════════════════════════');
  console.log('SCANNING USER PROJECTS');
  console.log('════════════════════════════════════════');
  
  // Get all users and their projects
  const usersSnap = await db.collection('users').limit(5).get();
  let projectsScanned = 0;
  const projectsToAudit = [];
  
  for (const userDoc of usersSnap.docs) {
    const projectsSnap = await db.collection('users').doc(userDoc.id).collection('projects')
      .orderBy('updatedAt', 'desc').limit(4).get();
    
    for (const projectDoc of projectsSnap.docs) {
      const data = projectDoc.data();
      if (data.graphData && data.status === 'completed') {
        projectsToAudit.push({ id: projectDoc.id, userId: userDoc.id, data });
        if (projectsToAudit.length >= 6) break;
      }
    }
    if (projectsToAudit.length >= 6) break;
  }
  
  console.log(`Found ${projectsToAudit.length} completed projects to audit.\n`);
  
  for (const { id, userId, data } of projectsToAudit) {
    const isDirectHit = data.name?.toLowerCase().includes('direct hit') || 
                        data.projectType === 'direct_hit';
    const label = isDirectHit ? 'DIRECT HIT' : 'ROOT GEN';
    console.log(`\n── Project: ${id} (${label}) ──`);
    console.log(`  Name: ${data.name || 'Untitled'}`);
    console.log(`  Seeds: ${data.seedArtists}`);
    console.log(`  Status: ${data.status}`);
    auditGraph(data.graphData, 'Project graphData');
    auditActiveNodes(data.activeNodes, data.seedArtists, 'Project activeNodes');
  }

  // ── 2. Inspect artist cache docs ────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('SCANNING ARTIST CACHE DOCS (graphData field)');
  console.log('════════════════════════════════════════');
  
  const artistsSnap = await db.collection('artists')
    .where('hasUniqueSpiderweb', '==', true)
    .limit(5).get();
  
  console.log(`Found ${artistsSnap.size} cached artist docs with unique spiderweb.\n`);
  for (const artistDoc of artistsSnap.docs) {
    const data = artistDoc.data();
    if (data.graphData) {
      console.log(`\n── Artist Cache: ${artistDoc.id} ──`);
      auditGraph(data.graphData, 'Artist cache graphData');
    }
  }

  // ── 3. Inspect sharedZcenes for coordinate contamination ────────────────
  console.log('\n════════════════════════════════════════');
  console.log('SCANNING SHARED ZCENES');
  console.log('════════════════════════════════════════');
  
  const sharesSnap = await db.collection('sharedZcenes')
    .orderBy('createdAt', 'desc').limit(5).get();
  
  console.log(`Found ${sharesSnap.size} recent shared Zcenes.\n`);
  for (const shareDoc of sharesSnap.docs) {
    const data = shareDoc.data();
    console.log(`\n── Share: ${shareDoc.id} ──`);
    console.log(`  Name: ${data.name}`);
    console.log(`  Seeds: ${data.seedArtists}`);
    console.log(`  Has seedImageUrl: ${!!data.seedImageUrl} ${data.seedImageUrl ? '→ ' + data.seedImageUrl.substring(0, 60) + '...' : ''}`);
    if (data.graphData) {
      auditGraph(data.graphData, 'Share graphData');
    }
    auditActiveNodes(data.activeNodes, data.seedArtists, 'Share activeNodes');
  }

  console.log('\n════════════════════════════════════════');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('════════════════════════════════════════\n');
}

run().catch(console.error).finally(() => process.exit(0));

/**
 * Targeted Deep Audit — inspect exact project documents by known ID
 * Focus: Direct Hit (0NgoBID2KXy35gDzLtVD) and Root Gen (eQM61BjfJnzTsTVHH7Ry)
 * 
 * Prints:
 * 1. Full activeNodes array from both project docs
 * 2. First 5 node objects from graphData (showing which fields exist)
 * 3. Artist cache doc for "spaced-us" - activeNodes and graphData node structure
 * 4. The exact sharedZcene activeNodes arrays
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const COORD_FIELDS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'];

function printNodeSample(nodes, label, count = 5) {
  console.log(`\n  [${label}] Node sample (first ${count}):`);
  nodes.slice(0, count).forEach((n, i) => {
    const coordsPresent = COORD_FIELDS.filter(f => n[f] !== undefined && n[f] !== null);
    const coordStr = coordsPresent.length > 0
      ? `  COORDS: {${coordsPresent.map(f => `${f}:${n[f]}`).join(', ')}}`
      : '  coords: clean';
    console.log(`    [${i}] id="${n.id}" type=${n.type} group=${n.group}${coordStr}`);
  });
}

async function run() {
  const userId = 'ABpBVH7lMHgHIHJoAhP9DRkX8TK2'; // owner of these projects

  // ── Root Generation project ──────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('ROOT GENERATION PROJECT: eQM61BjfJnzTsTVHH7Ry');
  console.log('═══════════════════════════════════════════════');
  const rootRef = db.collection('users').doc(userId).collection('projects').doc('eQM61BjfJnzTsTVHH7Ry');
  const rootSnap = await rootRef.get();
  if (rootSnap.exists) {
    const d = rootSnap.data();
    console.log('Name:', d.name);
    console.log('seedArtists:', d.seedArtists);
    console.log('status:', d.status);
    console.log('activeNodes (full):', JSON.stringify(d.activeNodes));
    if (d.graphData) {
      const g = typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData;
      printNodeSample(g.nodes, 'Root Gen graphData nodes');
      // Check how many nodes have each coord field
      COORD_FIELDS.forEach(f => {
        const count = g.nodes.filter(n => n[f] !== undefined && n[f] !== null).length;
        if (count > 0) console.log(`  Field "${f}": present in ${count}/${g.nodes.length} nodes`);
      });
      if (!COORD_FIELDS.some(f => g.nodes.some(n => n[f] !== undefined))) {
        console.log('  → ALL D3 coordinate fields: ABSENT ✅');
      }
    }
  } else {
    console.log('  → Document does not exist under this userId, searching...');
    // Try to find it
    const allUsers = await db.collection('users').get();
    for (const u of allUsers.docs) {
      const p = await db.collection('users').doc(u.id).collection('projects').doc('eQM61BjfJnzTsTVHH7Ry').get();
      if (p.exists) { console.log(`  → Found under user: ${u.id}`); break; }
    }
  }

  // ── Direct Hit project ───────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('DIRECT HIT PROJECT: 0NgoBID2KXy35gDzLtVD');
  console.log('═══════════════════════════════════════════════');
  const dhRef = db.collection('users').doc(userId).collection('projects').doc('0NgoBID2KXy35gDzLtVD');
  const dhSnap = await dhRef.get();
  if (dhSnap.exists) {
    const d = dhSnap.data();
    console.log('Name:', d.name);
    console.log('seedArtists:', d.seedArtists);
    console.log('status:', d.status);
    console.log('activeNodes (full):', JSON.stringify(d.activeNodes));
    console.log('\nactiveNodes[0]:', d.activeNodes?.[0]);
    console.log('activeNodes[1]:', d.activeNodes?.[1]);
    console.log('activeNodes[2]:', d.activeNodes?.[2]);
    
    // WHERE IS SPACED-US in activeNodes?
    const spacedIndex = (d.activeNodes || []).findIndex(id =>
      id.toLowerCase().includes('spaced') || id.toLowerCase() === 'spaced-us'
    );
    console.log(`\n→ "spaced-us" appears at activeNodes[${spacedIndex}] (should be [0])`);
    
    if (d.graphData) {
      const g = typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData;
      console.log('\ngraphData.nodes[0]:', JSON.stringify(g.nodes[0]));
      console.log('graphData.nodes[1]:', JSON.stringify(g.nodes[1]));
      printNodeSample(g.nodes, 'Direct Hit graphData nodes');
      COORD_FIELDS.forEach(f => {
        const count = g.nodes.filter(n => n[f] !== undefined && n[f] !== null).length;
        if (count > 0) console.log(`  Field "${f}": present in ${count}/${g.nodes.length} nodes`);
      });
      if (!COORD_FIELDS.some(f => g.nodes.some(n => n[f] !== undefined))) {
        console.log('  → ALL D3 coordinate fields: ABSENT ✅');
      }
    }
  } else {
    console.log('  → Not found under userId', userId);
    // Search all users
    const allUsers = await db.collection('users').get();
    for (const u of allUsers.docs) {
      const p = await db.collection('users').doc(u.id).collection('projects').doc('0NgoBID2KXy35gDzLtVD').get();
      if (p.exists) {
        const d = p.data();
        console.log(`  → Found under user: ${u.id}`);
        console.log('  activeNodes (full):', JSON.stringify(d.activeNodes));
        const spacedIndex = (d.activeNodes || []).findIndex(id => id.toLowerCase().includes('spaced'));
        console.log(`  → "spaced-us" at activeNodes[${spacedIndex}]`);
        break;
      }
    }
  }

  // ── Spaced-US artist cache doc ───────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('ARTIST CACHE: spaced-us');
  console.log('═══════════════════════════════════════════════');
  const artistSnap = await db.collection('artists').doc('spaced-us').get();
  if (artistSnap.exists) {
    const d = artistSnap.data();
    console.log('isPrimarySeed:', d.isPrimarySeed);
    console.log('hasUniqueSpiderweb:', d.hasUniqueSpiderweb);
    console.log('dataIntegrityStatus:', d.dataIntegrityStatus);
    if (d.graphData) {
      const g = typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData;
      console.log('graphData.nodes[0]:', JSON.stringify(g.nodes[0]));
      console.log('graphData.nodes[1]:', JSON.stringify(g.nodes[1]));
      COORD_FIELDS.forEach(f => {
        const count = g.nodes.filter(n => n[f] !== undefined && n[f] !== null).length;
        if (count > 0) console.log(`  Field "${f}": present in ${count}/${g.nodes.length} nodes`);
      });
      if (!COORD_FIELDS.some(f => g.nodes.some(n => n[f] !== undefined))) {
        console.log('  → ALL D3 coordinate fields: ABSENT ✅');
      }
    }
  }

  // ── Shared Zcenes ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('DIRECT HIT SHARE: 0TQaVM0Ni0IRaefOAVyR');
  console.log('═══════════════════════════════════════════════');
  const dhShareSnap = await db.collection('sharedZcenes').doc('0TQaVM0Ni0IRaefOAVyR').get();
  if (dhShareSnap.exists) {
    const d = dhShareSnap.data();
    console.log('Name:', d.name);
    console.log('seedArtists:', d.seedArtists);
    console.log('activeNodes (full):', JSON.stringify(d.activeNodes));
    const spacedIndex = (d.activeNodes || []).findIndex(id => id.toLowerCase().includes('spaced'));
    console.log(`→ "spaced-us" at activeNodes[${spacedIndex}]`);
    console.log('seedImageUrl:', d.seedImageUrl || '(none)');
    if (d.graphData) {
      const g = typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData;
      console.log('graphData.nodes[0]:', JSON.stringify(g.nodes[0]));
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('ROOT GEN SHARE: wTZk2abEmWsfDonBio8D');
  console.log('═══════════════════════════════════════════════');
  const rgShareSnap = await db.collection('sharedZcenes').doc('wTZk2abEmWsfDonBio8D').get();
  if (rgShareSnap.exists) {
    const d = rgShareSnap.data();
    console.log('Name:', d.name);
    console.log('seedArtists:', d.seedArtists);
    console.log('activeNodes (full):', JSON.stringify(d.activeNodes));
    const spacedIndex = (d.activeNodes || []).findIndex(id => id.toLowerCase().includes('spaced'));
    console.log(`→ "spaced-us" at activeNodes[${spacedIndex}]`);
    console.log('seedImageUrl:', d.seedImageUrl || '(none)');
  }
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════\n');
}

run().catch(console.error).finally(() => process.exit(0));

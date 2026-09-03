/**
 * Split-Brain Audit — READ ONLY
 * Fetches artists/buggin and artists/buggin-us to prove the fractured state.
 * Outputs: exact fields present, synthesisRationale location, graphData node count.
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function printDocSchema(label, data) {
  if (!data) { console.log(`  → ${label}: DOES NOT EXIST`); return; }
  const fields = Object.keys(data);
  console.log(`\n  Fields present (${fields.length}): ${fields.join(', ')}`);

  // graphData analysis
  if (data.graphData) {
    try {
      const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      const nodeCount = g?.nodes?.length ?? 0;
      const linkCount = g?.links?.length ?? 0;
      const nodeTypes = [...new Set((g?.nodes || []).map(n => n.type || 'artist'))].join(', ');
      console.log(`  graphData: PRESENT — nodes=${nodeCount}, links=${linkCount}, types=[${nodeTypes}]`);
      if (nodeCount === 0) console.log(`  ⚠️  graphData contains ZERO nodes — this is an empty stub topology!`);
    } catch(e) {
      console.log(`  graphData: PARSE ERROR — ${e.message}`);
    }
  } else {
    console.log(`  graphData: NULL/ABSENT`);
  }

  // detailsCache analysis
  if (data.detailsCache) {
    try {
      const dc = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
      const dcFields = typeof dc === 'object' && dc !== null ? Object.keys(dc).join(', ') : typeof dc;
      const bioLen = (dc?.summary || dc?.bio || '').length;
      const hasImage = !!(dc?.imageUrl);
      const genre = dc?.details?.genre || '(missing)';
      console.log(`  detailsCache: PRESENT — fields=[${dcFields}]`);
      console.log(`    bio length=${bioLen}, hasImageUrl=${hasImage}, genre="${genre}"`);
    } catch(e) {
      console.log(`  detailsCache: PARSE ERROR — ${e.message}`);
    }
  } else {
    console.log(`  detailsCache: NULL/ABSENT`);
  }

  // synthesisRationale at root level
  if (data.synthesisRationale) {
    const snip = data.synthesisRationale.substring(0, 80).replace(/\n/g, ' ');
    console.log(`  synthesisRationale (root): PRESENT — "${snip}..."`);
  } else {
    console.log(`  synthesisRationale (root): NULL/ABSENT`);
  }

  // isPrimarySeed / hasUniqueSpiderweb (used by validateCacheEntry)
  console.log(`  isPrimarySeed: ${data.isPrimarySeed}`);
  console.log(`  hasUniqueSpiderweb: ${data.hasUniqueSpiderweb}`);
  console.log(`  dataIntegrityStatus: ${data.dataIntegrityStatus}`);
  console.log(`  cacheKey: ${data.cacheKey}`);
  console.log(`  artistId: ${data.artistId}`);
  console.log(`  isDeep: ${data.isDeep}`);
  console.log(`  cacheVersion: ${data.cacheVersion}`);
  console.log(`  cachedAt: ${data.cachedAt?.toDate?.() || data.cachedAt}`);
}

async function run() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('SPLIT-BRAIN AUDIT — artists/buggin (raw seed doc)');
  console.log('════════════════════════════════════════════════════════');
  const bugginSnap = await db.collection('artists').doc('buggin').get();
  if (bugginSnap.exists) {
    printDocSchema('buggin', bugginSnap.data());
  } else {
    console.log('  → artists/buggin: DOES NOT EXIST');
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('SPLIT-BRAIN AUDIT — artists/buggin-us (canonical slug doc)');
  console.log('════════════════════════════════════════════════════════');
  const bugginUsSnap = await db.collection('artists').doc('buggin-us').get();
  if (bugginUsSnap.exists) {
    printDocSchema('buggin-us', bugginUsSnap.data());
  } else {
    console.log('  → artists/buggin-us: DOES NOT EXIST');
  }

  // Cross-reference: validateCacheEntry simulation
  console.log('\n════════════════════════════════════════════════════════');
  console.log('VALIDATION SIMULATION — what validateCacheEntry() sees for buggin-us');
  console.log('════════════════════════════════════════════════════════');
  if (bugginUsSnap.exists) {
    const d = bugginUsSnap.data();
    // Simulate App.tsx L930
    const check1 = !d.graphData || d.isPrimarySeed === false || d.hasUniqueSpiderweb === false;
    console.log(`  [CHECK 1] graphData missing OR isPrimarySeed=false OR hasUniqueSpiderweb=false → FAIL=${check1}`);
    // Simulate App.tsx L936
    if (d.graphData) {
      const g = typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData;
      const check2 = !g || !g.nodes || g.nodes.length === 0;
      console.log(`  [CHECK 2] graphData nodes empty → FAIL=${check2}`);
    }
    // Simulate App.tsx L970
    const graphForRationale = d.graphData ? (typeof d.graphData === 'string' ? JSON.parse(d.graphData) : d.graphData) : {};
    const rationale = d.synthesisRationale || graphForRationale?.synthesisRationale;
    console.log(`  [CHECK 5] synthesisRationale present (from root OR graphData.synthesisRationale) → FOUND=${!!rationale}`);
    // detailsCache
    console.log(`  [CHECK 3] detailsCache present → ${!!d.detailsCache}`);
  }

  // Check for any other 'buggin*' docs that might indicate additional fragments
  console.log('\n════════════════════════════════════════════════════════');
  console.log('RANGE QUERY — all artists/ docs starting with "buggin"');
  console.log('════════════════════════════════════════════════════════');
  const rangeSnap = await db.collection('artists')
    .where('artistId', '>=', 'buggin')
    .where('artistId', '<=', 'buggin\uf8ff')
    .get();
  console.log(`  Range query returned ${rangeSnap.size} doc(s):`);
  rangeSnap.docs.forEach(d => {
    const data = d.data();
    console.log(`  Doc ID: "${d.id}" | artistId="${data.artistId}" | hasGraph=${!!(data.graphData)} | hasDetails=${!!(data.detailsCache)} | hasSynthesis=${!!(data.synthesisRationale)} | redirectTo=${data.redirectTo || 'none'}`);
  });

  console.log('\n════════════════════════════════════════════════════════');
  console.log('AUDIT COMPLETE');
  console.log('════════════════════════════════════════════════════════\n');
}

run().catch(console.error).finally(() => process.exit(0));

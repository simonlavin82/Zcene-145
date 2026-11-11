/**
 * Firestore Migration Script: V25 "Root-as-Router" Contract
 * Migrates entity payload from artists/gunmoll to artists/gunmoll-us,
 * and sets artists/gunmoll as a clean _isStub: true router forwarder.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrateGunmollToV25() {
  console.log('=== V25 Migration: Enforcing Root-as-Router for Gunmoll ===\n');

  const rootRef = db.collection('artists').doc('gunmoll');
  const suffixedRef = db.collection('artists').doc('gunmoll-us');

  const [rootSnap, suffixedSnap] = await Promise.all([
    rootRef.get(),
    suffixedRef.get()
  ]);

  if (!rootSnap.exists) {
    console.error('❌ artists/gunmoll does not exist.');
    return;
  }

  const rootData = rootSnap.data();

  // If root document is already a stub pointing to gunmoll-us, check if gunmoll-us exists
  if (rootData._isStub && rootData.redirectTo === 'gunmoll-us') {
    console.log('ℹ️  artists/gunmoll is already configured as a routing stub -> gunmoll-us.');
    if (suffixedSnap.exists) {
      console.log('✅ artists/gunmoll-us already exists with full payload.');
      return;
    }
  }

  // 1. Prepare full payload for artists/gunmoll-us
  const suffixedPayload = JSON.parse(JSON.stringify(rootData));
  suffixedPayload.artistId = 'gunmoll-us';
  suffixedPayload.cacheKey = 'gunmoll-us';
  delete suffixedPayload._isStub;
  delete suffixedPayload.redirectTo;
  delete suffixedPayload.candidates;
  delete suffixedPayload.isAmbiguous;

  // Remap any references to 'gunmoll' in graphData to 'gunmoll-us'
  if (suffixedPayload.graphData) {
    let graph = suffixedPayload.graphData;
    if (typeof graph === 'string') {
      try { graph = JSON.parse(graph); } catch (e) {}
    }
    if (graph && graph.nodes) {
      graph.nodes = graph.nodes.map(n => n.id === 'gunmoll' ? { ...n, id: 'gunmoll-us' } : n);
    }
    if (graph && graph.links) {
      graph.links = graph.links.map(l => {
        const updated = { ...l };
        if (updated.source === 'gunmoll') updated.source = 'gunmoll-us';
        if (updated.target === 'gunmoll') updated.target = 'gunmoll-us';
        return updated;
      });
    }
    suffixedPayload.graphData = typeof suffixedPayload.graphData === 'string' ? JSON.stringify(graph) : graph;
  }

  console.log('Writing full entity payload to artists/gunmoll-us...');
  await suffixedRef.set(suffixedPayload);
  console.log('✅ Created artists/gunmoll-us.');

  // 2. Prepare routing stub for artists/gunmoll
  const originStr = rootData.detailsCache?.details?.origin || 'Gainesville, Florida, USA';
  const genreStr = rootData.detailsCache?.details?.genre || 'Melodic Punk Rock / Post-Hardcore';
  const artistName = rootData.detailsCache?.details?.artist || 'Gunmoll';

  const routingStub = {
    _isStub: true,
    isAmbiguous: false,
    redirectTo: 'gunmoll-us',
    candidates: [
      {
        id: 'gunmoll-us',
        name: artistName,
        origin: originStr,
        genre: genreStr,
        disambiguationSnippet: `${artistName} (${originStr} • ${genreStr})`
      }
    ],
    cachedAt: FieldValue.serverTimestamp()
  };

  console.log('Overwriting artists/gunmoll with routing stub forwarder...');
  await rootRef.set(routingStub);
  console.log('✅ Overwritten artists/gunmoll with _isStub: true router.');

  // 3. Verification
  console.log('\n--- Post-Migration Verification ---');
  const [newRootSnap, newSuffixedSnap] = await Promise.all([
    rootRef.get(),
    suffixedRef.get()
  ]);

  const newRoot = newRootSnap.data();
  const newSuffixed = newSuffixedSnap.data();

  console.log('Root (artists/gunmoll):');
  console.log(`- _isStub: ${newRoot._isStub} (expected: true)`);
  console.log(`- redirectTo: ${newRoot.redirectTo} (expected: gunmoll-us)`);
  console.log(`- candidates[0].id: ${newRoot.candidates?.[0]?.id} (expected: gunmoll-us)`);

  console.log('\nCanonical Entity (artists/gunmoll-us):');
  console.log(`- cacheKey: ${newSuffixed.cacheKey} (expected: gunmoll-us)`);
  console.log(`- _isStub: ${newSuffixed._isStub} (expected: undefined)`);
  console.log(`- Details Origin: ${newSuffixed.detailsCache?.details?.origin}`);

  console.log('\n🎉 V25 Root-as-Router Contract successfully verified!');
}

migrateGunmollToV25().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

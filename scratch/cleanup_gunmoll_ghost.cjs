/**
 * Firestore Cleanup Script: Purge gunmoll-jp Ghost and Restore Canonical gunmoll
 * 
 * Context:
 * Due to the pre-V24 manual override vulnerability, an unverified Japanese jazz
 * stub was minted for "gunmoll", redirecting to "gunmoll-jp". The background
 * worker correctly populated real Gainesville, FL punk rock data, but stored it
 * under the poisoned doc ID "artists/gunmoll-jp".
 * 
 * This script:
 * 1. Fetches "artists/gunmoll-jp" (containing real Florida punk data) and "artists/gunmoll" (poisoned stub).
 * 2. Remaps all occurrences of "gunmoll-jp" to canonical "gunmoll" (in doc root, seedArtists, and graphData nodes/links).
 * 3. Strips all stub fields (_isStub, redirectTo, candidates, isAmbiguous).
 * 4. Overwrites "artists/gunmoll" with the canonical, fully populated artist document.
 * 5. Deletes the rogue "artists/gunmoll-jp" document.
 * 6. Performs sanity checks to verify database integrity.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function purgeGunmollGhost() {
  console.log('=== Firestore Cleanup: Purge gunmoll-jp Ghost ===\n');

  const gunmollRef = db.collection('artists').doc('gunmoll');
  const gunmollJpRef = db.collection('artists').doc('gunmoll-jp');

  const [gunmollSnap, gunmollJpSnap] = await Promise.all([
    gunmollRef.get(),
    gunmollJpRef.get()
  ]);

  if (!gunmollJpSnap.exists) {
    console.log('ℹ️  artists/gunmoll-jp does not exist. Nothing to migrate.');
    if (gunmollSnap.exists && gunmollSnap.data().redirectTo === 'gunmoll-jp') {
      console.log('⚠️  artists/gunmoll points to a nonexistent gunmoll-jp stub. Deleting broken stub...');
      await gunmollRef.delete();
      console.log('✅ Deleted orphaned stub artists/gunmoll.');
    }
    return;
  }

  const jpData = gunmollJpSnap.data();
  console.log('Found artists/gunmoll-jp data:');
  console.log(`- Artist Name: ${jpData.detailsCache?.details?.artist || 'Unknown'}`);
  console.log(`- Origin: ${jpData.detailsCache?.details?.origin || 'Unknown'}`);
  console.log(`- Genre: ${jpData.detailsCache?.details?.genre || 'Unknown'}`);
  console.log(`- Nodes in graphData: ${jpData.graphData?.nodes?.length || 0}`);
  console.log(`- Links in graphData: ${jpData.graphData?.links?.length || 0}`);

  // Deep-clone and sanitize data
  const canonicalData = JSON.parse(JSON.stringify(jpData));

  // 1. Root-level key remapping
  canonicalData.artistId = 'gunmoll';
  canonicalData.cacheKey = 'gunmoll';

  // 2. Remove stub fields
  delete canonicalData._isStub;
  delete canonicalData.redirectTo;
  delete canonicalData.candidates;
  delete canonicalData.isAmbiguous;

  // 3. Remap seedArtists array
  if (Array.isArray(canonicalData.seedArtists)) {
    canonicalData.seedArtists = canonicalData.seedArtists.map(s => (s === 'gunmoll-jp' ? 'gunmoll' : s));
  }

  // 4. Remap graphData nodes and links
  if (canonicalData.graphData) {
    if (Array.isArray(canonicalData.graphData.nodes)) {
      canonicalData.graphData.nodes = canonicalData.graphData.nodes.map(node => {
        if (node.id === 'gunmoll-jp') {
          return { ...node, id: 'gunmoll' };
        }
        return node;
      });
    }

    if (Array.isArray(canonicalData.graphData.links)) {
      canonicalData.graphData.links = canonicalData.graphData.links.map(link => {
        const updated = { ...link };
        if (updated.source === 'gunmoll-jp') updated.source = 'gunmoll';
        if (updated.target === 'gunmoll-jp') updated.target = 'gunmoll';
        return updated;
      });
    }
  }

  // 5. Overwrite artists/gunmoll with canonical data
  console.log('\nWriting canonical data to artists/gunmoll...');
  await gunmollRef.set(canonicalData);
  console.log('✅ Overwritten artists/gunmoll with authentic data (Gainesville, FL).');

  // 6. Delete artists/gunmoll-jp
  console.log('Deleting rogue artists/gunmoll-jp document...');
  await gunmollJpRef.delete();
  console.log('✅ Successfully purged artists/gunmoll-jp.');

  // 7. Sanity verification
  console.log('\n--- Running Post-Cleanup Verification ---');
  const [newGunmollSnap, newGunmollJpSnap] = await Promise.all([
    gunmollRef.get(),
    gunmollJpRef.get()
  ]);

  console.log(`- artists/gunmoll-jp exists: ${newGunmollJpSnap.exists} (expected: false)`);
  console.log(`- artists/gunmoll exists: ${newGunmollSnap.exists} (expected: true)`);
  
  if (newGunmollSnap.exists) {
    const data = newGunmollSnap.data();
    console.log(`- _isStub: ${data._isStub} (expected: undefined)`);
    console.log(`- redirectTo: ${data.redirectTo} (expected: undefined)`);
    console.log(`- artistId: ${data.artistId} (expected: gunmoll)`);
    console.log(`- cacheKey: ${data.cacheKey} (expected: gunmoll)`);
    console.log(`- Origin: ${data.detailsCache?.details?.origin}`);
    console.log(`- Genre: ${data.detailsCache?.details?.genre}`);
  }

  console.log('\n🎉 Cleanup successfully completed! Zero ghost stubs remain.');
}

purgeGunmollGhost().catch(err => {
  console.error('❌ Error executing cleanup script:', err);
  process.exit(1);
});

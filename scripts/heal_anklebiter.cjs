const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin with production service account
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  console.log('=== Step 1: Inspect Current artists/anklebiter-us in Firestore ===');
  const docRef = db.collection('artists').doc('anklebiter-us');
  const snapBefore = await docRef.get();

  if (snapBefore.exists) {
    const data = snapBefore.data();
    console.log('Current Document Found:');
    console.log('  artistId:', data.artistId);
    console.log('  imageUrl:', data.imageUrl);
    console.log('  discography:', JSON.stringify(data.discography || data.detailsCache?.discography));
    console.log('  detailsCache.imageUrl:', data.detailsCache?.imageUrl);
  } else {
    console.log('Document artists/anklebiter-us does not exist.');
  }

  console.log('\n=== Step 2: Delete Corrupted artists/anklebiter-us to Force Fresh Synthesis ===');
  await docRef.delete();
  console.log('Deleted artists/anklebiter-us successfully.');

  console.log('\n=== Step 3: Trigger healOrphanedAsset Callable Function ===');
  // Invoke the Cloud Function via Firebase Functions Callable HTTPS endpoint
  const url = 'https://us-central1-zcene-production.cloudfunctions.net/healOrphanedAsset';
  const payload = {
    data: {
      entityId: 'anklebiter-us',
      entityType: 'artist',
      displayName: 'Anklebiter',
      countrySlug: 'us'
    }
  };

  console.log(`POST ${url}...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  console.log('HTTP Status:', response.status);
  console.log('Response Body:', responseText);

  if (!response.ok) {
    console.error('healOrphanedAsset invocation failed.');
    process.exit(1);
  }

  console.log('\n=== Step 4: Verify Newly Healed artists/anklebiter-us in Firestore ===');
  const snapAfter = await docRef.get();
  if (!snapAfter.exists) {
    console.error('ERROR: artists/anklebiter-us was not written to Firestore!');
    process.exit(1);
  }

  const healedData = snapAfter.data();
  const profile = healedData.detailsCache || healedData;
  console.log('Healed Document Verification:');
  console.log('  artistId:', healedData.artistId);
  console.log('  imageUrl:', profile.imageUrl);
  console.log('  discography:', JSON.stringify(profile.discography, null, 2));

  // Assertions
  const hasValidArtwork = typeof profile.imageUrl === 'string' && profile.imageUrl.startsWith('https://is1-ssl.mzstatic.com');
  const hasRealEP = (profile.discography || []).some(item => 
    item.albumName.toLowerCase().includes('to live and withstand')
  );
  const hasHallucinatedAlbum = (profile.discography || []).some(item =>
    item.albumName.toLowerCase().includes('to live and die in new england')
  );

  console.log('\n=== Architecture V37 Ground-Truth Assertions ===');
  console.log('1. Authentic 600x600 iTunes Artwork:', hasValidArtwork ? 'PASS ✅' : 'FAIL ❌ (' + profile.imageUrl + ')');
  console.log('2. Ground-Truth EP "To Live and Withstand":', hasRealEP ? 'PASS ✅' : 'FAIL ❌');
  console.log('3. Zero Hallucinated "To Live and Die in New England":', !hasHallucinatedAlbum ? 'PASS ✅ (Eliminated)' : 'FAIL ❌ (Hallucination still present!)');

  if (!hasValidArtwork || !hasRealEP || hasHallucinatedAlbum) {
    console.error('\n❌ Architectural validation failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 SUCCESS: artists/anklebiter-us is 100% verified and grounded in production Firestore!');
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});

// scripts/sanitize_radiohead_stub.cjs
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function sanitizeRadioheadStub() {
  const docRef = db.collection('artists').doc('radiohead');
  
  console.log('Inspecting current artists/radiohead document...');
  const beforeSnap = await docRef.get();
  if (beforeSnap.exists) {
    console.log('Current fields:', Object.keys(beforeSnap.data() || {}));
  } else {
    console.log('Document does not currently exist.');
  }

  console.log('Sanitizing artists/radiohead to lean Rule 6 redirect pointer...');
  await docRef.set({
    _isStub: true,
    redirectTo: 'radiohead-gb',
    cacheKey: 'radiohead',
    artistId: 'radiohead',
    cacheVersion: 4,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: false });

  const afterSnap = await docRef.get();
  console.log('SUCCESS: Sanitized artists/radiohead payload:');
  console.log(JSON.stringify(afterSnap.data(), null, 2));
}

sanitizeRadioheadStub()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error sanitizing stub:', err);
    process.exit(1);
  });

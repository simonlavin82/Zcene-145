// scripts/purge_turnstile_jit_misfires.cjs
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Targets specified by the user:
// flatspot, scowl-us, drain-us, pop-wig, jesus-piece-us, epitaph, sunami-us, zulu-us, roadrunner, century
const TARGET_ARTISTS = [
  'scowl-us',
  'drain-us',
  'jesus-piece-us',
  'sunami-us',
  'zulu-us',
  'turnstile-us',
  'century' // In case it was healed as artist
];

const TARGET_LABELS = [
  'flatspot',
  'pop-wig',
  'epitaph',
  'roadrunner',
  'century'
];

async function purgeTurnstileMisfires(dryRun = true) {
  console.log(`\n======================================================`);
  console.log(`Turnstile JIT Misfire Purge (Mode: ${dryRun ? 'DRY-RUN' : 'LIVE PURGE'})`);
  console.log(`======================================================\n`);

  const docsToDelete = [];

  // 1. Check targeted artists
  for (const id of TARGET_ARTISTS) {
    const docRef = db.collection('artists').doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data();
      // Purge if healed by JIT
      if (data?._healedBy === 'JIT_Asset_Healer_V22') {
        console.log(`[FLAGGED ARTIST] artists/${id} (healed by JIT_Asset_Healer_V22)`);
        docsToDelete.push(docRef);
      } else {
        console.log(`[SKIPPED ARTIST] artists/${id} (natively created / not flagged: _healedBy=${data?._healedBy})`);
      }
    }
  }

  // 2. Check targeted labels
  for (const id of TARGET_LABELS) {
    const docRef = db.collection('labels').doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data();
      if (data?._healedBy === 'JIT_Asset_Healer_V22') {
        console.log(`[FLAGGED LABEL] labels/${id} (healed by JIT_Asset_Healer_V22)`);
        docsToDelete.push(docRef);
      } else {
        console.log(`[SKIPPED LABEL] labels/${id} (natively created / not flagged: _healedBy=${data?._healedBy})`);
      }
    }
  }

  // 3. Check adminLedger/system/jitHeals for false-alarm receipts
  const receiptsQuery = await db.collection('adminLedger').doc('system').collection('jitHeals').get();
  console.log(`\nFound ${receiptsQuery.size} total receipt(s) in adminLedger/system/jitHeals.`);
  
  const receiptsToDelete = [];
  receiptsQuery.docs.forEach(doc => {
    const data = doc.data();
    const entityId = data?.entityId;
    if (
      TARGET_ARTISTS.includes(entityId) ||
      TARGET_LABELS.includes(entityId) ||
      entityId === 'turnstile' ||
      entityId === 'turnstile-us'
    ) {
      console.log(`[FLAGGED RECEIPT] adminLedger/system/jitHeals/${doc.id} (Entity: ${entityId}, Cost: $${data?.costUsd})`);
      receiptsToDelete.push(doc.ref);
    }
  });

  const totalDocs = docsToDelete.length + receiptsToDelete.length;
  console.log(`\nScan summary: ${docsToDelete.length} entity doc(s), ${receiptsToDelete.length} ledger receipt(s). Total: ${totalDocs}`);

  if (totalDocs === 0) {
    console.log(`No matching documents found.\n`);
    return;
  }

  if (dryRun) {
    console.log(`\nDRY-RUN ONLY: 0 documents deleted.`);
    console.log(`To delete these documents, re-run with: node scripts/purge_turnstile_jit_misfires.cjs --execute\n`);
  } else {
    console.log(`\nExecuting batch delete for ${totalDocs} document(s)...`);
    const allRefs = [...docsToDelete, ...receiptsToDelete];
    for (let i = 0; i < allRefs.length; i += 400) {
      const chunk = allRefs.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    console.log(`SUCCESS: Permanently purged ${totalDocs} document(s).\n`);
  }
}

const isExecute = process.argv.includes('--execute');
purgeTurnstileMisfires(!isExecute)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Purge execution error:', err);
    process.exit(1);
  });

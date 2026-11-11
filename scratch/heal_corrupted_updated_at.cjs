const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function isStrictEmptyObject(val) {
  if (val === null || val === undefined) return false;
  if (typeof val !== 'object') return false;
  if (Array.isArray(val)) return false;
  if (val instanceof Date) return false;
  if (val instanceof Timestamp) return false;
  if (typeof val.toDate === 'function') return false;
  if (typeof val.seconds === 'number' || typeof val._seconds === 'number') return false;
  return Object.keys(val).length === 0;
}

async function migrate() {
  console.log('--- PHASE 1: PRE-MIGRATION SCAN ---');
  const snap = await db.collection('artists').get();
  const docsToHeal = [];

  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (isStrictEmptyObject(data.updatedAt)) {
      docsToHeal.push({
        id: docSnap.id,
        hasGraph: !!data.graphData,
        createdAt: data.createdAt
      });
    }
  });

  console.log(`Found ${docsToHeal.length} documents in /artists with corrupted updatedAt: {}`);
  if (docsToHeal.length === 0) {
    console.log('No documents require healing. Exiting.');
    return;
  }

  console.log('\n--- PHASE 2: ATOMIC BATCH WRITE (FieldValue.delete()) ---');
  const batch = db.batch();
  for (const item of docsToHeal) {
    const docRef = db.collection('artists').doc(item.id);
    batch.update(docRef, {
      updatedAt: FieldValue.delete()
    });
  }

  await batch.commit();
  console.log(`✅ Successfully committed batch update for ${docsToHeal.length} documents.`);

  console.log('\n--- PHASE 3: POST-MIGRATION VERIFICATION ---');
  let successfullyHealed = 0;
  let remainingCorrupted = 0;

  for (const item of docsToHeal) {
    const freshSnap = await db.collection('artists').doc(item.id).get();
    const freshData = freshSnap.data();
    
    if (freshData.updatedAt === undefined) {
      successfullyHealed++;
    } else {
      console.error(`❌ Doc ${item.id} still has updatedAt:`, freshData.updatedAt);
      remainingCorrupted++;
    }
  }

  console.log(`\nVerification Summary:`);
  console.log(`- Successfully healed: ${successfullyHealed}/${docsToHeal.length}`);
  console.log(`- Remaining corrupted: ${remainingCorrupted}`);

  // Re-verify the primary seed indecision-us explicitly
  const indecisionSnap = await db.collection('artists').doc('indecision-us').get();
  const indecisionData = indecisionSnap.data();
  console.log(`\n[Sanity Check: indecision-us]`);
  console.log(`- updatedAt exists? ${indecisionData.updatedAt !== undefined}`);
  console.log(`- createdAt: ${indecisionData.createdAt ? (indecisionData.createdAt.toDate ? indecisionData.createdAt.toDate().toISOString() : indecisionData.createdAt) : 'MISSING'}`);
  console.log(`- hasUniqueSpiderweb: ${indecisionData.hasUniqueSpiderweb}`);
  console.log(`- isPrimarySeed: ${indecisionData.isPrimarySeed}`);
}

migrate().catch(console.error);

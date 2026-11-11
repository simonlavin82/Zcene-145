const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

initializeApp({
  credential: cert(serviceAccount)
});

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

function hasGraphData(data) {
  if (!data || !data.graphData) return false;
  if (typeof data.graphData === 'string') {
    return data.graphData.trim().length > 0 && data.graphData.trim() !== '{}';
  }
  if (typeof data.graphData === 'object') {
    return Array.isArray(data.graphData.nodes) ? data.graphData.nodes.length > 0 : Object.keys(data.graphData).length > 0;
  }
  return false;
}

async function audit() {
  console.log('Fetching all documents from /artists...');
  const snap = await db.collection('artists').get();
  console.log(`Total documents in /artists: ${snap.size}`);

  const affectedWithGraph = [];
  const affectedWithoutGraph = [];
  let validTimestampCount = 0;
  let missingUpdatedAtCount = 0;
  let nullUpdatedAtCount = 0;
  let stringUpdatedAtCount = 0;
  let otherUpdatedAtCount = 0;

  snap.forEach(docSnap => {
    const id = docSnap.id;
    const data = docSnap.data();
    const val = data.updatedAt;

    if (val === undefined) {
      missingUpdatedAtCount++;
    } else if (val === null) {
      nullUpdatedAtCount++;
    } else if (typeof val === 'string') {
      stringUpdatedAtCount++;
    } else if (val instanceof Timestamp || typeof val?.toDate === 'function' || typeof val?.seconds === 'number' || typeof val?._seconds === 'number') {
      validTimestampCount++;
    } else if (isStrictEmptyObject(val)) {
      if (hasGraphData(data)) {
        affectedWithGraph.push({
          id,
          artistId: data.artistId || id,
          isPrimarySeed: data.isPrimarySeed,
          hasUniqueSpiderweb: data.hasUniqueSpiderweb,
          createdAt: data.createdAt,
          graphDataType: typeof data.graphData,
          graphDataLength: typeof data.graphData === 'string' ? data.graphData.length : JSON.stringify(data.graphData).length
        });
      } else {
        affectedWithoutGraph.push({
          id,
          artistId: data.artistId || id,
          isDeep: data.isDeep,
          createdAt: data.createdAt
        });
      }
    } else {
      otherUpdatedAtCount++;
    }
  });

  console.log('\n--- AUDIT RESULTS FOR /artists ---');
  console.log(`Total documents scanned: ${snap.size}`);
  console.log(`Valid Timestamp updatedAt: ${validTimestampCount}`);
  console.log(`Missing (undefined) updatedAt: ${missingUpdatedAtCount}`);
  console.log(`Null updatedAt: ${nullUpdatedAtCount}`);
  console.log(`String updatedAt: ${stringUpdatedAtCount}`);
  console.log(`Other updatedAt: ${otherUpdatedAtCount}`);
  console.log(`Corrupted ({}) updatedAt WITH graphData (Target Group): ${affectedWithGraph.length}`);
  console.log(`Corrupted ({}) updatedAt WITHOUT graphData: ${affectedWithoutGraph.length}`);

  console.log('\nTarget Group (Contains graphData AND updatedAt is strictly {}):');
  affectedWithGraph.forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.id}] (artistId: "${a.artistId}", isPrimarySeed: ${a.isPrimarySeed}, hasUniqueSpiderweb: ${a.hasUniqueSpiderweb})`);
  });

  if (affectedWithoutGraph.length > 0) {
    console.log('\nOther documents with corrupted updatedAt (no graphData):');
    affectedWithoutGraph.forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.id}] (artistId: "${a.artistId}", isDeep: ${a.isDeep})`);
    });
  }

  // Also check /labels collection as additional telemetry
  console.log('\nChecking /labels collection for corrupted updatedAt...');
  const labelsSnap = await db.collection('labels').get();
  const affectedLabels = [];
  labelsSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (isStrictEmptyObject(data.updatedAt)) {
      affectedLabels.push({
        id: docSnap.id,
        hasGraph: hasGraphData(data)
      });
    }
  });
  console.log(`Total documents in /labels: ${labelsSnap.size}`);
  console.log(`Corrupted ({}) updatedAt in /labels: ${affectedLabels.length}`);
  if (affectedLabels.length > 0) {
    affectedLabels.forEach((l, i) => {
      console.log(`  ${i + 1}. [${l.id}] (hasGraphData: ${l.hasGraph})`);
    });
  }
}

audit().catch(console.error);

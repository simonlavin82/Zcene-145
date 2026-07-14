// Inspect recent curation jobs in firestore to see if there are any failures or pending states
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  console.log("Fetching the 5 most recent curation jobs...");
  const snapshot = await db.collection('curationJobs')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  if (snapshot.empty) {
    console.log("No curation jobs found.");
    return;
  }

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\n=============================================`);
    console.log(`Job ID: ${doc.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Job Type: ${data.jobType}`);
    console.log(`Created At: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'N/A'}`);
    console.log(`Updated At: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'N/A'}`);
    console.log(`Artists: ${data.inputPayload?.artists}`);
    if (data.errorMessage) {
      console.log(`Error Message: ${data.errorMessage}`);
    }
    if (data.errorDetails) {
      console.log(`Error Details:`, JSON.stringify(data.errorDetails, null, 2));
    }
    if (data.result) {
      console.log(`Result: Graph Nodes: ${data.result.graphData?.nodes?.length || 0}, Links: ${data.result.graphData?.links?.length || 0}`);
      if (data.result.detailsCache) {
        try {
          const parsed = JSON.parse(data.result.detailsCache);
          console.log(`Details Cache Size: ${parsed.length}`);
        } catch (e) {
          console.log("Details cache not parseable as JSON.");
        }
      }
    }
    console.log(`=============================================`);
  });
}

inspect().catch(console.error);

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

async function inspect() {
  const jobId = 'job-1784136168919-sxi0lva5k';
  const snap = await db.collection('curationJobs').doc(jobId).get();
  const data = snap.data();
  if (data.result && data.result.detailsCache) {
    const parsed = JSON.parse(data.result.detailsCache);
    console.log(`detailsCache length: ${parsed.length}`);
    parsed.forEach(([name, details], idx) => {
      console.log(`\n[${idx + 1}/${parsed.length}] Artist: ${name}`);
      console.log(`  - summary length: ${details.summary?.length}`);
      console.log(`  - genre: ${details.details?.genre}`);
      console.log(`  - origin: ${details.details?.origin}`);
      console.log(`  - founded: ${details.details?.founded}`);
      console.log(`  - youtubeVideoId: ${details.youtubeVideoId}`);
      console.log(`  - youtubeSearchQuery: ${details.youtubeSearchQuery}`);
      console.log(`  - has groundings: ${!!details.groundingLinks?.length}`);
    });
  } else {
    console.log("No detailsCache found in result.");
  }
}

inspect().catch(console.error);

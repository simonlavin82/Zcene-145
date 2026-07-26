const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const fs = require('fs');

if (fs.existsSync('firebase-service-account.json')) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
}
admin.initializeApp();
const db = getFirestore();

async function main() {
  const snap = await db.collection('curationJobs').get();
  console.log(`Setting 24-hour TTL (expireAt) on ${snap.size} existing job documents...`);
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    });
  }
  if (snap.size > 0) {
    await batch.commit();
    console.log("✔ Successfully updated existing jobs with TTL expireAt!");
  } else {
    console.log("No existing jobs to update.");
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (fs.existsSync('firebase-service-account.json')) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
}
admin.initializeApp();
const db = getFirestore();

async function main() {
  const snap = await db.collection('curationJobs').get();
  console.log(`Total documents in /curationJobs: ${snap.size}`);
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`- Job ID: ${doc.id} | Status: ${data.status} | Created: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'N/A'}`);
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});

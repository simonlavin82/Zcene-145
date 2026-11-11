const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

initializeApp({
  projectId: "zcene-production" // Matches emulator default
});
const db = getFirestore();

async function getJob() {
  const doc = await db.collection('curationJobs').doc('job-1787326178963-owuz9cspd').get();
  console.log(JSON.stringify(doc.data(), null, 2));
}

getJob().catch(console.error);

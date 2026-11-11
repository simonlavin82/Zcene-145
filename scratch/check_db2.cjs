const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'zcene-app' });

async function check() {
  const db = getFirestore();
  const artists = await db.collection('artists').doc('turnstile-global').get();
  const labels = await db.collection('labels').doc('turnstile-global').get();
  console.log("Artists exists:", artists.exists);
  console.log("Labels exists:", labels.exists);
  process.exit(0);
}
check();

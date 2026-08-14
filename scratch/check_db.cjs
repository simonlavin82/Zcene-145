const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'zcene-app' });

async function check() {
  const db = getFirestore();
  const doc = await db.collection('artists').doc('turnstile-global').get();
  console.log("Exists:", doc.exists);
  if (doc.exists) console.log("Data:", doc.data());
  process.exit(0);
}
check();

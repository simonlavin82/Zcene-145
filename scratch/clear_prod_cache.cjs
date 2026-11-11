const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'zcene-production' });

async function clear() {
  const db = getFirestore();
  await db.collection('artists').doc('turnstile-global').delete();
  console.log("Deleted turnstile-global from zcene-production");
  process.exit(0);
}
clear();

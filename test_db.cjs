const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function run() {
  const snap = await db.collection('sharedZcenes').doc('IPWdt5A3MDJ3e29TgAB1').get();
  console.log("sharedZcenes exists:", snap.exists);
  if (!snap.exists) {
    const pSnap = await db.collection('projects').doc('IPWdt5A3MDJ3e29TgAB1').get();
    console.log("projects exists:", pSnap.exists);
  }
}
run();

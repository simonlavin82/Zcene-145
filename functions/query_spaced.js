const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const docRef = db.collection('artists').doc('spaced-us');
  const doc = await docRef.get();
  console.log("EXISTS:", doc.exists);
  if (doc.exists) {
    const data = doc.data();
    console.log("HAS synthesisRationale:", !!data.synthesisRationale);
  }
  process.exit(0);
}

run();

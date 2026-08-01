const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-account.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
db.collection("projects").doc("IPWdt5A3MDJ3e29TgAB1").get().then(snap => {
  console.log("Exists:", snap.exists);
  if (snap.exists) console.log(snap.data());
  process.exit(0);
}).catch(console.error);

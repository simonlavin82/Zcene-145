const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require(path.resolve(__dirname, "../firebase-service-account.json"));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkOtherUsers() {
  const uids = [
    { uid: "09eSHN1MgebQrExGJf8AbIAJUmZ2", email: "inkenmaria@icloud.com" },
    { uid: "fty4GC4Qiya6KH7uje3ANyzjJAo2", email: "25g0123@aghs.gakusen.ac.jp" },
    { uid: "pRB46EE704SUkw13qI941CGOqZD2", email: "liamnugent75@gmail.com" },
    { uid: "pZU8ggh2WUbSmsfh0xtJloXxXuF2", email: "liltatoo854@gmail.com" }
  ];

  for (const u of uids) {
    const docRef = db.collection("users").doc(u.uid);
    const snap = await docRef.get();
    console.log(`User ${u.email} (${u.uid}): doc exists? ${snap.exists}`);
    const subcols = await docRef.listCollections();
    console.log(`  Subcollections:`, subcols.map(c => c.id));
  }
}

checkOtherUsers().catch(console.error);


const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp();
const db = getFirestore();

db.collection('artists').limit(1).get().then(snap => {
  console.log("Connected to: ", snap.docs.length > 0 ? snap.docs[0].id : "empty");
}).catch(console.error);

const admin = require('firebase-admin');
const config = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(config) });
const db = admin.firestore();
db.collection('curationJobs').orderBy('createdAt', 'desc').limit(5).get().then(snap => {
  if (snap.empty) { console.log("No jobs found"); return; }
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Job: ${doc.id} | createdAt: ${data.createdAt?.toDate().toISOString()} | status: ${data.status}`);
  });
}).catch(console.error);

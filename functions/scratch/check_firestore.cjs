const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({
  projectId: 'zcene-production'
});
const db = getFirestore();
async function run() {
  const users = await db.collection('users').where('email', '==', 'zcene.online@gmail.com').get();
  const uid = users.docs[0].id;
  console.log("UID:", uid);
  const projects = await db.collection('users').doc(uid).collection('projects').orderBy('updatedAt', 'desc').limit(3).get();
  projects.forEach(p => {
    console.log(p.id, p.data().name, p.data().seedImageUrl, p.data().coverImage);
  });
}
run().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  const docRef = doc(db, 'artists', 'anberlin');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    console.log("seedArtists:", data.seedArtists);
    console.log("graphData:", JSON.stringify(JSON.parse(data.graphData), null, 2));
    console.log("detailsCache:", JSON.stringify(JSON.parse(data.detailsCache), null, 2));
  } else {
    console.log("No doc found for anberlin");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  console.log("Querying artists collection...");
  try {
    const colRef = collection(db, 'artists');
    const snap = await getDocs(colRef);
    console.log(`Total documents found in 'artists' collection: ${snap.size}`);
    snap.forEach(doc => {
      const data = doc.data();
      let nodeCount = 0;
      if (data.graphData) {
        try {
          const g = JSON.parse(data.graphData);
          nodeCount = g.nodes?.length || 0;
        } catch (e) {}
      }
      console.log(`- Document ID: "${doc.id}", seedArtists: "${data.seedArtists}", node count: ${nodeCount}`);
    });
  } catch (e) {
    console.error("Error querying collection:", e);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

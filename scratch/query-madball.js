import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkDoc(id) {
  console.log(`Checking cache for: "${id}"`);
  try {
    const docRef = doc(db, 'artists', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      console.log(`Document "${id}" exists!`);
      console.log("Keys present:", Object.keys(data));
      console.log("seedArtists:", data.seedArtists);
      console.log("cacheVersion:", data.cacheVersion);
      console.log("detailsCache type:", typeof data.detailsCache);
      console.log("detailsCache value:", JSON.stringify(data.detailsCache, null, 2));
      if (data.graphData) {
        try {
          const graph = JSON.parse(data.graphData);
          console.log("graphData node count:", graph.nodes?.length);
          console.log("graphData link count:", graph.links?.length);
        } catch (e) {
          console.log("Failed to parse graphData:", e.message);
        }
      }
    } else {
      console.log(`Document "${id}" does NOT exist.`);
    }
  } catch (e) {
    console.error(`Error reading doc "${id}":`, e);
  }
}

async function main() {
  await checkDoc('madball-united-states');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

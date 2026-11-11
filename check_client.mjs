import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function run() {
  const ref = doc(db, 'projects', 'RIPl77K9nq5B6z49QnWP');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    console.log("PROJECT SEEDS:", data.seedArtists);
    const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    const artists = g.nodes.filter(n => n.type === 'artist');
    const aiArtists = artists.filter(n => !data.seedArtists.includes(n.id) && !data.seedArtists.includes(n.id.replace('-usa', '')));
    console.log(`Nodes total: ${g.nodes.length}`);
    console.log(`AI Artists generated: ${aiArtists.length}`);
    console.log(`IDs:`, aiArtists.map(a => a.id));
  } else {
    console.log("Not found in emulator via client SDK!");
  }
}
run().catch(console.error).finally(() => process.exit(0));

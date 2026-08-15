const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

initializeApp({ projectId: "demo-zcene-production" });
const db = getFirestore();

async function run() {
  const doc = await db.collection('projects').doc('RIPl77K9nq5B6z49QnWP').get();
  if (doc.exists) {
    const data = doc.data();
    console.log("FOUND in demo-zcene-production!");
    console.log("PROJECT SEEDS:", data.seedArtists);
    const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    const artists = g.nodes.filter(n => n.type === 'artist');
    const aiArtists = artists.filter(n => !data.seedArtists.includes(n.id) && !data.seedArtists.includes(n.id.replace('-usa', '')));
    console.log(`Nodes total: ${g.nodes.length}`);
    console.log(`AI Artists generated: ${aiArtists.length}`);
    console.log(`IDs:`, aiArtists.map(a => a.id));
  } else {
    console.log("RIPl77K9nq5B6z49QnWP Not found in demo-zcene-production!");
  }
}
run().catch(console.error).finally(() => process.exit(0));

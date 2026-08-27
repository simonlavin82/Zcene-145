import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

async function main() {
  try {
    const origProjDoc = await db.collection('projects').doc('lKQ64u4tIWyF2V8qS5Te').get();
    const cachedProjDoc = await db.collection('projects').doc('UPCIWqZGeemgj8gzSPQV').get();
    const cacheArtistDoc = await db.collection('artists').doc('spaced-us').get();

    const origData = origProjDoc.data() || {};
    const cachedData = cachedProjDoc.data() || {};
    const artistData = cacheArtistDoc.data() || {};

    const origGraph = typeof origData.graphData === 'string' ? JSON.parse(origData.graphData) : (origData.graphData || {});
    const cachedGraph = typeof cachedData.graphData === 'string' ? JSON.parse(cachedData.graphData) : (cachedData.graphData || {});
    const cacheGraphStr = typeof artistData.graphData === 'string' ? JSON.parse(artistData.graphData) : (artistData.graphData || {});

    console.log("=== ARTISTS CACHE (spaced-us) ===");
    console.log("Has synthesisRationale at root level:", !!artistData.synthesisRationale);
    console.log("Has synthesisRationale inside graphData:", !!cacheGraphStr.synthesisRationale);
    
    console.log("\n=== PROJECT: ORIGINAL (lKQ64u4tIWyF2V8qS5Te) ===");
    console.log("synthesisRationale:", !!origGraph.synthesisRationale);
    console.log("Node count:", origGraph.nodes ? origGraph.nodes.length : 0);
    const origSeedNode = (origGraph.nodes || []).find(n => n.id === 'spaced-us' || n.id === 'spaced' || n.isSeed);
    console.log("Seed node ID:", origSeedNode ? origSeedNode.id : "Not Found");
    console.log("First edge:", JSON.stringify(origGraph.links ? origGraph.links[0] : null, null, 2));

    console.log("\n=== PROJECT: CACHED (UPCIWqZGeemgj8gzSPQV) ===");
    console.log("synthesisRationale:", !!cachedGraph.synthesisRationale);
    console.log("Node count:", cachedGraph.nodes ? cachedGraph.nodes.length : 0);
    const cachedSeedNode = (cachedGraph.nodes || []).find(n => n.id === 'spaced-us' || n.id === 'spaced' || n.isSeed);
    console.log("Seed node ID:", cachedSeedNode ? cachedSeedNode.id : "Not Found");
    console.log("First edge:", JSON.stringify(cachedGraph.links ? cachedGraph.links[0] : null, null, 2));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

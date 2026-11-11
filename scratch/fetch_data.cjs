const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount), projectId: "zcene-production" });
}
const db = getFirestore();

async function main() {
  try {
    const cacheArtistDoc = await db.collection('artists').doc('spaced-us').get();
    const artistData = cacheArtistDoc.data() || {};
    const cacheGraphStr = typeof artistData.graphData === 'string' ? JSON.parse(artistData.graphData) : (artistData.graphData || {});

    const spacedNodes = cacheGraphStr.nodes.filter(n => n.id.includes('spaced'));
    const spacedLinks = cacheGraphStr.links.filter(l => 
        (typeof l.source === 'string' && l.source.includes('spaced')) || 
        (l.source?.id?.includes('spaced')) || 
        (typeof l.target === 'string' && l.target.includes('spaced')) ||
        (l.target?.id?.includes('spaced'))
    );

    console.log("CACHE ARTIST (spaced-us) nodes with 'spaced':", spacedNodes);
    console.log("CACHE ARTIST (spaced-us) links with 'spaced':", spacedLinks);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
main();

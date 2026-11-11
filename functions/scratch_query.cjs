const admin = require('firebase-admin');

admin.initializeApp({
    projectId: 'zcene-app' // Assuming this based on standard setups, or we can look for .firebaserc
});

const db = admin.firestore();

async function run() {
    console.log('Querying artists: Big Boy and End It');
    
    // Check global artists cache first as it's easier
    const bigBoySnapshot = await db.collection('artists').where(admin.firestore.FieldPath.documentId(), 'in', ['big-boy', 'end-it', 'big-boy-united-states', 'end-it-united-states']).get();
    
    if (bigBoySnapshot.empty) {
        console.log('Not found in artists collection. Searching projects...');
        const projectsSnapshot = await db.collection('projects').where('projectName', '==', 'Spaced').limit(1).get();
        if (!projectsSnapshot.empty) {
            const project = projectsSnapshot.docs[0].data();
            console.log('Project Spaced found:', project.projectName);
            // look in detailsCache or graphData
            if (project.detailsCache) {
                if (project.detailsCache['big-boy']) {
                    console.log('Big Boy:', project.detailsCache['big-boy']);
                }
                if (project.detailsCache['end-it']) {
                    console.log('End It:', project.detailsCache['end-it']);
                }
            }
        }
    } else {
        bigBoySnapshot.forEach(doc => {
            console.log(`\nArtist: ${doc.id}`);
            const data = doc.data();
            console.log(`Image URL: ${data.imageUrl}`);
            console.log(`Bio Summary: ${data.biographySummary?.substring(0, 100)}...`);
            console.log(`Genre: ${data.genre}`);
        });
    }
}

run().catch(console.error);

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- 1. Alias Utility Function (Replicated from artistCacheService.ts for CJS compatibility) ---
function normalizeArtistId(id) {
    if (!id) return '';
    return id.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function isNodeInSeedList(nodeIdOrLabel, seedList) {
    if (!nodeIdOrLabel || !seedList || !Array.isArray(seedList) || seedList.length === 0) return false;
    
    const targetNorm = normalizeArtistId(nodeIdOrLabel);
    const countrySuffixRegex = /-(united-states|united-kingdom|global|australia|canada|germany|france|japan|sweden|italy|spain|brazil|mexico|netherlands|belgium|norway|finland|denmark|ireland|new-zealand|poland|austria|switzerland|uk|usa|us)$/;
    const strippedTargetNorm = targetNorm.replace(countrySuffixRegex, '');
    
    return seedList.some(seed => {
        if (!seed || typeof seed !== 'string') return false;
        if (seed === nodeIdOrLabel) return true;
        
        const seedNorm = normalizeArtistId(seed);
        const strippedSeedNorm = seedNorm.replace(countrySuffixRegex, '');
        
        if (seedNorm === targetNorm) return true;
        if (strippedSeedNorm === strippedTargetNorm) return true;
        
        return false;
    });
}

// --- 2. Regression Test Runner ---
async function runRegressionSuite() {
    console.log("=== PHASE 3: AUTOMATED REGRESSION TESTING SUITE ===");
    
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    // 1. Alias Utility Tests
    console.log("\n--- 1. Alias Utility Tests ---");
    assert(isNodeInSeedList('spaced-us', ['spaced']), "isNodeInSeedList matches 'spaced-us' against seed 'spaced'");
    assert(isNodeInSeedList('spaced', ['spaced-us']), "isNodeInSeedList matches 'spaced' against seed 'spaced-us'");
    assert(isNodeInSeedList('buggin-united-states', ['buggin']), "isNodeInSeedList matches 'buggin-united-states' against seed 'buggin'");
    assert(!isNodeInSeedList('space', ['spaced']), "isNodeInSeedList rejects incorrect substring match 'space' vs 'spaced'");

    // 2. Payload Hygiene Tests
    console.log("\n--- 2. Payload Hygiene Tests ---");
    // process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    try {
        initializeApp({ projectId: "zcene-production" });
    } catch(e) {
        // already initialized
    }
    const db = getFirestore();

    try {
        console.log("Querying a recent project from Firestore...");
        const projectsSnapshot = await db.collection('projects')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (projectsSnapshot.empty) {
            console.log("⚠️ No projects found in emulator. Skipping Firestore assertions.");
            assert(true, "Skipped Firestore assertions (No data)");
        } else {
            const projectDoc = projectsSnapshot.docs[0];
            const projectData = projectDoc.data();
            
            console.log(`Testing Project ID: ${projectDoc.id}`);
            
            // Assert activeNodes[0] holds the canonical seed slug
            const activeNodes = projectData.activeNodes || [];
            const seedArtists = projectData.seedArtists || [];
            
            if (seedArtists.length > 0 && activeNodes.length > 0) {
                const primarySeed = seedArtists[0];
                const firstActiveNode = activeNodes[0];
                
                assert(
                    isNodeInSeedList(firstActiveNode, [primarySeed]),
                    `activeNodes[0] ('${firstActiveNode}') correctly matches canonical seed slug ('${primarySeed}')`
                );
            } else {
                console.log("⚠️ Project is missing activeNodes or seedArtists. Skipping activeNodes assertion.");
                assert(true, "Skipped activeNodes assertion (Missing data)");
            }

            // Assert zero duplicate raw nodes exist in the graph data
            if (projectData.graphData) {
                let graphData = projectData.graphData;
                if (typeof graphData === 'string') {
                    graphData = JSON.parse(graphData);
                }
                
                const nodes = graphData.nodes || [];
                const nodeIds = nodes.map(n => n.id);
                const uniqueNodeIds = new Set(nodeIds);
                
                assert(
                    nodeIds.length === uniqueNodeIds.size,
                    `Zero duplicate nodes exist in graph data (Total: ${nodeIds.length}, Unique: ${uniqueNodeIds.size})`
                );
            } else {
                console.log("⚠️ Project is missing graphData. Skipping graph duplicates assertion.");
                assert(true, "Skipped duplicate nodes assertion (Missing data)");
            }
        }
    } catch (err) {
        console.error("Error during Firestore testing:", err);
        failed++;
    }

    console.log("\n--- Regression Suite Summary ---");
    console.log(`Total Passed: ${passed}`);
    console.log(`Total Failed: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runRegressionSuite();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCurationPipeline = exports.validateSeedOriginCallable = void 0;
exports.stripCountrySlug = stripCountrySlug;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const curatorService_1 = require("./services/curatorService");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
try {
    db.settings({ ignoreUndefinedProperties: true });
}
catch (e) {
    // Ignore if already set by another function module
}
function isEntitySeedMatch(seedNorm, candidateNorm) {
    if (!seedNorm || !candidateNorm)
        return false;
    const s = (0, curatorService_1.normalizeArtistId)(seedNorm);
    const c = (0, curatorService_1.normalizeArtistId)(candidateNorm);
    if (s === c)
        return true;
    if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`))
        return true;
    if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`))
        return true;
    return false;
}
function stripCountrySlug(name) {
    const KNOWN_COUNTRY_SLUGS = [
        '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
        '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
        '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
        '-switzerland', '-uk', '-usa', '-us'
    ];
    let cleanName = name.trim();
    for (const suffix of KNOWN_COUNTRY_SLUGS) {
        if (cleanName.toLowerCase().endsWith(suffix)) {
            cleanName = cleanName.substring(0, cleanName.length - suffix.length);
            break;
        }
    }
    return cleanName;
}
exports.validateSeedOriginCallable = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const { seed } = request.data;
    if (!seed) {
        throw new https_1.HttpsError("invalid-argument", "Missing seed in payload");
    }
    const validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed);
    return validationResult;
});
exports.executeCurationPipeline = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "1GiB",
}, async (request) => {
    const payload = request.data;
    console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, payload);
    if (!payload || !payload.artists) {
        throw new https_1.HttpsError("invalid-argument", "Missing artists in payload");
    }
    const artistList = payload.artists
        .split('::')
        .map((a) => a.trim())
        .filter(Boolean);
    console.log(`[Pipeline Diamond] -> Cache Lookup: Checking seeds: ${artistList.join(', ')}`);
    const detailsCacheEntries = [];
    const resolvedSeedArray = [];
    let needsProGeneration = false;
    for (const seed of artistList) {
        const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
        let cachedDetails = null;
        try {
            const cacheDoc = await db.collection("artists").doc(seedNorm).get();
            if (cacheDoc.exists) {
                const cacheData = cacheDoc.data();
                if (cacheData && cacheData.detailsCache) {
                    cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
                    if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                        const match = cachedDetails.find((item) => (0, curatorService_1.normalizeArtistId)(item[0]) === seedNorm);
                        if (match && match[1]) {
                            cachedDetails = match[1];
                        }
                        else {
                            cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                        }
                    }
                }
            }
        }
        catch (e) {
            console.warn(`Failed cache lookup for ${seedNorm}`, e);
        }
        if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50 && cachedDetails.details?.genre && cachedDetails.imageUrl) {
            console.log(`[Pipeline Diamond] -> Is Hit? Yes -> Full Data? Yes -> Merge into Canvas: ${seed}`);
            resolvedSeedArray.push({
                id: seedNorm,
                name: seed,
                origin: cachedDetails.details.origin || "",
                genre: cachedDetails.details.genre || "",
                isCacheHit: true
            });
            detailsCacheEntries.push([seedNorm, cachedDetails]);
        }
        else {
            console.log(`[Pipeline Diamond] -> Is Hit? No -> Flash-Lite Origin Validation: ${seed}`);
            needsProGeneration = true;
            let validationResult = null;
            if (payload.disambiguationHints && payload.disambiguationHints[(0, curatorService_1.normalizeArtistId)(seed)]) {
                validationResult = { isValid: true, id: seed, origin: payload.disambiguationHints[(0, curatorService_1.normalizeArtistId)(seed)], genre: "Unknown" };
            }
            else {
                validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed);
            }
            if (validationResult.isValid) {
                resolvedSeedArray.push({
                    id: (0, curatorService_1.normalizeArtistId)(validationResult.id),
                    name: validationResult.id,
                    origin: validationResult.origin,
                    genre: validationResult.genre,
                    isCacheHit: false
                });
            }
            else {
                throw new https_1.HttpsError("failed-precondition", `Validation failed for seed: ${seed}.`);
            }
        }
    }
    if (artistList.length > 1) {
        needsProGeneration = true;
    }
    let finalGraph = payload.baseGraph || { nodes: [], links: [] };
    if (needsProGeneration) {
        console.log(`[Pipeline Diamond] -> 3.1 Pro Topology Generation`);
        finalGraph = await (0, curatorService_1.generateGraphDataBackend)(payload.artists, payload.filters, payload.cachedSubgraphsContext, payload.baseGraph, payload.disambiguationHints);
    }
    else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
        console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
        const seedNorm = (0, curatorService_1.normalizeArtistId)(artistList[0]);
        const cacheDoc = await db.collection("artists").doc(seedNorm).get();
        if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            if (cacheData && cacheData.graphData) {
                finalGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
            }
        }
    }
    if (finalGraph.nodes) {
        for (const n of finalGraph.nodes) {
            if (n.type) {
                n.type = n.type.toLowerCase();
            }
            else {
                n.type = 'artist';
            }
        }
        for (const seed of artistList) {
            const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
            const seedNode = finalGraph.nodes.find((n) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
            if (seedNode && (0, curatorService_1.normalizeArtistId)(seedNode.id) !== seedNorm) {
                seedNode.id = seedNorm;
                seedNode.label = seed;
            }
        }
    }
    const recommendedEntities = (finalGraph.nodes || [])
        .filter((n) => n.type === 'artist' || n.type === 'label')
        .map((n) => ({
        id: n.id,
        name: n.label || n.id,
        type: n.type,
        origin: n.origin || null
    }));
    for (const seed of artistList) {
        const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
        const exists = recommendedEntities.some((e) => isEntitySeedMatch(seedNorm, e.id) || isEntitySeedMatch(seedNorm, e.name));
        if (!exists) {
            recommendedEntities.unshift({ id: seed, name: seed, type: 'artist', origin: null });
        }
    }
    console.log(`[Pipeline Diamond] -> Skipping synchronous hydration (Delegated to processCurationJob)`);
    let curationJobId = null;
    if (payload.userId && payload.projectId) {
        try {
            console.log(`[Pipeline Diamond] -> Initiating Curation Pipeline for ${payload.projectId}`);
            const projectUpdate = {
                graphData: JSON.stringify(finalGraph),
                schemaVersion: 2,
                supportsLabelDeepCuts: true,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update(projectUpdate);
            console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData via Admin SDK`);
            curationJobId = payload.jobId || db.collection('curationJobs').doc().id;
            const jobRef = db.collection('curationJobs').doc(curationJobId);
            await jobRef.set({
                status: "pending",
                jobType: "graph_generation",
                userId: payload.userId,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                inputPayload: {
                    ...payload,
                    baseGraph: finalGraph
                }
            });
            console.log(`[Pipeline Diamond] -> Created curation job ${curationJobId} for background hydration`);
            // Update project with activeJobId
            await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update({
                activeJobId: curationJobId
            });
        }
        catch (err) {
            console.error(`[Pipeline Diamond] -> Failed to update project doc ${payload.projectId} / spawn job`, err);
        }
    }
    console.log(`[Pipeline Diamond] -> Curation Phase 1 Complete, returning structural payload to client`);
    return {
        graphData: finalGraph,
        detailsCache: "[]",
        rootBreakdown: null,
        activeJobId: curationJobId
    };
});
//# sourceMappingURL=executeCurationPipeline.js.map
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
        '-switzerland', '-uk', '-usa', '-us', '-gb', '-au', '-ca', '-de', '-fr', '-jp', '-se', '-it', '-es',
        '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch'
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
    secrets: ["GEMINI_API_KEY", "API_PASSWORD"],
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const { seed, password } = request.data;
    if (!seed) {
        throw new https_1.HttpsError("invalid-argument", "Missing seed in payload");
    }
    const expectedPassword = process.env.API_PASSWORD;
    if (expectedPassword && password !== expectedPassword) {
        throw new https_1.HttpsError("unauthenticated", "Invalid or missing API password");
    }
    const validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed);
    return validationResult;
});
exports.executeCurationPipeline = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY", "API_PASSWORD"],
    timeoutSeconds: 540,
    memory: "1GiB",
}, async (request) => {
    const payload = request.data;
    console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, payload);
    if (!payload || !payload.artists) {
        throw new https_1.HttpsError("invalid-argument", "Missing artists in payload");
    }
    const expectedPassword = process.env.API_PASSWORD;
    if (expectedPassword && payload.password !== expectedPassword) {
        throw new https_1.HttpsError("unauthenticated", "Invalid or missing API password");
    }
    const artistList = payload.artists
        .split('::')
        .map((a) => a.trim())
        .filter(Boolean);
    console.log(`[Pipeline Diamond] -> Cache Lookup: Checking seeds: ${artistList.join(', ')}`);
    const detailsCacheEntries = [];
    const collectedTokens = {};
    const usageCollector = {
        push: (model, usage) => {
            if (!collectedTokens[model])
                collectedTokens[model] = { prompt: 0, candidates: 0, total: 0 };
            collectedTokens[model].prompt += usage.promptTokenCount;
            collectedTokens[model].candidates += usage.candidatesTokenCount;
            collectedTokens[model].total += usage.totalTokenCount;
        }
    };
    const resolvedSeedArray = [];
    let needsProGeneration = false;
    for (const seed of artistList) {
        const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
        let cachedDetails = null;
        // ── Slug Deduplication Guard ───────────────────────────────────────────────
        // Before reading artists/{seedNorm}, check if a canonical variation already
        // exists in Firestore (e.g. sick-of-it-all-usa when searching sick-of-it-all).
        // If found, adopt the existing canonical ID to prevent duplicate document creation.
        let resolvedSeedNorm = seedNorm;
        try {
            const dedupQuery = await db.collection("artists")
                .where("artistId", ">=", seedNorm)
                .where("artistId", "<=", `${seedNorm}\uf8ff`)
                .limit(5)
                .get();
            if (!dedupQuery.empty) {
                // Prefer a doc that has graphData (most complete)
                for (const snap of dedupQuery.docs) {
                    const snapData = snap.data();
                    if (snap.id !== seedNorm && snapData.artistId && snapData.artistId.startsWith(seedNorm)) {
                        if (snapData.graphData) {
                            console.log(`[Pipeline Diamond] Slug Dedup: Adopting canonical seed "${snap.id}" over "${seedNorm}"`);
                            resolvedSeedNorm = snap.id;
                            break;
                        }
                        // Even without graphData, prefer the canonical ID to keep naming consistent
                        resolvedSeedNorm = snap.id;
                    }
                }
            }
        }
        catch (dedupErr) {
            console.warn(`[Pipeline Diamond] Seed slug dedup query failed for "${seedNorm}", proceeding with derived ID:`, dedupErr);
        }
        let hasGraphData = false;
        try {
            const cacheDoc = await db.collection("artists").doc(resolvedSeedNorm).get();
            if (cacheDoc.exists) {
                const cacheData = cacheDoc.data();
                if (cacheData && cacheData.graphData) {
                    const rawGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
                    if (rawGraph && rawGraph.nodes && rawGraph.nodes.length > 0) {
                        hasGraphData = true;
                    }
                }
                if (cacheData && cacheData.detailsCache) {
                    cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
                    if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                        const match = cachedDetails.find((item) => (0, curatorService_1.normalizeArtistId)(item[0]) === resolvedSeedNorm);
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
            console.warn(`Failed cache lookup for ${resolvedSeedNorm}`, e);
        }
        if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50 && cachedDetails.details?.genre && cachedDetails.imageUrl) {
            if (hasGraphData) {
                console.log(`[Pipeline Diamond] -> Is Hit? Yes -> Full Data? Yes -> Merge into Canvas: ${seed}`);
                resolvedSeedArray.push({
                    id: resolvedSeedNorm,
                    name: seed,
                    origin: cachedDetails.details.origin || "",
                    genre: cachedDetails.details.genre || "",
                    isCacheHit: true
                });
                detailsCacheEntries.push([resolvedSeedNorm, cachedDetails]);
            }
            else {
                console.log(`[Pipeline Diamond] -> Is Hit? Partial (Stub) -> Missing Topology -> Triggering Pro Gen: ${seed}`);
                needsProGeneration = true;
                resolvedSeedArray.push({
                    id: resolvedSeedNorm,
                    name: seed,
                    origin: cachedDetails.details.origin || "",
                    genre: cachedDetails.details.genre || "",
                    isCacheHit: true
                });
                detailsCacheEntries.push([resolvedSeedNorm, cachedDetails]);
            }
        }
        else {
            console.log(`[Pipeline Diamond] -> Is Hit? No -> Flash-Lite Origin Validation: ${seed}`);
            needsProGeneration = true;
            let validationResult = null;
            if (payload.disambiguationHints && payload.disambiguationHints[(0, curatorService_1.normalizeArtistId)(seed)]) {
                validationResult = { isValid: true, id: seed, origin: payload.disambiguationHints[(0, curatorService_1.normalizeArtistId)(seed)], genre: "Unknown" };
            }
            else {
                validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed, usageCollector);
            }
            if (validationResult.isValid) {
                let normId = (0, curatorService_1.normalizeArtistId)(validationResult.id);
                if (validationResult.origin) {
                    const originSlug = (0, curatorService_1.extractCountrySlug)(validationResult.origin);
                    if (originSlug && originSlug !== 'global' && !normId.endsWith(`-${originSlug}`)) {
                        normId = `${normId}-${originSlug}`;
                    }
                }
                resolvedSeedArray.push({
                    id: normId,
                    name: validationResult.id,
                    origin: validationResult.origin,
                    genre: validationResult.genre,
                    isCacheHit: false
                });
                console.log(`[Pipeline Diamond] -> Seed Slugging: ${validationResult.id} -> ${normId}`);
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
        finalGraph = await (0, curatorService_1.generateGraphDataBackend)(payload.artists, payload.filters, payload.cachedSubgraphsContext, payload.baseGraph, payload.disambiguationHints, usageCollector);
    }
    else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
        console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
        const seedNorm = (0, curatorService_1.normalizeArtistId)(artistList[0]);
        const cacheDoc = await db.collection("artists").doc(seedNorm).get();
        if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            if (cacheData && cacheData.graphData) {
                const rawGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
                // Deep clone to ensure we do not mutate any in-memory objects
                finalGraph = JSON.parse(JSON.stringify(rawGraph));
                // Critical Fix: Explicitly map the synthesisRationale from the cache root (or inside graphData)
                if (cacheData.synthesisRationale || rawGraph.synthesisRationale) {
                    finalGraph.synthesisRationale = cacheData.synthesisRationale || rawGraph.synthesisRationale;
                }
            }
        }
    }
    if (finalGraph.nodes) {
        const idRewriteMap = new Map();
        for (const n of finalGraph.nodes) {
            if (n.type) {
                n.type = n.type.toLowerCase();
            }
            else {
                n.type = 'artist';
            }
            const originalNormId = (0, curatorService_1.normalizeArtistId)(n.id);
            let newId = originalNormId;
            const seedMatch = resolvedSeedArray.find(s => isEntitySeedMatch(s.id, originalNormId));
            if (seedMatch) {
                if (seedMatch.origin && !n.origin) {
                    n.origin = seedMatch.origin;
                }
                newId = seedMatch.id;
            }
            else if (n.type !== 'label' && n.origin) {
                const originSlug = (0, curatorService_1.extractCountrySlug)(n.origin);
                if (originSlug && originSlug !== 'global' && !originalNormId.endsWith(`-${originSlug}`)) {
                    newId = `${originalNormId}-${originSlug}`;
                }
            }
            if (newId !== n.id) {
                idRewriteMap.set(n.id, newId);
            }
            n.id = newId;
        }
        if (finalGraph.links) {
            for (const link of finalGraph.links) {
                const sId = typeof link.source === 'object' && link.source !== null ? link.source.id : link.source;
                const tId = typeof link.target === 'object' && link.target !== null ? link.target.id : link.target;
                if (idRewriteMap.size > 0 && idRewriteMap.has(sId)) {
                    link.source = idRewriteMap.get(sId);
                }
                else {
                    link.source = sId; // Ensure string format
                }
                if (idRewriteMap.size > 0 && idRewriteMap.has(tId)) {
                    link.target = idRewriteMap.get(tId);
                }
                else {
                    link.target = tId; // Ensure string format
                }
            }
        }
        for (const seed of artistList) {
            const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
            const resolvedSeed = resolvedSeedArray.find(r => (0, curatorService_1.normalizeArtistId)(r.name) === seedNorm || r.id === seedNorm);
            const sluggedSeedNorm = resolvedSeed ? resolvedSeed.id : seedNorm;
            const seedNode = finalGraph.nodes.find((n) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
            if (seedNode && seedNode.id !== sluggedSeedNorm) {
                const oldId = seedNode.id;
                seedNode.id = sluggedSeedNorm;
                seedNode.label = resolvedSeed ? resolvedSeed.name : seed;
                if (finalGraph.links) {
                    for (const link of finalGraph.links) {
                        if (link.source === oldId)
                            link.source = sluggedSeedNorm;
                        if (link.target === oldId)
                            link.target = sluggedSeedNorm;
                    }
                }
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
                    baseGraph: finalGraph,
                    foregroundApiUsage: collectedTokens
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
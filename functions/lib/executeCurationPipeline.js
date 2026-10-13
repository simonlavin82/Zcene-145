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
        '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch',
        '-scotland', '-wales', '-northern-ireland', '-england'
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
    const { seed, originHint, genreHint, password } = request.data;
    if (!seed) {
        throw new https_1.HttpsError("invalid-argument", "Missing seed in payload");
    }
    const expectedPassword = process.env.API_PASSWORD;
    if (expectedPassword && password !== expectedPassword) {
        throw new https_1.HttpsError("unauthenticated", "Invalid or missing API password");
    }
    const validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed, { originHint, genreHint });
    // V11.6 Fix 2: Programmatically enforce correctedInput for typos
    if (validationResult.isValid && seed.toLowerCase() !== validationResult.id.toLowerCase()) {
        validationResult.correctedInput = true;
        console.log(`[validateSeedOriginCallable] Case-insensitive mismatch: "${seed}" → "${validationResult.id}"`);
    }
    // V11.6 Fix 2B (Rule 11): Hard-block the pipeline for unrecognizable entities or failed bouncer re-queries.
    // isValid: false means the model could not confidently map the input to any known artist matching the parameters.
    // Throwing here prevents a broken stub from being minted and the pipeline from executing.
    if (!validationResult.isValid) {
        console.warn(`[validateSeedOriginCallable] Rule 11 BLOCK: Seed "${seed}" returned isValid: false. Rejecting pipeline.`);
        throw new https_1.HttpsError("not-found", originHint
            ? `No culturally significant artist named "${seed}" found matching origin "${originHint}"${genreHint ? ` / genre "${genreHint}"` : ""}.`
            : `"${seed}" could not be identified as a real musical artist or label. Please check the spelling and try again.`);
    }
    // Synchronously mint evolved stub in artists collection (Pre-Flight Gateway)
    // Gated: If an originHint is provided (Escape Hatch Re-Query in Column 1), do NOT mint premature stubs before human confirms in Node 4.
    if (!originHint) {
        try {
            const bareNormId = (0, curatorService_1.normalizeArtistId)(seed);
            const stubDocRef = db.collection("artists").doc(bareNormId);
            const isAmbiguous = !!(validationResult.hasCollision && validationResult.candidates && validationResult.candidates.length > 1);
            const candidates = validationResult.candidates || [];
            if (isAmbiguous) {
                await stubDocRef.set({
                    _isStub: true,
                    isAmbiguous: true,
                    redirectTo: null,
                    candidates,
                    cachedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log(`[validateSeedOriginCallable] Minted evolved ambiguous stub for "${bareNormId}" with ${candidates.length} candidates`);
            }
            else if (candidates.length === 1 && candidates[0].id !== bareNormId) {
                await stubDocRef.set({
                    _isStub: true,
                    isAmbiguous: false,
                    redirectTo: candidates[0].id,
                    candidates,
                    cachedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log(`[validateSeedOriginCallable] Minted single-hit stub for "${bareNormId}" -> "${candidates[0].id}"`);
            }
        }
        catch (stubErr) {
            console.warn(`[validateSeedOriginCallable] Failed to synchronously mint stub for "${seed}":`, stubErr);
        }
    }
    // Log typo corrections so operators can monitor misuse patterns.
    if (validationResult.correctedInput) {
        console.log(`[validateSeedOriginCallable] Typo correction applied: "${seed}" → "${validationResult.id}"`);
    }
    return validationResult;
});
exports.executeCurationPipeline = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY", "API_PASSWORD"],
    timeoutSeconds: 540,
    memory: "1GiB",
}, async (request) => {
    const payload = request.data;
    const safePayload = { ...payload };
    if (safePayload.password)
        safePayload.password = '[REDACTED]';
    console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, safePayload);
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
    const seedNamesMap = payload.seedNames || {};
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
    const seedStubs = {};
    let needsProGeneration = false;
    let hasStubHit = false;
    let hasCacheMiss = false;
    const cachedDocsData = {};
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
                    // RULE 10 INVARIANT: Skip ALL stubs and redirects
                    if (snapData.redirectTo || snapData._isStub || snapData.isAmbiguous)
                        continue;
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
        // [Pre-Flight Alias Resolution]
        const originalQuery = payload.originalQueries && (payload.originalQueries[resolvedSeedNorm] || payload.originalQueries[seedNorm]);
        if (originalQuery) {
            const bareNormId = (0, curatorService_1.normalizeArtistId)(originalQuery);
            if (bareNormId !== resolvedSeedNorm) {
                const stubDocRef = db.collection("artists").doc(bareNormId);
                const stubSnap = await stubDocRef.get();
                const existingData = stubSnap.exists ? stubSnap.data() : null;
                if (!existingData?._isStub || !existingData?.isAmbiguous) {
                    await stubDocRef.set({
                        _isStub: true,
                        isAmbiguous: false,
                        redirectTo: resolvedSeedNorm,
                        cachedAt: firestore_1.FieldValue.serverTimestamp()
                    }, { merge: true });
                    console.log(`[Pipeline Diamond] -> Synchronously minted bare stub forwarder (Frontend Resolved): ${bareNormId} -> ${resolvedSeedNorm}`);
                }
                else {
                    console.log(`[Pipeline Diamond] Preserving ambiguous stub for ${bareNormId} during alias resolution.`);
                }
            }
        }
        let hasGraphData = false;
        try {
            let cacheDoc = await db.collection("artists").doc(resolvedSeedNorm).get();
            if (cacheDoc.exists) {
                let cacheData = cacheDoc.data();
                // Root-as-Router Traversal (V25): Follow redirectTo from bare stub to canonical suffixed doc
                if (cacheData && cacheData.redirectTo && cacheData.redirectTo !== resolvedSeedNorm) {
                    const targetDoc = await db.collection("artists").doc(cacheData.redirectTo).get();
                    if (targetDoc.exists) {
                        resolvedSeedNorm = cacheData.redirectTo;
                        cacheDoc = targetDoc;
                        cacheData = targetDoc.data();
                    }
                }
                cachedDocsData[resolvedSeedNorm] = cacheData;
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
            const cleanHitName = seedNamesMap[resolvedSeedNorm] || seedNamesMap[seedNorm] || seedNamesMap[seed.toLowerCase()] || seed;
            if (hasGraphData) {
                console.log(`[Pipeline Diamond] -> Is Hit? Yes -> Full Data? Yes -> Merge into Canvas: ${seed}`);
                resolvedSeedArray.push({
                    id: resolvedSeedNorm,
                    name: cleanHitName,
                    origin: cachedDetails.details.origin || "",
                    genre: cachedDetails.details.genre || "",
                    isCacheHit: true
                });
                detailsCacheEntries.push([resolvedSeedNorm, cachedDetails]);
            }
            else {
                console.log(`[Pipeline Diamond] -> Is Hit? Partial (Stub) -> Missing Topology -> Triggering Pro Gen: ${seed}`);
                needsProGeneration = true;
                hasStubHit = true;
                resolvedSeedArray.push({
                    id: resolvedSeedNorm,
                    name: cleanHitName,
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
            hasCacheMiss = true;
            let validationResult = null;
            const strippedSeed = stripCountrySlug((0, curatorService_1.normalizeArtistId)(seed));
            const hintCountry = (payload.disambiguationHints && (payload.disambiguationHints[seedNorm] || payload.disambiguationHints[strippedSeed])) || null;
            const hintGenre = (payload.disambiguationGenres && (payload.disambiguationGenres[seedNorm] || payload.disambiguationGenres[strippedSeed])) || "Unknown";
            const rawId = (payload.originalQueries && (payload.originalQueries[seedNorm] || payload.originalQueries[strippedSeed])) || strippedSeed;
            // Zero Blind Trust (V24): Column 2 MUST NOT synthesize geographic slugs (e.g., -jp) from raw user hints.
            // Stubs are minted strictly from validated Flash candidate payloads.
            const valResult = await (0, curatorService_1.validateSeedOriginBackend)(rawId || seed, hintCountry ? { originHint: hintCountry, genreHint: hintGenre } : undefined);
            validationResult = valResult;
            if (valResult.apiUsage) {
                usageCollector.push(valResult.apiUsage.model, valResult.apiUsage);
            }
            if (validationResult.isValid) {
                const bareNormId = (0, curatorService_1.normalizeArtistId)(validationResult.id);
                let normId = bareNormId;
                // Root-as-Router Contract (V25 / Rule 36): Bare IDs must be minted exclusively as _isStub: true forwarders.
                // All verified entities with non-global origins resolve to their geographically suffixed ID.
                if (validationResult.origin) {
                    const originSlug = (0, curatorService_1.extractCountrySlug)(validationResult.origin);
                    if (originSlug && originSlug !== 'global' && !normId.endsWith(`-${originSlug}`)) {
                        normId = `${normId}-${originSlug}`;
                    }
                }
                if (normId !== bareNormId) {
                    const stubDocRef = db.collection("artists").doc(bareNormId);
                    const stubSnap = await stubDocRef.get();
                    const existingData = stubSnap.exists ? stubSnap.data() : null;
                    if (!existingData?._isStub || !existingData?.isAmbiguous) {
                        await stubDocRef.set({
                            _isStub: true,
                            isAmbiguous: false,
                            redirectTo: normId,
                            candidates: validationResult.candidates || [{
                                    id: normId,
                                    name: validationResult.id,
                                    origin: validationResult.origin || "Unknown",
                                    genre: validationResult.genre || "Unknown"
                                }],
                            cachedAt: firestore_1.FieldValue.serverTimestamp()
                        }, { merge: true });
                        console.log(`[Pipeline Diamond] -> Synchronously minted bare stub forwarder: ${bareNormId} -> ${normId}`);
                    }
                    else {
                        console.log(`[Pipeline Diamond] Preserving existing ambiguous stub for ${bareNormId}`);
                    }
                }
                const cleanMissName = seedNamesMap[normId] || seedNamesMap[bareNormId] || seedNamesMap[seedNorm] || seedNamesMap[seed.toLowerCase()] || validationResult.id;
                resolvedSeedArray.push({
                    id: normId,
                    name: cleanMissName,
                    origin: validationResult.origin,
                    genre: validationResult.genre,
                    isCacheHit: false
                });
                seedStubs[normId] = {
                    _isStub: true,
                    summary: "Awaiting Deep Cut analysis...",
                    imageUrl: null,
                    details: {
                        genre: validationResult.genre || "Unknown",
                        origin: validationResult.origin || "Unknown",
                        founded: "Unknown",
                        notableArtists: []
                    },
                    discography: [],
                    links: []
                };
                console.log(`[Pipeline Diamond] -> Seed Slugging: ${validationResult.id} -> ${normId}`);
            }
            else {
                throw new https_1.HttpsError("failed-precondition", `Validation failed for seed: ${seed}.`);
            }
        }
    }
    if (artistList.length > 1 || payload.intent === 'cache_upgrade') {
        needsProGeneration = true;
    }
    let finalGraph = payload.baseGraph || { nodes: [], links: [] };
    if (needsProGeneration) {
        console.log(`[Pipeline Diamond] -> 3.1 Pro Topology Generation`);
        const result = await (0, curatorService_1.generateGraphDataBackend)(payload.artists, payload.filters, payload.cachedSubgraphsContext, payload.baseGraph, payload.disambiguationHints);
        finalGraph = result.graphData;
        if (result.apiUsage) {
            usageCollector.push(result.apiUsage.model, result.apiUsage);
        }
    }
    else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
        console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
        const seedNorm = (0, curatorService_1.normalizeArtistId)(artistList[0]);
        // The doc was already fetched in the loop above
        const cacheData = cachedDocsData[seedNorm] || null;
        if (cacheData) {
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
    let determinedGenerationType = "Direct Hit";
    if (artistList.length > 1 || (payload.filters && Object.keys(payload.filters).length > 0)) {
        determinedGenerationType = "Complex Generation";
    }
    else if (needsProGeneration) {
        if (hasStubHit && !hasCacheMiss) {
            determinedGenerationType = "Partial Generation";
        }
        else {
            determinedGenerationType = "Root Generation";
        }
    }
    if (payload.userId && payload.projectId) {
        try {
            console.log(`[Pipeline Diamond] -> Initiating Curation Pipeline for ${payload.projectId} with type: ${determinedGenerationType}`);
            const projectUpdate = {
                graphData: JSON.stringify(finalGraph),
                schemaVersion: 2,
                supportsLabelDeepCuts: true,
                generationType: determinedGenerationType,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update(projectUpdate);
            console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData via Admin SDK`);
            if (determinedGenerationType !== "Direct Hit") {
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
                        artists: resolvedSeedArray.map(s => s.id).join('::'),
                        seedNames: {
                            ...seedNamesMap,
                            ...Object.fromEntries(resolvedSeedArray.map(s => [s.id, s.name]))
                        },
                        baseGraph: finalGraph,
                        generationType: determinedGenerationType,
                        foregroundApiUsage: collectedTokens,
                        seedStubs: seedStubs
                    }
                });
                console.log(`[Pipeline Diamond] -> Created curation job ${curationJobId} for background hydration`);
                // Update project with activeJobId
                await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update({
                    activeJobId: curationJobId
                });
            }
            else {
                console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Skipping background hydration job.`);
            }
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
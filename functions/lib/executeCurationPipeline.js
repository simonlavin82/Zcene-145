"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCurationPipeline = exports.validateSeedOriginCallable = exports.shouldAdoptCanonicalSlugCandidate = exports.canonicalizeArtistSlugWithOrigin = exports.stripCountrySlug = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const curatorService_1 = require("./services/curatorService");
const cacheQualification_1 = require("./services/cacheQualification");
const isoCountries_1 = require("./shared/isoCountries");
Object.defineProperty(exports, "canonicalizeArtistSlugWithOrigin", { enumerable: true, get: function () { return isoCountries_1.canonicalizeArtistSlugWithOrigin; } });
Object.defineProperty(exports, "shouldAdoptCanonicalSlugCandidate", { enumerable: true, get: function () { return isoCountries_1.shouldAdoptCanonicalSlugCandidate; } });
const tokenEconomy_1 = require("./shared/tokenEconomy");
const tokenWallet_1 = require("./tokenWallet");
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
    const rawS = (0, curatorService_1.normalizeArtistId)(seedNorm);
    const rawC = (0, curatorService_1.normalizeArtistId)(candidateNorm);
    if (rawS === rawC)
        return true;
    const sIso = (0, isoCountries_1.extractTrailingCountryIso)(rawS);
    const cIso = (0, isoCountries_1.extractTrailingCountryIso)(rawC);
    if (sIso && cIso && !(0, isoCountries_1.areCountryIsosCompatible)(sIso, cIso)) {
        return false;
    }
    const s = (0, isoCountries_1.stripCountrySlug)(rawS);
    const c = (0, isoCountries_1.stripCountrySlug)(rawC);
    if (s === c)
        return true;
    if (rawS.startsWith(`${rawC}-`) || rawC.startsWith(`${rawS}-`))
        return true;
    if (rawS.includes(`-${rawC}-`) || rawS.endsWith(`-${rawC}`) || rawS.includes(`-${rawS}-`) || rawS.endsWith(`-${rawS}`))
        return true;
    return false;
}
exports.stripCountrySlug = isoCountries_1.stripCountrySlug;
async function upsertBareRouterStub(bareNormId, targetCanonicalId, candidateMeta) {
    if (!bareNormId || bareNormId === targetCanonicalId)
        return;
    const stubDocRef = db.collection("artists").doc(bareNormId);
    const stubSnap = await stubDocRef.get();
    const existingData = stubSnap.exists ? stubSnap.data() : null;
    const newCandidate = {
        id: targetCanonicalId,
        name: candidateMeta?.name || bareNormId,
        origin: candidateMeta?.origin || "Unknown",
        genre: candidateMeta?.genre || "Unknown",
    };
    if (existingData?._isStub && existingData?.isAmbiguous) {
        const existingCandidates = Array.isArray(existingData.candidates) ? existingData.candidates : [];
        const hasTarget = existingCandidates.some((c) => c?.id === targetCanonicalId);
        if (!hasTarget) {
            await stubDocRef.set({
                _isStub: true,
                isAmbiguous: true,
                redirectTo: null,
                candidates: [...existingCandidates, newCandidate],
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        console.log(`[Pipeline Diamond] Preserving ambiguous stub for ${bareNormId}`);
        return;
    }
    // Multi-Tenant Homonym Protection (Rule 6 & Rule 17):
    // If an existing single-pointer stub points to a DIFFERENT valid 2-letter ISO homonym (e.g. paradox-de vs paradox-th),
    // upgrade the bare stub to an Evolved Ambiguous Stub instead of clobbering redirectTo!
    const existingRedirect = typeof existingData?.redirectTo === "string" ? existingData.redirectTo : null;
    const existingRedirectIso = existingRedirect ? (0, isoCountries_1.extractTrailingCountryIso)(existingRedirect) : null;
    const targetIso = (0, isoCountries_1.extractTrailingCountryIso)(targetCanonicalId);
    const isExistingValidTwoLetterCanonical = Boolean(existingRedirect &&
        existingRedirectIso &&
        /-[a-z]{2}$/i.test(existingRedirect) &&
        !existingRedirect.endsWith("-uk"));
    if (existingData?._isStub &&
        isExistingValidTwoLetterCanonical &&
        existingRedirect !== targetCanonicalId &&
        targetIso &&
        !(0, isoCountries_1.areCountryIsosCompatible)(existingRedirectIso, targetIso)) {
        const prevCandidates = Array.isArray(existingData.candidates) && existingData.candidates.length > 0
            ? existingData.candidates
            : [{ id: existingRedirect, name: candidateMeta?.name || bareNormId, origin: existingRedirectIso.toUpperCase(), genre: "Unknown" }];
        const merged = prevCandidates.some((c) => c?.id === targetCanonicalId)
            ? prevCandidates
            : [...prevCandidates, newCandidate];
        await stubDocRef.set({
            _isStub: true,
            isAmbiguous: true,
            redirectTo: null,
            candidates: merged,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[Pipeline Diamond] -> Upgraded bare stub ${bareNormId} to Evolved Ambiguous Stub (${existingRedirect} + ${targetCanonicalId})`);
        return;
    }
    await stubDocRef.set({
        _isStub: true,
        isAmbiguous: false,
        redirectTo: targetCanonicalId,
        candidates: candidateMeta?.candidates || [newCandidate],
        cachedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[Pipeline Diamond] -> Synchronously minted bare stub forwarder: ${bareNormId} -> ${targetCanonicalId}`);
}
exports.validateSeedOriginCallable = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const caller = (0, tokenWallet_1.requireAuthenticatedCaller)(request);
    const { seed, originHint, genreHint, curationSessionId, mode, expectedProjectCost } = request.data || {};
    if (!seed) {
        throw new https_1.HttpsError("invalid-argument", "Missing seed in payload");
    }
    // Rule 18 & 43: Atomic 1-Token Non-Refundable Pre-Flight / Escape-Hatch Lookup Fee (Admin bypassed)
    const resolvedMode = originHint || mode === "escape_hatch" ? "escape_hatch" : "initial_preflight";
    const lookupBilling = await (0, tokenWallet_1.chargePreFlightLookupIfNeeded)({
        caller,
        curationSessionId,
        mode: resolvedMode,
        expectedProjectCost: expectedProjectCost === 10 ? 10 : 5,
        seedLabel: String(seed).trim(),
    });
    const validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed, { originHint, genreHint });
    // Persist Flash pre-flight micro-cost telemetry BEFORE any Rule 11 rejection or Box 4 cancellation
    await (0, tokenWallet_1.recordPreFlightApiUsage)({
        caller,
        curationSessionId: lookupBilling.curationSessionId,
        seedLabel: String(seed).trim(),
        isValid: Boolean(validationResult.isValid),
        apiUsage: validationResult.apiUsage,
    });
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
    return {
        ...validationResult,
        curationSessionId: lookupBilling.curationSessionId,
        tokenBalance: lookupBilling.tokenBalance,
    };
});
exports.executeCurationPipeline = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "1GiB",
}, async (request) => {
    const caller = (0, tokenWallet_1.requireAuthenticatedCaller)(request);
    const payload = request.data;
    const safePayload = { ...payload };
    if (safePayload.password)
        delete safePayload.password;
    console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, safePayload);
    if (!payload || !payload.artists) {
        throw new https_1.HttpsError("invalid-argument", "Missing artists in payload");
    }
    // Bind userId strictly to verified Firebase Auth identity
    payload.userId = caller.uid;
    const artistList = payload.artists
        .split('::')
        .map((a) => a.trim())
        .filter(Boolean);
    const seedNamesMap = payload.seedNames || {};
    payload.filters = (0, cacheQualification_1.sanitizeDiscoveryFilters)(payload.filters);
    const hasActiveFilters = (0, cacheQualification_1.hasActiveDiscoveryFilters)(payload.filters);
    // Rule 18 & 43: Settle remaining project token balance (4T/5T Single-Seed or 9T/10T Complex)
    const totalProjectCost = (0, tokenEconomy_1.computeBaseProjectTokenCost)(artistList.length, hasActiveFilters);
    const displaySeeds = artistList.map((s) => seedNamesMap[s] || s).join(' + ');
    const settlement = await (0, tokenWallet_1.settleCurationProjectTokens)({
        caller,
        curationSessionId: payload.curationSessionId,
        totalProjectCost,
        projectId: payload.projectId,
        txType: "spend_live_synthesis",
        description: `Zcene Synthesis: ${displaySeeds}`,
        generationTypeToStamp: hasActiveFilters ? "Filtered Live Synthesis" : "Root Generation",
        seedArtist: displaySeeds,
    });
    try {
        console.log(`[Pipeline Diamond] -> Cache Lookup: Checking seeds: ${artistList.join(', ')} (activeFilters=${hasActiveFilters})`);
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
            const strippedSeed = (0, isoCountries_1.stripCountrySlug)(seedNorm);
            const hintCountry = (payload.disambiguationHints && (payload.disambiguationHints[seedNorm] || payload.disambiguationHints[strippedSeed] || payload.disambiguationHints[seed])) || null;
            const hintGenre = (payload.disambiguationGenres && (payload.disambiguationGenres[seedNorm] || payload.disambiguationGenres[strippedSeed] || payload.disambiguationGenres[seed])) || null;
            const expectedSeedIso = (hintCountry ? (0, isoCountries_1.normalizeIsoCode)((0, curatorService_1.extractCountrySlug)(hintCountry)) : null) || (0, isoCountries_1.extractTrailingCountryIso)(seedNorm);
            let cachedDetails = null;
            // ── Slug Deduplication Guard (Cross-Homonym Protected) ─────────────────────
            // Before reading artists/{seedNorm}, check if a canonical variation already
            // exists in Firestore (e.g. buggin-us when searching buggin), while strictly
            // rejecting cross-country homonyms (e.g. protecting klear [Thailand] from klear-us).
            let resolvedSeedNorm = seedNorm;
            try {
                const dedupQuery = await db.collection("artists")
                    .where("artistId", ">=", strippedSeed)
                    .where("artistId", "<=", `${strippedSeed}\uf8ff`)
                    .limit(10)
                    .get();
                if (!dedupQuery.empty) {
                    // Prefer a compatible canonical doc that has graphData (most complete)
                    for (const snap of dedupQuery.docs) {
                        const snapData = snap.data();
                        if (!(0, isoCountries_1.shouldAdoptCanonicalSlugCandidate)(expectedSeedIso, snap.id, snapData, strippedSeed)) {
                            continue;
                        }
                        if (snap.id !== seedNorm && snapData.artistId) {
                            if (snapData.graphData) {
                                console.log(`[Pipeline Diamond] Slug Dedup: Adopting canonical seed "${snap.id}" over "${seedNorm}"`);
                                resolvedSeedNorm = snap.id;
                                break;
                            }
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
                if (bareNormId !== resolvedSeedNorm && (!expectedSeedIso || (0, isoCountries_1.areCountryIsosCompatible)(expectedSeedIso, (0, isoCountries_1.extractTrailingCountryIso)(resolvedSeedNorm)))) {
                    await upsertBareRouterStub(bareNormId, resolvedSeedNorm, {
                        name: seedNamesMap[resolvedSeedNorm] || seedNamesMap[seedNorm] || originalQuery,
                        origin: hintCountry || undefined,
                        genre: hintGenre || undefined,
                    });
                }
            }
            let hasGraphData = false;
            try {
                let cacheDoc = await db.collection("artists").doc(resolvedSeedNorm).get();
                if (cacheDoc.exists) {
                    let cacheData = cacheDoc.data();
                    // Root-as-Router Traversal (V25): Follow redirectTo ONLY if country-compatible and 2-letter canonical
                    if (cacheData && cacheData.redirectTo && cacheData.redirectTo !== resolvedSeedNorm) {
                        const redirectIso = (0, isoCountries_1.extractTrailingCountryIso)(cacheData.redirectTo);
                        const isValidRedirect = Boolean((0, isoCountries_1.areCountryIsosCompatible)(expectedSeedIso, redirectIso) &&
                            (!redirectIso || (/-[a-z]{2}$/i.test(cacheData.redirectTo) && !cacheData.redirectTo.endsWith('-uk'))));
                        if (isValidRedirect) {
                            const targetDoc = await db.collection("artists").doc(cacheData.redirectTo).get();
                            if (targetDoc.exists) {
                                resolvedSeedNorm = cacheData.redirectTo;
                                cacheDoc = targetDoc;
                                cacheData = targetDoc.data();
                            }
                        }
                        else if (expectedSeedIso) {
                            const hintedCanonicalId = `${strippedSeed}-${expectedSeedIso}`;
                            const hintedDoc = await db.collection("artists").doc(hintedCanonicalId).get();
                            if (hintedDoc.exists) {
                                resolvedSeedNorm = hintedCanonicalId;
                                cacheDoc = hintedDoc;
                                cacheData = hintedDoc.data();
                            }
                            else {
                                cacheData = undefined;
                            }
                        }
                    }
                    else if (cacheData?._isStub && expectedSeedIso) {
                        const hintedCanonicalId = `${strippedSeed}-${expectedSeedIso}`;
                        const hintedDoc = await db.collection("artists").doc(hintedCanonicalId).get();
                        if (hintedDoc.exists) {
                            resolvedSeedNorm = hintedCanonicalId;
                            cacheDoc = hintedDoc;
                            cacheData = hintedDoc.data();
                        }
                    }
                    if (cacheData) {
                        cachedDocsData[resolvedSeedNorm] = cacheData;
                        if (cacheData.graphData) {
                            const rawGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
                            if (rawGraph && rawGraph.nodes && rawGraph.nodes.length > 0) {
                                hasGraphData = true;
                            }
                        }
                        if (cacheData.detailsCache) {
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
            }
            catch (e) {
                console.warn(`Failed cache lookup for ${resolvedSeedNorm}`, e);
            }
            const qualificationIso = expectedSeedIso || (0, isoCountries_1.extractTrailingCountryIso)(resolvedSeedNorm);
            if ((0, cacheQualification_1.isFullyQualifiedEntityProfile)(cachedDetails, false, qualificationIso)) {
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
                const effectiveGenreHint = hintGenre || "Unknown";
                const rawId = (payload.originalQueries && (payload.originalQueries[seedNorm] || payload.originalQueries[strippedSeed])) || strippedSeed;
                // Zero Blind Trust (V24): Column 2 MUST NOT synthesize geographic slugs (e.g., -jp) from raw user hints.
                // Stubs are minted strictly from validated Flash candidate payloads.
                const valResult = await (0, curatorService_1.validateSeedOriginBackend)(rawId || seed, hintCountry ? { originHint: hintCountry, genreHint: effectiveGenreHint } : undefined);
                validationResult = valResult;
                if (valResult.apiUsage) {
                    usageCollector.push(valResult.apiUsage.model, valResult.apiUsage);
                }
                if (validationResult.isValid) {
                    const bareNormId = (0, curatorService_1.normalizeArtistId)(validationResult.id);
                    // Root-as-Router Contract (V25 / Rule 36): Bare IDs must be minted exclusively as _isStub: true forwarders.
                    // All verified entities with non-global origins resolve strictly to 2-letter ISO suffixed IDs (e.g. klear-th).
                    const normId = (0, isoCountries_1.canonicalizeArtistSlugWithOrigin)(bareNormId, validationResult.origin);
                    if (normId !== bareNormId) {
                        await upsertBareRouterStub(bareNormId, normId, {
                            name: validationResult.id,
                            origin: validationResult.origin || "Unknown",
                            genre: validationResult.genre || "Unknown",
                            candidates: validationResult.candidates,
                        });
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
        const isComplexGeneration = artistList.length > 1 || hasActiveFilters;
        if (isComplexGeneration || payload.intent === 'cache_upgrade') {
            needsProGeneration = true;
        }
        // Architecture V33 [Rule 15 / Rule 27] Tabula Rasa Gate:
        // When isComplexGeneration is true (Multi-Seed or 3-Tier Anchored), strictly bypass
        // cachedSubgraphsContext and baseGraph merging so Gemini 3.1 Pro creates fresh bespoke
        // crossover connections from a blank slate without pre-conditioned bias.
        // Seed identities remain 100% locked via concise origin & genre constraints.
        let finalGraph = (!isComplexGeneration && payload.baseGraph) ? payload.baseGraph : { nodes: [], links: [] };
        if (needsProGeneration) {
            console.log(`[Pipeline Diamond] -> 3.1 Pro Topology Generation (Tabula Rasa: ${isComplexGeneration})`);
            const disambiguationHintsForPrompt = { ...(payload.disambiguationHints || {}) };
            for (const seedItem of resolvedSeedArray) {
                if (seedItem.origin || seedItem.genre) {
                    const lockLine = `Artist "${seedItem.name}": Origin "${seedItem.origin || "Unknown"}", Genre "${seedItem.genre || "Unknown"}"`;
                    disambiguationHintsForPrompt[seedItem.id] = lockLine;
                    const bareKey = (0, isoCountries_1.stripCountrySlug)((0, curatorService_1.normalizeArtistId)(seedItem.id));
                    if (bareKey) {
                        disambiguationHintsForPrompt[bareKey] = lockLine;
                    }
                }
            }
            const result = await (0, curatorService_1.generateGraphDataBackend)(payload.artists, payload.filters, isComplexGeneration ? undefined : payload.cachedSubgraphsContext, isComplexGeneration ? undefined : payload.baseGraph, disambiguationHintsForPrompt);
            finalGraph = result.graphData;
            if (result.apiUsage) {
                usageCollector.push(result.apiUsage.model, result.apiUsage);
            }
        }
        else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
            console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
            const seedNorm = resolvedSeedArray[0]?.id || (0, curatorService_1.normalizeArtistId)(artistList[0]);
            // The doc was already fetched in the loop above
            const cacheData = cachedDocsData[seedNorm] || cachedDocsData[(0, curatorService_1.normalizeArtistId)(artistList[0])] || null;
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
                    if (seedMatch.origin) {
                        n.origin = seedMatch.origin;
                    }
                    if (seedMatch.genre && !n.genre) {
                        n.genre = seedMatch.genre;
                    }
                    newId = seedMatch.id;
                }
                else if (n.type !== 'label' && n.origin) {
                    newId = (0, isoCountries_1.canonicalizeArtistSlugWithOrigin)(originalNormId, n.origin);
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
                const resolvedSeed = resolvedSeedArray.find(r => isEntitySeedMatch(r.id, seedNorm) || (0, curatorService_1.normalizeArtistId)(r.name) === seedNorm || r.id === seedNorm);
                const sluggedSeedNorm = resolvedSeed ? resolvedSeed.id : seedNorm;
                const seedNode = finalGraph.nodes.find((n) => isEntitySeedMatch(sluggedSeedNorm, n.id) || isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
                if (seedNode && seedNode.id !== sluggedSeedNorm) {
                    const oldId = seedNode.id;
                    seedNode.id = sluggedSeedNorm;
                    seedNode.label = resolvedSeed ? resolvedSeed.name : seed;
                    if (resolvedSeed?.origin)
                        seedNode.origin = resolvedSeed.origin;
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
            const resolvedSeed = resolvedSeedArray.find(r => isEntitySeedMatch(r.id, seedNorm) || (0, curatorService_1.normalizeArtistId)(r.name) === seedNorm);
            const targetSeedId = resolvedSeed ? resolvedSeed.id : seed;
            const exists = recommendedEntities.some((e) => isEntitySeedMatch(targetSeedId, e.id) || isEntitySeedMatch(seedNorm, e.name));
            if (!exists) {
                recommendedEntities.unshift({
                    id: targetSeedId,
                    name: resolvedSeed?.name || seed,
                    type: 'artist',
                    origin: resolvedSeed?.origin || null
                });
            }
        }
        console.log(`[Pipeline Diamond] -> Skipping synchronous hydration (Delegated to processCurationJob)`);
        let curationJobId = null;
        let determinedGenerationType = "Direct Hit";
        if (artistList.length > 1 || hasActiveFilters) {
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
                    tokensSpent: settlement.tokensSpent,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                };
                await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).set(projectUpdate, { merge: true });
                console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData via Admin SDK`);
                if (determinedGenerationType !== "Direct Hit") {
                    // Persist end-to-end lockedSeeds map (keyed by BOTH canonical suffixed ID and bare ID)
                    // so Column 3 hydration & iTunes scraping never suffer disambiguation amnesia.
                    const lockedSeeds = {};
                    const normalizedDisambiguationHints = { ...(payload.disambiguationHints || {}) };
                    const normalizedDisambiguationGenres = { ...(payload.disambiguationGenres || {}) };
                    for (const s of resolvedSeedArray) {
                        const bareId = (0, isoCountries_1.stripCountrySlug)((0, curatorService_1.normalizeArtistId)(s.id));
                        const countryIso = (0, isoCountries_1.extractTrailingCountryIso)(s.id) || (s.origin ? (0, isoCountries_1.normalizeIsoCode)((0, curatorService_1.extractCountrySlug)(s.origin)) : null);
                        const lockEntry = {
                            id: s.id,
                            bareId,
                            name: s.name,
                            origin: s.origin || "",
                            countryIso,
                            genre: s.genre || "",
                        };
                        lockedSeeds[s.id] = lockEntry;
                        if (bareId) {
                            lockedSeeds[bareId] = lockEntry;
                        }
                        if (s.origin) {
                            normalizedDisambiguationHints[s.id] = s.origin;
                            if (bareId)
                                normalizedDisambiguationHints[bareId] = s.origin;
                        }
                        if (s.genre) {
                            normalizedDisambiguationGenres[s.id] = s.genre;
                            if (bareId)
                                normalizedDisambiguationGenres[bareId] = s.genre;
                        }
                    }
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
                            curationSessionId: settlement.curationSessionId,
                            tokensSpent: settlement.tokensSpent,
                            artists: resolvedSeedArray.map(s => s.id).join('::'),
                            seedNames: {
                                ...seedNamesMap,
                                ...Object.fromEntries(resolvedSeedArray.map(s => [s.id, s.name]))
                            },
                            disambiguationHints: normalizedDisambiguationHints,
                            disambiguationGenres: normalizedDisambiguationGenres,
                            lockedSeeds,
                            baseGraph: finalGraph,
                            generationType: determinedGenerationType,
                            foregroundApiUsage: collectedTokens,
                            seedStubs: seedStubs
                        }
                    });
                    console.log(`[Pipeline Diamond] -> Created curation job ${curationJobId} for background hydration (lockedSeeds=${resolvedSeedArray.map(s => s.id).join(', ')})`);
                    // Update project with activeJobId
                    await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).set({
                        activeJobId: curationJobId
                    }, { merge: true });
                }
                else {
                    console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Skipping background hydration job.`);
                }
            }
            catch (err) {
                console.error(`[Pipeline Diamond] -> Failed to update project doc ${payload.projectId} / spawn job`, err);
                throw err;
            }
        }
        console.log(`[Pipeline Diamond] -> Curation Phase 1 Complete, returning structural payload to client`);
        return {
            graphData: finalGraph,
            detailsCache: "[]",
            rootBreakdown: null,
            activeJobId: curationJobId,
            tokensSpent: settlement.tokensSpent,
            tokenBalance: settlement.tokenBalance,
        };
    }
    catch (pipelineErr) {
        await (0, tokenWallet_1.refundProjectSettlementOnError)({
            uid: caller.uid,
            projectId: payload.projectId,
            curationSessionId: settlement.curationSessionId,
            reason: "Column 2 Topology Pipeline Error",
        });
        throw pipelineErr;
    }
});
//# sourceMappingURL=executeCurationPipeline.js.map
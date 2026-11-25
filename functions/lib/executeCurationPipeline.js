"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCurationPipeline = exports.validateSeedOriginCallable = exports.shouldAdoptCanonicalSlugCandidate = exports.canonicalizeArtistSlugWithOrigin = exports.stripCountrySlug = void 0;
exports.resolveSceneTopologyBackend = resolveSceneTopologyBackend;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const curatorService_1 = require("./services/curatorService");
const cacheQualification_1 = require("./services/cacheQualification");
const isoCountries_1 = require("./shared/isoCountries");
Object.defineProperty(exports, "canonicalizeArtistSlugWithOrigin", { enumerable: true, get: function () { return isoCountries_1.canonicalizeArtistSlugWithOrigin; } });
Object.defineProperty(exports, "shouldAdoptCanonicalSlugCandidate", { enumerable: true, get: function () { return isoCountries_1.shouldAdoptCanonicalSlugCandidate; } });
const routerStubService_1 = require("./services/routerStubService");
const tokenEconomy_1 = require("./shared/tokenEconomy");
const multiSceneUtils_1 = require("./shared/multiSceneUtils");
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
exports.stripCountrySlug = isoCountries_1.stripCountrySlug;
async function resolveSceneTopologyBackend(params) {
    const { db, artistList, filters = {}, seedNamesMap = {}, disambiguationHints = {}, disambiguationGenres = {}, originalQueries = {}, cachedSubgraphsContext, baseGraph, intent, } = params;
    const sanitizedFilters = (0, cacheQualification_1.sanitizeDiscoveryFilters)(filters);
    const hasActiveFilters = (0, cacheQualification_1.hasActiveDiscoveryFilters)(sanitizedFilters);
    const detailsCacheEntries = [];
    const collectedTokens = {};
    const usageCollector = params.usageCollector || {
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
        const preliminaryBare = (0, curatorService_1.normalizeArtistId)((0, isoCountries_1.stripCountrySlug)(seed));
        const hintCountry = (disambiguationHints && (disambiguationHints[seedNorm] || disambiguationHints[preliminaryBare] || disambiguationHints[seed])) || null;
        const strippedSeed = (0, curatorService_1.normalizeArtistId)((0, isoCountries_1.stripCountrySlug)(seed, hintCountry));
        const hintGenre = (disambiguationGenres && (disambiguationGenres[seedNorm] || disambiguationGenres[strippedSeed] || disambiguationGenres[preliminaryBare] || disambiguationGenres[seed])) || null;
        const expectedSeedIso = (hintCountry ? (0, isoCountries_1.normalizeIsoCode)((0, curatorService_1.extractCountrySlug)(hintCountry)) : null) || (0, isoCountries_1.extractTrailingCountryIso)(seed);
        let cachedDetails = null;
        let resolvedSeedNorm = seedNorm;
        try {
            let effectiveStrippedSeed = strippedSeed;
            let dedupQuery = await db.collection("artists")
                .where("artistId", ">=", strippedSeed)
                .where("artistId", "<=", `${strippedSeed}\uf8ff`)
                .limit(10)
                .get();
            if (dedupQuery.empty) {
                const strippedSeedNoThe = (0, isoCountries_1.stripLeadingTheFromSlug)(strippedSeed);
                if (strippedSeedNoThe && strippedSeedNoThe !== strippedSeed) {
                    effectiveStrippedSeed = strippedSeedNoThe;
                    dedupQuery = await db.collection("artists")
                        .where("artistId", ">=", strippedSeedNoThe)
                        .where("artistId", "<=", `${strippedSeedNoThe}\uf8ff`)
                        .limit(10)
                        .get();
                }
            }
            if (!dedupQuery.empty) {
                const hasAmbiguousSibling = (0, isoCountries_1.inspectSlugDedupAmbiguity)(dedupQuery.docs.map(d => ({ id: d.id, data: d.data() })), effectiveStrippedSeed);
                for (const snap of dedupQuery.docs) {
                    const snapData = snap.data();
                    if (!(0, isoCountries_1.shouldAdoptCanonicalSlugCandidate)(expectedSeedIso, snap.id, snapData, effectiveStrippedSeed, { hasAmbiguousSibling, isSeed: true })) {
                        continue;
                    }
                    if (snap.id !== seedNorm && snapData.artistId) {
                        if (snapData.graphData) {
                            resolvedSeedNorm = snap.id;
                            break;
                        }
                        resolvedSeedNorm = snap.id;
                    }
                }
            }
        }
        catch (dedupErr) {
            console.warn(`[resolveSceneTopologyBackend] Seed slug dedup query failed for "${seedNorm}", proceeding with derived ID:`, dedupErr);
        }
        const canonicalBareId = (0, isoCountries_1.stripCountrySlug)(resolvedSeedNorm, expectedSeedIso || hintCountry);
        if (canonicalBareId && canonicalBareId !== resolvedSeedNorm && (!expectedSeedIso || (0, isoCountries_1.areCountryIsosCompatible)(expectedSeedIso, (0, isoCountries_1.extractTrailingCountryIso)(resolvedSeedNorm)))) {
            await (0, routerStubService_1.upsertBareRouterStub)(db, canonicalBareId, resolvedSeedNorm, {
                name: seedNamesMap[resolvedSeedNorm] || seedNamesMap[seedNorm] || seed,
                origin: hintCountry || undefined,
                genre: hintGenre || undefined,
            });
        }
        let hasGraphData = false;
        try {
            let cacheDoc = await db.collection("artists").doc(resolvedSeedNorm).get();
            if (cacheDoc.exists) {
                let cacheData = cacheDoc.data();
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
            console.warn(`[resolveSceneTopologyBackend] Failed cache lookup for ${resolvedSeedNorm}`, e);
        }
        const qualificationIso = expectedSeedIso || (0, isoCountries_1.extractTrailingCountryIso)(resolvedSeedNorm);
        if ((0, cacheQualification_1.isFullyQualifiedEntityProfile)(cachedDetails, false, qualificationIso, { requireMembersAndPeers: true })) {
            const cachedArtistName = typeof cachedDetails?.details?.artist === 'string' && cachedDetails.details.artist.trim()
                ? cachedDetails.details.artist.trim()
                : null;
            const cleanHitName = cachedArtistName || seedNamesMap[resolvedSeedNorm] || seedNamesMap[seedNorm] || seedNamesMap[seed.toLowerCase()] || seed;
            seedNamesMap[resolvedSeedNorm] = cleanHitName;
            seedNamesMap[seedNorm] = cleanHitName;
            if (hasGraphData) {
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
            needsProGeneration = true;
            hasCacheMiss = true;
            // V47.18 (Pillar B): Lock pre-validated seed identity in Column 2.
            // When a cold or degraded seed already arrives from Box 4 (<ConsolidatedValidationModal>)
            // with a valid trailing ISO country code, origin hint, genre hint, and display name,
            // honor its locked identity directly without invoking a redundant second Flash call.
            const resolvedTrailingIso = (0, isoCountries_1.extractTrailingCountryIso)(resolvedSeedNorm);
            const lockedOriginHint = hintCountry ||
                (typeof cachedDetails?.details?.origin === "string" ? cachedDetails.details.origin.trim() : "");
            const lockedGenreHint = hintGenre ||
                (disambiguationGenres && disambiguationGenres[resolvedSeedNorm]) ||
                (typeof cachedDetails?.details?.genre === "string" ? cachedDetails.details.genre.trim() : "");
            const lockedDisplayName = seedNamesMap[resolvedSeedNorm] ||
                seedNamesMap[seedNorm] ||
                seedNamesMap[strippedSeed] ||
                seedNamesMap[preliminaryBare] ||
                seedNamesMap[seed] ||
                seedNamesMap[seed.toLowerCase()] ||
                (typeof cachedDetails?.details?.artist === "string" ? cachedDetails.details.artist.trim() : "");
            const hasLockedPreFlightIdentity = Boolean(resolvedTrailingIso &&
                !resolvedSeedNorm.endsWith("-uk") &&
                lockedOriginHint &&
                lockedOriginHint.trim() &&
                lockedOriginHint.trim() !== "Unknown" &&
                lockedGenreHint &&
                lockedGenreHint.trim() &&
                lockedGenreHint.trim() !== "Unknown" &&
                lockedDisplayName &&
                lockedDisplayName.trim());
            if (hasLockedPreFlightIdentity) {
                const cleanLockedName = lockedDisplayName.trim();
                const cleanLockedOrigin = lockedOriginHint.trim();
                const cleanLockedGenre = lockedGenreHint.trim();
                console.log(`[Phase 1] Pre-validated seed identity locked for "${resolvedSeedNorm}" ("${cleanLockedName}", ${cleanLockedOrigin}, ${cleanLockedGenre}). Bypassing redundant Flash re-validation.`);
                seedNamesMap[resolvedSeedNorm] = cleanLockedName;
                seedNamesMap[seedNorm] = cleanLockedName;
                resolvedSeedArray.push({
                    id: resolvedSeedNorm,
                    name: cleanLockedName,
                    origin: cleanLockedOrigin,
                    genre: cleanLockedGenre,
                    isCacheHit: false,
                });
                seedStubs[resolvedSeedNorm] = {
                    _isStub: true,
                    summary: "Awaiting Deep Cut analysis...",
                    imageUrl: null,
                    details: {
                        genre: cleanLockedGenre,
                        origin: cleanLockedOrigin,
                        founded: "Unknown",
                        notableArtists: [],
                    },
                    discography: [],
                    links: [],
                };
            }
            else {
                let validationResult = null;
                const effectiveGenreHint = hintGenre || "Unknown";
                const rawId = seedNamesMap[resolvedSeedNorm] ||
                    seedNamesMap[seedNorm] ||
                    (originalQueries && (originalQueries[seedNorm] || originalQueries[strippedSeed])) ||
                    strippedSeed;
                const valResult = await (0, curatorService_1.validateSeedOriginBackend)(rawId || seed, hintCountry ? { originHint: hintCountry, genreHint: effectiveGenreHint } : undefined);
                validationResult = valResult;
                if (valResult.apiUsage) {
                    usageCollector.push(valResult.apiUsage.model, valResult.apiUsage);
                }
                if (validationResult.isValid) {
                    const bareNormId = (0, curatorService_1.normalizeArtistId)(validationResult.id);
                    const normId = (0, isoCountries_1.canonicalizeArtistSlugWithOrigin)(bareNormId, validationResult.origin);
                    if (normId !== bareNormId) {
                        await (0, routerStubService_1.upsertBareRouterStub)(db, bareNormId, normId, {
                            name: validationResult.id,
                            origin: validationResult.origin || "Unknown",
                            genre: validationResult.genre || "Unknown",
                            disambiguationSnippet: validationResult.candidates?.[0]?.disambiguationSnippet,
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
                }
                else {
                    throw new https_1.HttpsError("failed-precondition", `Validation failed for seed: ${seed}.`);
                }
            }
        }
    }
    const isComplexGeneration = artistList.length > 1 || hasActiveFilters;
    if (isComplexGeneration || intent === 'cache_upgrade') {
        needsProGeneration = true;
    }
    let finalGraph = (!isComplexGeneration && baseGraph) ? baseGraph : { nodes: [], links: [] };
    if (needsProGeneration) {
        const disambiguationHintsForPrompt = { ...(disambiguationHints || {}) };
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
        const displayArtistsForPrompt = resolvedSeedArray.length > 0
            ? resolvedSeedArray.map(s => s.name || s.id).join('::')
            : artistList.join('::');
        const result = await (0, curatorService_1.generateGraphDataBackend)(displayArtistsForPrompt, sanitizedFilters, isComplexGeneration ? undefined : cachedSubgraphsContext, isComplexGeneration ? undefined : baseGraph, disambiguationHintsForPrompt);
        finalGraph = result.graphData;
        if (result.apiUsage) {
            usageCollector.push(result.apiUsage.model, result.apiUsage);
        }
    }
    else if (!baseGraph || baseGraph.nodes.length === 0) {
        const seedNorm = resolvedSeedArray[0]?.id || (0, curatorService_1.normalizeArtistId)(artistList[0]);
        const cacheData = cachedDocsData[seedNorm] || cachedDocsData[(0, curatorService_1.normalizeArtistId)(artistList[0])] || null;
        if (cacheData) {
            if (cacheData && cacheData.graphData) {
                const rawGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
                finalGraph = JSON.parse(JSON.stringify(rawGraph));
                if (cacheData.synthesisRationale || rawGraph.synthesisRationale) {
                    finalGraph.synthesisRationale = cacheData.synthesisRationale || rawGraph.synthesisRationale;
                }
            }
        }
    }
    if (finalGraph.nodes) {
        (0, isoCountries_1.inferNodeOriginsFromCountryLinks)(finalGraph.nodes, finalGraph.links);
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
            const seedMatch = resolvedSeedArray.find(s => (0, isoCountries_1.isEntitySeedMatch)(s.id, originalNormId));
            if (seedMatch) {
                if (seedMatch.origin) {
                    n.origin = seedMatch.origin;
                }
                if (seedMatch.genre && !n.genre) {
                    n.genre = seedMatch.genre;
                }
                newId = seedMatch.id;
            }
            else if (n.type === 'artist' && n.origin) {
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
                    link.source = sId;
                }
                if (idRewriteMap.size > 0 && idRewriteMap.has(tId)) {
                    link.target = idRewriteMap.get(tId);
                }
                else {
                    link.target = tId;
                }
            }
        }
        for (const seed of artistList) {
            const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
            const resolvedSeed = resolvedSeedArray.find(r => (0, isoCountries_1.isEntitySeedMatch)(r.id, seedNorm) || (0, curatorService_1.normalizeArtistId)(r.name) === seedNorm || r.id === seedNorm);
            const sluggedSeedNorm = resolvedSeed ? resolvedSeed.id : seedNorm;
            const seedNode = finalGraph.nodes.find((n) => (0, isoCountries_1.isEntitySeedMatch)(sluggedSeedNorm, n.id) || (0, isoCountries_1.isEntitySeedMatch)(seedNorm, n.id) || (0, isoCountries_1.isEntitySeedMatch)(seedNorm, n.label || ''));
            if (seedNode) {
                if (resolvedSeed?.name) {
                    seedNode.label = resolvedSeed.name;
                }
                if (seedNode.id !== sluggedSeedNorm) {
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
    }
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
    return {
        finalGraph,
        resolvedSeedArray,
        seedStubs,
        detailsCacheEntries,
        determinedGenerationType,
        collectedTokens,
    };
}
exports.validateSeedOriginCallable = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 60,
    memory: "512MiB",
    enforceAppCheck: tokenWallet_1.ENFORCE_APP_CHECK,
}, async (request) => {
    const caller = (0, tokenWallet_1.requireAuthenticatedCaller)(request);
    const { seed, bundledSeedsLabel, originHint, genreHint, curationSessionId, mode, expectedProjectCost } = request.data || {};
    if (!seed) {
        throw new https_1.HttpsError("invalid-argument", "Missing seed in payload");
    }
    // Rule 18 & 43: Atomic 1-Token Non-Refundable Pre-Flight / Escape-Hatch Lookup Fee (Admin bypassed)
    const resolvedMode = originHint || mode === "escape_hatch" ? "escape_hatch" : "initial_preflight";
    const effectiveLabel = (resolvedMode === "initial_preflight" && typeof bundledSeedsLabel === "string" && bundledSeedsLabel.trim())
        ? bundledSeedsLabel.trim()
        : String(seed).trim();
    const lookupBilling = await (0, tokenWallet_1.chargePreFlightLookupIfNeeded)({
        caller,
        curationSessionId,
        mode: resolvedMode,
        expectedProjectCost: expectedProjectCost === 10 ? 10 : 5,
        seedLabel: effectiveLabel,
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
    // V11.6 Fix 2B (Rule 11): Hard-block the pipeline for unrecognizable entities or failed bouncer re-queries.
    // isValid: false means the model could not confidently map the input to any known artist matching the parameters.
    // Throwing here prevents a broken stub from being minted and the pipeline from executing.
    if (!validationResult.isValid) {
        console.warn(`[validateSeedOriginCallable] Rule 11 BLOCK: Seed "${seed}" returned isValid: false. Rejecting pipeline.`);
        throw new https_1.HttpsError("not-found", originHint
            ? `No culturally significant artist named "${seed}" found matching origin "${originHint}"${genreHint ? ` / genre "${genreHint}"` : ""}.`
            : `"${seed}" could not be identified as a real musical artist or label. Please check the spelling and try again.`);
    }
    const isAmbiguous = !!(validationResult.hasCollision && validationResult.candidates && validationResult.candidates.length > 1);
    const isEscapeHatchQuery = Boolean((typeof originHint === "string" && originHint.trim()) ||
        (typeof genreHint === "string" && genreHint.trim()) ||
        mode === "escape_hatch");
    // V47.18 (Pillar A): Front-Door iTunes Naming Authority ($0.00, 1500ms fail-open timeout).
    // Runs strictly on unambiguous initial pre-flight seeds (!isAmbiguous && !isEscapeHatchQuery)
    // BEFORE correctedInput enforcement and router stub minting so Apple Music's official
    // capitalization, internal hyphens ("At the Drive-In"), and leading "The " ("The Murder City Devils")
    // become the single source of truth from the front door.
    if (!isAmbiguous && !isEscapeHatchQuery && validationResult.id) {
        try {
            const itunesCanonicalName = await (0, curatorService_1.resolveItunesCanonicalArtistNameBackend)(validationResult.id, validationResult.genre, validationResult.origin, validationResult.candidates?.[0]?.disambiguationSnippet, 1500);
            if (itunesCanonicalName) {
                if (itunesCanonicalName !== validationResult.id) {
                    console.log(`[validateSeedOriginCallable] [Pillar A iTunes Authority] Snapped "${validationResult.id}" → "${itunesCanonicalName}"`);
                }
                validationResult.id = itunesCanonicalName;
                const snappedBareSlug = (0, curatorService_1.normalizeArtistId)(itunesCanonicalName);
                let snappedTargetId = (0, isoCountries_1.canonicalizeArtistSlugWithOrigin)(snappedBareSlug, validationResult.origin);
                // Check if an existing non-stub cached artist doc already lives at either snappedTargetId
                // or its leading-"the-" counterpart so we never duplicate an already-cached Firestore doc.
                try {
                    const snappedIso = (0, isoCountries_1.extractTrailingCountryIso)(snappedTargetId);
                    const strippedNoThe = (0, isoCountries_1.stripLeadingTheFromSlug)(snappedBareSlug);
                    const altBareSlug = strippedNoThe !== snappedBareSlug ? strippedNoThe : `the-${snappedBareSlug}`;
                    const altTargetId = snappedIso && altBareSlug !== snappedBareSlug
                        ? `${altBareSlug}-${snappedIso}`
                        : null;
                    const primarySnap = await db.collection("artists").doc(snappedTargetId).get();
                    const primaryData = primarySnap.exists ? primarySnap.data() : null;
                    const isPrimaryNonStub = Boolean(primaryData && !primaryData._isStub && !primaryData.redirectTo && !primaryData.isAmbiguous);
                    if (!isPrimaryNonStub && altTargetId && altTargetId !== snappedTargetId) {
                        const altSnap = await db.collection("artists").doc(altTargetId).get();
                        const altData = altSnap.exists ? altSnap.data() : null;
                        const isAltNonStub = Boolean(altData && !altData._isStub && !altData.redirectTo && !altData.isAmbiguous);
                        if (isAltNonStub) {
                            console.log(`[validateSeedOriginCallable] [Pillar A Cache Reuse] Adopting existing cached doc "${altTargetId}" for "${itunesCanonicalName}"`);
                            snappedTargetId = altTargetId;
                        }
                    }
                }
                catch (cacheCheckErr) {
                    console.warn(`[validateSeedOriginCallable] Non-fatal existing cache doc check warning:`, cacheCheckErr);
                }
                if (Array.isArray(validationResult.candidates) && validationResult.candidates.length === 1) {
                    validationResult.candidates[0] = {
                        ...validationResult.candidates[0],
                        id: snappedTargetId,
                        name: itunesCanonicalName,
                    };
                }
            }
        }
        catch (itunesErr) {
            console.warn(`[validateSeedOriginCallable] Non-fatal iTunes front-door naming check failed open for "${validationResult.id}":`, itunesErr);
        }
    }
    // V11.6 Fix 2 / V47.13 / V47.18 / V47.19: Programmatically enforce correctedInput:
    // - Case-insensitive matches ("void" -> "Void", "The hives" -> "The Hives") or invalid results force correctedInput = false
    // - Single-artist canonical name / typo / article normalizations force correctedInput = true
    // - Colliding typos ("nrvana" -> "Nirvana", hasCollision: true) preserve Flash's correctedInput: true
    const isCaseInsensitiveMatch = String(seed).trim().toLowerCase() === String(validationResult.id || "").trim().toLowerCase();
    if (!validationResult.isValid || isCaseInsensitiveMatch) {
        validationResult.correctedInput = false;
    }
    else if (!validationResult.hasCollision && Boolean(String(validationResult.id || "").trim())) {
        validationResult.correctedInput = true;
        console.log(`[validateSeedOriginCallable] Canonical normalization applied: "${seed}" → "${validationResult.id}"`);
    }
    // V47.19 Read-Only Pre-Flight Gateway:
    // Never write speculative router stubs to /artists during pre-flight before the user confirms in Box 4
    // (preventing orphan stubs on Cancel/Escape Hatch and keeping post-canonicalization Direct Hit checks pure).
    // If an ambiguous router stub already exists in /artists from prior confirmed curations, merge its cached
    // candidates in-memory so the radio disambiguation card surfaces all known homonyms.
    if (!isEscapeHatchQuery && isAmbiguous) {
        try {
            const candidates = validationResult.candidates || [];
            const bareNormId = (0, curatorService_1.normalizeArtistId)(seed);
            const stubDocRef = db.collection("artists").doc(bareNormId);
            const existingSnap = await stubDocRef.get();
            const existingCandidates = existingSnap.exists && Array.isArray(existingSnap.data()?.candidates)
                ? existingSnap.data().candidates
                : [];
            if (existingCandidates.length > 0) {
                const mergedCandidates = [...candidates];
                for (const prev of existingCandidates) {
                    if (prev?.id && !mergedCandidates.some((c) => c?.id === prev.id)) {
                        mergedCandidates.push(prev);
                    }
                }
                validationResult.candidates = mergedCandidates;
            }
        }
        catch (stubReadErr) {
            console.warn(`[validateSeedOriginCallable] Non-fatal cached candidate read warning for "${seed}":`, stubReadErr);
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
    enforceAppCheck: tokenWallet_1.ENFORCE_APP_CHECK,
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
    let updatedScenes = (0, multiSceneUtils_1.parseProjectScenes)(payload.scenes);
    // Catch 5A: isUpfrontBatch triggers ONLY when >1 scenes in the batch are uncurated
    const uncuratedScenesInBatch = updatedScenes.filter(s => (s.graphData?.nodes?.length ?? 0) === 0);
    const isUpfrontBatch = uncuratedScenesInBatch.length > 1;
    let targetSceneId = payload.targetSceneId || payload.activeSceneId || "scene-1";
    if (isUpfrontBatch && uncuratedScenesInBatch[0]) {
        const firstUncurated = uncuratedScenesInBatch[0];
        targetSceneId = firstUncurated.sceneId || firstUncurated.id || targetSceneId;
    }
    const parsedSceneIdx = parseInt(String(targetSceneId).replace(/^scene-/i, ""), 10);
    let targetSceneIndex = typeof payload.sceneIndex === "number" && payload.sceneIndex >= 0
        ? payload.sceneIndex
        : Number.isFinite(parsedSceneIdx) && parsedSceneIdx >= 1
            ? parsedSceneIdx - 1
            : 0;
    if (targetSceneIndex >= multiSceneUtils_1.MAX_SCENES_PER_PROJECT) {
        throw new https_1.HttpsError("invalid-argument", "Maximum of 5 scenes per project reached.");
    }
    // Rule 18 & 43: Settle remaining project token balance (supports multi-scene batch aggregate)
    let totalProjectCost = (0, tokenEconomy_1.computeBaseProjectTokenCost)(artistList.length, hasActiveFilters);
    const targetSceneDisplaySeeds = artistList.map((s) => seedNamesMap[s] || s).join(', ');
    let batchDisplaySeeds = targetSceneDisplaySeeds;
    if (isUpfrontBatch) {
        totalProjectCost = uncuratedScenesInBatch.reduce((sum, sc) => {
            const scSeeds = (0, multiSceneUtils_1.toSeedArtistsArray)(sc.seedArtists);
            const scFilters = (0, cacheQualification_1.sanitizeDiscoveryFilters)(sc.discoveryFilters);
            return sum + (0, tokenEconomy_1.computeBaseProjectTokenCost)(scSeeds.length, (0, cacheQualification_1.hasActiveDiscoveryFilters)(scFilters));
        }, 0);
        batchDisplaySeeds = uncuratedScenesInBatch.map(sc => {
            const scSeeds = (0, multiSceneUtils_1.toSeedArtistsArray)(sc.seedArtists);
            return scSeeds.map((s) => seedNamesMap[s] || s).join(', ');
        }).join(' & ');
    }
    const settlement = await (0, tokenWallet_1.settleCurationProjectTokens)({
        caller,
        curationSessionId: payload.curationSessionId,
        totalProjectCost,
        projectId: payload.projectId,
        targetSceneId,
        txType: "spend_live_synthesis",
        description: `Zcene Synthesis: ${batchDisplaySeeds}`,
        generationTypeToStamp: hasActiveFilters ? "Filtered Live Synthesis" : "Root Generation",
        seedArtist: batchDisplaySeeds,
    });
    let collectedTokens = {};
    try {
        const shouldDeferToWorker = payload.deferPhase1ToWorker === true || isUpfrontBatch;
        let finalGraph = payload.baseGraph || { nodes: [], links: [] };
        let resolvedSeedArray = [];
        let seedStubs = {};
        let determinedGenerationType = "Root Generation";
        if (!shouldDeferToWorker) {
            const topoResult = await resolveSceneTopologyBackend({
                db,
                artistList,
                filters: payload.filters,
                seedNamesMap,
                disambiguationHints: payload.disambiguationHints,
                disambiguationGenres: payload.disambiguationGenres,
                originalQueries: payload.originalQueries,
                cachedSubgraphsContext: payload.cachedSubgraphsContext,
                baseGraph: payload.baseGraph,
                intent: payload.intent,
            });
            finalGraph = topoResult.finalGraph;
            resolvedSeedArray = topoResult.resolvedSeedArray;
            seedStubs = topoResult.seedStubs;
            determinedGenerationType = topoResult.determinedGenerationType;
            collectedTokens = topoResult.collectedTokens;
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
            const resolvedSeed = resolvedSeedArray.find(r => (0, isoCountries_1.isEntitySeedMatch)(r.id, seedNorm) || (0, curatorService_1.normalizeArtistId)(r.name) === seedNorm);
            const targetSeedId = resolvedSeed ? resolvedSeed.id : seed;
            const exists = recommendedEntities.some((e) => (0, isoCountries_1.isEntitySeedMatch)(targetSeedId, e.id) || (0, isoCountries_1.isEntitySeedMatch)(seedNorm, e.name));
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
        let existingSavedLayout;
        if (Array.isArray(payload.canvasLayout)) {
            existingSavedLayout = payload.canvasLayout;
        }
        else if (typeof payload.canvasLayout === 'string') {
            try {
                const parsedLayout = JSON.parse(payload.canvasLayout);
                if (Array.isArray(parsedLayout))
                    existingSavedLayout = parsedLayout;
            }
            catch { }
        }
        if (payload.userId && payload.projectId) {
            try {
                let existingProjName = undefined;
                const projectDocRef = db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId);
                try {
                    const existingProjSnap = await projectDocRef.get();
                    if (existingProjSnap.exists) {
                        const existingProjData = existingProjSnap.data();
                        existingProjName = existingProjData?.name;
                        if (updatedScenes.length === 0 && existingProjData?.scenes) {
                            updatedScenes = (0, multiSceneUtils_1.parseProjectScenes)(existingProjData.scenes);
                        }
                        if (!existingSavedLayout && existingProjData?.canvasLayout) {
                            try {
                                const parsedLayout = typeof existingProjData.canvasLayout === 'string'
                                    ? JSON.parse(existingProjData.canvasLayout)
                                    : existingProjData.canvasLayout;
                                if (Array.isArray(parsedLayout))
                                    existingSavedLayout = parsedLayout;
                            }
                            catch { }
                        }
                    }
                }
                catch (readErr) {
                    // Graceful fallback if project doc doesn't exist yet or in unit test mocks without .get()
                }
                const prevTargetScene = updatedScenes.find(s => (s.sceneId || s.id) === targetSceneId);
                const activeScenePayload = (0, multiSceneUtils_1.normalizeProjectScene)({
                    id: targetSceneId,
                    sceneId: targetSceneId,
                    sceneIndex: targetSceneIndex,
                    title: targetSceneDisplaySeeds || prevTargetScene?.title || `Scene ${targetSceneIndex + 1}`,
                    name: targetSceneDisplaySeeds || prevTargetScene?.name || `Scene ${targetSceneIndex + 1}`,
                    ...(prevTargetScene?.customName ? { customName: prevTargetScene.customName } : {}),
                    seedArtists: resolvedSeedArray.length > 0
                        ? resolvedSeedArray.map(s => s.name || s.id).join('::')
                        : (artistList.map((s) => seedNamesMap[s] || s).join('::') || prevTargetScene?.seedArtists || targetSceneDisplaySeeds),
                    seedIds: resolvedSeedArray.length > 0
                        ? resolvedSeedArray.map(s => s.id)
                        : artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a)),
                    seedArtistIds: resolvedSeedArray.length > 0
                        ? resolvedSeedArray.map(s => s.id)
                        : artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a)),
                    discoveryFilters: payload.filters || {},
                    graphData: finalGraph,
                    synthesisRationale: finalGraph.synthesisRationale || "",
                    ...(prevTargetScene?.zineTitle ? { zineTitle: prevTargetScene.zineTitle } : {}),
                    ...(prevTargetScene?.zineIntro ? { zineIntro: prevTargetScene.zineIntro } : {}),
                    ...(prevTargetScene?.zineImages ? { zineImages: prevTargetScene.zineImages } : {}),
                    artistSnippets: {},
                    centerOffset: (0, multiSceneUtils_1.getSceneCenterOffset)(targetSceneIndex),
                    status: determinedGenerationType === "Direct Hit" ? "ready" : "curating",
                    pathway: determinedGenerationType === "Direct Hit"
                        ? "direct_hit"
                        : determinedGenerationType === "Complex Generation"
                            ? "complex_generation"
                            : "root_generation",
                    updatedAt: Date.now(),
                }, targetSceneIndex);
                const existingIdx = updatedScenes.findIndex(s => (s.sceneId || s.id) === targetSceneId);
                if (existingIdx !== -1) {
                    updatedScenes[existingIdx] = activeScenePayload;
                }
                else {
                    updatedScenes.push(activeScenePayload);
                }
                updatedScenes.sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
                const populatedUpdatedScenes = updatedScenes.filter(s => s.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0);
                const compositeProjectGraph = populatedUpdatedScenes.length >= 1
                    ? (0, multiSceneUtils_1.buildCompositeCanvasGraph)(populatedUpdatedScenes, [], existingSavedLayout)
                    : finalGraph;
                console.log(`[Pipeline Diamond] -> Initiating Curation Pipeline for ${payload.projectId} (scene=${targetSceneId}) with type: ${determinedGenerationType}`);
                const projectUpdate = {
                    graphData: JSON.stringify(compositeProjectGraph),
                    schemaVersion: 43,
                    scenes: JSON.stringify(updatedScenes),
                    activeSceneId: targetSceneId,
                    sceneCount: updatedScenes.length,
                    seedArtistIds: (0, multiSceneUtils_1.getAllProjectSeedIds)(updatedScenes),
                    supportsLabelDeepCuts: true,
                    generationType: determinedGenerationType,
                    tokensSpent: settlement.projectTokensSpent,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                };
                if (updatedScenes.length > 1) {
                    const isAuto = (0, multiSceneUtils_1.isAutoGeneratedProjectTitle)(existingProjName, updatedScenes);
                    if (isAuto) {
                        const multiSceneTitle = (0, multiSceneUtils_1.generateProjectTitleFromScenes)(updatedScenes);
                        if (multiSceneTitle && multiSceneTitle !== 'Untitled Zcene') {
                            projectUpdate.name = multiSceneTitle;
                        }
                    }
                }
                await projectDocRef.set(projectUpdate, { merge: true });
                console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData & scenes via Admin SDK`);
                if (determinedGenerationType !== "Direct Hit" || updatedScenes.length >= 2) {
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
                            mode: payload.mode === "overarching_only" ? "overarching_only" : (determinedGenerationType === "Direct Hit" && updatedScenes.length >= 2 ? "overarching_only" : "standard"),
                            targetSceneId,
                            sceneIndex: targetSceneIndex,
                            scenes: updatedScenes,
                            curationSessionId: settlement.curationSessionId,
                            tokensSpent: settlement.tokensSpent,
                            artists: resolvedSeedArray.length > 0 ? resolvedSeedArray.map(s => s.id).join('::') : artistList.join('::'),
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
                    await (0, tokenWallet_1.updateCurationLockJobId)(caller.uid, settlement.curationSessionId, curationJobId);
                    console.log(`[Pipeline Diamond] -> Created curation job ${curationJobId} for background hydration (scene=${targetSceneId}, lockedSeeds=${resolvedSeedArray.map(s => s.id).join(', ')})`);
                    // Update project with activeJobId and lock status to curating
                    await projectDocRef.set({
                        status: "curating",
                        activeJobId: curationJobId,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                else {
                    console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Skipping background hydration job.`);
                    await projectDocRef.set({
                        status: "completed",
                        activeJobId: null,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    await (0, tokenWallet_1.releaseCurationLock)(caller.uid, settlement.curationSessionId);
                }
            }
            catch (err) {
                console.error(`[Pipeline Diamond] -> Failed to update project doc ${payload.projectId} / spawn job`, err);
                throw err;
            }
        }
        else {
            // No background curation job spawned when projectId is omitted -> release lock immediately
            await (0, tokenWallet_1.releaseCurationLock)(caller.uid, settlement.curationSessionId);
        }
        console.log(`[Pipeline Diamond] -> Curation Phase 1 Complete, returning structural payload to client`);
        return {
            graphData: finalGraph,
            targetSceneId,
            scenes: updatedScenes,
            detailsCache: "[]",
            rootBreakdown: null,
            activeJobId: curationJobId,
            tokensSpent: settlement.tokensSpent,
            tokenBalance: settlement.tokenBalance,
        };
    }
    catch (pipelineErr) {
        const { costUsd: sunkCostUsd } = (0, tokenWallet_1.computeApiUsageCostUsd)(collectedTokens);
        await (0, tokenWallet_1.releaseCurationLock)(caller.uid, settlement.curationSessionId);
        const refundOutcome = await (0, tokenWallet_1.refundProjectSettlementOnError)({
            uid: caller.uid,
            projectId: payload.projectId,
            curationSessionId: settlement.curationSessionId,
            reason: "Column 2 Topology Pipeline Error",
            sunkCostUsd,
            sunkApiUsage: collectedTokens,
        });
        await (0, tokenWallet_1.recordCurationFailureAudit)({
            source: "column2_error",
            uid: caller.uid,
            userEmail: caller.email,
            projectId: payload.projectId || null,
            projectName: batchDisplaySeeds || null,
            curationSessionId: settlement.curationSessionId,
            sceneId: targetSceneId,
            tokensRefunded: refundOutcome.refundedTokens,
            isFullRefund: refundOutcome.isFullRefund,
            reason: "Column 2 Topology Pipeline Error",
            errorMessage: pipelineErr?.message || String(pipelineErr),
            sunkApiUsage: collectedTokens,
        });
        throw pipelineErr;
    }
});
//# sourceMappingURL=executeCurationPipeline.js.map
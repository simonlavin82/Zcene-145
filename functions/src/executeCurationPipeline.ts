import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { 
  generateGraphDataBackend, 
  validateSeedOriginBackend,
  normalizeArtistId,
  extractCountrySlug
} from "./services/curatorService";
import {
  hasActiveDiscoveryFilters,
  isFullyQualifiedEntityProfile,
  sanitizeDiscoveryFilters
} from "./services/cacheQualification";
import {
  stripCountrySlug as stripIsoCountrySlug,
  extractTrailingCountryIso,
  areCountryIsosCompatible,
  normalizeIsoCode,
  canonicalizeArtistSlugWithOrigin,
  shouldAdoptCanonicalSlugCandidate,
  inspectSlugDedupAmbiguity,
  inferNodeOriginsFromCountryLinks,
  isEntitySeedMatch,
} from "./shared/isoCountries";
import { upsertBareRouterStub } from "./services/routerStubService";
import { computeBaseProjectTokenCost } from "./shared/tokenEconomy";
import { ProjectScene } from "./types";
import {
  getSceneCenterOffset,
  parseProjectScenes,
  getAllProjectSeedIds,
  normalizeProjectScene,
  buildCompositeCanvasGraph,
  MAX_SCENES_PER_PROJECT,
} from "./shared/multiSceneUtils";
import {
  requireAuthenticatedCaller,
  chargePreFlightLookupIfNeeded,
  recordPreFlightApiUsage,
  settleCurationProjectTokens,
  refundProjectSettlementOnError,
} from "./tokenWallet";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  // Ignore if already set by another function module
}

export const stripCountrySlug = stripIsoCountrySlug;
export { canonicalizeArtistSlugWithOrigin, shouldAdoptCanonicalSlugCandidate };

export const validateSeedOriginCallable = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (request) => {
  const caller = requireAuthenticatedCaller(request);
  const { seed, originHint, genreHint, curationSessionId, mode, expectedProjectCost } = request.data || {};
  if (!seed) {
    throw new HttpsError("invalid-argument", "Missing seed in payload");
  }

  // Rule 18 & 43: Atomic 1-Token Non-Refundable Pre-Flight / Escape-Hatch Lookup Fee (Admin bypassed)
  const resolvedMode = originHint || mode === "escape_hatch" ? "escape_hatch" : "initial_preflight";
  const lookupBilling = await chargePreFlightLookupIfNeeded({
    caller,
    curationSessionId,
    mode: resolvedMode,
    expectedProjectCost: expectedProjectCost === 10 ? 10 : 5,
    seedLabel: String(seed).trim(),
  });

  const validationResult = await validateSeedOriginBackend(seed, { originHint, genreHint });

  // Persist Flash pre-flight micro-cost telemetry BEFORE any Rule 11 rejection or Box 4 cancellation
  await recordPreFlightApiUsage({
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
    throw new HttpsError(
      "not-found",
      originHint
        ? `No culturally significant artist named "${seed}" found matching origin "${originHint}"${genreHint ? ` / genre "${genreHint}"` : ""}.`
        : `"${seed}" could not be identified as a real musical artist or label. Please check the spelling and try again.`
    );
  }

  // Synchronously mint evolved stub in artists collection (Pre-Flight Gateway)
  // Gated: If an originHint is provided (Escape Hatch Re-Query in Column 1), do NOT mint premature stubs before human confirms in Node 4.
  if (!originHint) {
    try {
      const bareNormId = normalizeArtistId(seed);
      const stubDocRef = db.collection("artists").doc(bareNormId);
      const isAmbiguous = !!(validationResult.hasCollision && validationResult.candidates && validationResult.candidates.length > 1);
      const candidates = validationResult.candidates || [];

      if (isAmbiguous) {
        const existingSnap = await stubDocRef.get();
        const existingCandidates: any[] = existingSnap.exists && Array.isArray(existingSnap.data()?.candidates)
          ? existingSnap.data()!.candidates
          : [];
        const mergedCandidates = [...candidates];
        for (const prev of existingCandidates) {
          if (prev?.id && !mergedCandidates.some((c: any) => c?.id === prev.id)) {
            mergedCandidates.push(prev);
          }
        }
        await stubDocRef.set({
          _isStub: true,
          isAmbiguous: true,
          redirectTo: null,
          artistId: bareNormId,
          cacheKey: bareNormId,
          candidates: mergedCandidates,
          cachedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[validateSeedOriginCallable] Minted evolved ambiguous stub for "${bareNormId}" with ${mergedCandidates.length} candidates`);
      } else if (candidates.length === 1 && candidates[0].id !== bareNormId) {
        await upsertBareRouterStub(db, bareNormId, candidates[0].id, {
          name: candidates[0].name || validationResult.id || seed,
          origin: candidates[0].origin || validationResult.origin,
          genre: candidates[0].genre || validationResult.genre,
          disambiguationSnippet: candidates[0].disambiguationSnippet,
          candidates,
        });
      }
    } catch (stubErr) {
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

export const executeCurationPipeline = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  const caller = requireAuthenticatedCaller(request);
  const payload = request.data;
  const safePayload = { ...payload };
  if (safePayload.password) delete safePayload.password;
  console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, safePayload);

  if (!payload || !payload.artists) {
    throw new HttpsError("invalid-argument", "Missing artists in payload");
  }

  // Bind userId strictly to verified Firebase Auth identity
  payload.userId = caller.uid;

  const artistList = payload.artists
    .split('::')
    .map((a: string) => a.trim())
    .filter(Boolean);

  const seedNamesMap: Record<string, string> = payload.seedNames || {};
  payload.filters = sanitizeDiscoveryFilters(payload.filters);
  const hasActiveFilters = hasActiveDiscoveryFilters(payload.filters);

  // Rule 18 & 43: Settle remaining project token balance (4T/5T Single-Seed or 9T/10T Complex)
  const totalProjectCost = computeBaseProjectTokenCost(artistList.length, hasActiveFilters);
  const displaySeeds = artistList.map((s: string) => seedNamesMap[s] || s).join(' + ');
  const settlement = await settleCurationProjectTokens({
    caller,
    curationSessionId: payload.curationSessionId,
    totalProjectCost,
    projectId: payload.projectId,
    targetSceneId: payload.targetSceneId || payload.activeSceneId || "scene-1",
    txType: "spend_live_synthesis",
    description: `Zcene Synthesis: ${displaySeeds}`,
    generationTypeToStamp: hasActiveFilters ? "Filtered Live Synthesis" : "Root Generation",
    seedArtist: displaySeeds,
  });

  try {
  console.log(`[Pipeline Diamond] -> Cache Lookup: Checking seeds: ${artistList.join(', ')} (activeFilters=${hasActiveFilters})`);
  
  const detailsCacheEntries: [string, any][] = [];
  
  const collectedTokens: Record<string, { prompt: number, candidates: number, total: number }> = {};
  const usageCollector = {
    push: (model: string, usage: any) => {
      if (!collectedTokens[model]) collectedTokens[model] = { prompt: 0, candidates: 0, total: 0 };
      collectedTokens[model].prompt += usage.promptTokenCount;
      collectedTokens[model].candidates += usage.candidatesTokenCount;
      collectedTokens[model].total += usage.totalTokenCount;
    }
  };
  
  const resolvedSeedArray: any[] = [];
  const seedStubs: Record<string, any> = {};
  let needsProGeneration = false;
  
  let hasStubHit = false;
  let hasCacheMiss = false;
  const cachedDocsData: Record<string, any> = {};
  
  for (const seed of artistList) {
     const seedNorm = normalizeArtistId(seed);
     const strippedSeed = stripIsoCountrySlug(seedNorm);
     const hintCountry = (payload.disambiguationHints && (payload.disambiguationHints[seedNorm] || payload.disambiguationHints[strippedSeed] || payload.disambiguationHints[seed])) || null;
     const hintGenre = (payload.disambiguationGenres && (payload.disambiguationGenres[seedNorm] || payload.disambiguationGenres[strippedSeed] || payload.disambiguationGenres[seed])) || null;
     const expectedSeedIso = (hintCountry ? normalizeIsoCode(extractCountrySlug(hintCountry)) : null) || extractTrailingCountryIso(seedNorm);
     let cachedDetails: any = null;
     
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
         const hasAmbiguousSibling = inspectSlugDedupAmbiguity(
           dedupQuery.docs.map(d => ({ id: d.id, data: d.data() })),
           strippedSeed
         );
         // Prefer a compatible canonical doc that has graphData (most complete)
         for (const snap of dedupQuery.docs) {
           const snapData = snap.data();
           if (!shouldAdoptCanonicalSlugCandidate(expectedSeedIso, snap.id, snapData, strippedSeed, { hasAmbiguousSibling, isSeed: true })) {
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
      } catch (dedupErr) {
        console.warn(`[Pipeline Diamond] Seed slug dedup query failed for "${seedNorm}", proceeding with derived ID:`, dedupErr);
      }

      // [Pre-Flight Alias Resolution]
      const originalQuery = payload.originalQueries && (payload.originalQueries[resolvedSeedNorm] || payload.originalQueries[seedNorm]);
      if (originalQuery) {
          const bareNormId = normalizeArtistId(originalQuery);
          if (bareNormId !== resolvedSeedNorm && (!expectedSeedIso || areCountryIsosCompatible(expectedSeedIso, extractTrailingCountryIso(resolvedSeedNorm)))) {
              await upsertBareRouterStub(db, bareNormId, resolvedSeedNorm, {
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
              const redirectIso = extractTrailingCountryIso(cacheData.redirectTo);
              const isValidRedirect = Boolean(
                areCountryIsosCompatible(expectedSeedIso, redirectIso) &&
                (!redirectIso || (/-[a-z]{2}$/i.test(cacheData.redirectTo) && !cacheData.redirectTo.endsWith('-uk')))
              );
              if (isValidRedirect) {
                const targetDoc = await db.collection("artists").doc(cacheData.redirectTo).get();
                if (targetDoc.exists) {
                   resolvedSeedNorm = cacheData.redirectTo;
                   cacheDoc = targetDoc;
                   cacheData = targetDoc.data();
                }
              } else if (expectedSeedIso) {
                const hintedCanonicalId = `${strippedSeed}-${expectedSeedIso}`;
                const hintedDoc = await db.collection("artists").doc(hintedCanonicalId).get();
                if (hintedDoc.exists) {
                   resolvedSeedNorm = hintedCanonicalId;
                   cacheDoc = hintedDoc;
                   cacheData = hintedDoc.data();
                } else {
                   cacheData = undefined;
                }
              }
           } else if (cacheData?._isStub && expectedSeedIso) {
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
                   const match = cachedDetails.find((item: any) => normalizeArtistId(item[0]) === resolvedSeedNorm);
                   if (match && match[1]) {
                     cachedDetails = match[1];
                   } else {
                     cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                   }
                }
             }
           }
        }
      } catch (e) {
         console.warn(`Failed cache lookup for ${resolvedSeedNorm}`, e);
      }
      
      const qualificationIso = expectedSeedIso || extractTrailingCountryIso(resolvedSeedNorm);
      if (isFullyQualifiedEntityProfile(cachedDetails, false, qualificationIso)) {
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
         } else {
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
      } else {
        console.log(`[Pipeline Diamond] -> Is Hit? No -> Flash-Lite Origin Validation: ${seed}`);
        needsProGeneration = true;
        hasCacheMiss = true;
        
         let validationResult: any = null;
         const effectiveGenreHint = hintGenre || "Unknown";
         const rawId = (payload.originalQueries && (payload.originalQueries[seedNorm] || payload.originalQueries[strippedSeed])) || strippedSeed;

         // Zero Blind Trust (V24): Column 2 MUST NOT synthesize geographic slugs (e.g., -jp) from raw user hints.
         // Stubs are minted strictly from validated Flash candidate payloads.
         const valResult = await validateSeedOriginBackend(
            rawId || seed,
            hintCountry ? { originHint: hintCountry, genreHint: effectiveGenreHint } : undefined
         );
         validationResult = valResult;
         if (valResult.apiUsage) {
            usageCollector.push(valResult.apiUsage.model, valResult.apiUsage);
         }

         if (validationResult.isValid) {
            const bareNormId = normalizeArtistId(validationResult.id);
            // Root-as-Router Contract (V25 / Rule 36): Bare IDs must be minted exclusively as _isStub: true forwarders.
            // All verified entities with non-global origins resolve strictly to 2-letter ISO suffixed IDs (e.g. klear-th).
            const normId = canonicalizeArtistSlugWithOrigin(bareNormId, validationResult.origin);
            
            if (normId !== bareNormId) {
               await upsertBareRouterStub(db, bareNormId, normId, {
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

           console.log(`[Pipeline Diamond] -> Seed Slugging: ${validationResult.id} -> ${normId}`);
        } else {
           throw new HttpsError("failed-precondition", `Validation failed for seed: ${seed}.`);
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

    const disambiguationHintsForPrompt: Record<string, string> = { ...(payload.disambiguationHints || {}) };
    for (const seedItem of resolvedSeedArray) {
      if (seedItem.origin || seedItem.genre) {
        const lockLine = `Artist "${seedItem.name}": Origin "${seedItem.origin || "Unknown"}", Genre "${seedItem.genre || "Unknown"}"`;
        disambiguationHintsForPrompt[seedItem.id] = lockLine;
        const bareKey = stripIsoCountrySlug(normalizeArtistId(seedItem.id));
        if (bareKey) {
          disambiguationHintsForPrompt[bareKey] = lockLine;
        }
      }
    }

    const displayArtistsForPrompt = resolvedSeedArray.length > 0
      ? resolvedSeedArray.map(s => s.name || s.id).join('::')
      : payload.artists;

    const result = await generateGraphDataBackend(
      displayArtistsForPrompt, 
      payload.filters, 
      isComplexGeneration ? undefined : payload.cachedSubgraphsContext, 
      isComplexGeneration ? undefined : payload.baseGraph, 
      disambiguationHintsForPrompt
    );
    finalGraph = result.graphData;
    if (result.apiUsage) {
       usageCollector.push(result.apiUsage.model, result.apiUsage);
    }
  } else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
    console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
    const seedNorm = resolvedSeedArray[0]?.id || normalizeArtistId(artistList[0]);
    // The doc was already fetched in the loop above
    const cacheData = cachedDocsData[seedNorm] || cachedDocsData[normalizeArtistId(artistList[0])] || null;
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
    // Infer missing `origin` on artist/label nodes from `artist/label <-> country` edges BEFORE canonical slugging
    const inferredCount = inferNodeOriginsFromCountryLinks(finalGraph.nodes, finalGraph.links);
    if (inferredCount > 0) {
      console.log(`[Pipeline Diamond] -> Inferred origin from country links for ${inferredCount} graph node(s)`);
    }

    const idRewriteMap = new Map<string, string>();
    for (const n of finalGraph.nodes) {
      if (n.type) {
        n.type = n.type.toLowerCase();
      } else {
        n.type = 'artist';
      }
      
      const originalNormId = normalizeArtistId(n.id);
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
      } else if (n.type === 'artist' && n.origin) {
         newId = canonicalizeArtistSlugWithOrigin(originalNormId, n.origin);
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
          } else {
             link.source = sId; // Ensure string format
          }
          
          if (idRewriteMap.size > 0 && idRewriteMap.has(tId)) {
             link.target = idRewriteMap.get(tId);
          } else {
             link.target = tId; // Ensure string format
          }
       }
    }
    
    for (const seed of artistList) {
      const seedNorm = normalizeArtistId(seed);
      const resolvedSeed = resolvedSeedArray.find(r => isEntitySeedMatch(r.id, seedNorm) || normalizeArtistId(r.name) === seedNorm || r.id === seedNorm);
      const sluggedSeedNorm = resolvedSeed ? resolvedSeed.id : seedNorm;

      const seedNode = finalGraph.nodes.find((n: any) => isEntitySeedMatch(sluggedSeedNorm, n.id) || isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
      if (seedNode && seedNode.id !== sluggedSeedNorm) {
         const oldId = seedNode.id;
         seedNode.id = sluggedSeedNorm;
         seedNode.label = resolvedSeed ? resolvedSeed.name : seed;
         if (resolvedSeed?.origin) seedNode.origin = resolvedSeed.origin;
         
         if (finalGraph.links) {
            for (const link of finalGraph.links) {
               if (link.source === oldId) link.source = sluggedSeedNorm;
               if (link.target === oldId) link.target = sluggedSeedNorm;
            }
         }
      }
    }
  }

  const recommendedEntities = (finalGraph.nodes || [])
    .filter((n: any) => n.type === 'artist' || n.type === 'label')
    .map((n: any) => ({
      id: n.id,
      name: n.label || n.id,
      type: n.type,
      origin: n.origin || null
    }));

  for (const seed of artistList) {
    const seedNorm = normalizeArtistId(seed);
    const resolvedSeed = resolvedSeedArray.find(r => isEntitySeedMatch(r.id, seedNorm) || normalizeArtistId(r.name) === seedNorm);
    const targetSeedId = resolvedSeed ? resolvedSeed.id : seed;
    const exists = recommendedEntities.some((e: any) => isEntitySeedMatch(targetSeedId, e.id) || isEntitySeedMatch(seedNorm, e.name));
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
  } else if (needsProGeneration) {
     if (hasStubHit && !hasCacheMiss) {
        determinedGenerationType = "Partial Generation";
     } else {
        determinedGenerationType = "Root Generation";
     }
  }

  const targetSceneId: string = payload.targetSceneId || payload.activeSceneId || "scene-1";
  const parsedSceneIdx = parseInt(String(targetSceneId).replace(/^scene-/i, ""), 10);
  const targetSceneIndex: number =
    typeof payload.sceneIndex === "number" && payload.sceneIndex >= 0
      ? payload.sceneIndex
      : Number.isFinite(parsedSceneIdx) && parsedSceneIdx >= 1
        ? parsedSceneIdx - 1
        : 0;

  if (targetSceneIndex >= MAX_SCENES_PER_PROJECT) {
    throw new HttpsError("invalid-argument", "Maximum of 5 scenes per project reached.");
  }

  let updatedScenes: ProjectScene[] = parseProjectScenes(payload.scenes);

  if (payload.userId && payload.projectId) {
    try {
      const projectDocRef = db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId);
      if (updatedScenes.length === 0) {
        try {
          const existingProjSnap = await projectDocRef.get();
          if (existingProjSnap.exists) {
            const existingProjData = existingProjSnap.data();
            if (existingProjData?.scenes) {
              updatedScenes = parseProjectScenes(existingProjData.scenes);
            }
          }
        } catch (readErr) {
          // Graceful fallback if project doc doesn't exist yet or in unit test mocks without .get()
        }
      }

      const prevTargetScene = updatedScenes.find(s => (s.sceneId || s.id) === targetSceneId);
      const activeScenePayload: ProjectScene = normalizeProjectScene({
        id: targetSceneId,
        sceneId: targetSceneId,
        sceneIndex: targetSceneIndex,
        title: displaySeeds || `Scene ${targetSceneIndex + 1}`,
        name: displaySeeds || `Scene ${targetSceneIndex + 1}`,
        ...(prevTargetScene?.customName ? { customName: prevTargetScene.customName } : {}),
        seedArtists: resolvedSeedArray.map(s => s.name || s.id).join('::'),
        seedIds: resolvedSeedArray.map(s => s.id),
        seedArtistIds: resolvedSeedArray.map(s => s.id),
        discoveryFilters: payload.filters || {},
        graphData: finalGraph,
        synthesisRationale: finalGraph.synthesisRationale || "",
        ...(prevTargetScene?.zineIntro ? { zineIntro: prevTargetScene.zineIntro } : {}),
        ...(prevTargetScene?.zineImages ? { zineImages: prevTargetScene.zineImages } : {}),
        artistSnippets: {},
        centerOffset: getSceneCenterOffset(targetSceneIndex),
        status: determinedGenerationType === "Direct Hit" ? "ready" : "curating",
        pathway:
          determinedGenerationType === "Direct Hit"
            ? "direct_hit"
            : determinedGenerationType === "Complex Generation"
              ? "complex_generation"
              : "root_generation",
        updatedAt: Date.now(),
      }, targetSceneIndex);

      const existingIdx = updatedScenes.findIndex(s => (s.sceneId || s.id) === targetSceneId);
      if (existingIdx !== -1) {
        updatedScenes[existingIdx] = activeScenePayload;
      } else {
        updatedScenes.push(activeScenePayload);
      }
      updatedScenes.sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));

      const populatedUpdatedScenes = updatedScenes.filter(
        s => s.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0
      );
      const compositeProjectGraph = populatedUpdatedScenes.length >= 2
        ? buildCompositeCanvasGraph(populatedUpdatedScenes, [])
        : finalGraph;

      console.log(`[Pipeline Diamond] -> Initiating Curation Pipeline for ${payload.projectId} (scene=${targetSceneId}) with type: ${determinedGenerationType}`);
      const projectUpdate: any = {
        graphData: JSON.stringify(compositeProjectGraph),
        schemaVersion: 43,
        scenes: JSON.stringify(updatedScenes),
        activeSceneId: targetSceneId,
        sceneCount: updatedScenes.length,
        seedArtistIds: getAllProjectSeedIds(updatedScenes),
        supportsLabelDeepCuts: true,
        generationType: determinedGenerationType,
        tokensSpent: settlement.tokensSpent,
        updatedAt: FieldValue.serverTimestamp()
      };
      
      await projectDocRef.set(projectUpdate, { merge: true });
      console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData & scenes via Admin SDK`);
      
      if (determinedGenerationType !== "Direct Hit" || updatedScenes.length >= 2) {
        // Persist end-to-end lockedSeeds map (keyed by BOTH canonical suffixed ID and bare ID)
        // so Column 3 hydration & iTunes scraping never suffer disambiguation amnesia.
        const lockedSeeds: Record<string, { id: string; bareId: string; name: string; origin: string; countryIso: string | null; genre: string }> = {};
        const normalizedDisambiguationHints: Record<string, string> = { ...(payload.disambiguationHints || {}) };
        const normalizedDisambiguationGenres: Record<string, string> = { ...(payload.disambiguationGenres || {}) };

        for (const s of resolvedSeedArray) {
          const bareId = stripIsoCountrySlug(normalizeArtistId(s.id));
          const countryIso = extractTrailingCountryIso(s.id) || (s.origin ? normalizeIsoCode(extractCountrySlug(s.origin)) : null);
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
            if (bareId) normalizedDisambiguationHints[bareId] = s.origin;
          }
          if (s.genre) {
            normalizedDisambiguationGenres[s.id] = s.genre;
            if (bareId) normalizedDisambiguationGenres[bareId] = s.genre;
          }
        }

        curationJobId = payload.jobId || db.collection('curationJobs').doc().id;
        const jobRef = db.collection('curationJobs').doc(curationJobId);
        await jobRef.set({
          status: "pending",
          jobType: "graph_generation",
          userId: payload.userId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          inputPayload: {
             ...payload,
             mode: determinedGenerationType === "Direct Hit" && updatedScenes.length >= 2 ? "overarching_only" : "standard",
             targetSceneId,
             sceneIndex: targetSceneIndex,
             scenes: updatedScenes,
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
        console.log(`[Pipeline Diamond] -> Created curation job ${curationJobId} for background hydration (scene=${targetSceneId}, lockedSeeds=${resolvedSeedArray.map(s => s.id).join(', ')})`);

        // Update project with activeJobId
        await projectDocRef.set({
           activeJobId: curationJobId
        }, { merge: true });
      } else {
        console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Skipping background hydration job.`);
      }

    } catch (err) {
      console.error(`[Pipeline Diamond] -> Failed to update project doc ${payload.projectId} / spawn job`, err);
      throw err;
    }
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
  } catch (pipelineErr) {
    await refundProjectSettlementOnError({
      uid: caller.uid,
      projectId: payload.projectId,
      curationSessionId: settlement.curationSessionId,
      reason: "Column 2 Topology Pipeline Error",
    });
    throw pipelineErr;
  }
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  generateRootsBreakdownBackend,
  normalizeArtistId,
  fetchNodeDetailsBackend,
  scrapeVideoIdBackend,
  checkVideoPlayability,
  scrapeImageUrlBackend,
  extractCountrySlug,
  buildCompositeCacheKey,
  extractArtistSubGraph,
  validateSeedOriginBackend,
  generateGraphDataBackend
} from "./services/curatorService";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  // Ignore if already set by another function module
}

function sanitizeUndefinedProperties(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeUndefinedProperties(item));
  }
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = sanitizeUndefinedProperties(val);
      }
    }
    return clean;
  }
  return obj;
}

function normalizeDetailsForWrite(details: any): any {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return details;
  return {
    ...details,
    imageUrl: (typeof details.imageUrl === 'string') ? details.imageUrl : ""
  };
}

function sanitizeLabelProfile(details: any): any {
  if (!details) return null;
  let parsed = typeof details === 'string' ? JSON.parse(details) : details;
  if (!parsed || typeof parsed !== 'object') return null;
  const cleanDetails = {
    genre: parsed.details?.genre || null,
    origin: parsed.details?.origin || null,
    founded: parsed.details?.founded || null,
    notableArtists: parsed.details?.notableArtists || [],
  };
  return {
    summary: parsed.summary || parsed.bio || parsed.description || "",
    imageUrl: parsed.imageUrl || parsed.image || null,
    details: cleanDetails,
    discography: Array.isArray(parsed.discography) ? parsed.discography : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
}

function isEntitySeedMatch(seedNorm: string, candidateNorm: string): boolean {
  if (!seedNorm || !candidateNorm) return false;
  const s = normalizeArtistId(seedNorm);
  const c = normalizeArtistId(candidateNorm);
  if (s === c) return true;
  if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`)) return true;
  if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`)) return true;
  return false;
}

const KNOWN_COUNTRY_SLUGS = [
  '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
  '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
  '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
  '-switzerland', '-uk', '-usa', '-us'
];

function stripCountrySlug(name: string): string {
  let cleanName = name.trim();
  for (const suffix of KNOWN_COUNTRY_SLUGS) {
    if (cleanName.toLowerCase().endsWith(suffix)) {
      cleanName = cleanName.substring(0, cleanName.length - suffix.length);
      break;
    }
  }
  return cleanName;
}

export const executeCurationPipeline = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  const PIPELINE_START_TIME = Date.now();
  const payload = request.data;
  console.log(`[Curation Backend] Executing executeCurationPipeline with payload:`, payload);

  if (!payload || !payload.artists) {
    throw new HttpsError("invalid-argument", "Missing artists in payload");
  }

  const artistList = payload.artists
    .split('::')
    .map((a: string) => a.trim())
    .filter(Boolean);

  console.log(`[Pipeline Diamond] -> Cache Lookup: Checking seeds: ${artistList.join(', ')}`);
  
  const resolvedSeedArray: any[] = [];
  let needsProGeneration = false;
  
  for (const seed of artistList) {
     const seedNorm = normalizeArtistId(seed);
     let cachedDetails: any = null;
     
     try {
       const cacheDoc = await db.collection("artists").doc(seedNorm).get();
       if (cacheDoc.exists) {
          const cacheData = cacheDoc.data();
          if (cacheData && cacheData.detailsCache) {
             cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
             if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                const match = cachedDetails.find((item: any) => normalizeArtistId(item[0]) === seedNorm);
                if (match && match[1]) {
                  cachedDetails = match[1];
                } else {
                  cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                }
             }
          }
       }
     } catch (e) {
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
     } else {
        console.log(`[Pipeline Diamond] -> Is Hit? No -> Flash-Lite Origin Validation: ${seed}`);
        needsProGeneration = true;
        
        const validationResult = await validateSeedOriginBackend(seed);
        if (validationResult.isValid) {
           resolvedSeedArray.push({
              id: normalizeArtistId(validationResult.id),
              name: validationResult.id,
              origin: validationResult.origin,
              genre: validationResult.genre,
              isCacheHit: false
           });
        } else {
           throw new HttpsError("failed-precondition", `Validation failed for seed: ${seed}.`);
        }
     }
  }
  
  if (artistList.length > 1) {
     needsProGeneration = true;
  }

  let finalGraph = payload.baseGraph || { nodes: [], links: [] };

  if (needsProGeneration) {
    console.log(`[Pipeline Diamond] -> 3.1 Pro Topology Generation`);
    // Pass the resolved seeds string instead of raw names if possible, or just raw names.
    // curatorService's generateGraphDataBackend uses raw string.
    finalGraph = await generateGraphDataBackend(
      payload.artists, 
      payload.filters, 
      payload.cachedSubgraphsContext, 
      payload.baseGraph, 
      payload.disambiguationHints
    );
  } else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
    // If it's a single seed hit and no base graph is provided, we need to extract from cache
    console.log(`[Pipeline Diamond] -> Single Seed Cache Hit: Extracting topology from cache`);
    const seedNorm = normalizeArtistId(artistList[0]);
    const cacheDoc = await db.collection("artists").doc(seedNorm).get();
    if (cacheDoc.exists) {
        const cacheData = cacheDoc.data();
        if (cacheData && cacheData.graphData) {
            finalGraph = typeof cacheData.graphData === 'string' ? JSON.parse(cacheData.graphData) : cacheData.graphData;
        }
    }
  }

  // Pre-Hydration processing (similar to processCurationJob)
  const cleanSeedArtistsContext = artistList.map((a: string) => stripCountrySlug(a)).join('::');

  if (finalGraph.nodes) {
    for (const seed of artistList) {
      const seedNorm = normalizeArtistId(seed);
      const seedNode = finalGraph.nodes.find((n: any) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
      if (seedNode && normalizeArtistId(seedNode.id) !== seedNorm) {
         seedNode.id = seedNorm;
         seedNode.label = seed;
      }
    }
  }

  const recommendedEntities = (finalGraph.nodes || [])
    .filter((n: any) => n.type === 'artist' || n.type === 'label' || !n.type)
    .map((n: any) => ({
      id: n.id,
      name: n.label || n.id,
      type: n.type || 'artist',
      origin: n.origin || null
    }));

  for (const seed of artistList) {
    const seedNorm = normalizeArtistId(seed);
    const exists = recommendedEntities.some((e: any) => isEntitySeedMatch(seedNorm, e.id) || isEntitySeedMatch(seedNorm, e.name));
    if (!exists) {
       recommendedEntities.unshift({ id: seed, name: seed, type: 'artist', origin: null });
    }
  }

  console.log(`[Pipeline Diamond] -> 3.1 Pro Deep Cuts & Positioning (${recommendedEntities.length} entities)`);

  const detailsCacheEntries: [string, any][] = [];
  const batchSize = 4;
  for (let i = 0; i < recommendedEntities.length; i += batchSize) {
    if (Date.now() - PIPELINE_START_TIME > 480000) {
      console.warn(`[Pipeline Diamond] Safe-Exit Stopwatch Triggered at ${i} entities to prevent timeout.`);
      break;
    }
    const chunk = recommendedEntities.slice(i, i + batchSize);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (entityObj: any, idx: number) => {
        const rawName = entityObj.name;
        let artistNormId = normalizeArtistId(rawName);
        if (entityObj.origin) {
          const originSlug = extractCountrySlug(entityObj.origin);
          if (!artistNormId.endsWith(`-${originSlug}`)) artistNormId = `${artistNormId}-${originSlug}`;
        }
        const isLabel = entityObj.type === 'label';
        let details: any = null;
        try {
          const collName = isLabel ? "labels" : "artists";
          const cacheDoc = await db.collection(collName).doc(artistNormId).get();
          if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            if (cacheData && cacheData.detailsCache) {
              let cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
              if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                const match = cachedDetails.find((item: any) => normalizeArtistId(item[0]) === artistNormId);
                cachedDetails = match ? match[1] : (Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0]);
              }
              const isCacheComplete = (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50 && cachedDetails.details?.genre && cachedDetails.imageUrl);
              if (isCacheComplete) details = cachedDetails;
            }
          }
        } catch (e) {}

        let requiresTextHydration = false, requiresImageScraping = false, requiresVideoScraping = false;
        let searchArtistName = stripCountrySlug(rawName);
        if (details && details.details && details.details.artist && details.details.artist !== rawName) {
          searchArtistName = details.details.artist;
        }

        if (!details || details.summary?.length <= 50 || !details.details?.genre || !details.imageUrl) {
          requiresTextHydration = true;
          requiresImageScraping = true;
          requiresVideoScraping = true;
        } else {
          if (!details.imageUrl) requiresImageScraping = true;
          if (!details.youtubeVideoId && !isLabel) requiresVideoScraping = true;
        }

        const tempNode = { id: searchArtistName, type: entityObj.type, group: 1 };
        if (idx > 0 && (requiresTextHydration || requiresImageScraping || requiresVideoScraping)) {
          await new Promise(resolve => setTimeout(resolve, idx * 1000));
        }

        if (requiresTextHydration) {
          try {
            details = await fetchNodeDetailsBackend(tempNode, finalGraph, cleanSeedArtistsContext);
          } catch (e: any) {
            return null;
          }
          if (details && details.details && details.details.artist) searchArtistName = details.details.artist;
        }

        if (details) {
          if (!isLabel && requiresVideoScraping) {
            try {
              if (details.youtubeVideoId) {
                if (!(await checkVideoPlayability(details.youtubeVideoId))) details.youtubeVideoId = null;
              }
              if (!details.youtubeVideoId && details.youtubeSearchQuery) {
                const scrapedId = await scrapeVideoIdBackend(searchArtistName, artistNormId);
                if (scrapedId && await checkVideoPlayability(scrapedId)) details.youtubeVideoId = scrapedId;
              }
            } catch (e) { details.youtubeVideoId = null; }
          }
          if (!details.details) details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
          if (requiresImageScraping) {
            const fetchedImageUrl = await scrapeImageUrlBackend(searchArtistName, tempNode.type, details.details.genre || "", details.summary || "");
            details.imageUrl = fetchedImageUrl || details.imageUrl || "";
          }
          details.details.artist = details.details.artist || searchArtistName;
          if (!details.synthesisRationale) {
            details.synthesisRationale = `[Single-Seed Analysis]\n- Acoustic & Sonics: Resolved core musical properties and stylistic lineage.\n- Scene Context: Mapped direct influences, record label history, and geographic background.\n- Overlap Insights: Unified structural connections and surrounding chronological relationships.`;
          }
        }
        return [artistNormId, details] as [string, any];
      })
    );
    for (const res of chunkResults) {
      if (res.status === 'fulfilled' && res.value) {
        const [normId, details] = res.value;
        const isComplete = details && details.summary && details.summary.length > 50 && details.details?.genre && details.imageUrl;
        if (isComplete) {
          const existingIndex = detailsCacheEntries.findIndex((entry: any) => isEntitySeedMatch(normalizeArtistId(normId), entry[0]));
          if (existingIndex !== -1) detailsCacheEntries[existingIndex] = res.value;
          else detailsCacheEntries.push(res.value);
        } else {
          console.warn(`[Pipeline Diamond] Culling node ${normId} due to incomplete details (Quality Rule).`);
        }
      }
    }
    if (i + batchSize < recommendedEntities.length) await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const hydratedNorms = new Set<string>(detailsCacheEntries.map(entry => normalizeArtistId(entry[0])));
  const seedNormSet = new Set<string>(artistList.map((a: string) => normalizeArtistId(a)));

  if (finalGraph.nodes) {
    const prunedIds = new Set<string>();
    finalGraph.nodes = finalGraph.nodes.filter((node: any) => {
      if (node.type !== 'artist' && node.type !== 'label') {
        return true;
      }
      const nodeNorm = normalizeArtistId(node.id);
      const isSeedNode = Array.from(seedNormSet).some((s: string) => isEntitySeedMatch(s, nodeNorm));
      const isHydrated = Array.from(hydratedNorms).some((h: string) => isEntitySeedMatch(nodeNorm, h));
      if (!isHydrated && !isSeedNode) {
        prunedIds.add(node.id);
        prunedIds.add(node.id.toLowerCase());
        prunedIds.add(nodeNorm);
        return false;
      }
      return true;
    });
    if (prunedIds.size > 0 && finalGraph.links) {
      finalGraph.links = finalGraph.links.filter((link: any) => {
        const srcId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
        const tgtId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
        
        return !prunedIds.has(srcId) && 
               !prunedIds.has(tgtId) &&
               !prunedIds.has(srcId?.toLowerCase()) &&
               !prunedIds.has(tgtId?.toLowerCase()) &&
               !prunedIds.has(normalizeArtistId(srcId || '')) &&
               !prunedIds.has(normalizeArtistId(tgtId || ''));
      });
    }
  }

  console.log(`[Pipeline Diamond] -> 3.1 Pro Roots Breakdown`);
  const fullRationale = await generateRootsBreakdownBackend(payload.artists, detailsCacheEntries);
  finalGraph.synthesisRationale = fullRationale;

  // DB Write-back logic (Project + Cache)
  const seedNorms = artistList.map((a: string) => normalizeArtistId(a));
  
  // Note: We now update the project document synchronously on the backend to avoid 
  // client-side disconnections stranding the project in a 'curating' state.

  for (const entityObj of recommendedEntities) {
      const recArtist = entityObj.name;
      const recNorm = normalizeArtistId(recArtist);
      const isLabel = entityObj.type === 'label';
      const matchingSeedNorm = seedNorms.find((s: string) => isEntitySeedMatch(s, recNorm));
      
      const recDetailsEntry = detailsCacheEntries.find((entry: any) => isEntitySeedMatch(recNorm, entry[0]));
      const recDetails = recDetailsEntry ? (recDetailsEntry as any)[1] : null;

      if (!recDetails) continue;

      const collName = isLabel ? "labels" : "artists";
      const idFieldKey = isLabel ? "labelId" : "artistId";
      const disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
      const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, payload.filters || undefined);
      
      if (recDetailsEntry) (recDetailsEntry as any)[0] = compositeCanonicalId;

      const recDocRef = db.collection(collName).doc(compositeCanonicalId);
      // Fire-and-forget the cache writes to speed up return
      recDocRef.get().then(async (recSnap) => {
          const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
          if (!recSnap.exists) {
              const extractedGraph = matchingSeedNorm && !isLabel ? extractArtistSubGraph(matchingSeedNorm, finalGraph, artistList) : null;
              await recDocRef.set({
                  cacheKey: compositeCanonicalId,
                  [idFieldKey]: recNorm,
                  seedArtists: recArtist,
                  graphData: extractedGraph ? JSON.stringify(extractedGraph) : null,
                  detailsCache: finalRecDetails,
                  filters: matchingSeedNorm && !isLabel ? payload.filters || null : null,
                  cacheVersion: 4,
                  cachedAt: FieldValue.serverTimestamp(),
                  isDeep: true,
                  isPrimarySeed: !!matchingSeedNorm,
                  hasUniqueSpiderweb: matchingSeedNorm ? !isLabel : false
              }).catch(console.error);
          } else {
              const updatePayload: any = {
                  detailsCache: finalRecDetails,
                  cachedAt: FieldValue.serverTimestamp(),
                  cacheVersion: 4,
                  [idFieldKey]: recNorm,
                  cacheKey: compositeCanonicalId,
                  isDeep: true
              };
              if (matchingSeedNorm) {
                  const extractedGraph = !isLabel ? extractArtistSubGraph(matchingSeedNorm, finalGraph, artistList) : null;
                  updatePayload.isPrimarySeed = true;
                  updatePayload.hasUniqueSpiderweb = !isLabel;
                  if (!isLabel) updatePayload.graphData = extractedGraph ? JSON.stringify(extractedGraph) : null;
              }
              await recDocRef.update(updatePayload).catch(console.error);
          }
      }).catch(console.error);
  }

  if (payload.userId && payload.projectId) {
    try {
      await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update({
        graphData: JSON.stringify(finalGraph),
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} via Admin SDK`);
    } catch (err) {
      console.error(`[Pipeline Diamond] -> Failed to update project doc ${payload.projectId}`, err);
    }
  }

  console.log(`[Pipeline Diamond] -> Curation Complete, returning payload to client`);

  return {
      graphData: finalGraph,
      detailsCache: JSON.stringify(detailsCacheEntries)
  };
});

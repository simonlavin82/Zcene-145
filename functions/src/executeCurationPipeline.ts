import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { 
  generateGraphDataBackend, 
  validateSeedOriginBackend,
  normalizeArtistId
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

function isEntitySeedMatch(seedNorm: string, candidateNorm: string): boolean {
  if (!seedNorm || !candidateNorm) return false;
  const s = normalizeArtistId(seedNorm);
  const c = normalizeArtistId(candidateNorm);
  if (s === c) return true;
  if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`)) return true;
  if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`)) return true;
  return false;
}

export function stripCountrySlug(name: string): string {
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

export const validateSeedOriginCallable = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (request) => {
  const { seed } = request.data;
  if (!seed) {
    throw new HttpsError("invalid-argument", "Missing seed in payload");
  }
  const validationResult = await validateSeedOriginBackend(seed);
  return validationResult;
});

export const executeCurationPipeline = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
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
  
  const detailsCacheEntries: [string, any][] = [];
  
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
        detailsCacheEntries.push([seedNorm, cachedDetails]);
     } else {
        console.log(`[Pipeline Diamond] -> Is Hit? No -> Flash-Lite Origin Validation: ${seed}`);
        needsProGeneration = true;
        
        let validationResult: any = null;
        if (payload.disambiguationHints && payload.disambiguationHints[normalizeArtistId(seed)]) {
           validationResult = { isValid: true, id: seed, origin: payload.disambiguationHints[normalizeArtistId(seed)], genre: "Unknown" };
        } else {
           validationResult = await validateSeedOriginBackend(seed);
        }
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
    finalGraph = await generateGraphDataBackend(
      payload.artists, 
      payload.filters, 
      payload.cachedSubgraphsContext, 
      payload.baseGraph, 
      payload.disambiguationHints
    );
  } else if (!payload.baseGraph || payload.baseGraph.nodes.length === 0) {
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

  console.log(`[Pipeline Diamond] -> Skipping synchronous hydration (Delegated to processCurationJob)`);

  let curationJobId = null;

  if (payload.userId && payload.projectId) {
    try {
      console.log(`[Pipeline Diamond] -> Initiating Curation Pipeline for ${payload.projectId}`);
      const projectUpdate: any = {
        graphData: JSON.stringify(finalGraph),
        schemaVersion: 2,
        supportsLabelDeepCuts: true,
        updatedAt: FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(payload.userId).collection('projects').doc(payload.projectId).update(projectUpdate);
      console.log(`[Pipeline Diamond] -> Successfully updated project ${payload.projectId} graphData via Admin SDK`);
      
      const jobRef = db.collection('curationJobs').doc();
      curationJobId = jobRef.id;
      await jobRef.set({
        status: "pending",
        jobType: "graph_generation",
        userId: payload.userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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

    } catch (err) {
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

import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import { GraphData, Node, Link, ArtistCacheEntry, DiscoveryFilters, NodeDetails } from '../types';

// ─── UTILITIES ────────────────────────────────────────────────────────────────

/**
 * Produces a stable, Firestore-safe document ID for a single artist name.
 * e.g. "End It" → "end-it", "blink-182" → "blink-182", "Radiohead" → "radiohead"
 */
export const normalizeArtistId = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "") // Strip straight and curly apostrophes
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);

/**
 * Recursively removes any property whose value is strictly `undefined` from an object or array.
 * Required before passing objects to Firestore SDK (`setDoc`, `updateDoc`, `addDoc`) which
 * throws synchronous validation exceptions on `undefined` values.
 */
export const stripUndefinedProperties = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(stripUndefinedProperties) as unknown as T;
  }
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value !== undefined) {
      cleaned[key] = stripUndefinedProperties(value);
    }
  }
  return cleaned;
};

/**
 * Builds a deterministic composite cache key from an artistId and any active DiscoveryFilters.
 * Ensures that changes in filters trigger a cache miss.
 */
export const buildCompositeCacheKey = (artistId: string, filters?: DiscoveryFilters): string => {
  if (!filters) return artistId;
  const parts: string[] = [artistId];
  
  if (filters.foundedAfter) {
    parts.push(`after:${filters.foundedAfter}`);
  }
  if (filters.foundedBefore) {
    parts.push(`before:${filters.foundedBefore}`);
  }
  if (filters.includeOrigins && filters.includeOrigins.length > 0) {
    const sorted = [...filters.includeOrigins].map(s => s.trim().toLowerCase()).sort();
    parts.push(`inc_origins:${sorted.join(',')}`);
  }
  if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
    const sorted = [...filters.excludeOrigins].map(s => s.trim().toLowerCase()).sort();
    parts.push(`exc_origins:${sorted.join(',')}`);
  }
  if (filters.includeGenres && filters.includeGenres.length > 0) {
    const sorted = [...filters.includeGenres].map(s => s.trim().toLowerCase()).sort();
    parts.push(`inc_genres:${sorted.join(',')}`);
  }
  
  if (parts.length === 1) return artistId;
  
  return parts.join('-').replace(/\s+/g, '-').toLowerCase();
};

/**
 * Extracts a clean, normalized country slug from origin strings.
 * e.g. "San Diego, CA, United States" -> "united-states"
 * e.g. "London, England, United Kingdom" -> "united-kingdom"
 * e.g. "Italy" -> "italy"
 */
export const extractCountrySlug = (originStr?: string): string => {
  if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
    return 'global';
  }

  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  const slug = normalizeArtistId(rawCountry);

  return slug || 'global';
};


/**
 * Title cases a raw kebab-case or snake-case artist ID string.
 * e.g. "mindforce" -> "Mindforce", "drug-church" -> "Drug Church"
 */
export const titleCaseArtistId = (id: string): string => {
  if (!id) return '';
  const spacedId = id.replace(/[-_]+/g, ' ').trim();
  return spacedId
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

/**
 * Presentation utility that cleanly formats artist titles without clunky country routing suffixes
 * (e.g., "-united-states", "-global", " United States", " Global", etc.), cross-referencing
 * graph topology nodes when available to return pristine human-readable titles.
 */
export const cleanArtistDisplayName = (rawIdOrName?: string | null, graphNodes?: Node[] | null): string => {
  if (!rawIdOrName || typeof rawIdOrName !== 'string') return '';
  const trimmed = rawIdOrName.trim();
  if (!trimmed) return '';

  // 1. Known common country routing suffixes and slugs in display or kebab case
  const countrySuffixes = [
    'united states', 'united kingdom', 'global', 'australia', 'canada', 'germany', 'france',
    'japan', 'sweden', 'italy', 'spain', 'brazil', 'mexico', 'netherlands', 'belgium',
    'norway', 'finland', 'denmark', 'ireland', 'new zealand', 'poland', 'austria',
    'switzerland', 'uk', 'usa', 'us'
  ];

  let cleaned = trimmed;
  // If kebab/snake case, convert to spaced words first for suffix checking
  const spaced = trimmed.replace(/[-_]+/g, ' ').trim();
  const lowerSpaced = spaced.toLowerCase();

  for (const suffix of countrySuffixes) {
    if (lowerSpaced.endsWith(` ${suffix}`)) {
      // Strip the suffix and any preceding hyphen/space
      const suffixLen = suffix.length;
      const baseSpaced = spaced.slice(0, spaced.length - suffixLen).trim().replace(/[-_]$/, '').trim();
      if (baseSpaced.length > 0) {
        cleaned = baseSpaced;
        break;
      }
    }
  }

  // 2. If graphNodes are available, check if there is an exact artist or label node matching the cleaned string
  if (graphNodes && graphNodes.length > 0) {
    const foundNode = findCanonicalNodeForArtist(cleaned, graphNodes) || findCanonicalNodeForArtist(trimmed, graphNodes);
    if (foundNode && foundNode.label) {
      return foundNode.label;
    }
  }

  // If the result is purely lowercase or was kebab case, apply titleCaseArtistId
  if (cleaned === cleaned.toLowerCase() || cleaned.includes('-') || cleaned.includes('_')) {
    return titleCaseArtistId(cleaned);
  }

  return cleaned;
};

/**
 * Universal seed matching utility bridging backend curation and frontend graph rendering.
 * Reliably maps disambiguated session routing keys (e.g., buggin-united-states) to short canonical
 * graph node IDs (e.g., buggin) or display titles for correct D3 shape, color, force simulation, and UI drawers.
 */
export const isNodeInSeedList = (nodeIdOrLabel?: string | null, seedList?: string[] | null): boolean => {
  if (!nodeIdOrLabel || !seedList || !Array.isArray(seedList) || seedList.length === 0) return false;
  const targetNorm = normalizeArtistId(nodeIdOrLabel);
  const targetClean = cleanArtistDisplayName(nodeIdOrLabel).toLowerCase();

  return seedList.some(seed => {
    if (!seed || typeof seed !== 'string') return false;
    if (seed === nodeIdOrLabel) return true;
    const seedNorm = normalizeArtistId(seed);
    if (seedNorm === targetNorm) return true;
    if (seed.toLowerCase() === nodeIdOrLabel.toLowerCase() || cleanArtistDisplayName(seed).toLowerCase() === targetClean) return true;
    if (seedNorm.startsWith(`${targetNorm}-`) || targetNorm.startsWith(`${seedNorm}-`)) return true;
    if (seedNorm.includes(`-${targetNorm}-`) || seedNorm.endsWith(`-${targetNorm}`) || targetNorm.includes(`-${seedNorm}-`) || targetNorm.endsWith(`-${seedNorm}`)) return true;
    return false;
  });
};



/**
 * Standardizes a graph's node IDs and links to ensure consistency:
 * - Artist node IDs are converted to lowercase hyphenated slugs (using normalizeArtistId).
 * - Other node IDs (genre, label, country, founded) are lowercased and stripped of leading/trailing whitespace.
 * - Original human casing of all nodes is preserved in the 'label' field.
 * - Link source and target properties are mapped to the normalized IDs.
 */
export const normalizeGraphData = (graph: GraphData): GraphData => {
  if (!graph || !graph.nodes) return graph;

  const idMap = new Map<string, string>(); // Original ID -> Normalized ID

  const normalizedNodes = graph.nodes.map(node => {
    const originalId = node.id;
    let normalizedId = originalId.trim();
    
    if (node.type === 'artist' || node.type === 'label') {
      normalizedId = normalizeArtistId(originalId);
    } else {
      normalizedId = normalizedId.toLowerCase();
    }
    
    idMap.set(originalId, normalizedId);
    idMap.set(originalId.toLowerCase(), normalizedId); // fallback
    idMap.set(normalizeArtistId(originalId), normalizedId); // accent-insensitive fallback

    let label = node.label || originalId.trim();
    if (node.type === 'artist' || node.type === 'label') {
      label = titleCaseArtistId(label);
    }

    return {
      ...node,
      id: normalizedId,
      label
    };
  });

  const normalizedLinks = (graph.links || []).map(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;

    const sourceLower = sourceId.trim().toLowerCase();
    const targetLower = targetId.trim().toLowerCase();
    const sourceNorm = normalizeArtistId(sourceId);
    const targetNorm = normalizeArtistId(targetId);

    const newSource = idMap.get(sourceId) || idMap.get(sourceLower) || idMap.get(sourceNorm) || sourceLower;
    const newTarget = idMap.get(targetId) || idMap.get(targetLower) || idMap.get(targetNorm) || targetLower;

    return {
      ...link,
      source: newSource,
      target: newTarget
    };
  });

  return {
    nodes: normalizedNodes,
    links: normalizedLinks,
    synthesisRationale: graph.synthesisRationale || (graph as any).synthesis_rationale
  };
};


// ─── GRAPH ISOLATION ──────────────────────────────────────────────────────────

/**
 * STRICT ISOLATION: Given a full AI-returned GraphData and a single artist name,
 * extracts ONLY the sub-graph that belongs to that artist.
 *
 * Included:
 *   - The artist's own node
 *   - Direct structural metadata nodes (genre, label, country, founded) that are
 *     linked exclusively to this artist
 *
 * Excluded (stripped before write):
 *   - Links between THIS artist and OTHER artist nodes (cross-session edges)
 *   - Any metadata node only reachable via a cross-artist link
 *
 * This prevents "ghost data" leakage when a single-artist query later reads a doc
 * that was originally written during a multi-artist session.
 */
export const extractArtistSubGraph = (
  artistName: string,
  fullGraph: GraphData,
  allSeeds: string[] = []
): { nodes: Node[]; links: Link[] } => {
  const artistNameNorm = normalizeArtistId(artistName);
  const seedsNorm = new Set(allSeeds.map(s => normalizeArtistId(s)));
  // Make sure the target artist itself is not in the other seeds set we want to exclude
  seedsNorm.delete(artistNameNorm);

  const isArtistIdMatch = (a: string, b: string) => {
    const na = normalizeArtistId(a);
    const nb = normalizeArtistId(b);
    return na === nb || na.startsWith(nb + '-') || nb.startsWith(na + '-');
  };

  // Find the canonical artist node from the full graph
  const artistNode = fullGraph.nodes.find(
    n => (n.type === 'artist' || n.type === 'label') && (normalizeArtistId(n.id) === artistNameNorm || isArtistIdMatch(n.id, artistName))
  );

  if (!artistNode) {
    return { nodes: [], links: [] };
  }

  const originalArtistNodeId = artistNode.id;
  const artistNodeIdNorm = normalizeArtistId(originalArtistNodeId);

  // Resolve link endpoints to string IDs
  const resolveId = (endpoint: string | Node): string =>
    typeof endpoint === 'string' ? endpoint : endpoint.id;

  // 1. Identify direct peer bands of the target artist node (excluding other query seeds)
  const peerArtistIds = new Set<string>();
  (fullGraph.links || []).forEach(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);

    if (sNorm === artistNodeIdNorm || tNorm === artistNodeIdNorm) {
      const otherId = sNorm === artistNodeIdNorm ? t : s;
      const otherNorm = normalizeArtistId(otherId);
      
      const otherNode = fullGraph.nodes.find(n => normalizeArtistId(n.id) === otherNorm);
      if (otherNode && (otherNode.type === 'artist' || otherNode.type === 'label') && !seedsNorm.has(otherNorm)) {
        peerArtistIds.add(otherNode.id);
      }
    }
  });

  // 2. Combine all kept artist nodes (target artist itself + its peer bands)
  const keptArtistIds = new Set<string>([originalArtistNodeId]);
  peerArtistIds.forEach(id => keptArtistIds.add(id));
  const keptArtistIdsNorm = new Set<string>(
    Array.from(keptArtistIds).map(id => normalizeArtistId(id))
  );

  // 3. Collect all metadata nodes connected to any of the kept artist nodes
  const metadataNodeIds = new Set<string>();
  (fullGraph.links || []).forEach(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);

    const sIsKeptArtist = keptArtistIdsNorm.has(sNorm);
    const tIsKeptArtist = keptArtistIdsNorm.has(tNorm);

    if (sIsKeptArtist || tIsKeptArtist) {
      const otherId = sIsKeptArtist ? t : s;
      const otherLower = otherId.trim().toLowerCase();
      const otherNode = fullGraph.nodes.find(n => n.id.trim().toLowerCase() === otherLower);
      if (otherNode && otherNode.type !== 'artist') {
        metadataNodeIds.add(otherNode.id);
      }
    }
  });

  // 4. Gather all final node IDs to keep
  const keptNodeIds = new Set<string>();
  keptNodeIds.add(originalArtistNodeId);
  peerArtistIds.forEach(id => keptNodeIds.add(id));
  metadataNodeIds.forEach(id => keptNodeIds.add(id));

  const keptNodeIdsLower = new Set<string>(
    Array.from(keptNodeIds).map(id => id.trim().toLowerCase())
  );
  const keptNodeIdsNorm = new Set<string>(
    Array.from(keptNodeIds).map(id => normalizeArtistId(id))
  );

  // 5. Filter the nodes and links
  const ownNodes = fullGraph.nodes.filter(n => {
    const norm = normalizeArtistId(n.id);
    const lower = n.id.trim().toLowerCase();
    return keptNodeIdsNorm.has(norm) || keptNodeIdsLower.has(lower);
  });
  const ownLinks = (fullGraph.links || []).filter(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);
    const sLower = s.trim().toLowerCase();
    const tLower = t.trim().toLowerCase();
    return (keptNodeIdsNorm.has(sNorm) || keptNodeIdsLower.has(sLower)) && 
           (keptNodeIdsNorm.has(tNorm) || keptNodeIdsLower.has(tLower));
  });

  // Map the matched artist's node ID to the query's canonical artistName
  const ownNodesMapped = ownNodes.map(n => {
    if (n.id === originalArtistNodeId) {
      return { ...n, id: artistName };
    }
    return n;
  });

  const ownLinksMapped = ownLinks.map(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const newSource = s === originalArtistNodeId ? artistName : s;
    const newTarget = t === originalArtistNodeId ? artistName : t;
    return { ...link, source: newSource, target: newTarget };
  });

  return { nodes: ownNodesMapped, links: ownLinksMapped };
};

export const eagerNormalizeCacheEntry = (entry: ArtistCacheEntry): ArtistCacheEntry => {
  if (!entry) return entry;
  
  if (entry.seedArtists) {
    entry.seedArtists = titleCaseArtistId(entry.seedArtists);
  } else if ((entry as any).seedLabels) {
    (entry as any).seedLabels = titleCaseArtistId((entry as any).seedLabels);
  }
  
  if (entry.graphData) {
    try {
      const graph = JSON.parse(entry.graphData);
      if (graph && graph.nodes) {
        graph.nodes.forEach((n: any) => {
          if (n.type === 'artist' || n.type === 'label') {
            n.label = titleCaseArtistId(n.label || n.id);
          }
        });
        entry.graphData = JSON.stringify(graph);
      }
    } catch (e) {
      console.warn("[ArtistCache] Eager graphData normalization failed:", e);
    }
  }
  
  if (entry.detailsCache) {
    try {
      const parsed = typeof entry.detailsCache === 'string' ? JSON.parse(entry.detailsCache) : entry.detailsCache;
      const processDetails = (details: any) => {
        if (details) {
          if (details.details) {
            details.details.artist = titleCaseArtistId(details.details.artist || details.name || "");
          }
          if (details.name) {
            details.name = titleCaseArtistId(details.name);
          }
        }
      };
      if (Array.isArray(parsed)) {
        parsed.forEach(processDetails);
      } else {
        processDetails(parsed);
      }
      entry.detailsCache = parsed;
    } catch (e) {
      console.warn("[ArtistCache] Eager detailsCache normalization failed:", e);
    }
  }
  
  return entry;
};

// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Concurrently reads individual Firestore documents for each requested artist.
 * Returns a split result:
 *   - `cached`:  Map of artistName → ArtistCacheEntry for every doc that exists
 *   - `missing`: Array of artist names for which no document was found
 *
 * Errors on individual reads are non-fatal — a failed read is treated as a miss.
 */
export const readArtistCacheMany = async (
  artistNames: string[],
  activeUserId?: string | null,
  filters?: DiscoveryFilters
): Promise<{ cached: Map<string, ArtistCacheEntry>; missing: string[] }> => {
  const hasActiveFilters = !!(filters && (
    filters.foundedAfter ||
    filters.foundedBefore ||
    (filters.includeOrigins && filters.includeOrigins.length > 0) ||
    (filters.excludeOrigins && filters.excludeOrigins.length > 0) ||
    (filters.includeGenres && filters.includeGenres.length > 0)
  ));

  if (hasActiveFilters) {
    console.log("[ArtistCache] Bypassing cache read because active filters are present.");
    return { cached: new Map<string, ArtistCacheEntry>(), missing: artistNames };
  }

  const cached = new Map<string, ArtistCacheEntry>();
  const missing: string[] = [];

  const results = await Promise.allSettled(
    artistNames.map(async name => {
      const artistId = normalizeArtistId(name);
      const compositeId = buildCompositeCacheKey(artistId, filters);
      try {
        let snap = await getArtistDocWithRedirect(compositeId);
        if (!snap.exists()) {
          const labelSnap = await getLabelDocWithRedirect(compositeId);
          if (labelSnap.exists()) {
            snap = labelSnap;
          }
        }
        if (snap.exists()) {
          console.log(`[ArtistCache] HIT (Resolved): ${compositeId}`);
          return { name, entry: snap.data() as ArtistCacheEntry };
        } else {
          console.log(`[ArtistCache] MISS: ${compositeId}`);
          return { name, entry: null };
        }
      } catch (e) {
        console.warn(`[ArtistCache] Read failed for ${compositeId} (non-critical):`, e);
        return { name, entry: null };
      }
    })
  );

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      const { name, entry } = result.value;
      if (entry) {
        const normalizedEntry = eagerNormalizeCacheEntry(entry);
        cached.set(name, normalizedEntry);
        cached.set(name.toLowerCase(), normalizedEntry);
        const entityId = normalizedEntry.artistId || (normalizedEntry as any).labelId || normalizedEntry.cacheKey;
        if (entityId) {
          cached.set(entityId, normalizedEntry);
          cached.set(entityId.toLowerCase(), normalizedEntry);
        }
      } else {
        missing.push(name);
      }
    }
  });

  return { cached, missing };
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

/**
 * Writes each artist's isolated sub-graph as an individual Firestore document.
 *
 * For each entry:
 *   1. Extracts only the artist's own structural sub-graph via `extractArtistSubGraph`
 *   2. Writes to `/artists/{normalizedId}` with cacheVersion = 2
 *
 * Uses `Promise.allSettled` — partial write failures are non-fatal.
 * A failed write is swallowed (concurrent write by another user is the most likely cause).
 */
export const writeArtistCacheMany = async (
  artistNames: string[],
  fullGraph: GraphData,
  activeUserId?: string | null,
  filters?: any,
  preserveFullGraph: boolean = true,
  forceOverwrite?: boolean,
  detailsMap?: Map<string, NodeDetails>,
  seedArtistNames?: string[]
): Promise<void> => {
  const hasActiveFilters = !!(filters && (
    filters.foundedAfter ||
    filters.foundedBefore ||
    (filters.includeOrigins && filters.includeOrigins.length > 0) ||
    (filters.excludeOrigins && filters.excludeOrigins.length > 0) ||
    (filters.includeGenres && filters.includeGenres.length > 0)
  ));

  if (hasActiveFilters) {
    console.log("[ArtistCache] Bypassing cache write because active filters are present.");
    return;
  }

  const normalizedGraph = normalizeGraphData(fullGraph);
  const allEntitiesToCache = Array.from(new Set([
    ...artistNames,
    ...normalizedGraph.nodes
      .filter(n => n && (n.type === 'artist' || n.type === 'label'))
      .map(n => n.id)
  ]));

  await Promise.allSettled(
    allEntitiesToCache.map(async name => {
      const artistId = normalizeArtistId(name);
      
      // Find the canonical node in the full returned graph
      const canonicalNode = findCanonicalNodeForArtist(name, normalizedGraph.nodes);
      const targetNodeId = canonicalNode ? canonicalNode.id : name;

      // Find connected country nodes in normalizedGraph
      const connectedCountries = normalizedGraph.links
        .filter(l => {
          const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return sId.toLowerCase() === targetNodeId.toLowerCase() || tId.toLowerCase() === targetNodeId.toLowerCase();
        })
        .map(l => {
          const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          const otherId = sId.toLowerCase() === targetNodeId.toLowerCase() ? tId : sId;
          return normalizedGraph.nodes.find(n => n.id.toLowerCase() === otherId.toLowerCase());
        })
        .filter(n => n && n.type === 'country')
        .map(n => n!.label || n!.id);

      const canonicalId = canonicalNode ? normalizeArtistId(canonicalNode.id) : artistId;
      const canonicalName = canonicalNode?.label ?? canonicalNode?.id ?? name;
      
      const artistDetails = detailsMap?.get(canonicalId) || 
                            detailsMap?.get(artistId) || 
                            detailsMap?.get(canonicalName.toLowerCase()) || 
                            detailsMap?.get(name.toLowerCase());

      let countryNorm = "";
      if (connectedCountries.length > 0) {
        countryNorm = extractCountrySlug(connectedCountries[0]);
      } else if (artistDetails?.details?.origin) {
        countryNorm = extractCountrySlug(artistDetails.details.origin);
      }
      if (!countryNorm) countryNorm = "global";

      const isLabel = canonicalNode?.type === 'label';
      const disambiguatedCanonicalId = canonicalId.endsWith(`-${countryNorm}`) ? canonicalId : `${canonicalId}-${countryNorm}`;
      const disambiguatedArtistId = artistId.endsWith(`-${countryNorm}`) ? artistId : `${artistId}-${countryNorm}`;

      const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, filters);
      const compositeArtistId = buildCompositeCacheKey(disambiguatedArtistId, filters);

      const { nodes, links } = preserveFullGraph
        ? { nodes: normalizedGraph.nodes, links: normalizedGraph.links }
        : extractArtistSubGraph(canonicalNode ? canonicalNode.id : name, normalizedGraph, artistNames);

      if (nodes.length === 0 && !isLabel) {
        console.warn(`[ArtistCache] Skipping write for "${name}" (canonical: "${compositeCanonicalId}") — artist node not found in graph.`);
        return;
      }

      try {
        const collName = isLabel ? 'labels' : 'artists';
        const canonicalDocRef = doc(db, collName, compositeCanonicalId);
        const canonicalSnap = await getDoc(canonicalDocRef);

      const checkSeedMatch = (s: string, targetId: string, targetName: string) => {
        if (!s) return false;
        const normS = normalizeArtistId(s);
        const normT = normalizeArtistId(targetId);
        if (normS === normT || s.toLowerCase() === targetName.toLowerCase()) return true;
        if (normS.startsWith(`${normT}-`) || normT.startsWith(`${normS}-`)) return true;
        if (normS.includes(`-${normT}-`) || normS.endsWith(`-${normT}`) || normT.includes(`-${normS}-`) || normT.endsWith(`-${normS}`)) return true;
        return false;
      };
      const isPrimarySeed = seedArtistNames 
        ? seedArtistNames.some(s => checkSeedMatch(s, artistId, name))
        : artistNames.some(s => checkSeedMatch(s, artistId, name));

      if (!canonicalSnap.exists()) {
        // ── CREATE PATH ─────────────────────────────────────────────────────
        const idFieldKey = isLabel ? 'labelId' : 'artistId';
        const setPayload: any = {
          cacheKey: compositeCanonicalId,
          [idFieldKey]: canonicalId,
          seedArtists: canonicalName,
          graphData: (isLabel || !isPrimarySeed) ? null : JSON.stringify({ nodes, links, synthesisRationale: normalizedGraph.synthesisRationale }),
          synthesisRationale: (isLabel || !isPrimarySeed) ? null : (normalizedGraph.synthesisRationale || null),
          filters: filters || {},
          cacheVersion: 2,
          cachedAt: serverTimestamp(),
          hitCount: 0,
          isDeep: preserveFullGraph || false,
          isPrimarySeed: isPrimarySeed && !isLabel,
          hasUniqueSpiderweb: isPrimarySeed && !isLabel,
        };
        if (artistDetails) {
          setPayload.detailsCache = isLabel ? sanitizeLabelProfile(artistDetails) : (typeof artistDetails === 'string' ? JSON.parse(artistDetails) : artistDetails);
        } else if (isLabel) {
          console.warn(`[LabelCache] Creating canonical label "${compositeCanonicalId}" without detailsCache because artistDetails was missing/undefined.`);
        }
        if (!isLabel) enforceArtistCacheSchema(setPayload);
        await setDoc(canonicalDocRef, stripUndefinedProperties(setPayload));
        console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Created Universal Canonical (${isPrimarySeed ? 'SEED' : 'DEEP CUT'}): ${compositeCanonicalId}`);
      } else {
        const existing = canonicalSnap.data();
        const idFieldKey = isLabel ? 'labelId' : 'artistId';

        let existingArtistCount = 0;
        if (existing?.graphData) {
          try {
            const existingGraph = JSON.parse(existing.graphData);
            existingArtistCount = (existingGraph.nodes || []).filter((n: any) => n.type === 'artist' || n.type === 'label').length;
          } catch (e) { /* ignore parse errors on stale doc */ }
        }
        const incomingArtistCount = nodes.filter(n => n.type === 'artist' || n.type === 'label').length;
        const isRicherGraph = incomingArtistCount > existingArtistCount;

        if (!isPrimarySeed) {
          // Recommendation / Deep Cut: strictly perform telemetry/details write-back without overwriting graph topology or seed status!
          if (artistDetails) {
            const updatePayload: any = {
              detailsCache: isLabel ? sanitizeLabelProfile(artistDetails) : (typeof artistDetails === 'string' ? JSON.parse(artistDetails) : artistDetails),
              cachedAt: serverTimestamp(),
              cacheVersion: 2,
              [idFieldKey]: canonicalId,
              cacheKey: compositeCanonicalId,
              isDeep: preserveFullGraph || false,
            };
            await updateDoc(canonicalDocRef, stripUndefinedProperties(updatePayload));
            console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Proactively updated detailsCache for deep cut doc: ${compositeCanonicalId}`);
          } else {
            console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Skipping deep cut update for "${compositeCanonicalId}" — no detailsCache to write.`);
          }
        } else if (forceOverwrite || isRicherGraph || (existing && (!existing.cacheVersion || existing.cacheVersion < 2 || (preserveFullGraph && existing.isDeep !== true)))) {
          // ── UPGRADE PATH (Primary Seed) ─────────────────────────────────────────
          const updatePayload: any = {
            cacheKey: compositeCanonicalId,
            [idFieldKey]: canonicalId,
            seedArtists: canonicalName,
            graphData: isLabel ? null : JSON.stringify({ nodes, links, synthesisRationale: normalizedGraph.synthesisRationale }),
            synthesisRationale: normalizedGraph.synthesisRationale || null,
            filters: filters || {},
            cacheVersion: 2,
            cachedAt: serverTimestamp(),
            isDeep: preserveFullGraph || false,
            isPrimarySeed: !isLabel,
            hasUniqueSpiderweb: !isLabel,
          };
          if (artistDetails) {
            updatePayload.detailsCache = isLabel ? sanitizeLabelProfile(artistDetails) : (typeof artistDetails === 'string' ? JSON.parse(artistDetails) : artistDetails);
          }
          if (!isLabel) enforceArtistCacheSchema(updatePayload);
          await updateDoc(canonicalDocRef, stripUndefinedProperties(updatePayload));
          console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Upgraded/Overwritten Canonical doc: ${compositeCanonicalId} → cacheVersion 2 (incoming: ${incomingArtistCount} entities, existing: ${existingArtistCount} entities)`);
        } else if (artistDetails) {
          // Update detailsCache if it was missing or stale
          const updatePayload: any = {
            detailsCache: isLabel ? sanitizeLabelProfile(artistDetails) : (typeof artistDetails === 'string' ? JSON.parse(artistDetails) : artistDetails),
            cachedAt: serverTimestamp(),
            cacheVersion: 2,
            [idFieldKey]: canonicalId,
            cacheKey: compositeCanonicalId,
            isDeep: preserveFullGraph || false,
          };
          await updateDoc(canonicalDocRef, stripUndefinedProperties(updatePayload));
          console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Updated detailsCache for canonical doc: ${compositeCanonicalId}`);
        } else {
          console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Skipping write for Canonical "${compositeCanonicalId}" — doc already at v${existing?.cacheVersion || 2}.`);
        }
      }

      // Bare root alias pointer protection & legacy healing:
      const bareArtistIdRef = doc(db, collName, artistId);
      const bareSnap = await getDoc(bareArtistIdRef);
      const bareData = bareSnap.exists() ? bareSnap.data() : null;
      const idFieldKey = isLabel ? 'labelId' : 'artistId';

      if (!bareSnap.exists() || (bareData && !bareData.redirectTo && bareSnap.id !== compositeCanonicalId)) {
        await setDoc(bareArtistIdRef, stripUndefinedProperties({
          cacheKey: artistId,
          [idFieldKey]: artistId,
          seedArtists: name,
          graphData: isLabel ? null : JSON.stringify({ nodes: [], links: [] }),
          filters: {},
          cacheVersion: 2,
          cachedAt: serverTimestamp(),
          hitCount: 0,
          redirectTo: compositeCanonicalId,
          isPrimarySeed: isPrimarySeed && !isLabel,
          hasUniqueSpiderweb: false
        }));
        console.log(`[${isLabel ? 'LabelCache' : 'ArtistCache'}] Created/Healed Bare Alias Pointer: ${artistId} -> ${compositeCanonicalId}`);
      }
      } catch (e: any) {
        console.warn(`[ArtistCache] Write failed for "${compositeArtistId}" (${e.code ?? 'unknown'}): ${e.message}`);
      }
    })
  );
};

// ─── ASSEMBLE ─────────────────────────────────────────────────────────────────

/**
 * Merges a map of per-artist cache entries into a single unified GraphData
 * suitable for the D3 canvas.
 *
 * Nodes are deduplicated by their lowercased ID. Cross-artist structural
 * connections (e.g. two artists sharing the same genre node) are naturally
 * reconstituted here because the genre node will exist in both entries — the
 * deduplication step keeps only one copy, and both artists' links point to it.
 */
export const assembleGraphFromCache = (
  cached: Map<string, ArtistCacheEntry>
): GraphData => {
  const nodeMap = new Map<string, Node>();
  const linkSet = new Set<string>();
  const links: Link[] = [];

  cached.forEach(entry => {
    let entryNodes: Node[] = [];
    let entryLinks: Link[] = [];

    if (entry.graphData) {
      try {
        const parsedGraph = normalizeGraphData(JSON.parse(entry.graphData));
        if (parsedGraph.nodes) entryNodes = parsedGraph.nodes;
        if (parsedGraph.links) entryLinks = parsedGraph.links;
      } catch (e) {
        console.warn(`[ArtistCache] Failed to parse graphData for ${entry.artistId}:`, e);
      }
    }

    // Deduplicate nodes by lowercased ID
    entryNodes.forEach(node => {
      const key = node.id.trim().toLowerCase();
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { ...node, id: node.id.trim(), fx: null, fy: null });
      }
    });

    // Deduplicate links by source→target pair
    entryLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
      const linkKey = `${sourceId.trim().toLowerCase()}→${targetId.trim().toLowerCase()}`;
      if (!linkSet.has(linkKey)) {
        linkSet.add(linkKey);
        links.push({ ...link, source: sourceId.trim(), target: targetId.trim() });
      }
    });
    
    // Enforce Safe Fallback Graph State: If we have zero metadata connections and only 1 node, inject a placeholder
    if (entryLinks.length === 0 && entryNodes.length === 1) {
       const artistIdStr = (entry.artistId || (entry as any).labelId || '').trim().toLowerCase();
       const fallbackId = 'Cached Profile';
       const fallbackKey = fallbackId.toLowerCase();
       if (!nodeMap.has(fallbackKey)) {
          nodeMap.set(fallbackKey, { id: fallbackKey, label: fallbackId, type: 'genre', group: 0, fx: null, fy: null });
       }
       const linkKey = `${artistIdStr}→${fallbackKey}`;
       if (!linkSet.has(linkKey)) {
          linkSet.add(linkKey);
          links.push({ source: normalizeArtistId(entry.seedArtists || (entry as any).seedLabels || entry.artistId || (entry as any).labelId || ''), target: fallbackKey, value: 1 });
       }
    }
  });

  let aggregatedRationale = "";
  const rationales: string[] = [];
  cached.forEach(entry => {
    let entryRationale = entry.synthesisRationale;
    if (!entryRationale && entry.graphData) {
      try {
        const parsed = JSON.parse(entry.graphData);
        if (parsed.synthesisRationale) entryRationale = parsed.synthesisRationale;
      } catch (e) {}
    }
    if (entryRationale && entryRationale.trim()) {
      rationales.push(entryRationale.trim());
    }
  });

  if (rationales.length > 0) {
    aggregatedRationale = Array.from(new Set(rationales)).join('\n\n');
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
    synthesisRationale: aggregatedRationale || undefined
  };
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

/**
 * Increments the hit counter on a per-artist cache entry for analytics.
 * Fire-and-forget — failures are silently ignored.
 */
export const incrementCacheHit = async (artistId: string, activeUserId?: string | null, entityType = 'artist'): Promise<void> => {
  try {
    const snap = await getEntityDocWithRedirect(artistId, entityType);
    if (snap.exists()) {
      await updateDoc(doc(db, entityType === 'label' ? 'labels' : 'artists', snap.id), {
        hitCount: increment(1),
      });
    }
  } catch (error: any) {
    console.warn("Global write bypassed due to rule restrictions:", error.message);
  }
};

// ─── LEGACY COMPATIBILITY ─────────────────────────────────────────────────────

/**
 * @deprecated — Retained ONLY for backward-compatible reads of legacy project
 * documents that still reference a compound `cacheKey`.
 *
 * Do NOT use for new cache writes. Use `readArtistCacheMany` instead.
 */
export const readLegacyArtistCache = async (
  cacheKey: string,
  entityType = 'artist'
): Promise<{ graphData: string; detailsCache: string } | null> => {
  try {
    const collName = entityType === 'label' ? 'labels' : 'artists';
    const snap = await getDoc(doc(db, collName, cacheKey));
    if (snap.exists()) {
      const data = snap.data();
      console.log(`[ArtistCache] Legacy HIT: ${cacheKey}`);
      let graphDataStr = data.graphData ?? '{"nodes":[],"links":[]}';
      let detailsCacheStr = data.detailsCache ?? '[]';
      try {
        const graph = JSON.parse(graphDataStr);
        if (graph && graph.nodes) {
          graph.nodes.forEach((n: any) => {
            if (n.type === 'artist' || n.type === 'label') {
              n.label = titleCaseArtistId(n.label || n.id);
            }
          });
          graphDataStr = JSON.stringify(graph);
        }
      } catch (e) {}

      try {
        const parsed = JSON.parse(detailsCacheStr);
        const processDetails = (details: any) => {
          if (details) {
            if (details.details) {
              details.details.artist = titleCaseArtistId(details.details.artist || details.name || "");
            }
            if (details.name) {
              details.name = titleCaseArtistId(details.name);
            }
          }
        };
        if (Array.isArray(parsed)) {
          parsed.forEach(processDetails);
        } else {
          processDetails(parsed);
        }
        detailsCacheStr = JSON.stringify(parsed);
      } catch (e) {}

      return {
        graphData: graphDataStr,
        detailsCache: detailsCacheStr,
      };
    }
    console.log(`[ArtistCache] Legacy MISS: ${cacheKey}`);
    return null;
  } catch (e) {
    console.warn('[ArtistCache] Legacy read failed (non-critical):', e);
    return null;
  }
};

/**
 * Checks if the cachedAt timestamp is older than 365 days (1 year).
 */
export const isCacheExpired = (cachedAt: any): boolean => {
  if (!cachedAt) return true;
  let date: Date;
  if (typeof cachedAt.toDate === 'function') {
    date = cachedAt.toDate();
  } else if (cachedAt instanceof Date) {
    date = cachedAt;
  } else if (typeof cachedAt === 'string') {
    date = new Date(cachedAt);
  } else if (cachedAt.seconds) {
    date = new Date(cachedAt.seconds * 1000);
  } else if (typeof cachedAt === 'number') {
    date = new Date(cachedAt);
  } else if (cachedAt.nanoseconds && typeof cachedAt.seconds === 'number') {
    date = new Date(cachedAt.seconds * 1000);
  } else {
    return true;
  }
  
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  return (Date.now() - date.getTime()) > oneYearMs;
};

/**
 * Reads a document from the global entity cache ('artists' or 'labels'), resolving redirects.
 * If the doc has a `redirectTo` field, fetches and returns the canonical doc snapshot instead.
 * Supports up to 3 levels of redirects to prevent infinite loops.
 */
export const getEntityDocWithRedirect = async (
  entityId: string,
  entityType = 'artist',
  depth = 0
): Promise<DocumentSnapshot> => {
  const collName = entityType === 'label' ? 'labels' : 'artists';
  const apiPath = entityType === 'label' ? '/api/label/' : '/api/artist/';
  try {
    const url = `${apiPath}${entityId}`;
    const response = await fetch(url);
    if (!response.ok) {
      // Fallback to client-side direct read if proxy endpoint fails or returns 404
      const docRef = doc(db, collName, entityId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.redirectTo && depth < 3) {
          let targetId = data.redirectTo.trim();
          const match = targetId.match(/^([a-z0-9\-]+-(?:united-states|united-kingdom|canada|australia|germany|france|sweden|norway|italy|spain|brazil|mexico|japan|south-korea))-.+$/i);
          if (match) {
            console.log(`[Redirect Suffix Cleaner] Normalized redirect: ${targetId} -> ${match[1]}`);
            targetId = match[1];
          }
          console.log(`[Client-Side Redirect] Redirecting ${entityId} -> ${targetId}`);
          return getEntityDocWithRedirect(targetId, entityType, depth + 1);
        }
        return snap;
      }

      // Prefix match lookup fallback: check if any document has a cacheKey starting with entityId
      if (depth === 0) {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(
          collection(db, collName),
          where('cacheKey', '>=', entityId),
          where('cacheKey', '<=', entityId + '\uf8ff')
        );
        const qSnap = await getDocs(q);
        const validDocs = qSnap.docs.filter(d => !d.data().redirectTo);
        if (validDocs.length > 0) {
          console.log(`[Client-Side Prefix Match] Resolved ${entityId} -> ${validDocs[0].id}`);
          return validDocs[0];
        }
      }
      return snap;
    }
    
    const data = await response.json();
    if (data && data.redirectTo && depth < 3) {
      let targetId = data.redirectTo.trim();
      const match = targetId.match(/^([a-z0-9\-]+-(?:united-states|united-kingdom|canada|australia|germany|france|sweden|norway|italy|spain|brazil|mexico|japan|south-korea))-.+$/i);
      if (match) {
        console.log(`[Redirect Suffix Cleaner Proxy] Normalized redirect: ${targetId} -> ${match[1]}`);
        targetId = match[1];
      }
      console.log(`[Client-Side Redirect Proxy] Redirecting ${entityId} -> ${targetId}`);
      return getEntityDocWithRedirect(targetId, entityType, depth + 1);
    }
    
    let canonicalId = entityId;
    if (data && data.cacheKey) {
      canonicalId = data.cacheKey;
    }
    
    // Return a mocked DocumentSnapshot to maintain type compatibility
    return {
      exists: () => true,
      data: () => data,
      id: canonicalId,
      metadata: {} as any,
      ref: {} as any,
      get: (fieldPath: string) => (data as any)[fieldPath],
    } as unknown as DocumentSnapshot;
  } catch (error) {
    console.warn(`[Proxy Fetch] Failed for ${entityId}, falling back to direct Firestore read:`, error);
    const docRef = doc(db, collName, entityId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.redirectTo && depth < 3) {
        let targetId = data.redirectTo.trim();
        const match = targetId.match(/^([a-z0-9\-]+-(?:united-states|united-kingdom|canada|australia|germany|france|sweden|norway|italy|spain|brazil|mexico|japan|south-korea))-.+$/i);
        if (match) {
          console.log(`[Redirect Suffix Cleaner Catch] Normalized redirect: ${targetId} -> ${match[1]}`);
          targetId = match[1];
        }
        console.log(`[Client-Side Redirect] Redirecting ${entityId} -> ${targetId}`);
        return getEntityDocWithRedirect(targetId, entityType, depth + 1);
      }
      return snap;
    }

    // Prefix match lookup fallback: check if any document has a cacheKey starting with entityId
    if (depth === 0) {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(
          collection(db, collName),
          where('cacheKey', '>=', entityId),
          where('cacheKey', '<=', entityId + '\uf8ff')
        );
        const qSnap = await getDocs(q);
        const validDocs = qSnap.docs.filter(d => !d.data().redirectTo);
        if (validDocs.length > 0) {
          console.log(`[Client-Side Prefix Match (Catch)] Resolved ${entityId} -> ${validDocs[0].id}`);
          return validDocs[0];
        }
      } catch (innerErr) {
        console.warn(`[Client-Side Prefix Match (Catch)] Failed query:`, innerErr);
      }
    }
    return snap;
  }
};

export const getArtistDocWithRedirect = async (
  artistId: string,
  depth = 0
): Promise<DocumentSnapshot> => getEntityDocWithRedirect(artistId, 'artist', depth);

export const getLabelDocWithRedirect = async (
  labelId: string,
  depth = 0
): Promise<DocumentSnapshot> => getEntityDocWithRedirect(labelId, 'label', depth);

export const getAnyEntityDocWithRedirect = async (
  entityId: string,
  depth = 0
): Promise<DocumentSnapshot> => {
  let snap = await getArtistDocWithRedirect(entityId, depth);
  if (!snap.exists()) {
    const labelSnap = await getLabelDocWithRedirect(entityId, depth);
    if (labelSnap.exists()) {
      snap = labelSnap;
    }
  }
  return snap;
};

/**
 * Helper to identify the canonical/matching node in the returned graph data.
 */
export const findCanonicalNodeForArtist = (name: string, nodes: Node[]): Node | undefined => {
  const normSearch = normalizeArtistId(name);
  const artistNodes = nodes.filter(n => n.type === 'artist' || n.type === 'label');
  
  // 1. Try exact normalized match on ID
  let found = artistNodes.find(n => normalizeArtistId(n.id) === normSearch);
  if (found) return found;
  
  // 2. Try exact normalized match on Label
  found = artistNodes.find(n => n.label && normalizeArtistId(n.label) === normSearch);
  if (found) return found;

  // 2.5 Try prefix/suffix or country slug match (e.g. "buggin-united-states" vs "buggin")
  found = artistNodes.find(n => {
    const normId = normalizeArtistId(n.id);
    const normLabel = n.label ? normalizeArtistId(n.label) : '';
    const checkPair = (a: string, b: string) => {
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return true;
      if (a.includes(`-${b}-`) || a.endsWith(`-${b}`) || b.includes(`-${a}-`) || b.endsWith(`-${a}`)) return true;
      return false;
    };
    return checkPair(normSearch, normId) || (normLabel ? checkPair(normSearch, normLabel) : false);
  });
  if (found) return found;
  
  // 3. Try partial/fuzzy match (surnames or word boundaries)
  const isFuzzyPartialMatch = (search: string, target: string) => {
    const searchClean = search.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const targetClean = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!searchClean || !targetClean) return false;
    
    const searchWords = searchClean.split(/\s+/);
    const targetWords = targetClean.split(/\s+/);
    
    // If search is a single word (e.g. "Gaye"), it must be one of the words in the target name
    if (searchWords.length === 1) {
      return targetWords.includes(searchWords[0]);
    }
    
    // If search has multiple words (e.g. "Marvin G"), check if target contains it as a substring
    return targetClean.includes(searchClean);
  };

  // Try matching ID fuzzy first
  found = artistNodes.find(n => isFuzzyPartialMatch(name, n.id));
  if (found) return found;

  // Try matching Label fuzzy next
  found = artistNodes.find(n => n.label && isFuzzyPartialMatch(name, n.label));
  if (found) return found;

  return undefined;
};

/**
 * Strips artist-centric fields from a label profile before caching in Firestore.
 */
export const sanitizeLabelProfile = (details: any): any => {
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
};

/**
 * Enforces schema validation for artist documents written to Firestore.
 * Ensures detailsCache is valid, non-empty, and contains biography/summary and discography to prevent data rot.
 */
export const enforceArtistCacheSchema = (payload: any): void => {
  if (!payload) return;
  if (payload.redirectTo) return;

  const isDeep = payload.isDeep === true;

  if (isDeep || 'detailsCache' in payload) {
    try {
      const detailsCacheRaw = payload.detailsCache;
      if (!detailsCacheRaw) {
        return;
      }

      let parsed: any = null;
      try {
        parsed = typeof detailsCacheRaw === 'string' ? JSON.parse(detailsCacheRaw) : detailsCacheRaw;
      } catch (e: any) {
        throw new Error(`[Schema Enforcement] detailsCache is not valid JSON: ${e.message}`);
      }
      
      if (!parsed) {
        throw new Error("[Schema Enforcement] Parsed detailsCache is null or empty.");
      }
      
      // Check for biography or summary
      const bio = parsed.summary || parsed.bio || parsed.description || parsed.text;
      if (!bio || typeof bio !== 'string' || bio.trim().length < 2) {
        throw new Error("[Schema Enforcement] detailsCache is missing biography/summary text.");
      }
      
      // Check details object
      if (!parsed.details || typeof parsed.details !== 'object') {
        throw new Error("[Schema Enforcement] detailsCache is missing or has invalid details object.");
      }
      const { genre, origin, founded, notableArtists } = parsed.details;
      if (genre === undefined || genre === null || typeof genre !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing genre.");
      }
      if (origin === undefined || origin === null || typeof origin !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing origin.");
      }
      if (founded === undefined || founded === null || typeof founded !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing founded year.");
      }
      if (notableArtists && !Array.isArray(notableArtists)) {
        throw new Error("[Schema Enforcement] detailsCache.details has invalid notableArtists array.");
      }

      // Check for discography array
      if (parsed.discography && !Array.isArray(parsed.discography)) {
        throw new Error("[Schema Enforcement] detailsCache has invalid discography array.");
      }
      if (Array.isArray(parsed.discography)) {
        for (let i = 0; i < parsed.discography.length; i++) {
          const item = parsed.discography[i];
          if (!item || typeof item !== 'object' || !item.albumName || !item.releaseYear) {
            throw new Error(`[Schema Enforcement] discography item at index ${i} is missing albumName or releaseYear.`);
          }
        }
      }

      // Check recommendationReason (allow empty string for primary seeds)
      if (parsed.recommendationReason === undefined || parsed.recommendationReason === null || typeof parsed.recommendationReason !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing recommendationReason.");
      }

      // Check youtubeSearchQuery (allow empty string)
      if (parsed.youtubeSearchQuery === undefined || parsed.youtubeSearchQuery === null || typeof parsed.youtubeSearchQuery !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing youtubeSearchQuery.");
      }
    } catch (err: any) {
      console.error("[Schema Enforcement] Client Validation failed for payload:", JSON.stringify(payload, null, 2));
      throw err;
    }
  }
};


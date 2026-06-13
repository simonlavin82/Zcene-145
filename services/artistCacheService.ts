import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { GraphData, Node, Link, ArtistCacheEntry } from '../types';

// ─── UTILITIES ────────────────────────────────────────────────────────────────

/**
 * Produces a stable, Firestore-safe document ID for a single artist name.
 * e.g. "End It" → "end-it", "blink-182" → "blink-182", "Radiohead" → "radiohead"
 */
export const normalizeArtistId = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);


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
    
    if (node.type === 'artist') {
      normalizedId = normalizeArtistId(originalId);
    } else {
      normalizedId = normalizedId.toLowerCase();
    }
    
    idMap.set(originalId, normalizedId);
    idMap.set(originalId.toLowerCase(), normalizedId); // fallback
    idMap.set(normalizeArtistId(originalId), normalizedId); // accent-insensitive fallback

    return {
      ...node,
      id: normalizedId,
      label: node.label || originalId.trim()
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
    links: normalizedLinks
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

  // Find the canonical artist node from the full graph
  const artistNode = fullGraph.nodes.find(
    n => n.type === 'artist' && normalizeArtistId(n.id) === artistNameNorm
  );

  if (!artistNode) {
    return { nodes: [], links: [] };
  }

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

    if (sNorm === artistNameNorm || tNorm === artistNameNorm) {
      const otherId = sNorm === artistNameNorm ? t : s;
      const otherNorm = normalizeArtistId(otherId);
      
      const otherNode = fullGraph.nodes.find(n => normalizeArtistId(n.id) === otherNorm);
      if (otherNode && otherNode.type === 'artist' && !seedsNorm.has(otherNorm)) {
        peerArtistIds.add(otherNode.id);
      }
    }
  });

  // 2. Combine all kept artist nodes (target artist itself + its peer bands)
  const keptArtistIds = new Set<string>([artistNode.id]);
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
  keptNodeIds.add(artistNode.id);
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

  return { nodes: ownNodes, links: ownLinks };
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
  activeUserId?: string | null
): Promise<{ cached: Map<string, ArtistCacheEntry>; missing: string[] }> => {
  const cached = new Map<string, ArtistCacheEntry>();
  const missing: string[] = [];

  const results = await Promise.allSettled(
    artistNames.map(async name => {
      const artistId = normalizeArtistId(name);
      try {
        const snap = await getDoc(doc(db, 'artists', artistId));
        if (snap.exists()) {
          console.log(`[ArtistCache] HIT: ${artistId}`);
          return { name, entry: snap.data() as ArtistCacheEntry };
        } else {
          console.log(`[ArtistCache] MISS: ${artistId}`);
          return { name, entry: null };
        }
      } catch (e) {
        console.warn(`[ArtistCache] Read failed for ${artistId} (non-critical):`, e);
        return { name, entry: null };
      }
    })
  );

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      const { name, entry } = result.value;
      if (entry) {
        cached.set(name, entry);
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
  filters?: any
): Promise<void> => {
  const normalizedGraph = normalizeGraphData(fullGraph);
  await Promise.allSettled(
    artistNames.map(async name => {
      const artistId = normalizeArtistId(name);
      const { nodes, links } = extractArtistSubGraph(name, normalizedGraph, artistNames);

      if (nodes.length === 0) {
        console.warn(`[ArtistCache] Skipping write for "${name}" — artist node not found in graph.`);
        return;
      }

      // Find the canonical name from the artist node itself (preserves AI casing in label)
      const canonicalNode = nodes.find(
        n => n.type === 'artist' && (n.id.trim().toLowerCase() === name.trim().toLowerCase() || normalizeArtistId(n.id) === artistId)
      );
      const canonicalName = canonicalNode?.label ?? canonicalNode?.id ?? name;

      try {
        await setDoc(doc(db, 'artists', artistId), {
          cacheKey: artistId,
          artistId,
          seedArtists: canonicalName,
          graphData: JSON.stringify({ nodes, links }),
          filters: filters || {},
          cacheVersion: 2,
          cachedAt: serverTimestamp(),
          hitCount: 0,
        }, { merge: true });
        console.log(`[ArtistCache] Written: ${artistId} (${nodes.length} nodes, ${links.length} links)`);
      } catch (e: any) {
        console.warn("Global write bypassed due to rule restrictions:", e.message);
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
       const artistIdStr = entry.artistId.trim().toLowerCase();
       const fallbackId = 'Cached Profile';
       const fallbackKey = fallbackId.toLowerCase();
       if (!nodeMap.has(fallbackKey)) {
          nodeMap.set(fallbackKey, { id: fallbackKey, label: fallbackId, type: 'genre', group: 0, fx: null, fy: null });
       }
       const linkKey = `${artistIdStr}→${fallbackKey}`;
       if (!linkSet.has(linkKey)) {
          linkSet.add(linkKey);
          links.push({ source: normalizeArtistId(entry.seedArtists || entry.artistId), target: fallbackKey, value: 1 });
       }
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  };
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

/**
 * Increments the hit counter on a per-artist cache entry for analytics.
 * Fire-and-forget — failures are silently ignored.
 */
export const incrementCacheHit = async (artistId: string, activeUserId?: string | null): Promise<void> => {
  try {
    await updateDoc(doc(db, 'artists', artistId), {
      hitCount: increment(1),
    });
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
  cacheKey: string
): Promise<{ graphData: string; detailsCache: string } | null> => {
  try {
    const snap = await getDoc(doc(db, 'artists', cacheKey));
    if (snap.exists()) {
      const data = snap.data();
      console.log(`[ArtistCache] Legacy HIT: ${cacheKey}`);
      // Legacy docs stored graphData + detailsCache as top-level string fields
      return {
        graphData: data.graphData ?? '{"nodes":[],"links":[]}',
        detailsCache: data.detailsCache ?? '[]',
      };
    }
    console.log(`[ArtistCache] Legacy MISS: ${cacheKey}`);
    return null;
  } catch (e) {
    console.warn('[ArtistCache] Legacy read failed (non-critical):', e);
    return null;
  }
};

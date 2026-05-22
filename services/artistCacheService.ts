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
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);

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
  fullGraph: GraphData
): { nodes: Node[]; links: Link[] } => {
  const artistNameLower = artistName.trim().toLowerCase();

  // Find the canonical artist node from the full graph
  const artistNode = fullGraph.nodes.find(
    n => n.type === 'artist' && n.id.trim().toLowerCase() === artistNameLower
  );

  if (!artistNode) {
    return { nodes: [], links: [] };
  }

  // Collect all artist node IDs in the full graph (to detect cross-artist edges)
  const allArtistIds = new Set(
    fullGraph.nodes
      .filter(n => n.type === 'artist')
      .map(n => n.id.trim().toLowerCase())
  );

  // Resolve link endpoints to string IDs
  const resolveId = (endpoint: string | Node): string =>
    typeof endpoint === 'string' ? endpoint : endpoint.id;

  const artistId = artistNode.id;

  // Find all links where this artist is one endpoint and the OTHER endpoint
  // is NOT another artist node (i.e. only structural metadata links)
  const ownLinks = fullGraph.links.filter(link => {
    const sourceId = resolveId(link.source);
    const targetId = resolveId(link.target);
    const sourceLower = sourceId.trim().toLowerCase();
    const targetLower = targetId.trim().toLowerCase();

    const involvesSelf =
      sourceLower === artistNameLower || targetLower === artistNameLower;
    if (!involvesSelf) return false;

    // Determine the other endpoint
    const otherId = sourceLower === artistNameLower ? targetLower : sourceLower;

    // Strip cross-artist edges: exclude if the other node is also an artist
    return !allArtistIds.has(otherId);
  });

  // Collect the metadata node IDs referenced by the kept links
  const metadataNodeIds = new Set<string>();
  ownLinks.forEach(link => {
    const sourceId = resolveId(link.source);
    const targetId = resolveId(link.target);
    const sourceLower = sourceId.trim().toLowerCase();
    if (sourceLower !== artistNameLower) metadataNodeIds.add(sourceId);
    else metadataNodeIds.add(targetId);
  });

  // Collect the kept nodes: this artist + its metadata nodes
  const ownNodes = fullGraph.nodes.filter(n => {
    const nLower = n.id.trim().toLowerCase();
    return nLower === artistNameLower || metadataNodeIds.has(n.id);
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
  await Promise.allSettled(
    artistNames.map(async name => {
      const artistId = normalizeArtistId(name);
      const { nodes, links } = extractArtistSubGraph(name, fullGraph);

      if (nodes.length === 0) {
        console.warn(`[ArtistCache] Skipping write for "${name}" — artist node not found in graph.`);
        return;
      }

      // Find the canonical name from the artist node itself (preserves AI casing)
      const canonicalNode = nodes.find(
        n => n.type === 'artist' && n.id.trim().toLowerCase() === name.trim().toLowerCase()
      );
      const canonicalName = canonicalNode?.id ?? name;

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
        const parsedGraph = JSON.parse(entry.graphData);
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
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
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
          nodeMap.set(fallbackKey, { id: fallbackId, type: 'genre', group: 0, fx: null, fy: null });
       }
       const linkKey = `${artistIdStr}→${fallbackKey}`;
       if (!linkSet.has(linkKey)) {
          linkSet.add(linkKey);
          links.push({ source: entry.seedArtists || entry.artistId, target: fallbackId, value: 1 });
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

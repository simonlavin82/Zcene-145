import { useMemo } from 'react';
import { normalizeArtistId } from '../services/artistCacheService';

/**
 * Hook to resolve seed artwork for Dashboard Cards in accordance with Architecture V29 (Rule 29).
 * 
 * Invariants:
 * 1. UI consumers must rely strictly on the frozen seedImageUrls snapshot.
 * 2. Querying the global artists cache for visual assets on isolated projects is strictly prohibited.
 * 3. Deep cuts are strictly excluded. Only explicitly chosen seeds are returned.
 */
export const useSeedImages = (
  seedArtists: string,
  projectDetailsCache?: string,
  fallbackGraphData?: any,
  seedImageUrl?: string,
  seedImageUrls?: (string | null)[]
): string[] => {
  return useMemo(() => {
    if (!seedArtists) return [];

    // 1. Primary Pathway (Architecture V29): Frozen seedImageUrls snapshot
    if (seedImageUrls && Array.isArray(seedImageUrls)) {
      return seedImageUrls
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0 && url !== 'not-found')
        .map(url => url.trim());
    }

    // 2. Legacy In-Memory Fallback: Strictly scoped to the project's own snapshot
    const list = seedArtists.split('::').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return [];

    const resolved: string[] = [];

    // Check projectDetailsCache
    let internalCacheMap: Map<string, any> | null = null;
    if (projectDetailsCache) {
      try {
        const parsedMap = JSON.parse(projectDetailsCache);
        if (Array.isArray(parsedMap)) {
          internalCacheMap = new Map(parsedMap as [string, any][]);
        }
      } catch (e) {}
    }

    // Check fallbackGraphData
    let graphNodes: any[] = [];
    if (fallbackGraphData) {
      try {
        const parsedGraph = typeof fallbackGraphData === 'string' ? JSON.parse(fallbackGraphData) : fallbackGraphData;
        if (parsedGraph && Array.isArray(parsedGraph.nodes)) {
          graphNodes = parsedGraph.nodes;
        }
      } catch (e) {}
    }

    for (let index = 0; index < list.length; index++) {
      const seed = list[index];
      const normId = normalizeArtistId(seed);
      let foundUrl: string | null = null;

      // A. Check internal detailsCache
      if (internalCacheMap) {
        let entry = internalCacheMap.get(normId);
        if (!entry) {
          const fallbackKey = Array.from(internalCacheMap.keys()).find(k => (k as string).startsWith(`${normId}-`));
          if (fallbackKey) entry = internalCacheMap.get(fallbackKey);
        }
        if (entry) {
          const url = entry.imageUrl || entry.details?.imageUrl || '';
          if (url && url !== 'not-found' && typeof url === 'string' && url.trim().length > 0) {
            foundUrl = url.trim();
          }
        }
      }

      // B. Check explicit legacy seedImageUrl for index 0
      if (!foundUrl && index === 0 && seedImageUrl && seedImageUrl !== 'not-found' && typeof seedImageUrl === 'string' && seedImageUrl.trim().length > 0) {
        foundUrl = seedImageUrl.trim();
      }

      // C. Check fallbackGraphData
      if (!foundUrl && graphNodes.length > 0) {
        const fallbackNode = graphNodes.find((fn: any) =>
          normalizeArtistId(fn.id) === normId ||
          normalizeArtistId(fn.label) === normId ||
          (fn.label && fn.label.toLowerCase() === seed.toLowerCase())
        );
        if (fallbackNode && fallbackNode.imageUrl && fallbackNode.imageUrl !== 'not-found') {
          foundUrl = fallbackNode.imageUrl.trim();
        }
      }

      if (foundUrl) {
        resolved.push(foundUrl);
      }
    }

    return resolved;
  }, [seedArtists, projectDetailsCache, fallbackGraphData, seedImageUrl, seedImageUrls]);
};

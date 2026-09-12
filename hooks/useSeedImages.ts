import { useState, useEffect } from 'react';
import { normalizeArtistId, getEntityDocWithRedirect } from '../services/artistCacheService';

export const useSeedImages = (
  seedArtists: string,
  projectDetailsCache?: string,
  fallbackGraphData?: any,
  seedImageUrl?: string
) => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!seedArtists) {
      setImageUrls([]);
      return;
    }

    const list = seedArtists.split('::').filter(Boolean);
    const topSeeds = list.slice(0, 2); // Get up to first 2 seeds
    if (topSeeds.length === 0) {
      setImageUrls([]);
      return;
    }

    let isMounted = true;
    const resolvedUrls = new Array(topSeeds.length).fill(null);
    let pendingCount = topSeeds.length;

    const checkComplete = () => {
      if (pendingCount === 0 && isMounted) {
        setImageUrls([...resolvedUrls]);
      }
    };

    topSeeds.forEach((seed, index) => {
      const normId = normalizeArtistId(seed);

      // 1. Prioritize internal cache
      if (projectDetailsCache) {
        try {
          const parsedMap = JSON.parse(projectDetailsCache);
          if (Array.isArray(parsedMap)) {
            const internalCacheMap = new Map(parsedMap as [string, any][]);
            let entry = internalCacheMap.get(normId);
            if (!entry) {
              const fallbackKey = Array.from(internalCacheMap.keys()).find(k => (k as string).startsWith(`${normId}-`));
              if (fallbackKey) entry = internalCacheMap.get(fallbackKey);
            }
            if (entry) {
              const url = entry.imageUrl || entry.details?.imageUrl || '';
              if (url && url !== 'not-found') {
                resolvedUrls[index] = url;
                pendingCount--;
                checkComplete();
                return;
              }
            }
          }
        } catch (e) {}
      }

      // 2. Explicit seedImageUrl fallback (only applies if we requested this seed as index 0)
      if (index === 0 && seedImageUrl && seedImageUrl !== 'not-found') {
        resolvedUrls[index] = seedImageUrl;
        pendingCount--;
        checkComplete();
        return;
      }

      // 3. Fallback to project internal graph data
      if (fallbackGraphData && fallbackGraphData.nodes) {
        const parsedGraph = typeof fallbackGraphData === 'string' ? JSON.parse(fallbackGraphData) : fallbackGraphData;
        if (parsedGraph.nodes) {
           const fallbackNode = parsedGraph.nodes.find((fn: any) => 
             normalizeArtistId(fn.id) === normId || normalizeArtistId(fn.label) === normId || (fn.label && fn.label.toLowerCase() === seed.toLowerCase())
           );
           if (fallbackNode && fallbackNode.imageUrl && fallbackNode.imageUrl !== 'not-found') {
             resolvedUrls[index] = fallbackNode.imageUrl;
             pendingCount--;
             checkComplete();
             return;
           }
        }
      }

      // 4. Fetch from database
      getEntityDocWithRedirect(normId, 'artist').then(snap => {
        if (!isMounted) return;
        if (snap && snap.exists()) {
          const entry = snap.data();
          if (entry && entry.detailsCache) {
            try {
              const parsed = typeof entry.detailsCache === 'string' ? JSON.parse(entry.detailsCache) : entry.detailsCache;
              let url = '';
              if (Array.isArray(parsed) && parsed.length > 0) {
                url = parsed[0].imageUrl || parsed[0].details?.imageUrl || '';
              } else if (parsed) {
                url = parsed.imageUrl || parsed.details?.imageUrl || '';
              }
              if (url && url !== 'not-found') {
                resolvedUrls[index] = url;
                pendingCount--;
                checkComplete();
                return;
              }
            } catch (e) {}
          }
        }
        resolvedUrls[index] = 'not-found';
        pendingCount--;
        checkComplete();
      });
    });

    return () => {
      isMounted = false;
    };
  }, [seedArtists, projectDetailsCache, fallbackGraphData, seedImageUrl]);

  return imageUrls;
};

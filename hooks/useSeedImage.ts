import { useState, useEffect } from 'react';
import { normalizeArtistId, getEntityDocWithRedirect } from '../services/artistCacheService';

export const useSeedImage = (
  seedArtists: string,
  projectDetailsCache?: string,
  fallbackGraphData?: any,
  seedImageUrl?: string
) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!seedArtists) {
      setImageUrl(null);
      return;
    }

    const list = seedArtists.split('::').filter(Boolean);
    const firstSeed = list[0];
    if (!firstSeed) return;

    const normId = normalizeArtistId(firstSeed);
    let isMounted = true;

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
              setImageUrl(url);
              return;
            }
          }
        }
      } catch (e) {}
    }

    // 2. Explicit seedImageUrl fallback
    if (seedImageUrl && seedImageUrl !== 'not-found') {
      setImageUrl(seedImageUrl);
      return;
    }

    // 3. Fallback to project internal graph data
    if (fallbackGraphData && fallbackGraphData.nodes) {
      const parsedGraph = typeof fallbackGraphData === 'string' ? JSON.parse(fallbackGraphData) : fallbackGraphData;
      if (parsedGraph.nodes) {
         const fallbackNode = parsedGraph.nodes.find((fn: any) => 
           normalizeArtistId(fn.id) === normId || normalizeArtistId(fn.label) === normId || (fn.label && fn.label.toLowerCase() === firstSeed.toLowerCase())
         );
         if (fallbackNode && fallbackNode.imageUrl && fallbackNode.imageUrl !== 'not-found') {
           setImageUrl(fallbackNode.imageUrl);
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
              setImageUrl(url);
              return;
            }
          } catch (e) {}
        }
      }
      setImageUrl('not-found');
    });

    return () => {
      isMounted = false;
    };
  }, [seedArtists, projectDetailsCache, fallbackGraphData, seedImageUrl]);

  return imageUrl;
};

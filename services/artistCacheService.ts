import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { GraphData, NodeDetails, ArtistCacheEntry, DiscoveryFilters } from '../types';

/**
 * Produces a stable, Firestore-safe document ID for a given set of artists + filters.
 * Artists are sorted so "Radiohead::Arcade Fire" == "Arcade Fire::Radiohead".
 * Max 512 chars (well under Firestore's 1500-byte doc ID limit).
 */
export const normalizeCacheKey = (
  artists: string,
  filters?: DiscoveryFilters
): string => {
  const sortedArtists = artists
    .split('::')
    .map(a =>
      a
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .sort()
    .join('--');

  const parts: string[] = [sortedArtists];
  if (filters?.foundedAfter) {
    parts.push(`after${filters.foundedAfter}`);
  }
  if (filters?.includeOrigins?.length) {
    const origins = filters.includeOrigins
      .map(o => o.toLowerCase().replace(/[^a-z0-9]+/g, ''))
      .sort()
      .join('-');
    parts.push(`in-${origins}`);
  }
  if (filters?.excludeOrigins?.length) {
    const origins = filters.excludeOrigins
      .map(o => o.toLowerCase().replace(/[^a-z0-9]+/g, ''))
      .sort()
      .join('-');
    parts.push(`ex-${origins}`);
  }

  // Replace any remaining unsafe chars with dashes and cap length
  return parts
    .join('_')
    .replace(/[^a-z0-9_\-]+/g, '-')
    .substring(0, 512);
};

/**
 * Reads a global artist cache entry from Firestore.
 * Returns null on a cache miss or any read error (errors are non-fatal).
 */
export const readArtistCache = async (
  cacheKey: string
): Promise<ArtistCacheEntry | null> => {
  try {
    const snap = await getDoc(doc(db, 'artists', cacheKey));
    if (snap.exists()) {
      console.log(`[ArtistCache] HIT: ${cacheKey}`);
      return snap.data() as ArtistCacheEntry;
    }
    console.log(`[ArtistCache] MISS: ${cacheKey}`);
    return null;
  } catch (e) {
    console.warn('[ArtistCache] Read failed (non-critical):', e);
    return null;
  }
};

/**
 * Writes a new global cache entry. The Firestore security rule ensures
 * only a CREATE (not UPDATE) is allowed, preventing cache poisoning.
 * Failures are silently swallowed — a cache write failure is non-fatal.
 */
export const writeArtistCache = async (
  cacheKey: string,
  graphData: GraphData,
  detailsCache: Map<string, NodeDetails>,
  seedArtists: string,
  filters?: DiscoveryFilters
): Promise<void> => {
  try {
    await setDoc(doc(db, 'artists', cacheKey), {
      cacheKey,
      graphData: JSON.stringify(graphData),
      detailsCache: JSON.stringify(Array.from(detailsCache.entries())),
      seedArtists,
      filters: JSON.stringify(filters || {}),
      cacheVersion: 1,            // required by Firestore create rule hasAll check
      cachedAt: serverTimestamp(), // informational timestamp
      hitCount: 0,                 // must be number 0 per rule: incoming().hitCount == 0
    });
    console.log(`[ArtistCache] Written: ${cacheKey}`);
  } catch (e) {
    // May fail if another user wrote the same key concurrently — that's fine
    console.warn('[ArtistCache] Write failed (likely already exists, non-critical):', e);
  }
};

/**
 * Incrementally writes updated detailsCache back to the global cache entry.
 * Called after each successful Phase 03 node enrichment. Fire-and-forget.
 */
export const updateCacheDetailsCache = async (
  cacheKey: string,
  detailsCache: Map<string, NodeDetails>
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'artists', cacheKey), {
      detailsCache: JSON.stringify(Array.from(detailsCache.entries())),
    });
  } catch (e) {
    console.warn('[ArtistCache] Details write-back failed (non-critical):', e);
  }
};

/**
 * Increments the hit counter on a cache entry for analytics.
 * Fire-and-forget — failures are silently ignored.
 */
export const incrementCacheHit = async (cacheKey: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'artists', cacheKey), {
      hitCount: increment(1),
    });
  } catch {
    // Analytics only — ignore
  }
};

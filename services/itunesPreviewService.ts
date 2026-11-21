/**
 * Architecture V40 / V42: Clean Slate Zero-Token iTunes Audio Preview Service
 *
 * Exclusively accepts an itunesArtistId captured deterministically by the backend Rule 38 scraper.
 * Non-US artists query their regional ISO-3166-1 alpha-2 storefront (&country=ISO) first before
 * falling back to the default US storefront.
 */
import { normalizeIsoCode } from '../shared/isoCountries';

export interface AudioPreviewResult {
  previewUrl: string;
  previewTrackName: string;
  collectionName?: string;
  itunesArtistId: number;
  itunesCollectionId?: number;
  trackViewUrl?: string;
}

export interface ResolveAlbumAudioPreviewParams {
  nodeId?: string;
  artistName: string;
  albumName: string;
  itunesArtistId?: number | null;
  itunesCollectionId?: number | null;
  signal?: AbortSignal;
  countryIso?: string | null;
  forceRefresh?: boolean;
}

// In-memory session cache (persists for lifetime of the page)
const previewMemoryCache = new Map<number, AudioPreviewResult | null>();
// Deduplication for concurrent in-flight requests
const inFlightRequests = new Map<number, Promise<AudioPreviewResult | null>>();

// Per-album JIT preview session cache & deduplication (V45.17)
const albumPreviewCache = new Map<string, AudioPreviewResult | null>();
const albumInFlightRequests = new Map<string, Promise<AudioPreviewResult | null>>();
// Lazy per-artist album catalog cache (normalized collectionName -> collectionId) for legacy cached artists lacking itunesCollectionId
const artistAlbumCatalogCache = new Map<string, Array<{ normName: string; rawName: string; collectionId: number }>>();
const artistAlbumCatalogInFlight = new Map<string, Promise<Array<{ normName: string; rawName: string; collectionId: number }> | null>>();

const normalizeForAlbumMatch = (raw: string): string =>
  (raw || '')
    .toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/\s+-\s+(ep|single|album|live|remastered|deluxe\s+edition|deluxe|expanded\s+edition)$/i, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const normalizeArtistForMatch = (raw: string): string =>
  (raw || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const doesCollectionTitleMatch = (candidateTitle: string, targetAlbumTitle: string): boolean => {
  const normCand = normalizeForAlbumMatch(candidateTitle);
  const normTarget = normalizeForAlbumMatch(targetAlbumTitle);
  if (!normCand || !normTarget) return false;
  if (normCand === normTarget) return true;
  if (normCand.length >= 4 && normTarget.length >= 4) {
    if (normCand.includes(normTarget) || normTarget.includes(normCand)) {
      const ratio = Math.min(normCand.length, normTarget.length) / Math.max(normCand.length, normTarget.length);
      if (ratio >= 0.65) return true;
    }
  }
  return false;
};

const buildAlbumPreviewCacheKey = (params: {
  nodeId?: string;
  artistName: string;
  albumName: string;
  itunesCollectionId?: number | null;
  countryIso?: string | null;
}): string => {
  const normIso = normalizeIsoCode(params.countryIso) || 'us';
  const numericCollectionId = Number(params.itunesCollectionId);
  if (numericCollectionId > 0 && !isNaN(numericCollectionId)) {
    return `col:${numericCollectionId}:${normIso}`;
  }
  const artistScope = (params.nodeId || normalizeArtistForMatch(params.artistName)).toLowerCase().trim();
  const normAlbum = normalizeForAlbumMatch(params.albumName);
  return `alb:${artistScope}::${normAlbum}:${normIso}`;
};

const fetchItunesJson = async (
  url: string,
  signal?: AbortSignal,
  timeoutMs: number = 3500
): Promise<{ ok: boolean; status: number; data: any | null; aborted: boolean }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const res = await fetch(url, { signal: combinedSignal });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: res.status, data, aborted: false };
    }
    return { ok: false, status: res.status, data: null, aborted: false };
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      return { ok: false, status: 0, data: null, aborted: true };
    }
    return { ok: false, status: 0, data: null, aborted: false };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchArtistAlbumCatalog = async (
  numericArtistId: number,
  storefront: string | undefined,
  signal?: AbortSignal
): Promise<{ entries: Array<{ normName: string; rawName: string; collectionId: number }> | null; ok: boolean; aborted: boolean }> => {
  const catalogKey = `${numericArtistId}::${storefront || 'US'}`;
  if (artistAlbumCatalogCache.has(catalogKey)) {
    return { entries: artistAlbumCatalogCache.get(catalogKey)!, ok: true, aborted: false };
  }
  if (artistAlbumCatalogInFlight.has(catalogKey)) {
    const entries = await artistAlbumCatalogInFlight.get(catalogKey)!;
    return { entries, ok: entries !== null, aborted: Boolean(signal?.aborted) };
  }

  const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
  const url = `https://itunes.apple.com/lookup?id=${numericArtistId}&entity=album&limit=200${countryParam}`;

  let lastOk = false;
  let lastAborted = false;
  const promise = (async () => {
    try {
      const res = await fetchItunesJson(url, signal, 3500);
      lastOk = res.ok;
      lastAborted = res.aborted;
      if (!res.ok || !res.data) return null;
      const entries: Array<{ normName: string; rawName: string; collectionId: number }> = [];
      for (const item of res.data.results || []) {
        if (item?.wrapperType !== 'collection') continue;
        if (String(item.artistId) !== String(numericArtistId)) continue;
        const colId = Number(item.collectionId);
        const rawName = String(item.collectionName || '');
        const normName = normalizeForAlbumMatch(rawName);
        if (colId > 0 && !isNaN(colId) && normName) {
          entries.push({ normName, rawName, collectionId: colId });
        }
      }
      artistAlbumCatalogCache.set(catalogKey, entries);
      return entries;
    } finally {
      artistAlbumCatalogInFlight.delete(catalogKey);
    }
  })();

  artistAlbumCatalogInFlight.set(catalogKey, promise);
  const entries = await promise;
  return { entries, ok: lastOk, aborted: lastAborted };
};

/**
 * Resolves an instant 30-second audio preview for an artist via verified iTunes Artist ID.
 * Returns null immediately if itunesArtistId is missing (e.g. for record labels or unverified underground bands).
 */
export async function resolveArtistAudioPreview(
  itunesArtistId?: number | null,
  signal?: AbortSignal,
  countryIso?: string | null,
  forceRefresh: boolean = false
): Promise<AudioPreviewResult | null> {
  const numericId = Number(itunesArtistId);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    return null;
  }

  if (forceRefresh) {
    previewMemoryCache.delete(numericId);
    inFlightRequests.delete(numericId);
  } else if (previewMemoryCache.has(numericId)) {
    return previewMemoryCache.get(numericId) ?? null;
  }

  if (inFlightRequests.has(numericId)) {
    return inFlightRequests.get(numericId)!;
  }

  const normIso = normalizeIsoCode(countryIso);
  const storefrontsToTry: Array<string | undefined> =
    normIso && normIso !== 'us' ? [normIso.toUpperCase(), undefined] : [undefined];

  const fetchPromise = (async (): Promise<AudioPreviewResult | null> => {
    try {
      let anySucceededWithoutTrack = false;

      for (const storefront of storefrontsToTry) {
        const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
        const lookupUrl = `https://itunes.apple.com/lookup?id=${numericId}&entity=song&limit=1${countryParam}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        try {
          const res = await fetch(lookupUrl, {
            signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
          });

          if (res.ok) {
            anySucceededWithoutTrack = true;
            const data = await res.json();
            const track = (data.results || []).find(
              (r: any) => r.wrapperType === 'track' && r.kind === 'song' && r.previewUrl
            );
            if (track && track.previewUrl) {
              const result: AudioPreviewResult = {
                previewUrl: track.previewUrl,
                previewTrackName: track.trackName || 'Preview',
                collectionName: track.collectionName,
                itunesArtistId: numericId,
                trackViewUrl: track.trackViewUrl,
              };
              previewMemoryCache.set(numericId, result);
              return result;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (anySucceededWithoutTrack) {
        // Verified empty response across attempted storefronts
        previewMemoryCache.set(numericId, null);
      }
      return null;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`[iTunes Preview] Error looking up artist ID ${numericId}:`, err.message || err);
      }
      return null;
    } finally {
      inFlightRequests.delete(numericId);
    }
  })();

  inFlightRequests.set(numericId, fetchPromise);
  return fetchPromise;
}

/**
 * Manually prime the preview cache (e.g. when hydrated from detailsCache).
 */
export function primePreviewCache(
  itunesArtistId: number,
  preview: AudioPreviewResult
): void {
  const numericId = Number(itunesArtistId);
  if (numericId > 0) {
    previewMemoryCache.set(numericId, preview);
  }
}

/**
 * Strictly on-click JIT 30-second audio preview resolver for an Essential Listening album (V45.17).
 *
 * Path 1 (Exact): Uses `lookup?id=${itunesCollectionId}&entity=song&limit=5` when stamped by Rule 38.
 * Path 2 (Legacy fallback): Queries `search?entity=song&limit=15` with strict artistId + normalized
 * collectionName matching, then lazily consults the session-cached per-artist `entity=album` catalog
 * when `itunesArtistId > 0` to locate the exact `collectionId`.
 *
 * Negative-caches `null` ONLY on confirmed HTTP 200 responses with 0 playable tracks (never on 403/429/timeout/abort).
 */
export async function resolveAlbumAudioPreview(
  params: ResolveAlbumAudioPreviewParams
): Promise<AudioPreviewResult | null> {
  const {
    nodeId,
    artistName,
    albumName,
    itunesArtistId,
    itunesCollectionId,
    signal,
    countryIso,
    forceRefresh = false,
  } = params;

  const cleanAlbum = (albumName || '').trim();
  const cleanArtist = (artistName || '').trim();
  const numericCollectionId = Number(itunesCollectionId);
  const hasCollectionId = numericCollectionId > 0 && !isNaN(numericCollectionId);
  const numericArtistId = Number(itunesArtistId);
  const hasArtistId = numericArtistId > 0 && !isNaN(numericArtistId);

  if (!hasCollectionId && (!cleanAlbum || !cleanArtist)) {
    return null;
  }

  const cacheKey = buildAlbumPreviewCacheKey({
    nodeId,
    artistName: cleanArtist,
    albumName: cleanAlbum,
    itunesCollectionId: hasCollectionId ? numericCollectionId : undefined,
    countryIso,
  });

  if (forceRefresh) {
    albumPreviewCache.delete(cacheKey);
    albumInFlightRequests.delete(cacheKey);
  } else if (albumPreviewCache.has(cacheKey)) {
    return albumPreviewCache.get(cacheKey) ?? null;
  }

  if (albumInFlightRequests.has(cacheKey)) {
    return albumInFlightRequests.get(cacheKey)!;
  }

  const normIso = normalizeIsoCode(countryIso);
  const storefrontsToTry: Array<string | undefined> =
    normIso && normIso !== 'us' ? [normIso.toUpperCase(), undefined] : [undefined];
  const normArtistTarget = normalizeArtistForMatch(cleanArtist);

  const buildTrackResult = (track: any, fallbackCollectionId?: number): AudioPreviewResult => {
    const resolvedArtistId = Number(track.artistId) || (hasArtistId ? numericArtistId : 0);
    const resolvedCollectionId = Number(track.collectionId) || fallbackCollectionId;
    return {
      previewUrl: track.previewUrl,
      previewTrackName: track.trackName || cleanAlbum || 'Preview',
      collectionName: track.collectionName || cleanAlbum,
      itunesArtistId: resolvedArtistId,
      ...(resolvedCollectionId && resolvedCollectionId > 0 ? { itunesCollectionId: resolvedCollectionId } : {}),
      trackViewUrl: track.trackViewUrl,
    };
  };

  const lookupByCollectionId = async (
    colId: number,
    storefront: string | undefined
  ): Promise<{ result: AudioPreviewResult | null; ok: boolean; aborted: boolean }> => {
    const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
    const lookupUrl = `https://itunes.apple.com/lookup?id=${colId}&entity=song&limit=5${countryParam}`;
    const res = await fetchItunesJson(lookupUrl, signal, 3500);
    if (!res.ok || !res.data) {
      return { result: null, ok: false, aborted: res.aborted };
    }
    const track = (res.data.results || []).find(
      (r: any) => r?.wrapperType === 'track' && r?.kind === 'song' && typeof r?.previewUrl === 'string' && r.previewUrl.length > 0
    );
    if (track) {
      return { result: buildTrackResult(track, colId), ok: true, aborted: false };
    }
    return { result: null, ok: true, aborted: false };
  };

  const fetchPromise = (async (): Promise<AudioPreviewResult | null> => {
    try {
      let anySucceededWithoutTrack = false;
      let hadTransientError = false;

      // Path 1: Exact collectionId lookup
      if (hasCollectionId) {
        for (const storefront of storefrontsToTry) {
          if (signal?.aborted) return null;
          const lookup = await lookupByCollectionId(numericCollectionId, storefront);
          if (lookup.aborted) return null;
          if (lookup.result) {
            albumPreviewCache.set(cacheKey, lookup.result);
            return lookup.result;
          }
          if (lookup.ok) {
            anySucceededWithoutTrack = true;
          } else {
            hadTransientError = true;
          }
        }

        if (anySucceededWithoutTrack && !hadTransientError && !signal?.aborted) {
          albumPreviewCache.set(cacheKey, null);
        }
        return null;
      }

      // Path 2A: Legacy fallback direct search with strict artistId + normalized collectionName verification
      const term = encodeURIComponent(`${cleanArtist} ${cleanAlbum}`);
      for (const storefront of storefrontsToTry) {
        if (signal?.aborted) return null;
        const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
        const searchUrl = `https://itunes.apple.com/search?term=${term}&entity=song&limit=15${countryParam}`;
        const res = await fetchItunesJson(searchUrl, signal, 3500);
        if (res.aborted) return null;
        if (res.ok && res.data) {
          anySucceededWithoutTrack = true;
          const matchedTrack = (res.data.results || []).find((r: any) => {
            if (!r || r.wrapperType !== 'track' || r.kind !== 'song' || !r.previewUrl) return false;
            const artistMatches = hasArtistId
              ? Number(r.artistId) === numericArtistId
              : normalizeArtistForMatch(String(r.artistName || '')) === normArtistTarget;
            if (!artistMatches) return false;
            return doesCollectionTitleMatch(String(r.collectionName || ''), cleanAlbum);
          });
          if (matchedTrack) {
            const result = buildTrackResult(matchedTrack);
            albumPreviewCache.set(cacheKey, result);
            return result;
          }
        } else {
          hadTransientError = true;
        }
      }

      // Path 2B: Lazy session-cached per-artist entity=album catalog lookup when itunesArtistId > 0
      if (hasArtistId) {
        const normAlbumTarget = normalizeForAlbumMatch(cleanAlbum);
        for (const storefront of storefrontsToTry) {
          if (signal?.aborted) return null;
          const catalog = await fetchArtistAlbumCatalog(numericArtistId, storefront, signal);
          if (catalog.aborted) return null;
          if (!catalog.ok || !catalog.entries) {
            hadTransientError = true;
            continue;
          }
          anySucceededWithoutTrack = true;
          const matchedEntry =
            catalog.entries.find((e) => e.normName === normAlbumTarget) ||
            catalog.entries.find((e) => doesCollectionTitleMatch(e.rawName, cleanAlbum));

          if (matchedEntry) {
            const lookup = await lookupByCollectionId(matchedEntry.collectionId, storefront);
            if (lookup.aborted) return null;
            if (lookup.result) {
              albumPreviewCache.set(cacheKey, lookup.result);
              return lookup.result;
            }
            if (!lookup.ok) {
              hadTransientError = true;
            }
          }
        }
      }

      if (anySucceededWithoutTrack && !hadTransientError && !signal?.aborted) {
        albumPreviewCache.set(cacheKey, null);
      }
      return null;
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn(`[iTunes Album Preview] Error looking up "${cleanArtist} - ${cleanAlbum}":`, err?.message || err);
      }
      return null;
    } finally {
      albumInFlightRequests.delete(cacheKey);
    }
  })();

  albumInFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Returns true strictly when a prior HTTP 200 lookup confirmed that this album has no playable preview.
 * Returns false for uncached albums or transient network / HTTP 403 / 429 failures.
 */
export function isAlbumPreviewConfirmedUnavailable(params: {
  nodeId?: string;
  artistName: string;
  albumName: string;
  itunesCollectionId?: number | null;
  countryIso?: string | null;
}): boolean {
  const cacheKey = buildAlbumPreviewCacheKey(params);
  return albumPreviewCache.has(cacheKey) && albumPreviewCache.get(cacheKey) === null;
}

/**
 * Test helper to reset in-memory preview caches between isolated storefront unit tests.
 */
export function clearPreviewMemoryCacheForTests(): void {
  previewMemoryCache.clear();
  inFlightRequests.clear();
  albumPreviewCache.clear();
  albumInFlightRequests.clear();
  artistAlbumCatalogCache.clear();
  artistAlbumCatalogInFlight.clear();
}

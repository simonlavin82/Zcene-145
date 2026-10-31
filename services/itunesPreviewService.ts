/**
 * Architecture V39.2: Clean Slate Zero-Token iTunes Audio Preview Service
 *
 * Exclusively accepts an itunesArtistId captured deterministically by the backend Rule 38 scraper.
 * Zero name-based searches, zero suffix stripping, zero ambiguity.
 */

export interface AudioPreviewResult {
  previewUrl: string;
  previewTrackName: string;
  collectionName?: string;
  itunesArtistId: number;
  trackViewUrl?: string;
}

// In-memory session cache (persists for lifetime of the page)
const previewMemoryCache = new Map<number, AudioPreviewResult | null>();
// Deduplication for concurrent in-flight requests
const inFlightRequests = new Map<number, Promise<AudioPreviewResult | null>>();

/**
 * Resolves an instant 30-second audio preview for an artist via verified iTunes Artist ID.
 * Returns null immediately if itunesArtistId is missing (e.g. for record labels or unverified underground bands).
 */
export async function resolveArtistAudioPreview(
  itunesArtistId?: number | null,
  signal?: AbortSignal
): Promise<AudioPreviewResult | null> {
  if (!itunesArtistId || itunesArtistId <= 0) {
    return null;
  }

  if (previewMemoryCache.has(itunesArtistId)) {
    return previewMemoryCache.get(itunesArtistId) ?? null;
  }

  if (inFlightRequests.has(itunesArtistId)) {
    return inFlightRequests.get(itunesArtistId)!;
  }

  const fetchPromise = (async (): Promise<AudioPreviewResult | null> => {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesArtistId}&entity=song&limit=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      try {
        const res = await fetch(lookupUrl, {
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          const track = (data.results || []).find(
            (r: any) => r.wrapperType === 'track' && r.kind === 'song' && r.previewUrl
          );
          if (track && track.previewUrl) {
            const result: AudioPreviewResult = {
              previewUrl: track.previewUrl,
              previewTrackName: track.trackName || 'Preview',
              collectionName: track.collectionName,
              itunesArtistId,
              trackViewUrl: track.trackViewUrl,
            };
            previewMemoryCache.set(itunesArtistId, result);
            return result;
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      // Negative cache on empty result
      previewMemoryCache.set(itunesArtistId, null);
      return null;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`[iTunes Preview] Error looking up artist ID ${itunesArtistId}:`, err.message || err);
      }
      return null;
    } finally {
      inFlightRequests.delete(itunesArtistId);
    }
  })();

  inFlightRequests.set(itunesArtistId, fetchPromise);
  return fetchPromise;
}

/**
 * Manually prime the preview cache (e.g. when hydrated from detailsCache).
 */
export function primePreviewCache(
  itunesArtistId: number,
  preview: AudioPreviewResult
): void {
  if (itunesArtistId > 0) {
    previewMemoryCache.set(itunesArtistId, preview);
  }
}

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
  const numericId = Number(itunesArtistId);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    return null;
  }

  if (previewMemoryCache.has(numericId)) {
    return previewMemoryCache.get(numericId) ?? null;
  }

  if (inFlightRequests.has(numericId)) {
    return inFlightRequests.get(numericId)!;
  }

  const fetchPromise = (async (): Promise<AudioPreviewResult | null> => {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${numericId}&entity=song&limit=1`;
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
              itunesArtistId: numericId,
              trackViewUrl: track.trackViewUrl,
            };
            previewMemoryCache.set(numericId, result);
            return result;
          }

          // Verified empty response (artist exists on iTunes but has no 30s song previews)
          previewMemoryCache.set(numericId, null);
          return null;
        }
      } finally {
        clearTimeout(timeout);
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

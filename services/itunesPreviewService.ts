/**
 * Architecture V39.2: Zero-Token Client iTunes Audio Preview Service
 *
 * Resolves 30-second .m4a audio streams and preview track titles on-demand
 * directly from Apple's public iTunes Search & Lookup APIs with zero GenAI tokens
 * and zero backend rate-limit overhead.
 */
import { normalizeArtistId } from './artistCacheService';

export interface AudioPreviewResult {
  previewUrl: string;
  previewTrackName: string;
  collectionName?: string;
  itunesArtistId?: number;
  trackViewUrl?: string;
}

// In-memory session cache (persists for lifetime of the page)
const previewMemoryCache = new Map<string, AudioPreviewResult | null>();
// Deduplication for concurrent in-flight requests
const inFlightRequests = new Map<string, Promise<AudioPreviewResult | null>>();

const KNOWN_COUNTRY_SUFFIXES = [
  'united states', 'united kingdom', 'global', 'australia', 'canada', 'germany', 'france',
  'japan', 'sweden', 'italy', 'spain', 'brazil', 'mexico', 'netherlands', 'belgium',
  'norway', 'finland', 'denmark', 'ireland', 'new zealand', 'poland', 'austria',
  'switzerland', 'uk', 'usa', 'us', 'gb', 'au', 'ca', 'de', 'fr', 'jp', 'se', 'it', 'es',
  'br', 'mx', 'nl', 'be', 'no', 'fi', 'dk', 'ie', 'nz', 'pl', 'at', 'ch',
  'scotland', 'wales', 'northern ireland', 'england'
];

/**
 * Strips geographic suffixes like " US", " UK", "(US)", or trailing hyphens for search.
 */
export function cleanArtistNameForSearch(rawName: string): string {
  if (!rawName) return '';
  let clean = rawName.trim();
  // Strip parentheses e.g. "Spite (US)" -> "Spite"
  clean = clean.replace(/\s*\([^)]*\)$/i, '').trim();

  // Strip country suffixes if separated by space or hyphen
  const lower = clean.toLowerCase();
  for (const suffix of KNOWN_COUNTRY_SUFFIXES) {
    if (lower.endsWith(` ${suffix}`) || lower.endsWith(`-${suffix}`)) {
      clean = clean.substring(0, clean.length - (suffix.length + 1)).trim();
      break;
    }
  }
  return clean.replace(/^-+|-+$/g, '').trim();
}

/**
 * Resolves an instant 30-second audio preview for an artist.
 * 
 * Hierarchy:
 * 1. Checks in-memory cache.
 * 2. If itunesArtistId is present, queries lookup?id=${itunesArtistId}&entity=song&limit=1
 * 3. Falls back to search?term=${artistName}&entity=song&limit=10 with token matching.
 * 4. Caches null on miss to prevent subsequent redundant fetches.
 */
export async function resolveArtistAudioPreview(
  artistName: string,
  itunesArtistId?: number | null,
  signal?: AbortSignal
): Promise<AudioPreviewResult | null> {
  const cleanName = cleanArtistNameForSearch(artistName);
  const cacheKey = itunesArtistId ? `id:${itunesArtistId}` : `name:${normalizeArtistId(cleanName)}`;

  if (previewMemoryCache.has(cacheKey)) {
    return previewMemoryCache.get(cacheKey) ?? null;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async (): Promise<AudioPreviewResult | null> => {
    try {
      // Strategy 1: Direct Lookup via itunesArtistId (Deterministic Tier 1/2/3 winner)
      if (itunesArtistId && itunesArtistId > 0) {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesArtistId}&entity=song&limit=1`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        try {
          const res = await fetch(lookupUrl, { 
            signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal 
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
                itunesArtistId: track.artistId || itunesArtistId,
                trackViewUrl: track.trackViewUrl,
              };
              previewMemoryCache.set(cacheKey, result);
              return result;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      // Strategy 2: Fallback Search by Artist Display Name (Retroactive Legacy Cache Support)
      if (cleanName.length > 0) {
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=song&limit=10`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        try {
          const res = await fetch(searchUrl, { 
            signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal 
          });
          if (res.ok) {
            const data = await res.json();
            const targetNorm = normalizeArtistId(cleanName);
            
            // Match tracks whose artistName matches cleanName
            const matchedTrack = (data.results || []).find((r: any) => {
              if (r.wrapperType !== 'track' || r.kind !== 'song' || !r.previewUrl) return false;
              const rNorm = normalizeArtistId(cleanArtistNameForSearch(r.artistName || ''));
              return rNorm === targetNorm || rNorm.startsWith(targetNorm) || targetNorm.startsWith(rNorm);
            });

            if (matchedTrack && matchedTrack.previewUrl) {
              const result: AudioPreviewResult = {
                previewUrl: matchedTrack.previewUrl,
                previewTrackName: matchedTrack.trackName || 'Preview',
                collectionName: matchedTrack.collectionName,
                itunesArtistId: matchedTrack.artistId,
                trackViewUrl: matchedTrack.trackViewUrl,
              };
              previewMemoryCache.set(cacheKey, result);
              // Also store under artistId if newly learned
              if (matchedTrack.artistId) {
                previewMemoryCache.set(`id:${matchedTrack.artistId}`, result);
              }
              return result;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      // Negative caching to prevent repeat hammering
      previewMemoryCache.set(cacheKey, null);
      return null;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`[iTunes Preview] Error resolving preview for "${artistName}":`, err.message || err);
      }
      return null;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Manually prime the preview cache (e.g. when hydrated from detailsCache).
 */
export function primePreviewCache(
  key: string | number,
  preview: AudioPreviewResult
): void {
  const cacheKey = typeof key === 'number' ? `id:${key}` : `name:${normalizeArtistId(key)}`;
  previewMemoryCache.set(cacheKey, preview);
}


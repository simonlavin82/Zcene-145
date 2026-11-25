import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  scrapeImageUrlBackend,
  reconcileDiscographyWithITunes,
  deduplicateDiscographyItems,
  cleanCollectionTitle,
  cleanSongQueryAlbumTitle,
  evaluateGenreMatch,
  evaluateGenreDistanceScore,
  isAppleElectronicHardcoreGenre,
  isCatalogCorroboratedNonHostileGenre,
  passesUncorroboratedEraGate,
  COMPILATION_COLLECTION_RE,
  selectBestArtistArtwork,
  CURRENT_ITUNES_SCRAPE_VERSION,
  shouldRunRule38NotFoundUpgrade,
  shouldRunRule38ArtistNameUpgrade,
  resolveVerifiedItunesArtistDisplayName,
  resolveItunesCanonicalArtistNameBackend,
  artistNamesMatchWithOptionalThe,
  sanitizeTextOnlyDiscography,
} from '../src/services/curatorService';
import {
  stripCountrySlug,
  extractTrailingCountryIso,
  resolveExpectedOriginIsos,
} from '../src/shared/isoCountries';
import { isCanonicalSeedMatch } from '../src/shared/multiSceneUtils';
import { CANONICAL_STYLES_FLAT } from '../src/types';

describe('Rule 38: Offline Unit Tests — Scraper Waterfall, Artwork Priority & iTunes Resilience', () => {
  it('Guardrails: Label entities bypass image scraping and retain catalog releases unchanged', async () => {
    const labelDiscography = [
      { albumName: 'Step 2 Rhythm', releaseYear: '2013' },
      { albumName: 'Pressure to Succeed', releaseYear: '2011' }
    ];
    const result = await scrapeImageUrlBackend(
      'Triple B Records',
      'label',
      'Hardcore Punk',
      'Triple B Records is an American independent record label based in Boston.',
      'Boston, USA',
      labelDiscography
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reconciledDiscography).toEqual(labelDiscography);
  });

  describe('Unit: reconcileDiscographyWithITunes and cleanCollectionTitle', () => {
    it('cleanCollectionTitle strips structural noise, format markers, and edition suffixes', () => {
      expect(cleanCollectionTitle('To Live and Withstand - EP')).toBe('To Live and Withstand');
      expect(cleanCollectionTitle('Demo 2022 - Single')).toBe('Demo 2022');
      expect(cleanCollectionTitle('Phantom Limb [Remastered]')).toBe('Phantom Limb');
      expect(cleanCollectionTitle('Starfire (Deluxe Edition)')).toBe('Starfire');
      expect(cleanCollectionTitle('Live at Flywheel')).toBe('Live at Flywheel');
    });

    it('evaluateGenreDistanceScore prioritizes direct and keyword matches over umbrella bridges', () => {
      const punkScore = evaluateGenreDistanceScore('Punk', 'Hardcore Punk', '');
      const altScore = evaluateGenreDistanceScore('Alternative', 'Hardcore Punk', '');
      expect(punkScore).toBe(8);
      expect(altScore).toBe(3);
      expect(punkScore).toBeGreaterThan(altScore);
    });

    it('reconcileDiscographyWithITunes drops hallucinations and backfills real releases', () => {
      const mockITunesAlbums = [
        { wrapperType: 'collection', collectionName: 'To Live and Withstand - EP', releaseDate: '2023-04-14T07:00:00Z', trackCount: 5 },
        { wrapperType: 'collection', collectionName: 'Live at Flywheel', releaseDate: '2023-01-20T07:00:00Z', trackCount: 8 },
        { wrapperType: 'collection', collectionName: 'Demo 2022 - Single', releaseDate: '2022-06-03T07:00:00Z', trackCount: 3 }
      ];

      const llmInput = [
        { albumName: 'Demo', releaseYear: '2022' },
        { albumName: 'To Live and Die in New England', releaseYear: '2023' } // Hallucinated title
      ];

      const reconciled = reconcileDiscographyWithITunes(llmInput, mockITunesAlbums, 'Anklebiter');

      // Must not contain hallucinated title
      expect(reconciled.some(r => r.albumName === 'To Live and Die in New England')).toBe(false);
      // Must contain auto-corrected/backfilled real releases
      expect(reconciled.some(r => r.albumName === 'Demo 2022')).toBe(true);
      expect(reconciled.some(r => r.albumName === 'To Live and Withstand')).toBe(true);
      expect(reconciled.find(r => r.albumName === 'To Live and Withstand')?.releaseYear).toBe('2023');
    });

    it('Zero-Match Backfill Prohibition: reconcileDiscographyWithITunes returns [] when 0 releases match and does not backfill impostor albums', () => {
      const impostorItunesAlbums = [
        { wrapperType: 'collection', collectionName: 'Live from Snake River', releaseDate: '2025-10-11T07:00:00Z', trackCount: 9 },
        { wrapperType: 'collection', collectionName: '4 Decades', releaseDate: '2026-03-15T07:00:00Z', trackCount: 10 }
      ];

      const realLLMDiscography = [
        { albumName: 'Next Time From the Heart', releaseYear: '1988' },
        { albumName: 'When the World Stood Still', releaseYear: '1990' }
      ];

      const reconciled = reconcileDiscographyWithITunes(realLLMDiscography, impostorItunesAlbums, 'Reason to Believe');
      expect(reconciled).toEqual([]);
    });
  });

  describe('V45.10 Studio-Album Artwork Priority, Spacing-Collapsed Fallback & iTunes 403/429 Backoff', () => {
    it('selectBestArtistArtwork selects Adult Themes for Voice over Crank: High Voltage OST even when Crank OST is index 0', () => {
      const mikePattonAlbums = [
        {
          wrapperType: 'collection',
          artistId: 2987396,
          collectionName: 'Crank: High Voltage (Original Motion Picture Soundtrack)',
          primaryGenreName: 'Soundtrack',
          releaseDate: '2009-04-07T07:00:00Z',
          trackCount: 32,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/crank/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 2987396,
          collectionName: 'The Place Beyond the Pines (Original Motion Picture Soundtrack)',
          primaryGenreName: 'Soundtrack',
          releaseDate: '2013-01-01T08:00:00Z',
          trackCount: 17,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/pines/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 2987396,
          collectionName: 'Adult Themes for Voice',
          primaryGenreName: 'Rock',
          releaseDate: '1997-04-22T07:00:00Z',
          trackCount: 34,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/adult-themes/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 2987396,
          collectionName: 'Mondo cane',
          primaryGenreName: 'Alternative',
          releaseDate: '2010-05-04T07:00:00Z',
          trackCount: 11,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/mondo-cane/100x100bb.jpg',
        },
      ];

      const reconciled = [
        { albumName: 'Adult Themes for Voice', releaseYear: '1997' },
        { albumName: 'Pranzo Oltranzista', releaseYear: '1997' },
        { albumName: 'Mondo cane', releaseYear: '2010' },
      ];

      const selected = selectBestArtistArtwork(mikePattonAlbums, reconciled);
      expect(selected).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/adult-themes/600x600bb.jpg');
    });

    it('selectBestArtistArtwork deprioritizes Greatest Hits / Live / Single behind studio LPs, and falls back to soundtrack if only soundtracks exist', () => {
      const mixedAlbums = [
        {
          wrapperType: 'collection',
          collectionName: 'Greatest Hits',
          primaryGenreName: 'Rock',
          trackCount: 18,
          artworkUrl100: 'https://example.com/greatest/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          collectionName: 'Live at the Fillmore',
          primaryGenreName: 'Rock',
          trackCount: 14,
          artworkUrl100: 'https://example.com/live/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          collectionName: 'Lead Track - Single',
          primaryGenreName: 'Rock',
          trackCount: 1,
          artworkUrl100: 'https://example.com/single/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          collectionName: 'Core Studio Record',
          primaryGenreName: 'Rock',
          trackCount: 11,
          artworkUrl100: 'https://example.com/studio/100x100bb.jpg',
        },
      ];

      expect(selectBestArtistArtwork(mixedAlbums, [])).toBe('https://example.com/studio/600x600bb.jpg');

      const soundtrackOnlyAlbums = [
        {
          wrapperType: 'collection',
          collectionName: 'Noir Film (Original Motion Picture Soundtrack)',
          primaryGenreName: 'Soundtrack',
          trackCount: 16,
          artworkUrl100: 'https://example.com/ost-only/100x100bb.jpg',
        },
      ];

      expect(selectBestArtistArtwork(soundtrackOnlyAlbums, [])).toBe('https://example.com/ost-only/600x600bb.jpg');
    });

    it('recovers spacing-collapsed LungLeg (artistId 2893998) when spaced query returns 0 hits, and recovers from transient HTTP 429 via retry', async () => {
      let lookupAttempts = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        // Spaced "Lung Leg" returns 0 hits -> triggers spacing-collapsed "LungLeg" fallback
        if (url.includes('term=Lung%20Leg&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ resultCount: 0, results: [] }),
          } as any;
        }
        if (url.includes('term=LungLeg&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  wrapperType: 'artist',
                  artistId: 2893998,
                  artistName: 'Lung Leg',
                  primaryGenreName: 'Alternative',
                },
              ],
            }),
          } as any;
        }
        // Lookup simulates transient HTTP 429 on attempt 1, then HTTP 200 on retry
        if (url.includes('lookup?id=2893998&entity=album')) {
          lookupAttempts++;
          if (lookupAttempts === 1) {
            return { ok: false, status: 429, json: async () => ({}) } as any;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 3,
              results: [
                { wrapperType: 'artist', artistId: 2893998, artistName: 'Lung Leg' },
                {
                  wrapperType: 'collection',
                  artistId: 2893998,
                  collectionName: 'Girls (feat. Essential Logic) - Single',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2025-10-24T07:00:00Z',
                  trackCount: 1,
                  artworkUrl100: 'https://example.com/girls-single/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 2893998,
                  collectionName: 'Maid to Minx',
                  primaryGenreName: 'Alternative',
                  releaseDate: '1999-05-11T07:00:00Z',
                  trackCount: 15,
                  artworkUrl100: 'https://example.com/maid-to-minx/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ resultCount: 0, results: [] }) } as any;
      });

      try {
        const result = await scrapeImageUrlBackend(
          'Lung Leg',
          'artist',
          'Indie Rock',
          'Lung Leg was a 1990s Scottish indie rock band from Glasgow.',
          'Glasgow, United Kingdom',
          [{ albumName: 'Maid to Minx', releaseYear: '1997' }],
          'gb'
        );

        expect(lookupAttempts).toBe(2);
        expect(result.itunesArtistId).toBe(2893998);
        expect(result.imageUrl).toBe('https://example.com/maid-to-minx/600x600bb.jpg');
        expect(result.reconciledDiscography.some((d) => d.albumName === 'Maid to Minx')).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('V45.17 Rule 38 itunesCollectionId Stamping & Holiday Artwork Penalty', () => {
    it('reconcileDiscographyWithITunes stamps optional itunesCollectionId on matched and backfilled releases, and omits it when absent', () => {
      const mockITunesAlbums = [
        {
          wrapperType: 'collection',
          collectionId: 1485042718,
          collectionName: 'No Control',
          releaseDate: '1989-11-02T08:00:00Z',
          trackCount: 15,
        },
        {
          wrapperType: 'collection',
          collectionId: 1485042900,
          collectionName: 'Suffer (Remastered)',
          releaseDate: '1988-09-08T07:00:00Z',
          trackCount: 15,
        },
        {
          wrapperType: 'collection',
          collectionName: 'Against the Grain', // No collectionId provided
          releaseDate: '1990-11-23T08:00:00Z',
          trackCount: 17,
        },
      ];

      const llmInput = [
        { albumName: 'No Control', releaseYear: '1989' },
      ];

      const reconciled = reconcileDiscographyWithITunes(llmInput, mockITunesAlbums, 'Bad Religion');

      const noControl = reconciled.find((r) => r.albumName === 'No Control');
      const suffer = reconciled.find((r) => r.albumName === 'Suffer');
      const against = reconciled.find((r) => r.albumName === 'Against the Grain');

      expect(noControl?.itunesCollectionId).toBe(1485042718);
      expect(suffer?.itunesCollectionId).toBe(1485042900);
      expect(against).toBeDefined();
      expect('itunesCollectionId' in (against || {})).toBe(false);
    });

    it('selectBestArtistArtwork penalizes holiday/seasonal albums (Christmas Songs) even without reconciledDiscography while preserving holiday-only fallback', () => {
      const badReligionAlbums = [
        {
          wrapperType: 'collection',
          artistId: 2568989,
          collectionId: 1485077777,
          collectionName: 'Christmas Songs',
          primaryGenreName: 'Holiday',
          releaseDate: '2013-10-29T07:00:00Z',
          trackCount: 9,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/christmas/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 2568989,
          collectionId: 1485042700,
          collectionName: 'How Could Hell Be Any Worse?',
          primaryGenreName: 'Punk',
          releaseDate: '1982-01-19T08:00:00Z',
          trackCount: 14,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/how-could-hell/100x100bb.jpg',
        },
      ];

      // Even with empty reconciledDiscography and Christmas Songs at index 0, studio LP MUST win
      expect(selectBestArtistArtwork(badReligionAlbums, [])).toBe(
        'https://is1-ssl.mzstatic.com/image/thumb/how-could-hell/600x600bb.jpg'
      );

      // Holiday title marker with non-Holiday genre (e.g., Punk) must also be penalized
      const punkTaggedXmas = [
        {
          wrapperType: 'collection',
          collectionName: 'A Punk Xmas Special',
          primaryGenreName: 'Punk',
          trackCount: 10,
          artworkUrl100: 'https://example.com/xmas/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          collectionName: 'No Control',
          primaryGenreName: 'Punk',
          trackCount: 15,
          artworkUrl100: 'https://example.com/no-control/100x100bb.jpg',
        },
      ];
      expect(selectBestArtistArtwork(punkTaggedXmas, [])).toBe('https://example.com/no-control/600x600bb.jpg');

      // Graceful fallback: if an artist ONLY has holiday releases, still return its cover
      const holidayOnlyAlbums = [
        {
          wrapperType: 'collection',
          collectionName: 'Yuletide Noel Classics',
          primaryGenreName: 'Holiday',
          trackCount: 12,
          artworkUrl100: 'https://example.com/yuletide/100x100bb.jpg',
        },
      ];
      expect(selectBestArtistArtwork(holidayOnlyAlbums, [])).toBe('https://example.com/yuletide/600x600bb.jpg');
    });
  });

  describe('V47.8 Rule 38: Tier 3B Album-Anchored Fallback, Conflation Guard & One-Time Upgrade', () => {
    it('1. Tier 3B album-anchored entity=song recovery rescues buried bare-name artists and caps at 3 album queries', async () => {
      const songQueries: string[] = [];
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        // Bare artist search & Tier 2 geographic search both miss (buried homonym)
        if (url.includes('entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 9001, artistName: 'Exhibition Tribute', primaryGenreName: 'Pop' },
              ],
            }),
          } as any;
        }
        // Tier 3B album-anchored entity=song query
        if (url.includes('entity=song&limit=15')) {
          songQueries.push(url);
          if (url.includes('The%20Last%20Laugh')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 1511350574,
                    artistName: 'Exhibition',
                    collectionId: 1670765896,
                    collectionName: 'The Last Laugh',
                    primaryGenreName: 'Punk',
                    releaseDate: '2023-02-17T08:00:00Z',
                    previewUrl: 'https://audio-ssl.itunes.apple.com/last-laugh.m4a',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=1511350574&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 1511350574, artistName: 'Exhibition', primaryGenreName: 'Punk' },
                {
                  wrapperType: 'collection',
                  artistId: 1511350574,
                  collectionId: 1670765896,
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-02-17T08:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/last-laugh/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 1511350574,
                  collectionId: 1587594003,
                  collectionName: "You'll Be Next - EP",
                  primaryGenreName: 'Punk',
                  releaseDate: '2021-10-01T07:00:00Z',
                  trackCount: 4,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/youll-be-next/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // Supply 5 non-generic albums to verify Tier 3B strictly caps at 4 queries (V47.12)
        const result = await scrapeImageUrlBackend(
          'Exhibition',
          'artist',
          'Hardcore Punk',
          'Buffalo NY metallic hardcore band on Triple B Records.',
          'Buffalo, USA',
          [
            { albumName: 'Unindexed Promo Tape', releaseYear: '2020' },
            { albumName: 'The Last Laugh', releaseYear: '2023' },
            { albumName: 'Another Unindexed Split', releaseYear: '2022' },
            { albumName: 'Third Unindexed Tape', releaseYear: '2022' },
            { albumName: 'Fifth Release Beyond Cap', releaseYear: '2024' },
          ],
          'us',
          '2021'
        );

        expect(songQueries.length).toBe(4);
        expect(songQueries.some((u) => u.includes('Fifth%20Release'))).toBe(false);
        expect(result.itunesArtistId).toBe(1511350574);
        expect(result.imageUrl).toBe('https://is1-ssl.mzstatic.com/exhibition/last-laugh/600x600bb.jpg');
        expect(result.reconciledDiscography.some((d) => d.albumName === 'The Last Laugh' && d.itunesCollectionId === 1670765896)).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. Tier 3B fail-closed guards reject Various Artists, substring artists, hostile genres, year drift & multi-artistId ambiguity', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=musicArtist')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('entity=song&limit=15')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                // Various Artists must be rejected
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 36270,
                  artistName: 'Various Artists',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-02-17T08:00:00Z',
                },
                // Substring / tribute artist must be rejected
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 88801,
                  artistName: 'Exhibition Tribute Band',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-02-17T08:00:00Z',
                },
                // Hostile genre must be rejected
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 88802,
                  artistName: 'Exhibition',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Classical',
                  releaseDate: '2023-02-17T08:00:00Z',
                },
                // Release-year drift (>2 years) & pre-formation must be rejected
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 88803,
                  artistName: 'Exhibition',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2015-01-01T08:00:00Z',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const rejected = await scrapeImageUrlBackend(
          'Exhibition',
          'artist',
          'Hardcore Punk',
          'Buffalo NY hardcore band.',
          'Buffalo, USA',
          [{ albumName: 'The Last Laugh', releaseYear: '2023' }],
          'us',
          '2021'
        );
        expect(rejected).toEqual({
          imageUrl: null,
          reconciledDiscography: [{ albumName: 'The Last Laugh', releaseYear: '2023' }],
          itunesArtistId: null,
        });
      } finally {
        fetchSpy.mockRestore();
      }

      // Ambiguous multi-artistId collision on the same query must fail closed to Tier 4
      const ambigSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=musicArtist')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('entity=song&limit=15')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 111111,
                  artistName: 'Exhibition',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-02-17T08:00:00Z',
                },
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 222222,
                  artistName: 'Exhibition',
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-03-01T08:00:00Z',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const ambigResult = await scrapeImageUrlBackend(
          'Exhibition',
          'artist',
          'Hardcore Punk',
          'Buffalo NY hardcore band.',
          'Buffalo, USA',
          [{ albumName: 'The Last Laugh', releaseYear: '2023' }],
          'us',
          '2021'
        );
        expect(ambigResult).toEqual({
          imageUrl: null,
          reconciledDiscography: [{ albumName: 'The Last Laugh', releaseYear: '2023' }],
          itunesArtistId: null,
        });
      } finally {
        ambigSpy.mockRestore();
      }
    });

    it('3. Exact #1511350574 Exhibition conflated catalog defense strips 1994-2003 Christian/New Age 1-track singles and surfaces Punk LP/EPs', () => {
      const exhibitionConflatedCatalog = [
        // 4 genuine Buffalo hardcore Punk releases
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1670765896,
          collectionName: 'The Last Laugh',
          primaryGenreName: 'Punk',
          releaseDate: '2023-02-17T08:00:00Z',
          trackCount: 10,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/last-laugh/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1666377208,
          collectionName: 'On the Run - EP',
          primaryGenreName: 'Punk',
          releaseDate: '2023-01-20T08:00:00Z',
          trackCount: 4,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/on-the-run/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1587594003,
          collectionName: "You'll Be Next - EP",
          primaryGenreName: 'Punk',
          releaseDate: '2021-10-01T07:00:00Z',
          trackCount: 4,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/youll-be-next/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1641164901,
          collectionName: 'Back For More - Single',
          primaryGenreName: 'Punk',
          releaseDate: '2022-08-24T07:00:00Z',
          trackCount: 3,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/back-for-more/100x100bb.jpg',
        },
        // Merged/conflated Apple Music 1994-2003 Christian & New Age 1-track singles
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1851895731,
          collectionName: 'Etude of Memory - Single',
          primaryGenreName: 'New Age',
          releaseDate: '1994-05-01T07:00:00Z',
          trackCount: 1,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/conflated/etude/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1851886828,
          collectionName: 'Stranger - Single',
          primaryGenreName: 'New Age',
          releaseDate: '1996-04-01T08:00:00Z',
          trackCount: 1,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/conflated/stranger/100x100bb.jpg',
        },
        {
          wrapperType: 'collection',
          artistId: 1511350574,
          collectionId: 1864404156,
          collectionName: 'American Life - Single',
          primaryGenreName: 'Christian',
          releaseDate: '2003-11-04T08:00:00Z',
          trackCount: 1,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/conflated/american-life/100x100bb.jpg',
        },
      ];

      const sanityContext = {
        genre: 'Hardcore Punk',
        summary: 'Buffalo NY hardcore punk band on Triple B Records.',
        foundedYear: '2021',
      };

      const reconciled = reconcileDiscographyWithITunes([], exhibitionConflatedCatalog, 'Exhibition', sanityContext);
      const titles = reconciled.map((r) => r.albumName);

      expect(titles).toEqual(["You'll Be Next", 'On the Run', 'The Last Laugh']);
      expect(reconciled.find((r) => r.albumName === 'The Last Laugh')?.itunesCollectionId).toBe(1670765896);
      expect(titles).not.toContain('Etude of Memory');
      expect(titles).not.toContain('Stranger');
      expect(titles).not.toContain('American Life');
      expect(titles).not.toContain('Back For More');

      const heroArtwork = selectBestArtistArtwork(exhibitionConflatedCatalog, reconciled, sanityContext);
      expect(heroArtwork).not.toContain('conflated');
      expect(heroArtwork).toContain('exhibition');
    });

    it('4. Generic-only "Demo" Tier 1 safeguard preserves clear Tier 1 Genre-Distance winner while non-generic wrong titles still fail Mandatory Catalog Corroboration', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Exhibition&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 1511350574, artistName: 'Exhibition', primaryGenreName: 'Punk' },
                { wrapperType: 'artist', artistId: 5903214, artistName: 'Exhibition', primaryGenreName: 'Rock' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=1511350574&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 1511350574, artistName: 'Exhibition', primaryGenreName: 'Punk' },
                {
                  wrapperType: 'collection',
                  artistId: 1511350574,
                  collectionId: 1670765896,
                  collectionName: 'The Last Laugh',
                  primaryGenreName: 'Punk',
                  releaseDate: '2023-02-17T08:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/last-laugh/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 1511350574,
                  collectionId: 1587594003,
                  collectionName: "You'll Be Next - EP",
                  primaryGenreName: 'Punk',
                  releaseDate: '2021-10-01T07:00:00Z',
                  trackCount: 4,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/youll-be-next/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        if (url.includes('term=Reason%20to%20Believe&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 999999, artistName: 'Reason to Believe', primaryGenreName: 'Punk' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=999999&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 999999,
                  collectionId: 555555,
                  collectionName: 'Live from Snake River',
                  primaryGenreName: 'Punk',
                  releaseDate: '2025-10-11T07:00:00Z',
                  trackCount: 9,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/impostor/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // Generic-only "Demo" must NOT sabotage clear Tier 1 Genre-Distance winner (Punk=8 vs Rock=3)
        const demoSafeResult = await scrapeImageUrlBackend(
          'Exhibition',
          'artist',
          'Hardcore Punk',
          'Buffalo NY hardcore punk band.',
          'Buffalo, USA',
          [{ albumName: 'Demo', releaseYear: '2020' }],
          'us',
          '2021'
        );
        expect(demoSafeResult.itunesArtistId).toBe(1511350574);
        expect(demoSafeResult.imageUrl).toContain('exhibition');
        expect(demoSafeResult.reconciledDiscography.some((d) => d.albumName === 'The Last Laugh')).toBe(true);

        // Non-generic wrong/unindexed titles MUST still fail Mandatory Catalog Corroboration (Reason to Believe defense)
        const uncorroboratedResult = await scrapeImageUrlBackend(
          'Reason to Believe',
          'artist',
          'Hardcore Punk',
          'Classic 1980s California melodic hardcore band.',
          'California, USA',
          [{ albumName: 'Next Time From the Heart', releaseYear: '1988' }],
          'us',
          '1986'
        );
        expect(uncorroboratedResult).toEqual({
          imageUrl: null,
          reconciledDiscography: [{ albumName: 'Next Time From the Heart', releaseYear: '1988' }],
          itunesArtistId: null,
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('5. Step 2 itunesScrapeVersion: 4 one-time $0.00 upgrade runs once for anchored legacy not-found artists, never loops, and leaves healOrphanedAsset untouched', () => {
      expect(CURRENT_ITUNES_SCRAPE_VERSION).toBe(4);

      // Legacy artist doc with not-found and valid founded year (or qualifying discography) -> eligible
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [], details: { founded: '2021' } }, false)).toBe(true);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 1, details: { founded: '1993' } }, false)).toBe(true);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 2, details: { founded: '1994' } }, false)).toBe(true);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [{ albumName: 'The Last Laugh', releaseYear: '2023' }] }, false)).toBe(true);

      // Unanchored legacy doc with empty discography AND missing founded year -> strictly bypassed (V47.9)
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [] }, false)).toBe(false);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 1, details: { founded: 'Unknown' } }, false)).toBe(false);

      // Already stamped v3 -> strictly bypassed (no repeat scraping on genuinely unindexed underground bands)
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 3, details: { founded: '2021' } }, false)).toBe(false);

      // Already has verified https:// imageUrl -> strictly bypassed
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'https://is1-ssl.mzstatic.com/art/600x600bb.jpg', details: { founded: '2021' } }, false)).toBe(false);

      // Label entities -> strictly bypassed
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', details: { founded: '2007' } }, true)).toBe(false);

      // Verify Step 2 wiring in processCurationJob.ts and zero JIT healer bloat in healOrphanedAsset.ts
      const workerSrc = fs.readFileSync(path.resolve(__dirname, '../src/processCurationJob.ts'), 'utf-8');
      const jitSrc = fs.readFileSync(path.resolve(__dirname, '../src/healOrphanedAsset.ts'), 'utf-8');
      expect(workerSrc).toContain('shouldRunRule38NotFoundUpgrade(details, isLabel)');
      expect(workerSrc).toContain('details.itunesScrapeVersion = CURRENT_ITUNES_SCRAPE_VERSION');
      expect(jitSrc).not.toContain('itunesScrapeVersion');
    });
  });

  describe('V47.9 Rule 38 Guard Hardening: Apple Electronic "Hardcore", Uncorroborated Debut-Era Gate & Empty-Catalog Fail-Closed', () => {
    it('1. Apple bare "Hardcore" maps exclusively to Electronic/Dance/Gabber and blocks panic-us (#15241026) false positive', async () => {
      expect(isAppleElectronicHardcoreGenre('Hardcore')).toBe(true);
      expect(isAppleElectronicHardcoreGenre('Hardcore Punk')).toBe(false);

      // Non-electronic hardcore subgenres must NEVER match bare Apple "Hardcore" (even with "hardcore" in summary)
      const nonElectronicGenres = [
        'Hardcore Punk',
        'Post-Hardcore',
        'Melodic Hardcore',
        'Youth Crew Hardcore',
        'Metalcore',
        'Hardcore Rap',
      ];
      for (const zceneGenre of nonElectronicGenres) {
        expect(evaluateGenreMatch('Hardcore', zceneGenre, 'Seminal hardcore band from Boston.')).toBe(false);
        expect(evaluateGenreDistanceScore('Hardcore', zceneGenre, 'Seminal hardcore band from Boston.')).toBe(0);
      }

      // Authentic Electronic/Gabber/Happy Hardcore artists STILL match bare Apple "Hardcore"
      expect(evaluateGenreMatch('Hardcore', 'Gabber / Happy Hardcore', '')).toBe(true);
      expect(evaluateGenreDistanceScore('Hardcore', 'Gabber / Happy Hardcore', '')).toBe(10);
      expect(evaluateGenreMatch('Hardcore', 'Electronic', '')).toBe(true);
      expect(evaluateGenreDistanceScore('Hardcore', 'Electronic', '')).toBe(8);

      // Zero regressions on real hardcore punk bands tagged "Punk" / "Rock" / "Alternative" by Apple
      expect(evaluateGenreMatch('Punk', 'Hardcore Punk', '')).toBe(true);
      expect(evaluateGenreDistanceScore('Punk', 'Hardcore Punk', '')).toBe(8);
      expect(evaluateGenreMatch('Punk', 'Youth Crew Hardcore', '')).toBe(true);
      expect(evaluateGenreMatch('Alternative', 'Hardcore Punk', '')).toBe(true);

      // Full panic-us offline scrape regression: #15241026 ('Hardcore' Gabber DJ) must NOT win Tier 1 Genre-Distance
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Panic&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 15241026, artistName: 'Panic', primaryGenreName: 'Hardcore' },
                { wrapperType: 'artist', artistId: 200001, artistName: 'Panic', primaryGenreName: 'Rock' },
                { wrapperType: 'artist', artistId: 200002, artistName: 'Panic', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=15241026&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 15241026,
                  collectionId: 1728272549,
                  collectionName: 'Early Rave Addict',
                  primaryGenreName: 'Hardcore',
                  releaseDate: '2024-05-01T07:00:00Z',
                  trackCount: 6,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/panic-gabber/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const result = await scrapeImageUrlBackend(
          'Panic',
          'artist',
          'Hardcore Punk',
          'Panic was a Boston hardcore punk band founded in 2000 on Bridge Nine Records.',
          'Boston, USA',
          [],
          'us',
          '2000'
        );
        expect(result).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. passesUncorroboratedEraGate enforces both debut-era ceiling (<=10 yrs), pre-formation floor (>=founded-1), non-empty catalog, and valid foundedYear', () => {
      // Valid debut-era lags
      expect(passesUncorroboratedEraGate([{ albumName: "You'll Be Next", releaseYear: '2021' }], '2021')).toBe(true);
      expect(passesUncorroboratedEraGate([{ albumName: 'Stereo', releaseYear: '1997' }], '1993')).toBe(true);
      expect(passesUncorroboratedEraGate([{ albumName: 'Pre-Formation Promo', releaseYear: '1992' }], '1993')).toBe(true);
      expect(passesUncorroboratedEraGate([{ albumName: 'Ten Year Debut', releaseYear: '2003' }], '1993')).toBe(true);

      // Exceeds 10-year debut-era ceiling
      expect(passesUncorroboratedEraGate([{ albumName: 'Through the Wreckage EP', releaseYear: '2010' }], '1996')).toBe(false);
      expect(passesUncorroboratedEraGate([{ albumName: 'Absolute Clarity', releaseYear: '2016' }], '1995')).toBe(false);
      expect(passesUncorroboratedEraGate([{ albumName: 'Declaration Of Faith / The Empty Sea', releaseYear: '2026' }], '2001')).toBe(false);
      expect(passesUncorroboratedEraGate([{ albumName: 'Live from Snake River', releaseYear: '2025' }], '1986')).toBe(false);

      // Violates pre-formation floor (< founded - 1, older homonym)
      expect(passesUncorroboratedEraGate([{ albumName: '1995 Homonym LP', releaseYear: '1995' }], '2021')).toBe(false);

      // Empty reconciled catalog or missing/invalid foundedYear fails closed
      expect(passesUncorroboratedEraGate([], '2012')).toBe(false);
      expect(passesUncorroboratedEraGate([{ albumName: 'Some LP', releaseYear: '2021' }], undefined)).toBe(false);
      expect(passesUncorroboratedEraGate([{ albumName: 'Some LP', releaseYear: '2021' }], 'Unknown')).toBe(false);
    });

    it('3. Uncorroborated debut-era gate rejects reason-to-believe-us, sunrise-pl, hands-tied-us, zwan-us, pre-formation homonyms & missing foundedYear', async () => {
      const falsePositiveCases = [
        {
          name: 'Reason To Believe',
          genre: 'Hardcore Punk',
          origin: 'Orange County, California, USA',
          iso: 'us',
          founded: '1986',
          artistId: 1832738374,
          itunesGenre: 'Rock',
          albumName: 'Live from Snake River',
          releaseDate: '2025-10-11T07:00:00Z',
        },
        {
          name: 'Sunrise',
          genre: 'Metalcore',
          origin: 'Poznań, Poland',
          iso: 'pl',
          founded: '1995',
          artistId: 1490229573,
          itunesGenre: 'Metal',
          albumName: 'Absolute Clarity (Japan Edition)',
          releaseDate: '2016-01-15T08:00:00Z',
        },
        {
          name: 'Hands Tied',
          genre: 'Hardcore Punk',
          origin: 'New Jersey, USA',
          iso: 'us',
          founded: '1996',
          artistId: 39275704,
          itunesGenre: 'Alternative',
          albumName: 'Through the Wreckage EP',
          releaseDate: '2010-05-01T07:00:00Z',
        },
        {
          name: 'Zwan',
          genre: 'Alternative Rock',
          origin: 'Chicago, USA',
          iso: 'us',
          founded: '2001',
          artistId: 2092397,
          itunesGenre: 'Rock',
          albumName: 'Declaration Of Faith / The Empty Sea',
          releaseDate: '2026-01-01T08:00:00Z',
        },
        {
          // Pre-formation floor check: modern 2021 band vs 1995 homonym (-26 yrs)
          name: 'PreFormationHomonym',
          genre: 'Hardcore Punk',
          origin: 'Chicago, USA',
          iso: 'us',
          founded: '2021',
          artistId: 777001,
          itunesGenre: 'Punk',
          albumName: 'Ancient Cassette LP',
          releaseDate: '1995-03-01T08:00:00Z',
        },
        {
          // Missing foundedYear with empty discography must fail closed
          name: 'NoFoundedBand',
          genre: 'Hardcore Punk',
          origin: 'Boston, USA',
          iso: 'us',
          founded: undefined,
          artistId: 777002,
          itunesGenre: 'Punk',
          albumName: 'Unverified Record',
          releaseDate: '2022-03-01T08:00:00Z',
        },
      ];

      for (const tc of falsePositiveCases) {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
          const url = String(input);
          if (url.includes(`term=${encodeURIComponent(tc.name)}&entity=musicArtist`)) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  { wrapperType: 'artist', artistId: tc.artistId, artistName: tc.name, primaryGenreName: tc.itunesGenre },
                ],
              }),
            } as any;
          }
          if (url.includes(`lookup?id=${tc.artistId}&entity=album`)) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  { wrapperType: 'artist', artistId: tc.artistId, artistName: tc.name, primaryGenreName: tc.itunesGenre },
                  {
                    wrapperType: 'collection',
                    artistId: tc.artistId,
                    collectionId: 990001,
                    collectionName: tc.albumName,
                    primaryGenreName: tc.itunesGenre,
                    releaseDate: tc.releaseDate,
                    trackCount: 8,
                    artworkUrl100: 'https://is1-ssl.mzstatic.com/false-pos/100x100bb.jpg',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        });

        try {
          const res = await scrapeImageUrlBackend(
            tc.name,
            'artist',
            tc.genre,
            `${tc.name} is an underground band from ${tc.origin}.`,
            tc.origin,
            [],
            tc.iso,
            tc.founded
          );
          expect(res).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
        } finally {
          fetchSpy.mockRestore();
        }
      }
    });

    it('4. Verified legacy not-found positives (exhibition-us & christie-front-drive-us) pass uncorroborated debut-era gate cleanly', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Exhibition&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 1511350574, artistName: 'Exhibition', primaryGenreName: 'Punk' },
                { wrapperType: 'artist', artistId: 5903214, artistName: 'Exhibition', primaryGenreName: 'Rock' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=1511350574&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'collection', artistId: 1511350574, collectionId: 1587594003, collectionName: "You'll Be Next - EP", primaryGenreName: 'Punk', releaseDate: '2021-10-01T07:00:00Z', trackCount: 4, artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 1511350574, collectionId: 1670765896, collectionName: 'The Last Laugh', primaryGenreName: 'Punk', releaseDate: '2023-02-17T08:00:00Z', trackCount: 10, artworkUrl100: 'https://is1-ssl.mzstatic.com/exhibition/last-laugh/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 1511350574, collectionId: 1851895731, collectionName: 'Etude of Memory - Single', primaryGenreName: 'New Age', releaseDate: '1994-05-01T07:00:00Z', trackCount: 1, artworkUrl100: 'https://is1-ssl.mzstatic.com/conflated/100x100bb.jpg' },
              ],
            }),
          } as any;
        }
        if (url.includes('term=Christie%20Front%20Drive&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 18380995, artistName: 'Christie Front Drive', primaryGenreName: 'Rock' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=18380995&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'collection', artistId: 18380995, collectionId: 363669509, collectionName: 'Stereo', primaryGenreName: 'Rock', releaseDate: '1997-01-01T08:00:00Z', trackCount: 9, artworkUrl100: 'https://is1-ssl.mzstatic.com/cfd/stereo/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 18380995, collectionId: 367490902, collectionName: 'S/T', primaryGenreName: 'Rock', releaseDate: '2010-01-01T08:00:00Z', trackCount: 8, artworkUrl100: 'https://is1-ssl.mzstatic.com/cfd/st/100x100bb.jpg' },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const exhibitionRes = await scrapeImageUrlBackend(
          'Exhibition',
          'artist',
          'Hardcore Punk',
          'Buffalo hardcore band on Triple B Records.',
          'Buffalo, USA',
          [],
          'us',
          '2021'
        );
        expect(exhibitionRes.itunesArtistId).toBe(1511350574);
        expect(exhibitionRes.imageUrl).toContain('exhibition');
        expect(exhibitionRes.reconciledDiscography.map((d) => d.albumName)).toEqual(["You'll Be Next", 'The Last Laugh']);

        const cfdRes = await scrapeImageUrlBackend(
          'Christie Front Drive',
          'artist',
          'Emo / Post-Hardcore',
          'Denver 1990s emo pioneers.',
          'Denver, USA',
          [],
          'us',
          '1993'
        );
        expect(cfdRes.itunesArtistId).toBe(18380995);
        expect(cfdRes.imageUrl).toContain('cfd');
        expect(cfdRes.reconciledDiscography.map((d) => d.albumName)).toEqual(['Stereo', 'S/T']);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('5. Empty-catalog artwork-only fail-closed: certain-people-i-know-us (#551925469) fails closed when 0 collections survive reconciliation', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Certain%20People%20I%20Know&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 551925469, artistName: 'Certain People I Know', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=551925469&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 551925469,
                  collectionId: 551925470,
                  collectionName: 'Certain People I Know',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2012-08-01T07:00:00Z',
                  trackCount: 7,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/cpik/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Certain People I Know',
          'artist',
          'Emo / Indie Rock',
          'Chicago emo band founded in 2012.',
          'Chicago, Illinois, USA',
          [],
          'us',
          '2012'
        );
        expect(res).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('V47.10 Rule 38: Compilation Track-Match Rescue, Multi-Album Reissue Drift & Leading "The " Fallback', () => {
    it('1. Conflation-Pinned Compilation Rescue recovers mouthpiece-us (#161072028) pinned strictly to #300974664 and blocks 2025 feat. single + Hip-Hop/Christian albums', async () => {
      expect(COMPILATION_COLLECTION_RE.test("Can't Kill What's Inside: The Complete Discography")).toBe(true);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Mouthpiece&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 161072028, artistName: 'Mouthpiece', primaryGenreName: 'Hip-Hop/Rap' },
                { wrapperType: 'artist', artistId: 1679167303, artistName: 'Mouthpiece', primaryGenreName: 'Afrobeats' },
              ],
            }),
          } as any;
        }
        if (url.includes('entity=song&limit=15')) {
          if (url.includes('Face%20Tomorrow')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'Face Tomorrow',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('What%20Was%20Said')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'What Was Said',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=300974664&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 38,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/complete-discog/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Youth Crew Hardcore',
          'New Jersey straight-edge hardcore band founded in 1991 on New Age and Revelation Records.',
          'New Jersey, USA',
          [
            { albumName: 'What Was Said', releaseYear: '1994' },
            { albumName: 'Face Tomorrow', releaseYear: '1995' },
          ],
          'us',
          '1991'
        );

        expect(res.itunesArtistId).toBe(161072028);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/mouthpiece/complete-discog/600x600bb.jpg');
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: "Can't Kill What's Inside: The Complete Discography",
            releaseYear: '2009',
            itunesCollectionId: 300974664,
          },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. Conflation-Pinned Compilation Rescue recovers friction-us (#4940290) pinned strictly to #1653010702 and excludes Japanese Friction Alternative LPs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Friction&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 4940290, artistName: 'Friction', primaryGenreName: 'Alternative' },
                { wrapperType: 'artist', artistId: 1640912527, artistName: 'Friction', primaryGenreName: 'Punk' },
              ],
            }),
          } as any;
        }
        // Tier 3A lookup on #4940290 returns compilation + Japanese Friction albums (none match "Blurred in Six" or "The Makeshift Chimney" as collectionName)
        if (url.includes('lookup?id=4940290&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'collection', artistId: 4940290, collectionId: 260169621, collectionName: '軋轢', primaryGenreName: 'Alternative', releaseDate: '2005-05-20T07:00:00Z', trackCount: 10, artworkUrl100: 'https://is1-ssl.mzstatic.com/jp-friction/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 4940290, collectionId: 1653010702, collectionName: 'Hours of Operation: Discography 1991 - 1994', primaryGenreName: 'Alternative', releaseDate: '2002-04-16T07:00:00Z', trackCount: 32, artworkUrl100: 'https://is1-ssl.mzstatic.com/us-friction/hours/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 4940290, collectionId: 1537156474, collectionName: 'SKIN DEEP', primaryGenreName: 'Rock', releaseDate: '2006-08-21T07:00:00Z', trackCount: 8, artworkUrl100: 'https://is1-ssl.mzstatic.com/jp-friction-2/100x100bb.jpg' },
              ],
            }),
          } as any;
        }
        if (url.includes('entity=song&limit=15')) {
          if (url.includes('Blurred%20in%20Six')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 4940290,
                    artistName: 'Friction',
                    collectionId: 1653010702,
                    collectionName: 'Hours of Operation: Discography 1991 - 1994',
                    trackName: 'Blurred in Six',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2002-04-16T07:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('The%20Makeshift%20Chimney')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 4940290,
                    artistName: 'Friction',
                    collectionId: 1653010702,
                    collectionName: 'Hours of Operation: Discography 1991 - 1994',
                    trackName: 'The Makeshift Chimney',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2002-04-16T07:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=1653010702&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 4940290,
                  collectionId: 1653010702,
                  collectionName: 'Hours of Operation: Discography 1991 - 1994',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2002-04-16T07:00:00Z',
                  trackCount: 32,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/us-friction/hours/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Friction',
          'artist',
          'Post-Hardcore',
          'Chicago post-hardcore band active from 1991 to 1994.',
          'Chicago, USA',
          [
            { albumName: 'Blurred in Six', releaseYear: '1993' },
            { albumName: 'The Makeshift Chimney', releaseYear: '1994' },
          ],
          'us',
          '1991'
        );

        expect(res.itunesArtistId).toBe(4940290);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/us-friction/hours/600x600bb.jpg');
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: 'Hours of Operation: Discography 1991 - 1994',
            releaseYear: '2002',
            itunesCollectionId: 1653010702,
          },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('3. Compilation negative guards: 1-of-2 track coincidence, same-track duplicate, or <8-track EP all fail closed to Tier 4', async () => {
      // Case A: Only 1 of 2 Gemini titles matches a track on the compilation -> fail closed
      const oneOfTwoSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song&limit=15') && url.includes('Face%20Tomorrow')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 161072028,
                  artistName: 'Mouthpiece',
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  trackName: 'Face Tomorrow',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                },
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 161072028,
                  artistName: 'Mouthpiece',
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  trackName: 'Face Tomorrow (Live)',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const oneMatchRes = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Youth Crew Hardcore',
          'NJ hardcore band.',
          'New Jersey, USA',
          [
            { albumName: 'Face Tomorrow', releaseYear: '1995' },
            { albumName: 'Nonexistent Second Record', releaseYear: '1996' },
          ],
          'us',
          '1991'
        );
        expect(oneMatchRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [
            { albumName: 'Face Tomorrow', releaseYear: '1995' },
            { albumName: 'Nonexistent Second Record', releaseYear: '1996' },
          ],
          itunesArtistId: null,
        });
      } finally {
        oneOfTwoSpy.mockRestore();
      }

      // Case B: Short <8-track EP masquerading with "Complete" in title -> rejected by trackCount >= 8 check
      const shortEpSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song&limit=15')) {
          const isFirst = url.includes('Track%20Alpha');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 500001,
                  artistName: 'Mouthpiece',
                  collectionId: 600001,
                  collectionName: 'Complete Control - EP',
                  trackName: isFirst ? 'Track Alpha' : 'Track Bravo',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=600001&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 500001,
                  collectionId: 600001,
                  collectionName: 'Complete Control - EP',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 4, // < 8 tracks -> must fail closed
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/short-ep/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const shortEpRes = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Youth Crew Hardcore',
          'NJ hardcore band.',
          'New Jersey, USA',
          [
            { albumName: 'Track Alpha', releaseYear: '1994' },
            { albumName: 'Track Bravo', releaseYear: '1995' },
          ],
          'us',
          '1991'
        );
        expect(shortEpRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [
            { albumName: 'Track Alpha', releaseYear: '1994' },
            { albumName: 'Track Bravo', releaseYear: '1995' },
          ],
          itunesArtistId: null,
        });
      } finally {
        shortEpSpy.mockRestore();
      }
    });

    it('4. Multi-Album Reissue Year-Drift Relaxation rescues jejune-us (#1457025031, 1997/1998 -> 2025) while single-album year drift still fails closed', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=musicArtist')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('entity=song&limit=15')) {
          if (url.includes('Malady')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 1457025031,
                    artistName: 'Jejune',
                    collectionId: 1835015465,
                    collectionName: 'This Afternoons Malady',
                    trackName: 'Morale Is Low',
                    primaryGenreName: 'Rock',
                    releaseDate: '2025-09-05T07:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('Junk')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 1457025031,
                    artistName: 'Jejune',
                    collectionId: 1824532811,
                    collectionName: 'Junk',
                    trackName: 'Coping With Senility',
                    primaryGenreName: 'Indie Rock',
                    releaseDate: '2025-07-18T07:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=1457025031&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'collection', artistId: 1457025031, collectionId: 1835015465, collectionName: 'This Afternoons Malady', primaryGenreName: 'Rock', releaseDate: '2025-09-05T07:00:00Z', trackCount: 12, artworkUrl100: 'https://is1-ssl.mzstatic.com/jejune/malady/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 1457025031, collectionId: 1824532811, collectionName: 'Junk', primaryGenreName: 'Indie Rock', releaseDate: '2025-07-18T07:00:00Z', trackCount: 8, artworkUrl100: 'https://is1-ssl.mzstatic.com/jejune/junk/100x100bb.jpg' },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // Multi-album (2 distinct albums matching 2025 reissues on #1457025031) -> passes
        const multiRes = await scrapeImageUrlBackend(
          'Jejune',
          'artist',
          'Emo / Indie Rock',
          'Boston 1990s emo band.',
          'Boston, USA',
          [
            { albumName: 'Junk', releaseYear: '1997' },
            { albumName: "This Afternoon's Malady", releaseYear: '1998' },
          ],
          'us',
          '1996'
        );
        expect(multiRes.itunesArtistId).toBe(1457025031);
        expect(multiRes.imageUrl).toContain('jejune');
        expect(multiRes.reconciledDiscography.map((d) => d.albumName)).toEqual(['Junk', 'This Afternoons Malady']);

        // Single-album >2 yr drift (only 1 album provided: 1998 vs 2025) -> still fails closed!
        const singleDriftRes = await scrapeImageUrlBackend(
          'Jejune',
          'artist',
          'Emo / Indie Rock',
          'Boston 1990s emo band.',
          'Boston, USA',
          [{ albumName: "This Afternoon's Malady", releaseYear: '1998' }],
          'us',
          '1996'
        );
        expect(singleDriftRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [{ albumName: "This Afternoon's Malady", releaseYear: '1998' }],
          itunesArtistId: null,
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('5. Tier 1 Leading "The " Fallback rescues the-rocking-horse-winner-us (#31536457) when bare query misses and never double-prefixes "The "', async () => {
      const queriedTerms: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=musicArtist')) {
          queriedTerms.push(url);
          if (url.includes('term=The%20Rocking%20Horse%20Winner&')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  { wrapperType: 'artist', artistId: 31536457, artistName: 'The Rocking Horse Winner', primaryGenreName: 'Rock' },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=31536457&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'collection', artistId: 31536457, collectionId: 555153017, collectionName: 'State of Feeling Concentration', primaryGenreName: 'Rock', releaseDate: '2000-06-12T07:00:00Z', trackCount: 10, artworkUrl100: 'https://is1-ssl.mzstatic.com/trhw/state/100x100bb.jpg' },
                { wrapperType: 'collection', artistId: 31536457, collectionId: 493669654, collectionName: 'Horizon', primaryGenreName: 'Rock', releaseDate: '2002-01-01T08:00:00Z', trackCount: 10, artworkUrl100: 'https://is1-ssl.mzstatic.com/trhw/horizon/100x100bb.jpg' },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Rocking Horse Winner',
          'artist',
          'Emo / Indie Rock',
          'Florida indie emo band on Equal Vision Records.',
          'Coral Springs, Florida, USA',
          [],
          'us',
          '1999'
        );

        expect(res.itunesArtistId).toBe(31536457);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/trhw/state/600x600bb.jpg');
        expect(res.reconciledDiscography.map((d) => d.albumName)).toEqual(['State of Feeling Concentration', 'Horizon']);

        // Calling with an input that already starts with "The " must NEVER query "The The ..."
        queriedTerms.length = 0;
        await scrapeImageUrlBackend(
          'The Nonexistent Band',
          'artist',
          'Indie Rock',
          'Indie rock band.',
          'USA',
          [],
          'us',
          '1999'
        );
        expect(queriedTerms.some((u) => u.includes('The%20The'))).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('V47.11 Rule 38: Tier 3B Compilation Rescue — Collection+Track Corroboration & Cross-Title Track Scanning', () => {
    it('1. rescues mouthpiece-us (#161072028 -> pinned strictly to #300974664) on live 4-album payload ["Mouthpiece" (1991), "Demo" (1991), "What Was Said" (1994), "Can\'t Kill What\'s Inside" (1995)] via 1 collectionName + 1 distinct trackName', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Mouthpiece&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 161072028, artistName: 'Mouthpiece', primaryGenreName: 'Hip-Hop/Rap' },
                { wrapperType: 'artist', artistId: 174787020, artistName: 'Mouthpiece', primaryGenreName: 'Hip-Hop/Rap' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=161072028&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 38,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/cant-kill/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 1214141023,
                  collectionName: 'Disperse',
                  primaryGenreName: 'Christian',
                  releaseDate: '2017-03-10T08:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/disperse/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        if (url.includes('entity=song')) {
          if (url.includes('What%20Was%20Said')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'What Was Said',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('Can%27t%20Kill%20What%27s%20Inside')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'Abandon',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=300974664&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 38,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/cant-kill/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Hardcore Punk',
          'Mouthpiece bridged early 90s youth crew with modern straight edge hardcore.',
          'United States',
          [
            { albumName: 'Mouthpiece', releaseYear: '1991' },
            { albumName: 'Demo', releaseYear: '1991' },
            { albumName: 'What Was Said', releaseYear: '1994' },
            { albumName: "Can't Kill What's Inside", releaseYear: '1995' },
          ],
          'us',
          '1991'
        );

        expect(res.itunesArtistId).toBe(161072028);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/mouthpiece/cant-kill/600x600bb.jpg');
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: "Can't Kill What's Inside: The Complete Discography",
            releaseYear: '2009',
            itunesCollectionId: 300974664,
          },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. cross-matches returned compilation song rows against a 5th qualifying title beyond .slice(0, 4) at 0 extra HTTP cost', async () => {
      let songQueryCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song')) {
          songQueryCount++;
          if (url.includes('What%20Was%20Said')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: 'Complete Anthology 1991-1995',
                    trackName: 'What Was Said',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                  // 5th qualifying title ("Face Tomorrow") appears inside the 15 song rows returned for query #4
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: 'Complete Anthology 1991-1995',
                    trackName: 'Face Tomorrow',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=300974664&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: 'Complete Anthology 1991-1995',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 24,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/anthology/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Hardcore Punk',
          'New Jersey straight edge youth crew hardcore band.',
          'United States',
          [
            { albumName: 'New Horizons', releaseYear: '1992' },
            { albumName: 'Lost Tape Sessions', releaseYear: '1993' },
            { albumName: 'Out of the Shadows', releaseYear: '1993' },
            { albumName: 'What Was Said', releaseYear: '1994' },
            { albumName: 'Face Tomorrow', releaseYear: '1995' }, // 5th qualifying title (beyond .slice(0, 4))
          ],
          'us',
          '1991'
        );

        expect(songQueryCount).toBe(4); // Capped strictly at 4 entity=song HTTP calls
        expect(res.itunesArtistId).toBe(161072028);
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: 'Complete Anthology 1991-1995',
            releaseYear: '2009',
            itunesCollectionId: 300974664,
          },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('3. negative guard: 1 compilation collectionName match with 0 trackName matches still fails closed to Tier 4', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'track',
                  kind: 'song',
                  artistId: 161072028,
                  artistName: 'Mouthpiece',
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  trackName: 'Unrelated Song Title',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Hardcore Punk',
          'New Jersey straight edge youth crew hardcore band.',
          'United States',
          [
            { albumName: 'New Horizons', releaseYear: '1993' },
            { albumName: "Can't Kill What's Inside", releaseYear: '1995' },
          ],
          'us',
          '1991'
        );

        expect(res).toEqual({
          imageUrl: null,
          reconciledDiscography: [
            { albumName: 'New Horizons', releaseYear: '1993' },
            { albumName: "Can't Kill What's Inside", releaseYear: '1995' },
          ],
          itunesArtistId: null,
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('V47.12 Rule 38: Tier 3B Format-Stripping, Core Release Prioritization & Straight Edge / Youth Crew Taxonomy', () => {
    it('1. cleanSongQueryAlbumTitle strips trailing/parenthetical format descriptors (EP, LP, 7", 7-inch, (EP)) and rescues format-suffixed Mouthpiece payload', async () => {
      expect(cleanSongQueryAlbumTitle('What Was Said EP')).toBe('What Was Said');
      expect(cleanSongQueryAlbumTitle('What Was Said LP')).toBe('What Was Said');
      expect(cleanSongQueryAlbumTitle('What Was Said (LP)')).toBe('What Was Said');
      expect(cleanSongQueryAlbumTitle('Face Tomorrow 7-inch')).toBe('Face Tomorrow');
      expect(cleanSongQueryAlbumTitle('Face Tomorrow (EP)')).toBe('Face Tomorrow');
      expect(cleanSongQueryAlbumTitle('Face Tomorrow 7"')).toBe('Face Tomorrow');
      expect(cleanSongQueryAlbumTitle('Mouthpiece EP')).toBe('Mouthpiece');

      const songUrlsQueried: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song')) {
          songUrlsQueried.push(url);
          // Simulate Apple's strict token-AND behavior: returns 0 if "EP", "LP", or "7-inch" is in term!
          if (url.includes('EP') || url.includes('LP') || url.includes('7-inch')) {
            return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
          }
          if (url.includes('term=Mouthpiece%20What%20Was%20Said&')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'What Was Said',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('term=Mouthpiece%20Face%20Tomorrow&')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'Face Tomorrow',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=300974664&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 38,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/cant-kill/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Straight Edge Hardcore',
          'Mouthpiece bridged early 90s youth crew with modern straight edge hardcore.',
          'United States',
          [
            { albumName: 'What Was Said EP', releaseYear: '1994' },
            { albumName: 'Face Tomorrow 7-inch', releaseYear: '1995' },
          ],
          'us',
          '1991'
        );

        expect(songUrlsQueried.some((u) => u.includes('term=Mouthpiece%20What%20Was%20Said&'))).toBe(true);
        expect(songUrlsQueried.some((u) => u.includes('term=Mouthpiece%20Face%20Tomorrow&'))).toBe(true);
        expect(res.itunesArtistId).toBe(161072028);
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: "Can't Kill What's Inside: The Complete Discography",
            releaseYear: '2009',
            itunesCollectionId: 300974664,
          },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. chronological 4-item payload ["Mouthpiece EP" (1991), "Demo 1991" (1991), "What Was Said" (1994), "Face Tomorrow" (1995)] blocks collapsed self-titled/demo entries and rescues via "What Was Said" + "Face Tomorrow"', async () => {
      const songUrlsQueried: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=song')) {
          songUrlsQueried.push(url);
          if (url.includes('term=Mouthpiece%20What%20Was%20Said&')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'What Was Said',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('term=Mouthpiece%20Face%20Tomorrow&')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 161072028,
                    artistName: 'Mouthpiece',
                    collectionId: 300974664,
                    collectionName: "Can't Kill What's Inside: The Complete Discography",
                    trackName: 'Face Tomorrow',
                    primaryGenreName: 'Alternative',
                    releaseDate: '2009-01-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=300974664&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 161072028,
                  collectionId: 300974664,
                  collectionName: "Can't Kill What's Inside: The Complete Discography",
                  primaryGenreName: 'Alternative',
                  releaseDate: '2009-01-20T08:00:00Z',
                  trackCount: 38,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mouthpiece/cant-kill/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Straight Edge Hardcore',
          'Mouthpiece bridged early 90s youth crew with modern straight edge hardcore.',
          'United States',
          [
            { albumName: 'Mouthpiece EP', releaseYear: '1991' },
            { albumName: 'Demo 1991', releaseYear: '1991' },
            { albumName: 'What Was Said', releaseYear: '1994' },
            { albumName: 'Face Tomorrow', releaseYear: '1995' },
          ],
          'us',
          '1991'
        );

        // Collapsed "Mouthpiece EP" and "Demo 1991" must NOT be queried in Tier 3B
        expect(songUrlsQueried).toHaveLength(2);
        expect(songUrlsQueried.some((u) => u.includes('Mouthpiece%20EP') || u.includes('Demo'))).toBe(false);
        expect(res.itunesArtistId).toBe(161072028);
        expect(res.reconciledDiscography).toEqual([
          {
            albumName: "Can't Kill What's Inside: The Complete Discography",
            releaseYear: '2009',
            itunesCollectionId: 300974664,
          },
        ]);

        // Negative check: ["Mouthpiece EP" (1991), "What Was Said" (1994)] must NOT use "Mouthpiece EP" as a 2nd proof even if a track is named "Mouthpiece"
        const negativeRes = await scrapeImageUrlBackend(
          'Mouthpiece',
          'artist',
          'Straight Edge Hardcore',
          'Mouthpiece bridged early 90s youth crew with modern straight edge hardcore.',
          'United States',
          [
            { albumName: 'Mouthpiece EP', releaseYear: '1991' },
            { albumName: 'What Was Said', releaseYear: '1994' },
          ],
          'us',
          '1991'
        );
        expect(negativeRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [
            { albumName: 'Mouthpiece EP', releaseYear: '1991' },
            { albumName: 'What Was Said', releaseYear: '1994' },
          ],
          itunesArtistId: null,
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('3. bare "Straight Edge" and "Youth Crew" genres match Apple "Alternative" / "Punk" / "Rock" while returning false / 0 against bare Apple Electronic "Hardcore"', () => {
      for (const bareGenre of ['Straight Edge', 'Youth Crew', 'Straight Edge Hardcore', 'Youth Crew Hardcore']) {
        expect(evaluateGenreMatch('Alternative', bareGenre, '')).toBe(true);
        expect(evaluateGenreMatch('Punk', bareGenre, '')).toBe(true);
        expect(evaluateGenreMatch('Rock', bareGenre, '')).toBe(true);
        expect(evaluateGenreMatch('Hardcore', bareGenre, 'Straight edge youth crew band.')).toBe(false);
        expect(evaluateGenreDistanceScore('Hardcore', bareGenre, 'Straight edge youth crew band.')).toBe(0);
      }
    });
  });

  describe('V47.14 Rule 38: Mutual Non-Hostile Catalog-Corroborated Genre Guard, Emo/Rock Taxonomy Parity & Year-Aware Discography Deduplication', () => {
    it('1. rescues live Fairweather (#31535979, genre="Emo", founded="1999") across mixed "Rock"/"Punk" iTunes catalog, preserving Alaska (2001) + Lusitania (2003)', async () => {
      expect(evaluateGenreMatch('Rock', 'Emo', 'East Coast emo band on Equal Vision.')).toBe(true);
      expect(evaluateGenreMatch('Alternative', 'Emo', 'East Coast emo band on Equal Vision.')).toBe(true);
      expect(evaluateGenreMatch('Rock', 'Screamo', '')).toBe(true);
      expect(evaluateGenreMatch('Rock', 'Post-Hardcore', '')).toBe(true);
      expect(evaluateGenreMatch('Rock', 'Shoegaze', '')).toBe(true);
      expect(evaluateGenreMatch('Rock', 'Math Rock', '')).toBe(true);
      expect(evaluateGenreMatch('Rock', 'Pop Punk', '')).toBe(true);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Fairweather&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 31535979, artistName: 'Fairweather', primaryGenreName: 'Rock' },
                { wrapperType: 'artist', artistId: 1502437416, artistName: 'Fairweather', primaryGenreName: 'Singer/Songwriter' },
                { wrapperType: 'artist', artistId: 342696241, artistName: 'Fairweather', primaryGenreName: 'Rock' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=31535979&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 31535979,
                  collectionId: 493670001,
                  collectionName: 'Alaska',
                  primaryGenreName: 'Rock',
                  releaseDate: '2001-03-20T08:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/fairweather/alaska/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 31535979,
                  collectionId: 493670002,
                  collectionName: 'Lusitania',
                  primaryGenreName: 'Rock',
                  releaseDate: '2003-10-07T07:00:00Z',
                  trackCount: 12,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/fairweather/lusitania/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 31535979,
                  collectionId: 840123456,
                  collectionName: 'Fairweather',
                  primaryGenreName: 'Punk',
                  releaseDate: '2014-04-01T07:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/fairweather/st/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Fairweather',
          'artist',
          'Emo',
          'Their work on major independent punk imprints cemented their reputation as a beloved fixture of the early 2000s East Coast emo scene.',
          'Virginia, USA',
          [
            { albumName: 'Alaska', releaseYear: '2001' },
            { albumName: 'Lusitania', releaseYear: '2003' },
            { albumName: 'Fairweather', releaseYear: '2014' },
          ],
          'us',
          '1999'
        );

        expect(res.itunesArtistId).toBe(31535979);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/fairweather/alaska/600x600bb.jpg');
        expect(res.reconciledDiscography).toEqual([
          { albumName: 'Alaska', releaseYear: '2001', itunesCollectionId: 493670001 },
          { albumName: 'Lusitania', releaseYear: '2003', itunesCollectionId: 493670002 },
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('2. Mutual Non-Hostility Catalog-Corroborated Genre Guard rescues unmapped editorial subgenres (>=2 albums) in Tier 3A & Tier 3B while blocking cross-family Zcene genres, hostile Apple genres, bare Hardcore 1050 & 1-album unmapped matches', async () => {
      // Unmapped underground subgenres pass against non-hostile Apple umbrella buckets
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Sasscore / Nintendocore')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Alternative', 'Orgcore / Egg Punk')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Metal', 'Djent / Thall')).toBe(true);

      // Legitimate crossover genres pass
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Rap Rock')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Jazz Rock')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Electronic Rock')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Folk Rock')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Rock', 'Post-Rock')).toBe(true);
      expect(isCatalogCorroboratedNonHostileGenre('Alternative', 'Soul Punk')).toBe(true);

      // Pure non-umbrella Zcene genres MUST return false against Apple 'Rock' / 'Pop' / 'Alternative'
      for (const incompatibleZceneGenre of [
        'Hip-Hop',
        'Rap',
        'Hardcore Rap',
        'Classical',
        'Opera',
        'Country',
        'Bluegrass',
        'Jazz',
        'Bebop',
        'Electronic',
        'Techno',
        'House',
        'EDM',
        'Happy Hardcore',
        'Hardcore Techno',
        'UK Hardcore',
        'R&B',
        'Neo-Soul',
      ]) {
        expect(isCatalogCorroboratedNonHostileGenre('Rock', incompatibleZceneGenre)).toBe(false);
        expect(isCatalogCorroboratedNonHostileGenre('Pop', incompatibleZceneGenre)).toBe(false);
        expect(isCatalogCorroboratedNonHostileGenre('Alternative', incompatibleZceneGenre)).toBe(false);
      }

      // Hostile Apple genres and bare Apple Electronic 'Hardcore' (ID 1050) always return false
      for (const hostileAppleGenre of [
        'Hip-Hop/Rap',
        'Country',
        'Christian',
        'Classical',
        'New Age',
        "Children's Music",
        'Comedy',
        'Holiday',
        'Soundtrack',
        'Hardcore',
      ]) {
        expect(isCatalogCorroboratedNonHostileGenre(hostileAppleGenre, 'Sasscore')).toBe(false);
      }

      // Tier 3B rescue with unmapped editorial subgenre ("Sasscore / Nintendocore") + 2 distinct albums on 1 unambiguous artistId
      const tier3bUnmappedSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('entity=musicArtist')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('entity=song')) {
          if (url.includes('Alaska')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 31535979,
                    artistName: 'Fairweather',
                    collectionId: 493670001,
                    collectionName: 'Alaska',
                    trackName: 'If They Move... Kill Them',
                    primaryGenreName: 'Rock',
                    releaseDate: '2001-03-20T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('Lusitania')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 31535979,
                    artistName: 'Fairweather',
                    collectionId: 493670002,
                    collectionName: 'Lusitania',
                    trackName: ' Lusitania',
                    primaryGenreName: 'Rock',
                    releaseDate: '2003-10-07T07:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=31535979&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 31535979,
                  collectionId: 493670001,
                  collectionName: 'Alaska',
                  primaryGenreName: 'Rock',
                  releaseDate: '2001-03-20T08:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/fairweather/alaska/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 31535979,
                  collectionId: 493670002,
                  collectionName: 'Lusitania',
                  primaryGenreName: 'Rock',
                  releaseDate: '2003-10-07T07:00:00Z',
                  trackCount: 12,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/fairweather/lusitania/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // 2 distinct albums with unmapped subgenre -> succeeds via multi-album catalog proof
        const multiAlbumUnmappedRes = await scrapeImageUrlBackend(
          'Fairweather',
          'artist',
          'Sasscore / Nintendocore',
          'Underground DIY band founded in 1999.',
          'Virginia, USA',
          [
            { albumName: 'Alaska', releaseYear: '2001' },
            { albumName: 'Lusitania', releaseYear: '2003' },
          ],
          'us',
          '1999'
        );
        expect(multiAlbumUnmappedRes.itunesArtistId).toBe(31535979);
        expect(multiAlbumUnmappedRes.reconciledDiscography.map((d) => d.albumName)).toEqual(['Alaska', 'Lusitania']);

        // Single-album (1 album only) with unmapped subgenre -> MUST still fail closed!
        const singleAlbumUnmappedRes = await scrapeImageUrlBackend(
          'Fairweather',
          'artist',
          'Sasscore / Nintendocore',
          'Underground DIY band founded in 1999.',
          'Virginia, USA',
          [{ albumName: 'Alaska', releaseYear: '2001' }],
          'us',
          '1999'
        );
        expect(singleAlbumUnmappedRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [{ albumName: 'Alaska', releaseYear: '2001' }],
          itunesArtistId: null,
        });

        // Cross-family Zcene genre ('Hip-Hop') against 'Rock' homonym with 2 matching album titles -> MUST fail closed!
        const crossFamilyRejectRes = await scrapeImageUrlBackend(
          'Fairweather',
          'artist',
          'Hip-Hop',
          'Underground boom bap duo founded in 1999.',
          'Virginia, USA',
          [
            { albumName: 'Alaska', releaseYear: '2001' },
            { albumName: 'Lusitania', releaseYear: '2003' },
          ],
          'us',
          '1999'
        );
        expect(crossFamilyRejectRes).toEqual({
          imageUrl: null,
          reconciledDiscography: [
            { albumName: 'Alaska', releaseYear: '2001' },
            { albumName: 'Lusitania', releaseYear: '2003' },
          ],
          itunesArtistId: null,
        });
      } finally {
        tier3bUnmappedSpy.mockRestore();
      }
    });

    it('3. Year-Aware Deterministic Discography Deduplication eliminates duplicate Horizon (#493669654), Turning Point (#1537004455), Good Apollo Vol 1/2 collisions & yearless duplicates while preserving multi-year self-titled albums (American Football / Weezer)', () => {
      // Case A: The Rocking Horse Winner — duplicate Horizon (#493669654) in llmDiscography deduplicates and backfills State of Feeling Concentration (#555153017)
      const trhwItunesAlbums = [
        {
          wrapperType: 'collection',
          artistId: 31536457,
          collectionId: 493669654,
          collectionName: 'Horizon',
          primaryGenreName: 'Rock',
          releaseDate: '2002-04-09T07:00:00Z',
          trackCount: 10,
        },
        {
          wrapperType: 'collection',
          artistId: 31536457,
          collectionId: 555153017,
          collectionName: 'State of Feeling Concentration',
          primaryGenreName: 'Rock',
          releaseDate: '2000-06-12T07:00:00Z',
          trackCount: 10,
        },
      ];
      const trhwReconciled = reconcileDiscographyWithITunes(
        [
          { albumName: 'Horizon', releaseYear: '2002' },
          { albumName: 'Horizon EP', releaseYear: '2002' },
        ],
        trhwItunesAlbums,
        'The Rocking Horse Winner',
        { genre: 'Indie Rock', foundedYear: '1999' }
      );
      expect(trhwReconciled).toEqual([
        { albumName: 'Horizon', releaseYear: '2002', itunesCollectionId: 493669654 },
        { albumName: 'State of Feeling Concentration', releaseYear: '2000', itunesCollectionId: 555153017 },
      ]);

      // Case B: Turning Point — two LLM variants matching compilation #1537004455 output #1537004455 exactly once
      const tpItunesAlbums = [
        {
          wrapperType: 'collection',
          artistId: 20112233,
          collectionId: 1537004455,
          collectionName: '1988-1991 Discography',
          primaryGenreName: 'Punk',
          releaseDate: '2000-01-01T08:00:00Z',
          trackCount: 25,
        },
      ];
      const tpReconciled = reconcileDiscographyWithITunes(
        [
          { albumName: '1988-1991', releaseYear: '2000' },
          { albumName: '1988-1991 Discography', releaseYear: '2000' },
        ],
        tpItunesAlbums,
        'Turning Point',
        { genre: 'Youth Crew Hardcore', foundedYear: '1988' }
      );
      expect(tpReconciled).toEqual([
        { albumName: '1988-1991 Discography', releaseYear: '2000', itunesCollectionId: 1537004455 },
      ]);

      // Case C: Coheed and Cambria — Good Apollo Volume One (2005) vs. Volume Two (2007) sharing 12-char prefix
      const coheedItunesAlbums = [
        {
          wrapperType: 'collection',
          artistId: 547891,
          collectionId: 100001,
          collectionName: "Good Apollo, I'm Burning Star IV, Volume One: From Fear Through the Eyes of Madness",
          primaryGenreName: 'Rock',
          releaseDate: '2005-09-20T07:00:00Z',
          trackCount: 15,
        },
        {
          wrapperType: 'collection',
          artistId: 547891,
          collectionId: 100002,
          collectionName: "Good Apollo, I'm Burning Star IV, Volume Two: No World for Tomorrow",
          primaryGenreName: 'Rock',
          releaseDate: '2007-10-23T07:00:00Z',
          trackCount: 13,
        },
      ];
      const coheedReconciled = reconcileDiscographyWithITunes(
        [
          {
            albumName: "Good Apollo, I'm Burning Star IV, Volume One: From Fear Through the Eyes of Madness",
            releaseYear: '2005',
          },
          {
            albumName: "Good Apollo, I'm Burning Star IV, Volume Two: No World for Tomorrow",
            releaseYear: '2007',
          },
        ],
        coheedItunesAlbums,
        'Coheed and Cambria',
        { genre: 'Progressive Rock', foundedYear: '1995' }
      );
      expect(coheedReconciled).toEqual([
        {
          albumName: "Good Apollo, I'm Burning Star IV, Volume One: From Fear Through the Eyes of Madness",
          releaseYear: '2005',
          itunesCollectionId: 100001,
        },
        {
          albumName: "Good Apollo, I'm Burning Star IV, Volume Two: No World for Tomorrow",
          releaseYear: '2007',
          itunesCollectionId: 100002,
        },
      ]);

      // Case D: Empty-year guard in deduplicateDiscographyItems (dated-then-yearless AND yearless-then-dated)
      expect(
        deduplicateDiscographyItems([
          { albumName: 'Horizon', releaseYear: '2002', itunesCollectionId: 493669654 },
          { albumName: 'Horizon', releaseYear: '' },
        ])
      ).toEqual([{ albumName: 'Horizon', releaseYear: '2002', itunesCollectionId: 493669654 }]);

      expect(
        deduplicateDiscographyItems([
          { albumName: 'Horizon', releaseYear: '' },
          { albumName: 'Horizon', releaseYear: '2002', itunesCollectionId: 493669654 },
        ])
      ).toEqual([{ albumName: 'Horizon', releaseYear: '2002', itunesCollectionId: 493669654 }]);

      // Case E: Multi-year self-titled / same-title albums (American Football 1999 vs 2016 vs 2019; Weezer 1994 vs 2001) are preserved!
      const multiYearSelfTitled = deduplicateDiscographyItems([
        { albumName: 'American Football', releaseYear: '1999', itunesCollectionId: 3001 },
        { albumName: 'American Football', releaseYear: '2016', itunesCollectionId: 3002 },
        { albumName: 'American Football', releaseYear: '2019', itunesCollectionId: 3003 },
      ]);
      expect(multiYearSelfTitled).toHaveLength(3);
      expect(multiYearSelfTitled.map((d) => d.releaseYear)).toEqual(['1999', '2016', '2019']);

      const weezerItunesAlbums = [
        {
          wrapperType: 'collection',
          artistId: 115234,
          collectionId: 9001,
          collectionName: 'Weezer - EP',
          primaryGenreName: 'Rock',
          releaseDate: '1994-05-10T07:00:00Z',
          trackCount: 10,
        },
        {
          wrapperType: 'collection',
          artistId: 115234,
          collectionId: 9002,
          collectionName: 'Weezer (Live)',
          primaryGenreName: 'Rock',
          releaseDate: '2001-05-15T07:00:00Z',
          trackCount: 10,
        },
      ];
      const weezerReconciled = reconcileDiscographyWithITunes(
        [
          { albumName: 'Weezer - EP', releaseYear: '1994' },
          { albumName: 'Weezer (Live)', releaseYear: '2001' },
        ],
        weezerItunesAlbums,
        'Weezer',
        { genre: 'Alternative Rock', foundedYear: '1992' }
      );
      expect(weezerReconciled).toEqual([
        { albumName: 'Weezer', releaseYear: '1994', itunesCollectionId: 9001 },
        { albumName: 'Weezer', releaseYear: '2001', itunesCollectionId: 9002 },
      ]);
    });
  });

  describe('V47.16 Rule 38 & Structural Country-Suffix / Seed Boundary Suite', () => {
    it('1. P1.1 Structural Country-Suffix Boundary & US State Guard: preserves display names ("At the Drive-In", "Lo-Fi"), guards bare slugs with origin locks, rejects 2-letter US state tokens ("Indianapolis, IN", "Portland, ME"), and enforces collision-free isCanonicalSeedMatch', () => {
      // Check 3: 2-letter US state abbreviations after a comma must NOT resolve to India ('in'), Montenegro ('me'), Germany ('de'), or Canada ('ca')
      expect(resolveExpectedOriginIsos('Indianapolis, IN')).toEqual([]);
      expect(resolveExpectedOriginIsos('Portland, ME')).toEqual([]);
      expect(resolveExpectedOriginIsos('Wilmington, DE')).toEqual([]);
      expect(resolveExpectedOriginIsos('Los Angeles, CA')).toEqual(['us']);
      expect(resolveExpectedOriginIsos('Brighton, UK')).toEqual(['gb']);
      expect(resolveExpectedOriginIsos('El Paso, USA')).toEqual(['us']);
      expect(resolveExpectedOriginIsos('El Paso, Texas, United States')).toEqual(['us']);
      expect(resolveExpectedOriginIsos('Umeå, Sweden')).toEqual(['se']);
      expect(resolveExpectedOriginIsos('us')).toEqual(['us']);
      expect(resolveExpectedOriginIsos('Unknown')).toEqual([]);

      // Rule 1A: Human display names are NEVER stripped of 2-letter hyphenated title words
      expect(stripCountrySlug('At the Drive-In')).toBe('At the Drive-In');
      expect(stripCountrySlug('Lo-Fi')).toBe('Lo-Fi');
      expect(stripCountrySlug('End It')).toBe('End It');
      expect(stripCountrySlug('As It Is')).toBe('As It Is');
      expect(stripCountrySlug('Against Me!')).toBe('Against Me!');
      expect(extractTrailingCountryIso('At the Drive-In')).toBeNull();
      expect(extractTrailingCountryIso('Lo-Fi')).toBeNull();

      // Rule 1B: Context-aware stripCountrySlug preserves bare lowercase slugs when trailing token != known origin ISO
      expect(stripCountrySlug('at-the-drive-in', 'El Paso, Texas, United States')).toBe('at-the-drive-in');
      expect(stripCountrySlug('at-the-drive-in-us', 'El Paso, Texas, United States')).toBe('at-the-drive-in');
      expect(stripCountrySlug('end-it', 'us')).toBe('end-it');
      expect(stripCountrySlug('end-it-us', 'us')).toBe('end-it');
      expect(stripCountrySlug('as-it-is', 'Brighton, United Kingdom')).toBe('as-it-is');
      expect(stripCountrySlug('refused-se')).toBe('refused');
      expect(stripCountrySlug('refused-se', 'Umeå, Sweden')).toBe('refused');

      // Check 1: isCanonicalSeedMatch matches canonical IDs <-> display names & legacy bare slugs without "End It" vs "END" collisions
      expect(isCanonicalSeedMatch('at-the-drive-in-us', ['At the Drive-In'])).toBe(true);
      expect(isCanonicalSeedMatch('At the Drive-In', ['at-the-drive-in-us'])).toBe(true);
      expect(isCanonicalSeedMatch('at-the-drive-in-us', ['at-the-drive-in'])).toBe(true);
      expect(isCanonicalSeedMatch('end-it-us', ['End It'])).toBe(true);
      expect(isCanonicalSeedMatch('End It', ['END'])).toBe(false);
      expect(isCanonicalSeedMatch('end-it-us', ['END'])).toBe(false);
      expect(isCanonicalSeedMatch('end-us', ['end-it'])).toBe(false);
      expect(isCanonicalSeedMatch('Cave In', ['Cave'])).toBe(false);
      expect(isCanonicalSeedMatch('cave-in-us', ['Cave'])).toBe(false);
      expect(isCanonicalSeedMatch('Against Me!', ['Against'])).toBe(false);
    });

    it('2. P1.2 Bidirectional Leading "The " Matching rescues "Murder City Devils" <-> "The Murder City Devils" (#3116895) in Tier 1 (even past a 0-album bare stub) and Tier 3B while guarding "The The" and 1-word uncorroborated names', async () => {
      expect(artistNamesMatchWithOptionalThe('The Murder City Devils', 'Murder City Devils')).toBe(true);
      expect(artistNamesMatchWithOptionalThe('Murder City Devils', 'The Murder City Devils')).toBe(true);
      expect(artistNamesMatchWithOptionalThe('The The', 'The')).toBe(false);
      expect(artistNamesMatchWithOptionalThe('The The', 'The The')).toBe(true);
      expect(artistNamesMatchWithOptionalThe('The Band', 'Band', { requireMultiWordForOptionalThe: true })).toBe(false);
      expect(artistNamesMatchWithOptionalThe('The Who', 'Who', { requireMultiWordForOptionalThe: true })).toBe(false);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Murder%20City%20Devils&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                // 0-album bare stub alongside the real "The Murder City Devils"
                { wrapperType: 'artist', artistId: 99990001, artistName: 'Murder City Devils', primaryGenreName: 'Alternative' },
                { wrapperType: 'artist', artistId: 3116895, artistName: 'The Murder City Devils', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=99990001&entity=album')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        }
        if (url.includes('lookup?id=3116895&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 3116895,
                  collectionId: 3116901,
                  collectionName: 'Empty Bottles, Broken Hearts',
                  primaryGenreName: 'Alternative',
                  releaseDate: '1998-05-05T07:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mcd/empty-bottles/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 3116895,
                  collectionId: 3116902,
                  collectionName: 'In Name and Blood',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2000-06-06T07:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mcd/in-name/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Murder City Devils',
          'artist',
          'Garage Punk',
          'Seattle garage punk band founded in 1996 on Sub Pop.',
          'Seattle, Washington, United States',
          [
            { albumName: 'Empty Bottles, Broken Hearts', releaseYear: '1998' },
            { albumName: 'In Name and Blood', releaseYear: '2000' },
          ],
          'us',
          '1996'
        );
        expect(res.itunesArtistId).toBe(3116895);
        expect(res.imageUrl).toBe('https://is1-ssl.mzstatic.com/mcd/empty-bottles/600x600bb.jpg');
        expect(res.reconciledDiscography.map((d) => d.albumName)).toEqual([
          'Empty Bottles, Broken Hearts',
          'In Name and Blood',
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('3. P1.3 Rule 38 Relaxation & v3 Self-Heal: preserves sanitized text-only discography on Tier 4 miss and self-heals At the Drive-In (#159444) from a v2 empty-discography cache doc', async () => {
      // sanitizeTextOnlyDiscography strips unverified itunesCollectionId and deduplicates
      expect(
        sanitizeTextOnlyDiscography([
          { albumName: 'In/Casino/Out', releaseYear: '1998', itunesCollectionId: 999 },
          { albumName: 'In/Casino/Out', releaseYear: '1998' },
          { albumName: 'Relationship of Command', releaseYear: '2000' },
        ])
      ).toEqual([
        { albumName: 'In/Casino/Out', releaseYear: '1998' },
        { albumName: 'Relationship of Command', releaseYear: '2000' },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        // Because stripCountrySlug("At the Drive-In", "us") preserves "At the Drive-In", iTunes receives the full name!
        if (url.includes('term=At%20the%20Drive-In&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 159444, artistName: 'At the Drive-In', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=159444&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 159444,
                  collectionId: 1440850001,
                  collectionName: 'Acrobatic Tenement',
                  primaryGenreName: 'Alternative',
                  releaseDate: '1997-08-18T07:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/atdi/acrobatic/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 159444,
                  collectionId: 1440850002,
                  collectionName: 'In/Casino/Out',
                  primaryGenreName: 'Alternative',
                  releaseDate: '1998-08-18T07:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/atdi/incasinoout/100x100bb.jpg',
                },
                {
                  wrapperType: 'collection',
                  artistId: 159444,
                  collectionId: 1440850003,
                  collectionName: 'Relationship of Command',
                  primaryGenreName: 'Alternative',
                  releaseDate: '2000-09-12T07:00:00Z',
                  trackCount: 11,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/atdi/roc/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // Simulate v2 poisoned doc with discography: [] and founded: "1994" running $0.00 v3 self-heal
        const res = await scrapeImageUrlBackend(
          'At the Drive-In',
          'artist',
          'Post-Hardcore',
          'El Paso post-hardcore pioneers founded in 1994.',
          'El Paso, Texas, United States',
          [],
          'us',
          '1994'
        );
        expect(res.itunesArtistId).toBe(159444);
        expect(res.imageUrl).toContain('atdi');
        expect(res.reconciledDiscography).toHaveLength(3);
        expect(res.reconciledDiscography.map((d) => d.albumName)).toEqual([
          'Acrobatic Tenement',
          'In/Casino/Out',
          'Relationship of Command',
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('4. P1.4 Tier 3A -> Tier 3B Hostile-Profile Conflation Guard rescues Radon (#75264551) with >=2 verified non-hostile releases while blocking 1-release flukes and stripping Hip-Hop collections', async () => {
      const makeRadonFetchMock = (includeSecondPunkAlbum: boolean) =>
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
          const url = String(input);
          if (url.includes('term=Radon&entity=musicArtist')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  // Conflated Apple Music profile flagged with artist-level 'Hip-Hop/Rap'
                  { wrapperType: 'artist', artistId: 75264551, artistName: 'Radon', primaryGenreName: 'Hip-Hop/Rap' },
                ],
              }),
            } as any;
          }
          if (url.includes('entity=song&limit=15') && url.includes('Radon')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                results: [
                  {
                    wrapperType: 'track',
                    kind: 'song',
                    artistId: 75264551,
                    artistName: 'Radon',
                    collectionId: 75264602,
                    collectionName: 'Gainesville EP',
                    trackName: 'Metric Buttload',
                    primaryGenreName: 'Rock',
                    releaseDate: '1999-06-01T08:00:00Z',
                  },
                ],
              }),
            } as any;
          }
          if (url.includes('lookup?id=75264551&entity=album')) {
            const collections: any[] = [
              {
                wrapperType: 'collection',
                artistId: 75264551,
                collectionId: 75264602,
                collectionName: 'Gainesville EP',
                primaryGenreName: 'Rock',
                releaseDate: '1999-06-01T08:00:00Z',
                trackCount: 6,
                artworkUrl100: 'https://is1-ssl.mzstatic.com/radon/ep/100x100bb.jpg',
              },
              // Conflated Hip-Hop collection on the same artistId
              {
                wrapperType: 'collection',
                artistId: 75264551,
                collectionId: 75264999,
                collectionName: 'Trap Chronicles - Single',
                primaryGenreName: 'Hip-Hop/Rap',
                releaseDate: '2024-01-01T08:00:00Z',
                trackCount: 1,
                artworkUrl100: 'https://is1-ssl.mzstatic.com/radon/trap/100x100bb.jpg',
              },
            ];
            if (includeSecondPunkAlbum) {
              collections.push({
                wrapperType: 'collection',
                artistId: 75264551,
                collectionId: 75264601,
                collectionName: '28',
                primaryGenreName: 'Alternative',
                releaseDate: '1998-01-01T08:00:00Z',
                trackCount: 12,
                artworkUrl100: 'https://is1-ssl.mzstatic.com/radon/28/100x100bb.jpg',
              });
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({ results: collections }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
        });

      // Case A: Conflated profile with >=2 verified non-hostile releases (like Radon #75264551) -> RESCUED, Hip-Hop stripped!
      const spyRescue = makeRadonFetchMock(true);
      try {
        const rescued = await scrapeImageUrlBackend(
          'Radon',
          'artist',
          'Punk Rock',
          'Gainesville, Florida punk rock band on No Idea Records.',
          'Gainesville, Florida, USA',
          [
            { albumName: '28', releaseYear: '1998' },
            { albumName: 'Gainesville EP', releaseYear: '1999' },
          ],
          'us',
          '1991'
        );
        expect(rescued.itunesArtistId).toBe(75264551);
        expect(rescued.imageUrl).toBe('https://is1-ssl.mzstatic.com/radon/28/600x600bb.jpg');
        expect(rescued.reconciledDiscography.map((d) => d.albumName)).toEqual(['28', 'Gainesville EP']);
        expect(rescued.reconciledDiscography.some((d) => d.albumName.includes('Trap'))).toBe(false);
      } finally {
        spyRescue.mockRestore();
      }

      // Case B: Conflated hostile profile with only 1 non-hostile release on the profile -> REJECTED in Tier 3B (<2 required)!
      const spyFluke = makeRadonFetchMock(false);
      try {
        const blockedFluke = await scrapeImageUrlBackend(
          'Radon',
          'artist',
          'Punk Rock',
          'Gainesville, Florida punk rock band on No Idea Records.',
          'Gainesville, Florida, USA',
          [{ albumName: 'Gainesville EP', releaseYear: '1999' }],
          'us',
          '1991'
        );
        expect(blockedFluke.imageUrl).toBeNull();
        expect(blockedFluke.itunesArtistId).toBeNull();
        expect(blockedFluke.reconciledDiscography).toEqual([{ albumName: 'Gainesville EP', releaseYear: '1999' }]);
      } finally {
        spyFluke.mockRestore();
      }
    });

    it('5. P2.5 removes truncated "Post-" and "Proto-" tokens from CANONICAL_STYLES_FLAT', () => {
      expect(CANONICAL_STYLES_FLAT).not.toContain('Post-');
      expect(CANONICAL_STYLES_FLAT).not.toContain('Proto-');
      expect(CANONICAL_STYLES_FLAT).toContain('Midwest');
      expect(CANONICAL_STYLES_FLAT).toContain('Underground');
    });

    it('6. V47.17 Canonical Verified iTunes artistName Adoption & v3 -> v4 Self-Heal: adopts "The Murder City Devils" (#3269301) and "At the Drive-In" (#41990355), skips "Various Artists", rejects Tier 2 geo suffixes ("Klear TH") and multi-artist credits, and gates shouldRunRule38ArtistNameUpgrade strictly on itunesScrapeVersion === 3', async () => {
      // 1. resolveVerifiedItunesArtistDisplayName unit guards
      expect(
        resolveVerifiedItunesArtistDisplayName(
          ['The Murder City Devils', 'Murder City Devils'],
          'Murder City Devils'
        )
      ).toBe('The Murder City Devils');
      expect(
        resolveVerifiedItunesArtistDisplayName(
          ['At the Drive-In'],
          'At The Drive-In'
        )
      ).toBe('At the Drive-In');
      // Skips "Various Artists" on compilation albums and rescues the real track artistName
      expect(
        resolveVerifiedItunesArtistDisplayName(
          ['Various Artists', 'The Murder City Devils'],
          'Murder City Devils'
        )
      ).toBe('The Murder City Devils');
      // Rejects Tier 2 geographic suffix tags ("Klear TH") and multi-artist collaborations
      expect(resolveVerifiedItunesArtistDisplayName(['Klear TH'], 'Klear')).toBeNull();
      expect(resolveVerifiedItunesArtistDisplayName(['Klear', 'Klear TH'], 'Klear')).toBe('Klear');
      expect(
        resolveVerifiedItunesArtistDisplayName(
          ['At the Drive-In & The Mars Volta'],
          'At the Drive-In'
        )
      ).toBeNull();

      // 2. shouldRunRule38ArtistNameUpgrade gates strictly on imaged artist docs at itunesScrapeVersion === 3
      expect(
        shouldRunRule38ArtistNameUpgrade(
          { imageUrl: 'https://is1-ssl.mzstatic.com/mcd/600x600bb.jpg', itunesScrapeVersion: 3 },
          false
        )
      ).toBe(true);
      expect(
        shouldRunRule38ArtistNameUpgrade(
          { imageUrl: 'https://is1-ssl.mzstatic.com/mcd/600x600bb.jpg', itunesScrapeVersion: 4 },
          false
        )
      ).toBe(false);
      expect(
        shouldRunRule38ArtistNameUpgrade(
          { imageUrl: 'not-found', itunesScrapeVersion: 3 },
          false
        )
      ).toBe(false);
      expect(
        shouldRunRule38ArtistNameUpgrade(
          { imageUrl: 'https://is1-ssl.mzstatic.com/mcd/600x600bb.jpg', itunesScrapeVersion: 3 },
          true
        )
      ).toBe(false);

      // 3. End-to-end scrapeImageUrlBackend returns verifiedArtistName: "The Murder City Devils" (#3269301) when queried with "Murder City Devils"
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('term=Murder%20City%20Devils&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 3269301, artistName: 'The Murder City Devils', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }
        if (url.includes('lookup?id=3269301&entity=album')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  wrapperType: 'collection',
                  artistId: 3269301,
                  artistName: 'The Murder City Devils',
                  collectionId: 3116901,
                  collectionName: 'Empty Bottles, Broken Hearts',
                  primaryGenreName: 'Alternative',
                  releaseDate: '1998-05-05T07:00:00Z',
                  trackCount: 10,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/mcd/empty-bottles/100x100bb.jpg',
                },
              ],
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        const res = await scrapeImageUrlBackend(
          'Murder City Devils',
          'artist',
          'Garage Punk',
          'Seattle garage punk band founded in 1996 on Sub Pop.',
          'Seattle, Washington, United States',
          [{ albumName: 'Empty Bottles, Broken Hearts', releaseYear: '1998' }],
          'us',
          '1996'
        );
        expect(res.itunesArtistId).toBe(3269301);
        expect(res.verifiedArtistName).toBe('The Murder City Devils');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('7. V47.18 Pillar A (resolveItunesCanonicalArtistNameBackend): snaps "Murder City Devils" -> "The Murder City Devils" (#3269301) and "At The Drive In" -> "At the Drive-In" (#41990355), enforces Pass 1 exact-match priority ("Supersuckers" / "Deftones"), routes regional storefronts first, and fails open on DIY misses or timeouts', async () => {
      const queriedUrls: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        queriedUrls.push(url);

        // 1. "Murder City Devils" -> returns "The Murder City Devils" (#3269301) in primary payload
        if (url.includes('term=Murder%20City%20Devils&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 3269301, artistName: 'The Murder City Devils', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }

        // 2. "At The Drive In" -> Pass 1 exact norm match ("atthedrivein") returns "At the Drive-In" (#41990355)
        if (url.includes('term=At%20The%20Drive%20In&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 41990355, artistName: 'At the Drive-In', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }

        // 3. "Supersuckers" -> Pass 1 exact norm match ("supersuckers") takes priority over a "The Supersuckers" row
        if (url.includes('term=Supersuckers&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 999999, artistName: 'The Supersuckers', primaryGenreName: 'Rock' },
                { wrapperType: 'artist', artistId: 158101, artistName: 'Supersuckers', primaryGenreName: 'Rock' },
              ],
            }),
          } as any;
        }

        // 4. "Klear" (Bangkok, Thailand) -> Regional storefront &country=TH queried first
        if (url.includes('term=Klear&entity=musicArtist&limit=15&country=TH')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 571882910, artistName: 'Klear', primaryGenreName: 'Alternative' },
              ],
            }),
          } as any;
        }

        // 5. Hostile genre rejection (Hip-Hop artist returned for Hardcore Punk query)
        if (url.includes('term=Hostile%20Homonym&entity=musicArtist')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 777777, artistName: 'The Hostile Homonym', primaryGenreName: 'Hip-Hop/Rap' },
              ],
            }),
          } as any;
        }

        return { ok: true, status: 200, json: async () => ({ results: [] }) } as any;
      });

      try {
        // Case A: Snaps "Murder City Devils" -> "The Murder City Devils"
        const mcd = await resolveItunesCanonicalArtistNameBackend(
          'Murder City Devils',
          'Garage Rock',
          'USA',
          'American garage punk band from Seattle.'
        );
        expect(mcd).toBe('The Murder City Devils');

        // Case B: Snaps "At The Drive In" -> "At the Drive-In"
        const atdi = await resolveItunesCanonicalArtistNameBackend(
          'At The Drive In',
          'Post-Hardcore',
          'USA',
          'El Paso post-hardcore band.'
        );
        expect(atdi).toBe('At the Drive-In');

        // Case C: Pass 1 exact-match priority preserves "Supersuckers" (never flips to "The Supersuckers")
        const supersuckers = await resolveItunesCanonicalArtistNameBackend(
          'Supersuckers',
          'Garage Punk',
          'USA',
          'Tucson/Seattle cowpunk and garage rock band.'
        );
        expect(supersuckers).toBe('Supersuckers');
        expect(queriedUrls.some((u) => u.includes('term=The%20Supersuckers'))).toBe(false);

        // Case D: Regional storefront priority (&country=TH)
        queriedUrls.length = 0;
        const klear = await resolveItunesCanonicalArtistNameBackend(
          'Klear',
          'Alternative Rock',
          'Bangkok, Thailand',
          'Thai alternative rock band.'
        );
        expect(klear).toBe('Klear');
        expect(queriedUrls[0]).toContain('&country=TH');

        // Case E: Hostile genre rejected -> returns null (fail-open to Flash)
        const hostile = await resolveItunesCanonicalArtistNameBackend(
          'Hostile Homonym',
          'Hardcore Punk',
          'USA',
          'American hardcore punk band.'
        );
        expect(hostile).toBeNull();

        // Case F: Underground DIY band absent from iTunes -> returns null cleanly
        const diy = await resolveItunesCanonicalArtistNameBackend(
          'Certain People I Know',
          'Emo',
          'USA',
          '90s underground DIY emo band.'
        );
        expect(diy).toBeNull();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});

import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  scrapeImageUrlBackend,
  reconcileDiscographyWithITunes,
  cleanCollectionTitle,
  evaluateGenreMatch,
  evaluateGenreDistanceScore,
  isAppleElectronicHardcoreGenre,
  passesUncorroboratedEraGate,
  COMPILATION_COLLECTION_RE,
  selectBestArtistArtwork,
  CURRENT_ITUNES_SCRAPE_VERSION,
  shouldRunRule38NotFoundUpgrade
} from '../src/services/curatorService';

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
        // Supply 4 non-generic albums to verify Tier 3B strictly caps at 3 queries
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
            { albumName: 'Fourth Release Beyond Cap', releaseYear: '2024' },
          ],
          'us',
          '2021'
        );

        expect(songQueries.length).toBe(3);
        expect(songQueries.some((u) => u.includes('Fourth%20Release'))).toBe(false);
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
        expect(rejected).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
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
        expect(ambigResult).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
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
        expect(uncorroboratedResult).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('5. Step 2 itunesScrapeVersion: 2 one-time $0.00 upgrade runs once for anchored legacy not-found artists, never loops, and leaves healOrphanedAsset untouched', () => {
      expect(CURRENT_ITUNES_SCRAPE_VERSION).toBe(2);

      // Legacy artist doc with not-found and valid founded year (or qualifying discography) -> eligible
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [], details: { founded: '2021' } }, false)).toBe(true);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 1, details: { founded: '1993' } }, false)).toBe(true);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [{ albumName: 'The Last Laugh', releaseYear: '2023' }] }, false)).toBe(true);

      // Unanchored legacy doc with empty discography AND missing founded year -> strictly bypassed (V47.9)
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', discography: [] }, false)).toBe(false);
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 1, details: { founded: 'Unknown' } }, false)).toBe(false);

      // Already stamped v2 -> strictly bypassed (no repeat scraping on genuinely unindexed underground bands)
      expect(shouldRunRule38NotFoundUpgrade({ imageUrl: 'not-found', itunesScrapeVersion: 2, details: { founded: '2021' } }, false)).toBe(false);

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
        expect(oneMatchRes).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
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
        expect(shortEpRes).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
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
        expect(singleDriftRes).toEqual({ imageUrl: null, reconciledDiscography: [], itunesArtistId: null });
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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ISO_TO_COUNTRY_NAME,
  extractCountrySlug,
  extractTrailingCountryIso,
  stripCountrySlug,
  doesOriginMatchExpectedIso,
  areCountryIsosCompatible,
  canonicalizeArtistSlugWithOrigin,
  shouldAdoptCanonicalSlugCandidate,
  inferNodeOriginsFromCountryLinks,
  inspectSlugDedupAmbiguity,
  isEntitySeedMatch,
} from '../../shared/isoCountries';
import {
  buildDisambiguationSnippet,
  upsertBareRouterStub,
} from '../src/services/routerStubService';
import {
  isFullyQualifiedEntityProfile,
  qualifyCacheEntry,
} from '../../services/cacheQualification';
import {
  resolveArtistAudioPreview,
  clearPreviewMemoryCacheForTests,
} from '../../services/itunesPreviewService';
import {
  resolveSceneContextNodes,
  buildHydrationIdentityLockBlock,
  scrapeImageUrlBackend,
  normalizeGenreText,
  evaluateGenreMatch,
  isAppleElectronicHardcoreGenre,
  isCatalogCorroboratedNonHostileGenre,
} from '../src/services/curatorService';

describe('Architecture V42: Global 249-Country ISO-3166 Registry & End-to-End Disambiguation Lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewMemoryCacheForTests();
  });

  describe('1. Unified 249-Country ISO-3166-1 Alpha-2 Slugging ([Rule 2] & [Rule 36])', () => {
    it('contains all 249 official ISO-3166-1 alpha-2 country entries', () => {
      const keys = Object.keys(ISO_TO_COUNTRY_NAME);
      expect(keys.length).toBe(249);
      for (const code of keys) {
        expect(code).toMatch(/^[a-z]{2}$/);
      }
    });

    it('resolves Thailand and Thai cities strictly to 2-letter "th" (never "thailand")', () => {
      expect(extractCountrySlug('Thailand')).toBe('th');
      expect(extractCountrySlug('Bangkok, Thailand')).toBe('th');
      expect(extractCountrySlug('Chiang Mai, Thailand')).toBe('th');
      expect(extractCountrySlug('Nonthaburi, Thailand')).toBe('th');
      expect(extractCountrySlug('Thai')).toBe('th');
      expect(extractCountrySlug('Thailand')).not.toBe('thailand');
    });

    it('guarantees every one of the 249 ISO countries resolves to a strict 2-letter code and NEVER a full country word', () => {
      for (const [iso, countryName] of Object.entries(ISO_TO_COUNTRY_NAME)) {
        const resolved = extractCountrySlug(countryName);
        expect(resolved).toBe(iso);
        expect(resolved.length).toBe(2);
      }

      // Unrecognized / empty strings strictly resolve to 'global', never a raw word slug
      expect(extractCountrySlug('')).toBe('global');
      expect(extractCountrySlug(undefined)).toBe('global');
      expect(extractCountrySlug('Unknown')).toBe('global');
      expect(extractCountrySlug('Atlantis, Unknown Planet')).toBe('global');
    });

    it('resolves global scenes across Southeast Asia, Europe, Latin America, Africa, and UK constituent nations', () => {
      expect(extractCountrySlug('Jakarta, Indonesia')).toBe('id');
      expect(extractCountrySlug('Manila, Philippines')).toBe('ph');
      expect(extractCountrySlug('Kuala Lumpur, Malaysia')).toBe('my');
      expect(extractCountrySlug('Singapore')).toBe('sg');
      expect(extractCountrySlug('Ho Chi Minh City, Vietnam')).toBe('vn');
      expect(extractCountrySlug('Taipei, Taiwan')).toBe('tw');
      expect(extractCountrySlug('Poreč, Croatia')).toBe('hr');
      expect(extractCountrySlug('Würzburg, Germany')).toBe('de');
      expect(extractCountrySlug('Glasgow, Scotland')).toBe('gb');
      expect(extractCountrySlug('Cardiff, Wales')).toBe('gb');
      expect(extractCountrySlug('Belfast, Northern Ireland')).toBe('gb');
      expect(extractCountrySlug('Dublin, Ireland')).toBe('ie');
      expect(extractCountrySlug('La Calamine, Belgium / Kelmis, Germany')).toBe('be');
      expect(extractCountrySlug('Albuquerque, New Mexico')).toBe('us');
      expect(extractCountrySlug('Mexico City, Mexico')).toBe('mx');
      expect(extractCountrySlug('Lagos, Nigeria')).toBe('ng');
    });

    it('extracts trailing ISO codes and recovers legacy full-country-word suffixes while preserving band names like "End It"', () => {
      expect(extractTrailingCountryIso('klear-th')).toBe('th');
      expect(extractTrailingCountryIso('klear-thailand')).toBe('th');
      expect(extractTrailingCountryIso('architects-uk')).toBe('gb');
      expect(extractTrailingCountryIso('mogwai-scotland')).toBe('gb');
      expect(extractTrailingCountryIso('End It')).toBeNull();

      expect(stripCountrySlug('End It')).toBe('End It');
      expect(stripCountrySlug('klear-th')).toBe('klear');
      expect(stripCountrySlug('klear-thailand')).toBe('klear');
      expect(stripCountrySlug('no-more-tear-thailand')).toBe('no-more-tear');

      expect(canonicalizeArtistSlugWithOrigin('end-it', 'Baltimore, MD, USA')).toBe('end-it-us');
      expect(canonicalizeArtistSlugWithOrigin('klear', 'Thailand')).toBe('klear-th');
      expect(canonicalizeArtistSlugWithOrigin('klear-thailand', 'Bangkok, Thailand')).toBe('klear-th');
      expect(canonicalizeArtistSlugWithOrigin('architects-uk', 'Brighton, UK')).toBe('architects-gb');
    });

    it('isEntitySeedMatch Base-to-Suffixed ISO Parity Inoculation protects bands ending in ISO-like tokens (Vein.fm, End It) while rejecting conflicting country homonyms', () => {
      // Base-to-Suffixed parity ([Rule 2] & [Rule 36]):
      expect(isEntitySeedMatch('vein-fm', 'vein-fm-us')).toBe(true);
      expect(isEntitySeedMatch('Vein.fm', 'vein-fm-us')).toBe(true);
      expect(isEntitySeedMatch('vein-fm-us', 'vein-fm')).toBe(true);
      expect(isEntitySeedMatch('end-it', 'end-it-us')).toBe(true);
      expect(isEntitySeedMatch('End It', 'end-it-us')).toBe(true);
      expect(isEntitySeedMatch('end-it-us', 'end-it')).toBe(true);
      expect(isEntitySeedMatch('klear', 'klear-th')).toBe(true);
      expect(isEntitySeedMatch('klear-th', 'klear')).toBe(true);

      // Conflicting country homonyms are strictly rejected:
      expect(isEntitySeedMatch('klear-th', 'klear-us')).toBe(false);
      expect(isEntitySeedMatch('drain-us', 'drain-se')).toBe(false);
      expect(isEntitySeedMatch('paradox-th', 'paradox-de')).toBe(false);
      expect(isEntitySeedMatch('kala-th', 'kala-hr')).toBe(false);
    });
  });

  describe('2. Origin-Suffix Parity Across Gates B, C & D ([Rule 8], [Rule 17], [Rule 39], [Rule 40])', () => {
    it('doesOriginMatchExpectedIso rejects Buffalo NY US homonym for klear-th and accepts Bangkok Thailand', () => {
      expect(doesOriginMatchExpectedIso('Buffalo, New York, USA', 'klear-th')).toBe(false);
      expect(doesOriginMatchExpectedIso('Buffalo, New York, USA', 'th')).toBe(false);
      expect(doesOriginMatchExpectedIso('Buffalo, New York, USA', 'klear-thailand')).toBe(false);
      expect(doesOriginMatchExpectedIso('Würzburg, Germany', 'paradox-th')).toBe(false);
      expect(doesOriginMatchExpectedIso('Poreč, Croatia', 'kala-th')).toBe(false);

      expect(doesOriginMatchExpectedIso('Bangkok, Thailand', 'klear-th')).toBe(true);
      expect(doesOriginMatchExpectedIso('Thailand', 'klear-th')).toBe(true);
      expect(doesOriginMatchExpectedIso('La Calamine, Belgium / Kelmis, Germany', 'nasty-be')).toBe(true);
      expect(doesOriginMatchExpectedIso('La Calamine, Belgium / Kelmis, Germany', 'de')).toBe(true);

      // Bare artist ID without country suffix (e.g. Scottish band "Texas") must NOT be misclassified as US state
      expect(doesOriginMatchExpectedIso('Glasgow, Scotland', 'texas')).toBe(true);
    });

    it('Gate B: isFullyQualifiedEntityProfile and qualifyCacheEntry reject foreign homonym contamination', () => {
      const contaminatedUsKlearProfile = {
        summary: 'Klear is an American post-grunge and hard rock band formed in Buffalo, New York in 1998, known for 7500 Miles.',
        recommendationReason: 'Delivers riff-driven late-90s American post-grunge energy.',
        details: {
          artist: 'Klear',
          genre: 'Hard Rock / Alternative Metal',
          style: 'Riff-Driven',
          origin: 'Buffalo, New York, USA',
          founded: '1998',
        },
        discography: [{ title: '7500 Miles', year: '2002' }],
        imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/klear-us.jpg',
      };

      const authenticThaiKlearProfile = {
        summary: 'Klear is an acclaimed Thai alternative and pop-rock band signed to Genie Records in Bangkok, led by vocalist Pat Rannaphan.',
        recommendationReason: 'Defines modern Thai emotional rock with soaring vocals and stadium-scale arrangements.',
        details: {
          artist: 'Klear',
          genre: 'Alternative Rock',
          style: 'Anthemic',
          origin: 'Bangkok, Thailand',
          founded: '2005',
        },
        discography: [{ title: 'Stay Alive', year: '2008' }],
        imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/klear-th.jpg',
      };

      expect(isFullyQualifiedEntityProfile(contaminatedUsKlearProfile, false, 'klear-th')).toBe(false);
      expect(isFullyQualifiedEntityProfile(authenticThaiKlearProfile, false, 'klear-th')).toBe(true);

      const poisonedFirestoreDoc = {
        artistId: 'klear',
        cacheKey: 'klear-th',
        synthesisRationale: 'Klear anchors the Bangkok Genie Records modern Thai rock movement alongside Bodyslam and Potato.',
        graphData: JSON.stringify({
          nodes: [
            { id: 'klear-th', type: 'artist', label: 'Klear' },
            { id: 'genie', type: 'label', label: 'Genie' },
          ],
          links: [{ source: 'klear-th', target: 'genie', weight: 0.9 }],
        }),
        detailsCache: contaminatedUsKlearProfile,
      };

      const verdict = qualifyCacheEntry(poisonedFirestoreDoc, 'klear-th');
      expect(verdict.verdict).toBe('STUB');
      expect(verdict.isStructurallyUsable).toBe(false);
      expect(verdict.isFullyQualified).toBe(false);
      expect(verdict.missing).toContain('originMismatch');
    });
  });

  describe('3. Cross-Homonym Slug Deduplication Protection ([Rule 2], [Rule 9], [Rule 10])', () => {
    it('protects paradox-th from adopting German thrash metal homonym paradox-de', () => {
      const germanParadoxData = {
        artistId: 'paradox',
        cacheKey: 'paradox-de',
        detailsCache: {
          details: { artist: 'Paradox', origin: 'Würzburg, Germany', genre: 'Thrash Metal' },
        },
      };

      const thaiParadoxData = {
        artistId: 'paradox',
        cacheKey: 'paradox-th',
        detailsCache: {
          details: { artist: 'Paradox', origin: 'Bangkok, Thailand', genre: 'Alternative Rock' },
        },
      };

      expect(areCountryIsosCompatible('th', 'de')).toBe(false);
      expect(shouldAdoptCanonicalSlugCandidate('th', 'paradox-de', germanParadoxData, 'paradox')).toBe(false);
      expect(shouldAdoptCanonicalSlugCandidate('th', 'paradox-th', thaiParadoxData, 'paradox')).toBe(true);
    });

    it('rejects stubs, legacy full-word suffixes (-thailand), -uk slugs, and prefix-collision artists (kala vs kalapana-us)', () => {
      // Stub immunity (Rule 10)
      expect(
        shouldAdoptCanonicalSlugCandidate('th', 'paradox', { _isStub: true, isAmbiguous: true, redirectTo: null }, 'paradox')
      ).toBe(false);
      expect(
        shouldAdoptCanonicalSlugCandidate('th', 'bodyslam', { _isStub: true, redirectTo: 'bodyslam-th' }, 'bodyslam')
      ).toBe(false);

      // Legacy full-country-word suffix rejection
      expect(
        shouldAdoptCanonicalSlugCandidate(
          'th',
          'bodyslam-thailand',
          { artistId: 'bodyslam', detailsCache: { details: { origin: 'Bangkok, Thailand' } } },
          'bodyslam'
        )
      ).toBe(false);

      // Non-ISO -uk rejection
      expect(
        shouldAdoptCanonicalSlugCandidate(
          'gb',
          'architects-uk',
          { artistId: 'architects', detailsCache: { details: { origin: 'Brighton, UK' } } },
          'architects'
        )
      ).toBe(false);

      // Prefix collision: querying bare 'kala' in range [kala, kala\uf8ff] must NOT adopt 'kalapana-us'
      expect(
        shouldAdoptCanonicalSlugCandidate(
          null,
          'kalapana-us',
          { artistId: 'kalapana', detailsCache: { details: { origin: 'Honolulu, Hawaii, USA' } } },
          'kala'
        )
      ).toBe(false);

      // Self-contradictory doc: klear-th containing US Buffalo origin must be rejected
      expect(
        shouldAdoptCanonicalSlugCandidate(
          'th',
          'klear-th',
          { artistId: 'klear', detailsCache: { details: { origin: 'Buffalo, New York, USA' } } },
          'klear'
        )
      ).toBe(false);
    });
  });

  describe('4. Scene Context Resolution (tempNode.id) & Mandatory Identity Lock ([Rule 8] & [Rule 40])', () => {
    it('resolves connected scene peers via canonical suffixed tempNode.id while rendering clean display names', () => {
      const graphData = {
        nodes: [
          { id: 'klear-th', label: 'Klear', type: 'artist' as const, group: 1 },
          { id: 'genie', label: 'Genie', type: 'label' as const, group: 2 },
          { id: 'bodyslam-th', label: 'Bodyslam', type: 'artist' as const, group: 2 },
          { id: 'potato-th', label: 'potato-th', type: 'artist' as const, group: 2 },
        ],
        links: [
          { source: 'klear-th', target: 'genie', value: 0.9, weight: 0.9 },
          { source: 'klear-th', target: 'bodyslam-th', value: 0.8, weight: 0.8 },
          { source: 'potato-th', target: 'klear-th', value: 0.7, weight: 0.7 },
        ],
      };

      // Broken pre-V42 tempNode with bare display name as id matched ZERO links
      const legacyBrokenTempNode = { id: 'Klear', label: 'Klear', type: 'artist' as const, group: 1 };
      expect(resolveSceneContextNodes(legacyBrokenTempNode, graphData)).toBe('');

      // Fixed V42 tempNode with canonical entityObj.id matches all 3 links and strips -th from labels
      const fixedTempNode = { id: 'klear-th', label: 'Klear', type: 'artist' as const, group: 1 };
      const contextStr = resolveSceneContextNodes(fixedTempNode, graphData);
      expect(contextStr).toBe('Genie (label), Bodyslam (artist), Potato (artist)');
    });

    it('builds MANDATORY IDENTITY LOCK prompt block from locked origin, countryIso, and genreHint', () => {
      const block = buildHydrationIdentityLockBlock('Klear', 'artist', {
        originHint: 'Thailand',
        countryIso: 'th',
        genreHint: 'Alternative Rock',
      });

      expect(block).toContain('Thailand (ISO: TH)');
      expect(block).toContain('Alternative Rock');
      expect(block).toContain('MANDATORY IDENTITY LOCK (ZERO FOREIGN HOMONYMS)');
      expect(block).toContain('STRICTLY FORBIDDEN');
    });
  });

  describe('5. Regional iTunes Storefront Routing ([Rule 35] & [Rule 38])', () => {
    it('scrapeImageUrlBackend queries &country=TH first for Thai artists before falling back to US storefront', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('entity=musicArtist') && url.includes('country=TH')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  artistId: 571882910,
                  artistName: 'Klear',
                  primaryGenreName: 'Alternative',
                },
              ],
            }),
          };
        }
        if (url.includes('lookup?id=571882910') && url.includes('country=TH')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 571882910, artistName: 'Klear' },
                {
                  wrapperType: 'collection',
                  collectionType: 'Album',
                  artistId: 571882910,
                  collectionName: 'Stay Alive',
                  releaseDate: '2008-05-01T07:00:00Z',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/klear-stay-alive/100x100bb.jpg',
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({ results: [] }) };
      });
      global.fetch = fetchMock as any;

      const result = await scrapeImageUrlBackend(
        'Klear',
        'artist',
        'Alternative Rock',
        'Thai alternative rock band on Genie Records.',
        'Bangkok, Thailand',
        [{ albumName: 'Stay Alive', releaseYear: '2008' }],
        'th'
      );

      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toContain('&country=TH');
      expect(result.itunesArtistId).toBe(571882910);
      expect(result.imageUrl).toContain('600x600bb.jpg');
    });

    it('resolveArtistAudioPreview queries regional storefront first for non-US artists and falls back to US storefront on empty regional result', async () => {
      const fetchMock = vi
        .fn()
        // Regional TH storefront returns empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        })
        // Fallback US storefront returns preview track
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                wrapperType: 'track',
                kind: 'song',
                artistId: 301727614,
                trackName: 'Khwam Chuea',
                collectionName: 'Save My Life',
                previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/bodyslam.m4a',
              },
            ],
          }),
        });
      global.fetch = fetchMock as any;

      const preview = await resolveArtistAudioPreview(301727614, undefined, 'th');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain('&country=TH');
      expect(fetchMock.mock.calls[1][0]).not.toContain('&country=');
      expect(preview?.previewTrackName).toBe('Khwam Chuea');
    });
  });

  describe('6. V42.1 Deep-Cut Scene Homonym Guard & Evolved Router Stub Snippets', () => {
    it('inferNodeOriginsFromCountryLinks stamps origin onto artist and label nodes linked to country nodes while ignoring band names like "Japan"', () => {
      const nodes: any[] = [
        { id: 'klear-th', label: 'Klear', type: 'artist', origin: 'Thailand', group: 1 },
        { id: 'paradox', label: 'Paradox', type: 'artist', group: 1 },
        { id: 'genie', label: 'Genie', type: 'label', group: 1 },
        { id: 'japan', label: 'Japan', type: 'artist', group: 2 },
        { id: 'david-sylvian', label: 'David Sylvian', type: 'artist', group: 2 },
        { id: 'thailand', label: 'Thailand', type: 'country', group: 1 },
      ];
      const links = [
        { source: 'paradox', target: 'thailand' },
        { source: 'thailand', target: 'genie' },
        { source: 'david-sylvian', target: 'japan' }, // artist-to-artist link, NOT country!
      ];

      const count = inferNodeOriginsFromCountryLinks(nodes, links);
      expect(count).toBe(2);
      expect(nodes.find(n => n.id === 'paradox')?.origin).toBe('Thailand');
      expect(canonicalizeArtistSlugWithOrigin('paradox', nodes.find(n => n.id === 'paradox')?.origin)).toBe('paradox-th');
      expect(nodes.find(n => n.id === 'genie')?.origin).toBe('Thailand');
      // Artist "David Sylvian" linked to band "Japan" (type: 'artist') must NOT get origin: "Japan"
      expect(nodes.find(n => n.id === 'david-sylvian')?.origin).toBeUndefined();
    });

    it('blocks un-suffixed deep cuts from adopting foreign cached homonyms (paradox-de in a Thai scene) or ambiguous multi-ISO siblings', () => {
      const germanParadoxDoc = {
        id: 'paradox-de',
        data: {
          artistId: 'paradox',
          cacheKey: 'paradox-de',
          detailsCache: { details: { origin: 'Würzburg, Germany', genre: 'Thrash Metal' } },
        },
      };
      const thaiBodyslamDoc = {
        id: 'bodyslam-th',
        data: {
          artistId: 'bodyslam',
          cacheKey: 'bodyslam-th',
          detailsCache: { details: { origin: 'Bangkok, Thailand', genre: 'Rock' } },
        },
      };

      // Deep cut with expectedIso === null inside a Thai scene (`sceneAnchorIsos: ['th']`)
      // MUST reject paradox-de while still adopting bodyslam-th!
      expect(
        shouldAdoptCanonicalSlugCandidate(null, germanParadoxDoc.id, germanParadoxDoc.data, 'paradox', {
          sceneAnchorIsos: ['th'],
          hasAmbiguousSibling: false,
          isSeed: false,
        })
      ).toBe(false);

      expect(
        shouldAdoptCanonicalSlugCandidate(null, thaiBodyslamDoc.id, thaiBodyslamDoc.data, 'bodyslam', {
          sceneAnchorIsos: ['th'],
          hasAmbiguousSibling: false,
          isSeed: false,
        })
      ).toBe(true);

      // Multi-ISO collision detection via inspectSlugDedupAmbiguity
      const thaiParadoxDoc = {
        id: 'paradox-th',
        data: {
          artistId: 'paradox',
          cacheKey: 'paradox-th',
          detailsCache: { details: { origin: 'Bangkok, Thailand', genre: 'Alternative Rock' } },
        },
      };
      expect(inspectSlugDedupAmbiguity([germanParadoxDoc, thaiParadoxDoc], 'paradox')).toBe(true);
      expect(
        shouldAdoptCanonicalSlugCandidate(null, thaiParadoxDoc.id, thaiParadoxDoc.data, 'paradox', {
          hasAmbiguousSibling: true,
          isSeed: false,
        })
      ).toBe(false);
    });

    it('upsertBareRouterStub upgrades single-pointer homonyms to isAmbiguous: true and preserves/backfills disambiguationSnippet', async () => {
      const store = new Map<string, any>();
      const fakeDb: any = {
        collection: (coll: string) => ({
          doc: (docId: string) => ({
            get: async () => ({
              exists: store.has(`${coll}/${docId}`),
              data: () => store.get(`${coll}/${docId}`),
            }),
            set: async (payload: any, opts?: { merge?: boolean }) => {
              const key = `${coll}/${docId}`;
              const prev = opts?.merge ? store.get(key) || {} : {};
              store.set(key, { ...prev, ...payload });
            },
          }),
        }),
      };

      // 1. First homonym (paradox-de) mints single-pointer stub with snippet
      await upsertBareRouterStub(fakeDb, 'paradox', 'paradox-de', {
        name: 'Paradox',
        origin: 'Germany',
        genre: 'Thrash Metal',
        summary: '**Paradox** is a veteran German thrash metal band formed in Würzburg in 1986. Known for Product of Imagination.',
      });
      const step1 = store.get('artists/paradox');
      expect(step1._isStub).toBe(true);
      expect(step1.isAmbiguous).toBe(false);
      expect(step1.redirectTo).toBe('paradox-de');
      expect(step1.candidates[0].disambiguationSnippet).toBe(
        'Paradox is a veteran German thrash metal band formed in Würzburg in 1986.'
      );

      // 2. Second homonym (paradox-th) upgrades artists/paradox to Evolved Ambiguous Stub preserving both snippets
      await upsertBareRouterStub(fakeDb, 'paradox', 'paradox-th', {
        name: 'Paradox',
        origin: 'Bangkok, Thailand',
        genre: 'Alternative Rock',
        summary: 'Paradox is an iconic Thai alternative rock band known for surreal theatrical live shows.',
      });
      const step2 = store.get('artists/paradox');
      expect(step2._isStub).toBe(true);
      expect(step2.isAmbiguous).toBe(true);
      expect(step2.redirectTo).toBeNull();
      expect(step2.candidates).toHaveLength(2);
      expect(step2.candidates[0].id).toBe('paradox-de');
      expect(step2.candidates[0].disambiguationSnippet).toContain('German thrash metal');
      expect(step2.candidates[1].id).toBe('paradox-th');
      expect(step2.candidates[1].disambiguationSnippet).toContain('iconic Thai alternative rock band');

      // 3. Backfills missing disambiguationSnippet on an existing ambiguous candidate (klear-th case)
      store.set('artists/klear', {
        _isStub: true,
        isAmbiguous: true,
        redirectTo: null,
        candidates: [
          {
            id: 'klear-us',
            name: 'Klear',
            origin: 'USA',
            genre: 'Post-Grunge',
            disambiguationSnippet: 'American post-grunge band from Buffalo, New York.',
          },
          {
            id: 'klear-th',
            name: 'Klear',
            origin: 'Thailand',
            genre: 'Pop Rock',
          },
        ],
      });

      await upsertBareRouterStub(fakeDb, 'klear', 'klear-th', {
        name: 'Klear',
        origin: 'Bangkok, Thailand',
        genre: 'Pop Rock',
        summary: '**Klear** is a prominent Thai pop-rock band signed to Genie Records in Bangkok.',
      });

      const klearStub = store.get('artists/klear');
      expect(klearStub.isAmbiguous).toBe(true);
      expect(klearStub.candidates).toHaveLength(2);
      expect(klearStub.candidates[0].disambiguationSnippet).toBe('American post-grunge band from Buffalo, New York.');
      expect(klearStub.candidates[1].disambiguationSnippet).toBe(
        'Klear is a prominent Thai pop-rock band signed to Genie Records in Bangkok.'
      );
      expect(buildDisambiguationSnippet({ genre: 'Pop Rock', origin: 'Thailand' })).toBe('Pop Rock act from Thailand.');
    });
  });

  describe('7. V47.13 Canonical Band-Name Resolution (Leading "The " Restoration), Collision Guard & Router-Stub Keying', () => {
    it('(a) enforces official leading "The " restoration, non-"The " preservation, and erroneous "The " stripping in SEED_VALIDATION_SCHEMA and validateSeedOriginBackend prompt', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const curatorSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/curatorService.ts'), 'utf8');

      // Schema & Prompt Rule 1 locks:
      expect(curatorSrc).toContain('CANONICAL NAME, SPELLING & OFFICIAL ARTICLE NORMALIZATION (MANDATORY)');
      expect(curatorSrc).toContain('OFFICIAL LEADING "THE " RESTORATION');
      expect(curatorSrc).toContain('"Rocking Horse Winner" -> "The Rocking Horse Winner"');
      expect(curatorSrc).toContain('"Get Up Kids" -> "The Get Up Kids"');
      expect(curatorSrc).toContain('STRICT NON-"THE" PRESERVATION');
      expect(curatorSrc).toContain('"Pixies", "Ramones", "Talking Heads", "Deftones", "Fugazi", "Quicksand", "Snapcase"');
      expect(curatorSrc).toContain('"The Pixies" -> "Pixies"');
      expect(curatorSrc).toContain('"The Deftones" -> "Deftones"');
    });

    it('(b) multi-candidate "The X" vs. "X" or cross-country homonym collisions and case-only inputs ("void" -> "Void") avoid false correctedInput: true while colliding typos ("nrvana" -> "Nirvana") preserve correctedInput: true', () => {
      const enforcePreFlightCanonicalCorrection = (
        seed: string,
        validationResult: { isValid: boolean; hasCollision?: boolean; id: string; correctedInput: boolean }
      ) => {
        const isCaseInsensitiveMatch =
          String(seed).trim().toLowerCase() === String(validationResult.id || '').trim().toLowerCase();
        if (!validationResult.isValid || isCaseInsensitiveMatch) {
          validationResult.correctedInput = false;
        } else if (!validationResult.hasCollision && Boolean(String(validationResult.id || '').trim())) {
          validationResult.correctedInput = true;
        }
        return validationResult;
      };

      // 1. Single-artist dropped leading "The " -> sets correctedInput: true
      const singleRestored = enforcePreFlightCanonicalCorrection('Rocking Horse Winner', {
        isValid: true,
        hasCollision: false,
        id: 'The Rocking Horse Winner',
        correctedInput: false,
      });
      expect(singleRestored.correctedInput).toBe(true);

      // 2. Single-artist stripped erroneous leading "The " -> sets correctedInput: true
      const singleStripped = enforcePreFlightCanonicalCorrection('The Deftones', {
        isValid: true,
        hasCollision: false,
        id: 'Deftones',
        correctedInput: false,
      });
      expect(singleStripped.correctedInput).toBe(true);

      // 3. Multi-candidate homonym collision (e.g. "Darko" -> primary "Darko US" + collision "Darko" [UK]) -> does NOT force correctedInput: true
      const multiCollision = enforcePreFlightCanonicalCorrection('Darko', {
        isValid: true,
        hasCollision: true,
        id: 'Darko US',
        correctedInput: false,
      });
      expect(multiCollision.correctedInput).toBe(false);

      // 4. Case-only match ("void" -> "Void", "The hives" -> "The Hives") -> forces correctedInput: false even if Flash returned true
      const caseOnlyVoid = enforcePreFlightCanonicalCorrection('void', {
        isValid: true,
        hasCollision: false,
        id: 'Void',
        correctedInput: true,
      });
      expect(caseOnlyVoid.correctedInput).toBe(false);

      // 5. Genuine typo on a colliding band name ("nrvana" -> "Nirvana", hasCollision: true, Flash correctedInput: true) -> preserves correctedInput: true
      const collidingTypo = enforcePreFlightCanonicalCorrection('nrvana', {
        isValid: true,
        hasCollision: true,
        id: 'Nirvana',
        correctedInput: true,
      });
      expect(collidingTypo.correctedInput).toBe(true);
    });

    it('(c) V47.19 Read-Only Pre-Flight & Post-Confirmation Router-Stub Keying: validateSeedOriginCallable writes zero speculative stubs to /artists while post-confirmation upsertBareRouterStub keys strictly by canonicalBareNormId', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const pipelineSrc = fs.readFileSync(path.resolve(__dirname, '../src/executeCurationPipeline.ts'), 'utf8');
      const preFlightCallableSlice = pipelineSrc.split('export const validateSeedOriginCallable')[1] || '';

      // validateSeedOriginCallable MUST NOT write speculative stubs to /artists before user confirmation in Box 4
      expect(preFlightCallableSlice).not.toContain('upsertBareRouterStub(');
      expect(preFlightCallableSlice).not.toContain('stubDocRef.set(');
      expect(preFlightCallableSlice).toContain('V47.19 Read-Only Pre-Flight Gateway');

      const store = new Map<string, any>();
      const fakeDb: any = {
        collection: (coll: string) => ({
          doc: (docId: string) => ({
            get: async () => ({
              exists: store.has(`${coll}/${docId}`),
              data: () => store.get(`${coll}/${docId}`),
            }),
            set: async (payload: any, opts?: { merge?: boolean }) => {
              const key = `${coll}/${docId}`;
              const prev = opts?.merge ? store.get(key) || {} : {};
              store.set(key, { ...prev, ...payload });
            },
          }),
        }),
      };

      const normalizeId = (s: string) =>
        s.trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      // Simulate post-confirmation stub minting for both typo ("the rocking horse winer") and dropped article ("Rocking Horse Winner")
      for (const rawSeed of ['the rocking horse winer', 'Rocking Horse Winner']) {
        const validationResult = {
          isValid: true,
          correctedInput: true,
          hasCollision: false,
          id: 'The Rocking Horse Winner',
          origin: 'USA',
          genre: 'Indie Rock',
          candidates: [
            {
              id: 'the-rocking-horse-winner-us',
              name: 'The Rocking Horse Winner',
              origin: 'USA',
              genre: 'Indie Rock',
              disambiguationSnippet: 'South Florida indie emo band on Equal Vision Records.',
            },
          ],
        };
        const isAmbiguous = Boolean(validationResult.hasCollision && validationResult.candidates.length > 1);
        const bareNormId = normalizeId(!isAmbiguous && validationResult.id ? validationResult.id : rawSeed);

        await upsertBareRouterStub(fakeDb, bareNormId, validationResult.candidates[0].id, {
          name: validationResult.candidates[0].name,
          origin: validationResult.candidates[0].origin,
          genre: validationResult.candidates[0].genre,
          disambiguationSnippet: validationResult.candidates[0].disambiguationSnippet,
          candidates: validationResult.candidates,
        });
      }

      // Canonical bare stub exists -> points strictly to the-rocking-horse-winner-us
      expect(store.has('artists/the-rocking-horse-winner')).toBe(true);
      expect(store.get('artists/the-rocking-horse-winner').redirectTo).toBe('the-rocking-horse-winner-us');

      // Zero typo or dropped-article stub pollution in /artists
      expect(store.has('artists/the-rocking-horse-winer')).toBe(false);
      expect(store.has('artists/rocking-horse-winner')).toBe(false);
    });

    it('(d) V47.18 Pillars A & B: locks pre-flight seed identity across validateSeedOriginCallable -> executeCurationPipeline -> processCurationJob (0 redundant Flash calls) and guards Escape Hatch (!isAmbiguous && !originHint && !genreHint)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const pipelineSrc = fs.readFileSync(path.resolve(__dirname, '../src/executeCurationPipeline.ts'), 'utf8');
      const workerSrc = fs.readFileSync(path.resolve(__dirname, '../src/processCurationJob.ts'), 'utf8');

      // 1. Pillar A: Escape Hatch Guard in validateSeedOriginCallable checks !isAmbiguous && !isEscapeHatchQuery (originHint, genreHint, mode === "escape_hatch")
      expect(pipelineSrc).toContain('const isEscapeHatchQuery = Boolean(');
      expect(pipelineSrc).toContain('(typeof originHint === "string" && originHint.trim()) ||');
      expect(pipelineSrc).toContain('(typeof genreHint === "string" && genreHint.trim()) ||');
      expect(pipelineSrc).toContain('mode === "escape_hatch"');
      expect(pipelineSrc).toContain('if (!isAmbiguous && !isEscapeHatchQuery && validationResult.id)');

      // 2. Pillar B: Both resolveSceneTopologyBackend and processCurationJob lock pre-validated seed identity and bypass redundant Flash calls
      expect(pipelineSrc).toContain('const hasLockedPreFlightIdentity = Boolean(');
      expect(pipelineSrc).toContain('Bypassing redundant Flash re-validation.');
      expect(workerSrc).toContain('const hasLockedWorkerSeedIdentity = Boolean(');
      expect(workerSrc).toContain('Bypassing redundant Phase 2 Flash call.');
    });

    it('(e) V47.18 Pillar C (Gaps 1–3 & Step 5/6 Parity): cold non-seed peer re-keying ("murder-city-devils-us" -> "the-murder-city-devils-us", iTunes #3269301) updates idRewriteMap, finalGraph.nodes/links, sceneArtistSnippetsMap (deleting superseded origNorm), activeNodes, artistIds, and enforces artistId === stripCountrySlug(cacheKey)', () => {
      const normalizeId = (s: string) =>
        s.trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      // Simulate a scene anchored by "At the Drive-In" (#41990355, at-the-drive-in-us) where Gemini 3.1 Pro
      // emitted a cold peer node { id: "murder-city-devils-us", label: "Murder City Devils" } and Step 2
      // iTunes verified "The Murder City Devils" (#3269301).
      const finalGraph: any = {
        nodes: [
          { id: 'at-the-drive-in-us', label: 'At the Drive-In', type: 'artist', group: 1, isSeed: true },
          { id: 'murder-city-devils-us', label: 'Murder City Devils', type: 'artist', group: 1 },
          { id: 'sub-pop', label: 'Sub Pop', type: 'label', group: 2 },
        ],
        links: [
          { source: 'at-the-drive-in-us', target: 'murder-city-devils-us', value: 1, forwardContext: 'shared Pacific Northwest touring circuits with' },
          { source: 'murder-city-devils-us', target: 'sub-pop', value: 1, forwardContext: 'released seminal garage punk albums on' },
        ],
      };

      const recommendedEntities: any[] = [
        {
          id: 'at-the-drive-in-us',
          originalNodeId: 'at-the-drive-in-us',
          name: 'At the Drive-In',
          type: 'artist',
          origin: 'El Paso, Texas, USA',
          genre: 'Post-Hardcore',
        },
        {
          id: 'murder-city-devils-us',
          originalNodeId: 'murder-city-devils-us',
          name: 'Murder City Devils',
          type: 'artist',
          origin: 'Seattle, Washington, USA',
          genre: 'Garage Punk',
        },
      ];

      // Step 2 Cold Peer Re-Keying (!hadExistingCachedDoc && verifiedItunesArtistName === "The Murder City Devils")
      const coldPeer = recommendedEntities[1];
      const verifiedItunesArtistName = 'The Murder City Devils';
      coldPeer.name = verifiedItunesArtistName;
      const verifiedBareSlug = normalizeId(verifiedItunesArtistName);
      const currentIso = extractTrailingCountryIso(coldPeer.id);
      const currentBareSlug = stripCountrySlug(coldPeer.id, currentIso);
      expect(verifiedBareSlug).toBe('the-murder-city-devils');
      expect(currentBareSlug).toBe('murder-city-devils');
      coldPeer.id = canonicalizeArtistSlugWithOrigin(verifiedBareSlug, 'Seattle, Washington, USA');
      expect(coldPeer.id).toBe('the-murder-city-devils-us');

      const detailsCacheEntries: [string, any][] = [
        [
          'at-the-drive-in-us',
          {
            itunesArtistId: 41990355,
            details: { artist: 'At the Drive-In', origin: 'El Paso, Texas, USA', genre: 'Post-Hardcore' },
          },
        ],
        [
          coldPeer.id,
          {
            itunesArtistId: 3269301,
            details: { artist: 'The Murder City Devils', origin: 'Seattle, Washington, USA', genre: 'Garage Punk' },
          },
        ],
      ];

      // Step 3A: Scene Zine artistSnippets returns "The Murder City Devils" while finalGraph.nodes still has "murder-city-devils-us"
      const sceneArtistSnippetsMap: Record<string, string> = {};
      const zineSnippets = [
        { id: 'At the Drive-In', snippet: 'At the Drive-In detonated post-hardcore from El Paso.' },
        { id: 'The Murder City Devils', snippet: 'The Murder City Devils fused Spencer Moody vocals with Vox organ grit.' },
      ];
      for (const s of zineSnippets) {
        sceneArtistSnippetsMap[s.id] = s.snippet;
        sceneArtistSnippetsMap[normalizeId(s.id)] = s.snippet;
      }
      for (const n of finalGraph.nodes) {
        const nodeNorm = normalizeId(n.id);
        const nodeBare = stripCountrySlug(nodeNorm);
        const nodeBareNoThe = nodeBare.replace(/^the-/, '');
        const match = zineSnippets.find((s) => {
          const sNorm = normalizeId(s.id);
          const sBare = stripCountrySlug(sNorm);
          return sNorm === nodeNorm || sBare === nodeBare || sBare.replace(/^the-/, '') === nodeBareNoThe;
        });
        if (match) {
          n.narrativeSnippet = match.snippet;
          sceneArtistSnippetsMap[n.id] = match.snippet;
          sceneArtistSnippetsMap[nodeNorm] = match.snippet;
        }
      }
      expect(finalGraph.nodes[1].narrativeSnippet).toContain('The Murder City Devils');
      expect(sceneArtistSnippetsMap['murder-city-devils-us']).toBeDefined();

      // Gap 3: Build idRewriteMap registering recNorm, entryKeyNorm, entryBareNorm, origNorm, and origBare
      const idRewriteMap = new Map<string, string>();
      for (const entityObj of recommendedEntities) {
        const recNorm = normalizeId(entityObj.name);
        const recDetailsEntry = detailsCacheEntries.find(
          (entry) => entry[0] === entityObj.id || entry[0] === entityObj.originalNodeId || isEntitySeedMatch(recNorm, entry[0])
        )!;
        const entryKeyNorm = normalizeId(recDetailsEntry[0]);
        const entryTrailingIso = extractTrailingCountryIso(entryKeyNorm);
        const entryBareNorm = (entryTrailingIso ? stripCountrySlug(entryKeyNorm, entryTrailingIso) : stripCountrySlug(entryKeyNorm)) || recNorm;
        const finalCanonicalId = canonicalizeArtistSlugWithOrigin(entryBareNorm, recDetailsEntry[1]?.details?.origin);

        idRewriteMap.set(recNorm, finalCanonicalId);
        idRewriteMap.set(entryKeyNorm, finalCanonicalId);
        idRewriteMap.set(entryBareNorm, finalCanonicalId);
        if (entityObj.originalNodeId) {
          const origNorm = normalizeId(entityObj.originalNodeId);
          idRewriteMap.set(origNorm, finalCanonicalId);
          const origIso = extractTrailingCountryIso(origNorm);
          const origBare = origIso ? stripCountrySlug(origNorm, origIso) : stripCountrySlug(origNorm);
          if (origBare) idRewriteMap.set(origBare, finalCanonicalId);
        }
        entityObj.id = finalCanonicalId;
        recDetailsEntry[0] = finalCanonicalId;
      }

      expect(idRewriteMap.get('murder-city-devils-us')).toBe('the-murder-city-devils-us');
      expect(idRewriteMap.get('murder-city-devils')).toBe('the-murder-city-devils-us');
      expect(idRewriteMap.get('the-murder-city-devils')).toBe('the-murder-city-devils-us');

      // Apply idRewriteMap to finalGraph.nodes & prune superseded origNorm from sceneArtistSnippetsMap
      for (const node of finalGraph.nodes) {
        const prevRawNodeId = node.id;
        const normId = normalizeId(node.id);
        const baseNormId = stripCountrySlug(normId);
        if (idRewriteMap.has(normId)) {
          node.id = idRewriteMap.get(normId)!;
        } else if (idRewriteMap.has(baseNormId)) {
          node.id = idRewriteMap.get(baseNormId)!;
        }
        const rewrittenNormId = normalizeId(node.id);
        if (node.narrativeSnippet) {
          sceneArtistSnippetsMap[node.id] = node.narrativeSnippet;
          sceneArtistSnippetsMap[rewrittenNormId] = node.narrativeSnippet;
        }
        if (normId !== rewrittenNormId) {
          delete sceneArtistSnippetsMap[normId];
          if (prevRawNodeId !== node.id) {
            delete sceneArtistSnippetsMap[prevRawNodeId];
          }
        }
      }

      // Apply idRewriteMap to finalGraph.links
      for (const link of finalGraph.links) {
        if (idRewriteMap.has(link.source)) link.source = idRewriteMap.get(link.source)!;
        if (idRewriteMap.has(link.target)) link.target = idRewriteMap.get(link.target)!;
      }

      // Final Node Label Lock
      for (const node of finalGraph.nodes) {
        const entry = detailsCacheEntries.find((e) => e[0] === node.id);
        if (entry?.[1]?.details?.artist) {
          node.label = entry[1].details.artist;
        }
      }

      expect(finalGraph.nodes.map((n: any) => n.id)).toEqual([
        'at-the-drive-in-us',
        'the-murder-city-devils-us',
        'sub-pop',
      ]);
      expect(finalGraph.nodes[1].label).toBe('The Murder City Devils');
      expect(finalGraph.links[0].target).toBe('the-murder-city-devils-us');
      expect(finalGraph.links[1].source).toBe('the-murder-city-devils-us');

      // Superseded pre-rewrite key "murder-city-devils-us" is deleted from sceneArtistSnippetsMap while "the-murder-city-devils-us" is present
      expect(sceneArtistSnippetsMap['the-murder-city-devils-us']).toContain('The Murder City Devils');
      expect(sceneArtistSnippetsMap['murder-city-devils-us']).toBeUndefined();

      // Step 6 mathematical parity: canonicalBareIdForWrite === stripCountrySlug(cleanCanonicalId)
      const cleanCanonicalId = 'the-murder-city-devils-us';
      const canonicalTrailingIso = extractTrailingCountryIso(cleanCanonicalId);
      const canonicalBareIdForWrite = stripCountrySlug(cleanCanonicalId, canonicalTrailingIso);
      expect(canonicalBareIdForWrite).toBe('the-murder-city-devils');

      // And for an existing legacy doc ("murder-city-devils-us") whose display name was upgraded to "The Murder City Devils",
      // canonicalBareIdForWrite stays "murder-city-devils" (never writing a mismatched artistId or dual stub!)
      const legacyCanonicalId = 'murder-city-devils-us';
      const legacyTrailingIso = extractTrailingCountryIso(legacyCanonicalId);
      const legacyBareIdForWrite = stripCountrySlug(legacyCanonicalId, legacyTrailingIso);
      expect(legacyBareIdForWrite).toBe('murder-city-devils');
    });

    it('(f) V47.19 Localized Storefront Genre Normalization & &lang=en_us: resolves Swedish "Hårdrock" in Tier 1 on SE storefront for "The Hellacopters" (#8039597) while keeping EDM "ハードコア" blocked as bare "hardcore" (ID 1050)', async () => {
      // 1. Diacritic folding & localized genre alias table
      expect(normalizeGenreText('Hårdrock')).toBe('hard rock');
      expect(normalizeGenreText('Hardrock')).toBe('hard rock');
      expect(normalizeGenreText('Punkrock')).toBe('punk rock');
      expect(normalizeGenreText('Indierock')).toBe('indie rock');
      expect(normalizeGenreText('Alternativ')).toBe('alternative');
      expect(normalizeGenreText('Alternatif')).toBe('alternative');
      expect(normalizeGenreText('Música alternativa')).toBe('alternative');
      expect(normalizeGenreText('ロック')).toBe('rock');
      expect(normalizeGenreText('オルタナティブ')).toBe('alternative');

      // 2. EDM "Hardcore" (Apple Genre ID 1050) guard strictly preserved across localized storefronts
      expect(normalizeGenreText('ハードコア')).toBe('hardcore');
      expect(normalizeGenreText('하드코어')).toBe('hardcore');
      expect(isAppleElectronicHardcoreGenre('ハードコア')).toBe(true);
      expect(evaluateGenreMatch('ハードコア', 'Hardcore Punk', 'Japanese hardcore punk band.')).toBe(false);
      expect(isCatalogCorroboratedNonHostileGenre('ハードコア', 'Hardcore Punk')).toBe(false);

      // 3. Localized hostile genres remain strictly blocked
      expect(normalizeGenreText('Klassisk')).toBe('classical');
      expect(normalizeGenreText('クラシック')).toBe('classical');
      expect(isCatalogCorroboratedNonHostileGenre('Klassisk', 'Garage Rock')).toBe(false);
      expect(isCatalogCorroboratedNonHostileGenre('Barnmusik', 'Indie Rock')).toBe(false);

      // 4. End-to-end Tier 1 Hit on SE storefront for "The Hellacopters" (primaryGenreName: "Hårdrock", 0 Tier 2/3 escalations)
      expect(evaluateGenreMatch('Hårdrock', 'Garage Rock / Hard Rock', 'Swedish garage hard rock band.')).toBe(true);

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('entity=musicArtist') && url.includes('country=SE')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  artistId: 8039597,
                  artistName: 'The Hellacopters',
                  primaryGenreName: 'Hårdrock',
                },
              ],
            }),
          };
        }
        if (url.includes('lookup?id=8039597') && url.includes('country=SE')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 8039597, artistName: 'The Hellacopters' },
                {
                  wrapperType: 'collection',
                  collectionType: 'Album',
                  artistId: 8039597,
                  artistName: 'The Hellacopters',
                  collectionName: 'By the Grace of God',
                  primaryGenreName: 'Hårdrock',
                  releaseDate: '2002-09-16T07:00:00Z',
                  trackCount: 13,
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/hellacopters/100x100bb.jpg',
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({ results: [] }) };
      });
      global.fetch = fetchMock as any;

      const res = await scrapeImageUrlBackend(
        'The Hellacopters',
        'artist',
        'Garage Rock / Hard Rock',
        'The Hellacopters are a Swedish garage rock and hard rock band formed in Stockholm in 1994.',
        'Stockholm, Sweden',
        [{ albumName: 'By the Grace of God', releaseYear: '2002' }],
        'se',
        '1994'
      );

      expect(res.itunesArtistId).toBe(8039597);
      expect(res.verifiedArtistName).toBe('The Hellacopters');
      expect(res.imageUrl).toContain('600x600bb.jpg');
      // Only 2 network calls (1 artist search + 1 album lookup in Tier 1 on SE storefront, with &country=SE&lang=en_us)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain('&country=SE&lang=en_us');
      expect(fetchMock.mock.calls[1][0]).toContain('&country=SE&lang=en_us');
    });
  });
});

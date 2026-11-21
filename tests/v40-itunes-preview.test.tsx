import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isFullyQualifiedEntityProfile } from '../services/cacheQualification';
import { 
  resolveArtistAudioPreview, 
  resolveAlbumAudioPreview,
  isAlbumPreviewConfirmedUnavailable,
  clearPreviewMemoryCacheForTests,
  primePreviewCache 
} from '../services/itunesPreviewService';
import { 
  AudioPreviewPlayer, 
  AlbumAudioPreviewButton,
  audioController, 
  stopGlobalAudio 
} from '../components/AudioPreviewPlayer';

describe('Architecture V40: Instant 30-Second iTunes Audio Previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopGlobalAudio();
  });

  afterEach(() => {
    stopGlobalAudio();
  });

  describe('Part 1: Client iTunes Preview Service (Strict ID-Only Contract)', () => {
    it('immediately returns null when itunesArtistId is missing or falsy with zero network calls', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      expect(await resolveArtistAudioPreview(null)).toBeNull();
      expect(await resolveArtistAudioPreview(undefined)).toBeNull();
      expect(await resolveArtistAudioPreview(0)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolves track preview via itunesArtistId lookup (1-Step Deterministic)', async () => {
      const mockTrack = {
        wrapperType: 'track',
        kind: 'song',
        artistId: 1578305972,
        trackName: 'Boomerang',
        collectionName: 'This Is All We Ever Get',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a',
        trackViewUrl: 'https://music.apple.com/us/album/boomerang/1578305972?i=12345'
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ wrapperType: 'artist' }, mockTrack] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview(1578305972);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('https://itunes.apple.com/lookup?id=1578305972&entity=song&limit=1');
      expect(result).toEqual({
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a',
        previewTrackName: 'Boomerang',
        collectionName: 'This Is All We Ever Get',
        itunesArtistId: 1578305972,
        trackViewUrl: 'https://music.apple.com/us/album/boomerang/1578305972?i=12345'
      });

      // Second call must hit in-memory cache with zero network calls
      const cached = await resolveArtistAudioPreview(1578305972);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(result);
    });

    it('caches null on negative lookup (unindexed underground band)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview(999999999);
      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Re-query must return null without re-fetching
      const cached = await resolveArtistAudioPreview(999999999);
      expect(cached).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('accepts string itunesArtistId and coerces to number safely', async () => {
      const mockTrack = {
        wrapperType: 'track',
        kind: 'song',
        artistId: 1578305972,
        trackName: 'Boomerang',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a',
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [mockTrack] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview('1578305972' as any);
      expect(result).not.toBeNull();
      expect(result?.itunesArtistId).toBe(1578305972);
    });

    it('does not negative-cache if request was aborted', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      const fetchMock = vi.fn().mockRejectedValue(abortError);
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview(12345678);
      expect(result).toBeNull();

      // Subsequent successful call should be allowed to retry
      const successMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ wrapperType: 'track', kind: 'song', previewUrl: 'https://test.m4a', trackName: 'Test' }] })
      });
      global.fetch = successMock;

      const retryResult = await resolveArtistAudioPreview(12345678);
      expect(retryResult).not.toBeNull();
      expect(successMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Part 2: AudioPreviewPlayer Component & UI Resilience', () => {
    it('renders artwork watermark audio player overlay when previewUrl is present', () => {
      render(
        <AudioPreviewPlayer
          nodeId="spaced"
          previewUrl="https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a"
          previewTrackName="Boomerang"
          itunesArtistId={1578305972}
        />
      );

      const button = screen.getByRole('button', { name: /Play 30s Audio Preview: Boomerang/i });
      expect(button).toBeDefined();
      expect(button.getAttribute('title')).toContain('Boomerang');
      expect(screen.getByText('Boomerang')).toBeDefined();
    });

    it('supports Play -> Pause -> Play resume cycle via GlobalAudioController without deadlock', () => {
      // Mock HTMLMediaElement methods and paused property in jsdom
      const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
        Object.defineProperty(this, 'paused', { value: false, configurable: true });
      });
      const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: any) {
        Object.defineProperty(this, 'paused', { value: true, configurable: true });
      });

      // 1. Initial Play
      audioController.play('spaced', 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a');
      expect(audioController.getCurrentTrackId()).toBe('spaced');

      // 2. Pause
      audioController.pause();
      expect(pauseSpy).toHaveBeenCalled();

      // 3. Play again (Resume)
      audioController.play('spaced', 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a');
      expect(playSpy).toHaveBeenCalled();
      expect(audioController.getCurrentTrackId()).toBe('spaced');

      audioController.stop();
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    });

    it('renders 28px shimmer loader when itunesArtistId is present and fetch is pending', () => {
      // Mock fetch that hangs to inspect loading state
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const { container } = render(
        <AudioPreviewPlayer
          nodeId="spaced"
          itunesArtistId={1578305972}
        />
      );

      const pulseElement = container.querySelector('.animate-pulse');
      expect(pulseElement).not.toBeNull();
    });

    it('renders completely null (silent fallback) when itunesArtistId is absent and preview is null', async () => {
      const { container } = render(
        <AudioPreviewPlayer
          nodeId="underground-band"
          previewUrl={null}
          itunesArtistId={null}
        />
      );

      await act(async () => {
        await new Promise(r => setTimeout(r, 10));
      });

      expect(container.firstChild).toBeNull();
    });

    it('stops global audio when zcene:stop-audio custom event is fired', () => {
      const stopSpy = vi.spyOn(audioController, 'stop');

      window.dispatchEvent(new CustomEvent('zcene:stop-audio'));

      expect(stopSpy).toHaveBeenCalled();
    });

    it('switches from Track A to Track B without teardown race when previous audio emits async error event', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      let trackAAudioInstance: any = null;
      const originalAudio = window.Audio;

      // Intercept Audio construction to capture Track A's element
      window.Audio = vi.fn().mockImplementation(function(src: string) {
        const el = document.createElement('audio');
        el.src = src;
        vi.spyOn(el, 'play').mockImplementation(async function() {
          Object.defineProperty(el, 'paused', { value: false, configurable: true });
        });
        vi.spyOn(el, 'pause').mockImplementation(function() {
          Object.defineProperty(el, 'paused', { value: true, configurable: true });
        });
        if (src && src.includes('track-a')) {
          trackAAudioInstance = el;
        }
        return el;
      }) as any;

      // 1. Play Track A
      audioController.play('track-a', 'https://test.com/track-a.m4a');
      expect(audioController.getCurrentTrackId()).toBe('track-a');

      // 2. Play Track B on the first click
      audioController.play('track-b', 'https://test.com/track-b.m4a');
      expect(audioController.getCurrentTrackId()).toBe('track-b');

      // 3. Simulate browser asynchronously firing error event on Track A after teardown
      if (trackAAudioInstance) {
        trackAAudioInstance.dispatchEvent(new Event('error'));
      }

      // Assert Track B remains active and zero audio playback warning logs occurred
      expect(audioController.getCurrentTrackId()).toBe('track-b');
      expect(audioController.isTrackPlaying('track-b')).toBe(true);

      const audioPlaybackWarnings = consoleWarnSpy.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('[GlobalAudioController] Audio playback error')
      );
      expect(audioPlaybackWarnings.length).toBe(0);

      audioController.stop();
      window.Audio = originalAudio;
      consoleWarnSpy.mockRestore();
    });

    it('automatically self-heals and starts playback on first click when initial previewUrl fails with a media error', async () => {
      const onPreviewResolvedMock = vi.fn();
      const createdAudios: HTMLAudioElement[] = [];

      const originalAudio = window.Audio;
      window.Audio = vi.fn().mockImplementation(function(src: string) {
        const el = document.createElement('audio');
        el.src = src;
        vi.spyOn(el, 'play').mockImplementation(async function() {
          Object.defineProperty(el, 'paused', { value: false, configurable: true });
        });
        vi.spyOn(el, 'pause').mockImplementation(function() {
          Object.defineProperty(el, 'paused', { value: true, configurable: true });
        });
        createdAudios.push(el);
        return el;
      }) as any;

      // Mock fresh iTunes API response for self-heal
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 1798548,
              trackName: 'The Middle',
              previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/fresh-the-middle.m4a'
            }
          ]
        })
      });
      global.fetch = fetchMock;

      const { container } = render(
        <AudioPreviewPlayer
          nodeId="jimmy-eat-world-us"
          artistName="Jimmy Eat World"
          previewUrl="https://expired.mzstatic.com/expired-preview.m4a"
          previewTrackName="The Middle (Expired)"
          itunesArtistId={1798548}
          onPreviewResolved={onPreviewResolvedMock}
        />
      );

      const playButton = container.querySelector('[role="button"]') as HTMLElement;
      expect(playButton).not.toBeNull();

      // Click Play on the expired track
      await act(async () => {
        playButton.click();
      });

      expect(createdAudios.length).toBe(1);
      expect(createdAudios[0].src).toBe('https://expired.mzstatic.com/expired-preview.m4a');

      // Dispatch error event on the expired audio element to simulate media error
      await act(async () => {
        createdAudios[0].dispatchEvent(new Event('error'));
        // Allow the async resolveArtistAudioPreview promise to settle
        await new Promise(r => setTimeout(r, 20));
      });

      // Verify self-healing re-queried iTunes with forceRefresh = true
      expect(fetchMock).toHaveBeenCalled();
      expect(onPreviewResolvedMock).toHaveBeenCalledWith(expect.objectContaining({
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/fresh-the-middle.m4a',
        itunesArtistId: 1798548,
      }));

      // Verify fresh audio instance was created and started playing
      expect(createdAudios.length).toBe(2);
      expect(createdAudios[1].src).toBe('https://audio-ssl.itunes.apple.com/itunes-assets/fresh-the-middle.m4a');
      expect(audioController.getCurrentTrackId()).toBe('jimmy-eat-world-us');
      expect(audioController.isTrackPlaying('jimmy-eat-world-us')).toBe(true);

      audioController.stop();
      window.Audio = originalAudio;
    });

    it('auto-plays resolved preview when user clicks during in-flight preview lookup', async () => {
      let resolveFetch: any;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      global.fetch = vi.fn().mockImplementation(() => fetchPromise);

      const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
        Object.defineProperty(this, 'paused', { value: false, configurable: true });
      });

      const { container } = render(
        <AudioPreviewPlayer
          nodeId="say-anything-us"
          artistName="Say Anything"
          itunesArtistId={2818055}
        />
      );

      const loadingPulse = container.querySelector('[role="button"]') as HTMLElement;
      expect(loadingPulse).not.toBeNull();

      // Click while loading
      await act(async () => {
        loadingPulse.click();
      });

      // Now resolve the fetch
      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({
            results: [{
              wrapperType: 'track',
              kind: 'song',
              artistId: 2818055,
              trackName: 'Alive with the Glory of Love',
              previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/alive.m4a'
            }]
          })
        });
        await new Promise(r => setTimeout(r, 20));
      });

      expect(audioController.getCurrentTrackId()).toBe('say-anything-us');
      expect(audioController.isTrackPlaying('say-anything-us')).toBe(true);

      audioController.stop();
      playSpy.mockRestore();
    });
  });

  describe('Part 3: V40 Architectural Safety Guard (Rule 37 & Rule 40 Agnosticism)', () => {
    const baseArtistProfile = {
      summary: 'Spaced is a modern hardcore band from Buffalo, NY known for groove and psychedelic atmosphere.',
      details: {
        genre: 'Hardcore Punk',
        style: 'Modern Hardcore',
        origin: 'Buffalo, NY, USA',
        founded: '2021',
        notableArtists: ['Buggin', 'End It']
      },
      recommendationReason: 'Seminal modern hardcore trailblazers.',
      discography: [
        { albumName: 'Spaced Jams', releaseYear: '2022' },
        { albumName: 'This Is All We Ever Get', releaseYear: '2024' }
      ],
      imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/c7/d4/9/600x600bb.jpg'
    };

    it('qualifies artist profile with itunesArtistId and previewUrl present', () => {
      const profile = {
        ...baseArtistProfile,
        itunesArtistId: 1578305972,
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a',
        previewTrackName: 'Boomerang'
      };

      expect(isFullyQualifiedEntityProfile(profile, false)).toBe(true);
    });

    it('qualifies underground artist profile with itunesArtistId and previewUrl omitted or null', () => {
      const undergroundProfile = {
        ...baseArtistProfile,
        imageUrl: 'not-found',
        discography: [],
        itunesArtistId: null,
        previewUrl: null,
        previewTrackName: null
      };

      expect(isFullyQualifiedEntityProfile(undergroundProfile, false)).toBe(true);
    });
  });

  describe('Part 4: Canonical Presentation Sort (Audio Flow & Discovery Order)', () => {
    it('stably groups all artists before record labels while strictly preserving backend traversal order', () => {
      // Simulate raw graph traversal order where Artists and Labels are interleaved
      // Note: 'Spaced' appears before 'Antidote', which is non-alphabetical to verify stable sort
      const rawDiscoveryNodes = [
        { id: 'spaced-us', label: 'Spaced', type: 'artist' },
        { id: 'revelation-records', label: 'Revelation Records', type: 'label' },
        { id: 'antidote-us', label: 'Antidote', type: 'artist' },
        { id: 'triple-b-records', label: 'Triple B Records', type: 'label' },
        { id: 'scowl-us', label: 'Scowl', type: 'artist' },
      ];

      // Canonical Presentation Comparator (mirrored in App.tsx and DetailsPanel.tsx)
      const sorted = [...rawDiscoveryNodes].sort((a, b) => {
        const isLabelA = a.type === 'label';
        const isLabelB = b.type === 'label';
        if (!isLabelA && isLabelB) return -1;
        if (isLabelA && !isLabelB) return 1;
        return 0; // Stable sort
      });

      // Artists must strictly precede all Record Labels
      expect(sorted.map(n => n.id)).toEqual([
        'spaced-us',
        'antidote-us',
        'scowl-us',
        'revelation-records',
        'triple-b-records',
      ]);

      // Verify stable discovery order is preserved within artist group (Spaced precedes Antidote)
      expect(sorted[0].id).toBe('spaced-us');
      expect(sorted[1].id).toBe('antidote-us');
      expect(sorted[2].id).toBe('scowl-us');

      // Verify stable discovery order is preserved within label group (Revelation precedes Triple B)
      expect(sorted[3].id).toBe('revelation-records');
      expect(sorted[4].id).toBe('triple-b-records');
    });
  });

  describe('Part 5: V45.17 JIT Per-Album Essential Listening Audio Previews', () => {
    beforeEach(() => {
      clearPreviewMemoryCacheForTests();
      stopGlobalAudio();
    });

    afterEach(() => {
      clearPreviewMemoryCacheForTests();
      stopGlobalAudio();
    });

    it('Path 1: resolves album preview via exact itunesCollectionId lookup and caches in session memory', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { wrapperType: 'collection', collectionId: 1485042718, collectionName: 'No Control' },
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              collectionId: 1485042718,
              trackName: 'Change of Ideas',
              collectionName: 'No Control',
              previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/change-of-ideas.m4a',
            },
          ],
        }),
      });
      global.fetch = fetchMock;

      const res = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesArtistId: 2568989,
        itunesCollectionId: 1485042718,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://itunes.apple.com/lookup?id=1485042718&entity=song&limit=5');
      expect(res).toEqual(expect.objectContaining({
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/change-of-ideas.m4a',
        previewTrackName: 'Change of Ideas',
        collectionName: 'No Control',
        itunesArtistId: 2568989,
        itunesCollectionId: 1485042718,
      }));

      // Second call hits session memory cache with zero network requests
      const cached = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesArtistId: 2568989,
        itunesCollectionId: 1485042718,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(res);
    });

    it('Path 2A: legacy fallback search enforces strict artistId + normalized collectionName matching', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            // Impostor cover band track — wrong artistId
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 999999,
              artistName: 'Bad Religion Tribute Band',
              collectionName: 'Stranger Than Fiction',
              trackName: 'Infected (Tribute)',
              previewUrl: 'https://audio-ssl.itunes.apple.com/impostor.m4a',
            },
            // Same artist, wrong album
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              artistName: 'Bad Religion',
              collectionName: 'Christmas Songs',
              trackName: 'Hark! The Herald Angels Sing',
              previewUrl: 'https://audio-ssl.itunes.apple.com/christmas.m4a',
            },
            // Exact artistId + matching album with edition suffix
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              artistName: 'Bad Religion',
              collectionName: 'Stranger Than Fiction (Remastered)',
              trackName: 'Infected',
              collectionId: 158100111,
              previewUrl: 'https://audio-ssl.itunes.apple.com/infected.m4a',
            },
          ],
        }),
      });
      global.fetch = fetchMock;

      const res = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'Stranger Than Fiction',
        itunesArtistId: 2568989,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('https://itunes.apple.com/search?term=');
      expect(fetchMock.mock.calls[0][0]).toContain('&entity=song&limit=15');
      expect(res?.previewUrl).toBe('https://audio-ssl.itunes.apple.com/infected.m4a');
      expect(res?.previewTrackName).toBe('Infected');
    });

    it('Path 2B: lazily queries and caches artist entity=album catalog when direct search misses, reusing cache for subsequent albums', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/search?term=')) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) };
        }
        if (url.includes('/lookup?id=2568989&entity=album&limit=200')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'artist', artistId: 2568989, artistName: 'Bad Religion' },
                { wrapperType: 'collection', artistId: 2568989, collectionId: 1111, collectionName: 'Suffer (Remastered)' },
                { wrapperType: 'collection', artistId: 2568989, collectionId: 2222, collectionName: 'Generator' },
              ],
            }),
          };
        }
        if (url.includes('/lookup?id=1111&entity=song&limit=5')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'track', kind: 'song', artistId: 2568989, collectionId: 1111, trackName: 'You Are (The Government)', previewUrl: 'https://audio-ssl.itunes.apple.com/suffer.m4a' },
              ],
            }),
          };
        }
        if (url.includes('/lookup?id=2222&entity=song&limit=5')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { wrapperType: 'track', kind: 'song', artistId: 2568989, collectionId: 2222, trackName: 'Generator', previewUrl: 'https://audio-ssl.itunes.apple.com/generator.m4a' },
              ],
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      });
      global.fetch = fetchMock;

      const suffer = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'Suffer',
        itunesArtistId: 2568989,
      });
      expect(suffer?.previewUrl).toBe('https://audio-ssl.itunes.apple.com/suffer.m4a');

      const generator = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'Generator',
        itunesArtistId: 2568989,
      });
      expect(generator?.previewUrl).toBe('https://audio-ssl.itunes.apple.com/generator.m4a');

      // entity=album catalog lookup must have fired ONLY ONCE across both albums
      const catalogCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('entity=album&limit=200'));
      expect(catalogCalls.length).toBe(1);
    });

    it('negative-caches null ONLY on HTTP 200 with 0 tracks and NEVER on HTTP 429/403 rate limits', async () => {
      // Transient 429 must NOT negative-cache
      const rateLimitMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
      global.fetch = rateLimitMock;

      const throttled = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesCollectionId: 777777,
      });
      expect(throttled).toBeNull();
      expect(isAlbumPreviewConfirmedUnavailable({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesCollectionId: 777777,
      })).toBe(false);

      // Confirmed HTTP 200 with 0 tracks MUST negative-cache
      const emptyOkMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) });
      global.fetch = emptyOkMock;

      const missing = await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesCollectionId: 777777,
      });
      expect(missing).toBeNull();
      expect(emptyOkMock).toHaveBeenCalledTimes(1);
      expect(isAlbumPreviewConfirmedUnavailable({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesCollectionId: 777777,
      })).toBe(true);

      // Re-query hits negative cache with zero network calls
      await resolveAlbumAudioPreview({
        nodeId: 'bad-religion-us',
        artistName: 'Bad Religion',
        albumName: 'No Control',
        itunesCollectionId: 777777,
      });
      expect(emptyOkMock).toHaveBeenCalledTimes(1);
    });

    it('AlbumAudioPreviewButton makes zero network calls on mount, fetches strictly on click, and coordinates single active audio with Hero AudioPreviewPlayer', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              collectionId: 1485042718,
              trackName: 'Change of Ideas',
              collectionName: 'No Control',
              previewUrl: 'https://audio-ssl.itunes.apple.com/no-control.m4a',
            },
          ],
        }),
      });
      global.fetch = fetchMock;

      const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
        Object.defineProperty(this, 'paused', { value: false, configurable: true });
        this.dispatchEvent(new Event('play'));
      });
      const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: any) {
        Object.defineProperty(this, 'paused', { value: true, configurable: true });
        this.dispatchEvent(new Event('pause'));
      });

      render(
        <div>
          <AudioPreviewPlayer
            nodeId="bad-religion-us"
            artistName="Bad Religion"
            previewUrl="https://audio-ssl.itunes.apple.com/hero-top-track.m4a"
            previewTrackName="American Jesus"
            itunesArtistId={2568989}
          />
          <AlbumAudioPreviewButton
            nodeId="bad-religion-us"
            albumIndex={0}
            artistName="Bad Religion"
            albumName="No Control"
            itunesArtistId={2568989}
            itunesCollectionId={1485042718}
          />
        </div>
      );

      // Zero fetches on mount for AlbumAudioPreviewButton
      expect(fetchMock).not.toHaveBeenCalled();

      // 1. Start Hero preview
      const heroBtn = screen.getByRole('button', { name: /Play 30s Audio Preview: American Jesus/i });
      await act(async () => {
        heroBtn.click();
      });
      expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');
      expect(audioController.isTrackPlaying('bad-religion-us')).toBe(true);

      // 2. Click Album play button -> JIT fetches and hands off single active audio from Hero to Album
      const albumBtn = screen.getByRole('button', { name: /Play 30s preview for No Control/i });
      await act(async () => {
        albumBtn.click();
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(audioController.getCurrentTrackId()).toBe('bad-religion-us::album::0');
      expect(audioController.isTrackPlaying('bad-religion-us::album::0')).toBe(true);
      expect(audioController.isTrackPlaying('bad-religion-us')).toBe(false);

      // 3. Click Hero play button again -> stops album and resumes Hero
      const heroResumeBtn = screen.getByRole('button', { name: /Play 30s Audio Preview: American Jesus/i });
      await act(async () => {
        heroResumeBtn.click();
      });
      expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');
      expect(audioController.isTrackPlaying('bad-religion-us::album::0')).toBe(false);

      audioController.stop();
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    });

    it('handles iOS Safari NotAllowedError gracefully by keeping preview cached for synchronous retry', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              collectionId: 9090,
              trackName: 'We Are Only Gonna Die',
              previewUrl: 'https://audio-ssl.itunes.apple.com/how-could-hell.m4a',
            },
          ],
        }),
      });
      global.fetch = fetchMock;

      let callCount = 0;
      const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Playback not allowed by user agent');
          err.name = 'NotAllowedError';
          throw err;
        }
        Object.defineProperty(this, 'paused', { value: false, configurable: true });
        this.dispatchEvent(new Event('play'));
      });

      render(
        <AlbumAudioPreviewButton
          nodeId="bad-religion-us"
          albumIndex={0}
          artistName="Bad Religion"
          albumName="How Could Hell Be Any Worse?"
          itunesArtistId={2568989}
          itunesCollectionId={9090}
        />
      );

      const albumBtn = screen.getByRole('button', { name: /Play 30s preview for How Could Hell Be Any Worse\?/i });

      // First click hits NotAllowedError after async fetch; button must NOT become disabled/unavailable
      await act(async () => {
        albumBtn.click();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect((albumBtn as HTMLButtonElement).disabled).toBe(false);
      expect(albumBtn.getAttribute('title')).toBe('Tap again to play preview');

      // Second click plays synchronously using cached URL without re-fetching
      await act(async () => {
        albumBtn.click();
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(audioController.isTrackPlaying('bad-religion-us::album::0')).toBe(true);

      audioController.stop();
      playSpy.mockRestore();
    });

    it('renders w-7 h-7 circular yellow SVG progress ring, updates tabular-nums countdown on timeupdate, swaps to pause on hover, and retains ring while paused', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              artistId: 2568989,
              collectionId: 1485042718,
              trackName: 'Change of Ideas',
              collectionName: 'No Control',
              previewUrl: 'https://audio-ssl.itunes.apple.com/no-control.m4a',
            },
          ],
        }),
      });
      global.fetch = fetchMock;

      let activeAudioEl: HTMLAudioElement | null = null;
      const originalAudio = window.Audio;
      window.Audio = vi.fn().mockImplementation(function(src: string) {
        const el = document.createElement('audio');
        el.src = src;
        Object.defineProperty(el, 'duration', { value: 30, configurable: true });
        vi.spyOn(el, 'play').mockImplementation(async function() {
          Object.defineProperty(el, 'paused', { value: false, configurable: true });
          el.dispatchEvent(new Event('play'));
        });
        vi.spyOn(el, 'pause').mockImplementation(function() {
          Object.defineProperty(el, 'paused', { value: true, configurable: true });
          el.dispatchEvent(new Event('pause'));
        });
        activeAudioEl = el;
        return el;
      }) as any;

      try {
        render(
          <AlbumAudioPreviewButton
            nodeId="bad-religion-us"
            albumIndex={0}
            artistName="Bad Religion"
            albumName="No Control"
            itunesArtistId={2568989}
            itunesCollectionId={1485042718}
          />
        );

        const albumBtn = screen.getByTestId('album-preview-btn-0');
        expect(albumBtn.className).toContain('w-7');
        expect(albumBtn.className).toContain('h-7');
        expect(albumBtn.className).toContain('group/album-play');
        expect(screen.queryByTestId('album-preview-ring-0')).toBeNull();

        // Click to start playing
        await act(async () => {
          albumBtn.click();
          await new Promise((r) => setTimeout(r, 20));
        });

        const ring = screen.getByTestId('album-preview-ring-0');
        const countdown = screen.getByTestId('album-preview-countdown-0');
        const pauseIcon = screen.getByTestId('album-preview-pause-icon-0');

        expect(ring.getAttribute('class')).toContain('stroke-primary');
        expect(countdown.className).toContain('tabular-nums');
        expect(countdown.className).toContain('text-[9px]');
        expect(countdown.className).toContain('group-hover/album-play:hidden');
        expect(pauseIcon.getAttribute('class')).toContain('hidden');
        expect(pauseIcon.getAttribute('class')).toContain('group-hover/album-play:block');
        expect(countdown.textContent).toBe('30');

        const circumference = 2 * Math.PI * 13.5;

        // Advance playback to 12.4s and dispatch timeupdate
        await act(async () => {
          if (activeAudioEl) {
            Object.defineProperty(activeAudioEl, 'currentTime', { value: 12.4, configurable: true });
            activeAudioEl.dispatchEvent(new Event('timeupdate'));
          }
        });

        expect(screen.getByTestId('album-preview-countdown-0').textContent).toBe('18');
        const updatedOffset = Number(screen.getByTestId('album-preview-ring-0').getAttribute('stroke-dashoffset'));
        expect(updatedOffset).toBeCloseTo(circumference * (1 - 12.4 / 30), 2);

        // Pause mid-track: ring stays visible at paused offset, countdown hides
        await act(async () => {
          albumBtn.click();
        });
        expect(screen.queryByTestId('album-preview-countdown-0')).toBeNull();
        expect(screen.getByTestId('album-preview-ring-0')).toBeDefined();
        expect(Number(screen.getByTestId('album-preview-ring-0').getAttribute('stroke-dashoffset'))).toBeCloseTo(
          circumference * (1 - 12.4 / 30),
          2
        );

        // Switching to Hero track clears the album ring cleanly
        await act(async () => {
          audioController.play('bad-religion-us', 'https://audio-ssl.itunes.apple.com/hero.m4a');
        });
        expect(screen.queryByTestId('album-preview-ring-0')).toBeNull();
      } finally {
        audioController.stop();
        window.Audio = originalAudio;
      }
    });
  });
});

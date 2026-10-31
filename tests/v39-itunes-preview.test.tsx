import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isFullyQualifiedEntityProfile } from '../services/cacheQualification';
import { 
  resolveArtistAudioPreview, 
  primePreviewCache 
} from '../services/itunesPreviewService';
import { 
  AudioPreviewPlayer, 
  audioController, 
  stopGlobalAudio 
} from '../components/AudioPreviewPlayer';

describe('Architecture V39.2 Clean Slate: Instant 30-Second iTunes Audio Previews', () => {
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
  });

  describe('Part 2: AudioPreviewPlayer Component & UI Resilience', () => {
    it('renders audio player pill when previewUrl is present', () => {
      render(
        <AudioPreviewPlayer
          nodeId="spaced"
          previewUrl="https://audio-ssl.itunes.apple.com/itunes-assets/boomerang.m4a"
          previewTrackName="Boomerang"
          itunesArtistId={1578305972}
        />
      );

      expect(screen.getByText('Boomerang')).toBeDefined();
      expect(screen.getByText('30s')).toBeDefined();
      expect(screen.getByText('Preview')).toBeDefined();
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
  });

  describe('Part 3: V39 Architectural Safety Guard (Rule 37 & Rule 40 Agnosticism)', () => {
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
});

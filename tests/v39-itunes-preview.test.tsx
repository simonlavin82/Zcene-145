import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isFullyQualifiedEntityProfile } from '../services/cacheQualification';
import { 
  cleanArtistNameForSearch, 
  resolveArtistAudioPreview, 
  primePreviewCache 
} from '../services/itunesPreviewService';
import { 
  AudioPreviewPlayer, 
  audioController, 
  stopGlobalAudio 
} from '../components/AudioPreviewPlayer';

describe('Architecture V39.2: Instant 30-Second iTunes Audio Previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopGlobalAudio();
  });

  afterEach(() => {
    stopGlobalAudio();
  });

  describe('Part 1: Name Cleaning & Search Parameter Hygiene', () => {
    it('strips parentheses and country suffixes cleanly', () => {
      expect(cleanArtistNameForSearch('Turnstile (US)')).toBe('Turnstile');
      expect(cleanArtistNameForSearch('Spite US')).toBe('Spite');
      expect(cleanArtistNameForSearch('Darko-us')).toBe('Darko');
      expect(cleanArtistNameForSearch('Coldplay UK')).toBe('Coldplay');
      expect(cleanArtistNameForSearch('Radiohead')).toBe('Radiohead');
    });
  });

  describe('Part 2: Client iTunes Preview Service & Caching', () => {
    it('resolves track preview via itunesArtistId lookup (Strategy 1)', async () => {
      const mockTrack = {
        wrapperType: 'track',
        kind: 'song',
        artistId: 12345,
        trackName: 'Mystery',
        collectionName: 'GLOW ON',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/mystery.m4a',
        trackViewUrl: 'https://music.apple.com/us/album/mystery/12345?i=67890'
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ wrapperType: 'artist' }, mockTrack] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview('Turnstile', 12345);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('https://itunes.apple.com/lookup?id=12345&entity=song&limit=1');
      expect(result).toEqual({
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/mystery.m4a',
        previewTrackName: 'Mystery',
        collectionName: 'GLOW ON',
        itunesArtistId: 12345,
        trackViewUrl: 'https://music.apple.com/us/album/mystery/12345?i=67890'
      });

      // Second call must hit in-memory cache with zero network calls
      const cached = await resolveArtistAudioPreview('Turnstile', 12345);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(result);
    });

    it('falls back to artist name search when itunesArtistId is absent (Strategy 2)', async () => {
      const mockTrack = {
        wrapperType: 'track',
        kind: 'song',
        artistId: 99999,
        artistName: 'Gel',
        trackName: 'Attainable',
        collectionName: 'Only Constant',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/attainable.m4a'
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [mockTrack] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview('Gel');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('https://itunes.apple.com/search?term=Gel&entity=song&limit=10');
      expect(result?.previewTrackName).toBe('Attainable');
      expect(result?.previewUrl).toBe('https://audio-ssl.itunes.apple.com/itunes-assets/attainable.m4a');
    });

    it('caches null on negative lookup (unindexed underground band)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
      });
      global.fetch = fetchMock;

      const result = await resolveArtistAudioPreview('Obscure Basement Noise Collective 2026');
      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Re-query must return null without re-fetching
      const cached = await resolveArtistAudioPreview('Obscure Basement Noise Collective 2026');
      expect(cached).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Part 3: AudioPreviewPlayer Component & Lifecycle Rules', () => {
    it('renders audio player pill when previewUrl is present', () => {
      render(
        <AudioPreviewPlayer
          nodeId="turnstile"
          artistName="Turnstile"
          previewUrl="https://audio-ssl.itunes.apple.com/itunes-assets/mystery.m4a"
          previewTrackName="Mystery"
        />
      );

      expect(screen.getByText('Mystery')).toBeDefined();
      expect(screen.getByText('30s')).toBeDefined();
      expect(screen.getByText('Preview')).toBeDefined();
    });

    it('renders completely null (silent fallback) when preview is null', async () => {
      const { container } = render(
        <AudioPreviewPlayer
          nodeId="underground-band"
          artistName="Underground Band"
          previewUrl={null}
        />
      );

      // Wait for any async resolution to settle
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

  describe('Part 4: V39 Architectural Safety Guard (Rule 37 & Rule 40 Agnosticism)', () => {
    const baseArtistProfile = {
      summary: 'Turnstile is an American hardcore punk band formed in Baltimore, Maryland in 2010. They are widely celebrated for expanding the sonic boundaries of modern hardcore.',
      details: {
        genre: 'Hardcore Punk',
        style: 'Modern Hardcore',
        origin: 'Baltimore, MD, USA',
        founded: '2010',
        notableArtists: ['Trapped Under Ice', 'Angel Du$t']
      },
      recommendationReason: 'Seminal modern hardcore trailblazers combining groove with raw energy.',
      discography: [
        { albumName: 'Time & Space', releaseYear: '2018' },
        { albumName: 'GLOW ON', releaseYear: '2021' }
      ],
      imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/600x600bb.jpg'
    };

    it('qualifies artist profile with previewUrl present', () => {
      const profileWithPreview = {
        ...baseArtistProfile,
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a',
        previewTrackName: 'Mystery',
        itunesArtistId: 12345
      };

      expect(isFullyQualifiedEntityProfile(profileWithPreview, false)).toBe(true);
    });

    it('qualifies legacy artist profile with previewUrl completely omitted (0 Token JIT Healer Trigger)', () => {
      const legacyProfile = { ...baseArtistProfile };
      delete (legacyProfile as any).previewUrl;
      delete (legacyProfile as any).previewTrackName;
      delete (legacyProfile as any).itunesArtistId;

      expect(isFullyQualifiedEntityProfile(legacyProfile, false)).toBe(true);
    });

    it('qualifies underground artist profile with previewUrl explicitly null', () => {
      const undergroundProfile = {
        ...baseArtistProfile,
        imageUrl: 'not-found',
        discography: [],
        previewUrl: null,
        previewTrackName: null,
        itunesArtistId: null
      };

      expect(isFullyQualifiedEntityProfile(undergroundProfile, false)).toBe(true);
    });
  });
});


/**
 * Architecture V40: Instant 30-Second iTunes Audio Preview Player Component
 * Zero-token, on-demand client streaming overlaid on artist artwork in Deep Cuts and Magazine View.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  resolveArtistAudioPreview,
  resolveAlbumAudioPreview,
  isAlbumPreviewConfirmedUnavailable,
  AudioPreviewResult,
} from '../services/itunesPreviewService';
import { extractTrailingCountryIso } from '../shared/isoCountries';

// ─── SINGLETON GLOBAL AUDIO MANAGER ──────────────────────────────────────────
// Guarantees only ONE audio preview plays at any time across the entire application.
class GlobalAudioController {
  private static instance: GlobalAudioController;
  private audio: HTMLAudioElement | null = null;
  private currentTrackId: string | null = null;
  private listenerAbortController: AbortController | null = null;
  private listeners = new Set<(trackId: string | null, isPlaying: boolean, currentTime: number, duration: number) => void>();

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('zcene:stop-audio', () => this.stop());
      window.addEventListener('pagehide', () => this.stop());
    }
  }

  public static getInstance(): GlobalAudioController {
    if (!GlobalAudioController.instance) {
      GlobalAudioController.instance = new GlobalAudioController();
    }
    return GlobalAudioController.instance;
  }

  public subscribe(listener: (trackId: string | null, isPlaying: boolean, currentTime: number, duration: number) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const isPlaying = !!this.audio && !this.audio.paused && !this.audio.ended;
    const time = this.audio ? this.audio.currentTime : 0;
    const dur = this.audio && !isNaN(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 30;
    this.listeners.forEach(fn => fn(this.currentTrackId, isPlaying, time, dur));
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  public isTrackPlaying(trackId: string): boolean {
    return this.currentTrackId === trackId && !!this.audio && !this.audio.paused && !this.audio.ended;
  }

  public play(trackId: string, previewUrl: string, onError?: (err: any) => void) {
    if (this.currentTrackId === trackId && this.audio) {
      // If audio reached the end, restart from beginning; otherwise resume from paused timestamp
      if (this.audio.ended || (this.audio.duration > 0 && this.audio.currentTime >= this.audio.duration - 0.2)) {
        this.audio.currentTime = 0;
      }
      if (this.audio.paused) {
        this.audio.play().catch(err => {
          if (err.name === 'AbortError') return; // Silence rapid tap interruption
          console.warn('[GlobalAudioController] Resume failed:', err);
          this.notify();
        });
      }
      return;
    }

    // Stop current audio if playing different track
    this.stop();

    try {
      this.currentTrackId = trackId;
      const audio = new Audio(previewUrl);
      this.audio = audio;
      audio.volume = 0.85;

      const ac = new AbortController();
      this.listenerAbortController = ac;
      const signal = ac.signal;

      audio.addEventListener('play', () => {
        if (this.audio !== audio) return;
        this.notify();
      }, { signal });

      audio.addEventListener('pause', () => {
        if (this.audio !== audio) return;
        this.notify();
      }, { signal });

      audio.addEventListener('timeupdate', () => {
        if (this.audio !== audio) return;
        this.notify();
      }, { signal });

      audio.addEventListener('ended', () => {
        if (this.audio !== audio) return;
        this.stop();
      }, { signal });

      audio.addEventListener('error', (e) => {
        if (this.audio !== audio) return;
        // Architecture V40: Ignore harmless teardown events triggered when audio.src is cleared on stop/unmount
        if (!audio.src || audio.src === '' || audio.src === window.location.href || !this.currentTrackId) return;
        if (onError) {
          onError(e);
        } else {
          console.warn('[GlobalAudioController] Audio playback error:', e);
        }
        this.stop();
      }, { signal });

      audio.play().catch(err => {
        if (this.audio !== audio) return;
        if (err.name === 'AbortError') return; // Silence rapid tap interruption
        if (onError) {
          onError(err);
        } else {
          console.warn('[GlobalAudioController] Play stream error:', err);
        }
        this.stop();
      });
    } catch (e) {
      console.warn('[GlobalAudioController] Initialization failed:', e);
      this.stop();
    }
  }

  public pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  public stop() {
    if (this.listenerAbortController) {
      try {
        this.listenerAbortController.abort();
      } catch (e) {}
      this.listenerAbortController = null;
    }

    const prevAudio = this.audio;
    this.audio = null;

    if (prevAudio) {
      try {
        prevAudio.pause();
        prevAudio.currentTime = 0;
        prevAudio.removeAttribute('src');
        if (typeof prevAudio.load === 'function' && typeof navigator !== 'undefined' && !navigator.userAgent?.includes('jsdom')) {
          prevAudio.load();
        }
      } catch (e) {}
    }

    const prevId = this.currentTrackId;
    this.currentTrackId = null;
    if (prevId) {
      this.listeners.forEach(fn => fn(null, false, 0, 30));
    }
  }
}

export const audioController = GlobalAudioController.getInstance();

export const stopGlobalAudio = () => {
  audioController.stop();
};

export interface AudioPreviewPlayerProps {
  nodeId: string;
  artistName?: string;
  previewUrl?: string | null;
  previewTrackName?: string | null;
  itunesArtistId?: number | null;
  onPreviewResolved?: (resolved: { previewUrl: string; previewTrackName: string; itunesArtistId?: number }) => void;
  className?: string;
}

export const AudioPreviewPlayer: React.FC<AudioPreviewPlayerProps> = ({
  nodeId,
  artistName,
  previewUrl: initialPreviewUrl,
  previewTrackName: initialTrackName,
  itunesArtistId,
  onPreviewResolved,
  className = '',
}) => {
  const [preview, setPreview] = useState<AudioPreviewResult | null>(() => {
    if (initialPreviewUrl) {
      return {
        previewUrl: initialPreviewUrl,
        previewTrackName: initialTrackName || 'Preview',
        itunesArtistId: itunesArtistId || 0,
      };
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [hasResolved, setHasResolved] = useState(!!initialPreviewUrl);

  const abortControllerRef = useRef<AbortController | null>(null);
  const onPreviewResolvedRef = useRef(onPreviewResolved);
  const hasForceRefreshedRef = useRef(false);
  const pendingPlayRef = useRef(false);

  useEffect(() => {
    onPreviewResolvedRef.current = onPreviewResolved;
  }, [onPreviewResolved]);

  // Sync state if props update from cache or when nodeId changes
  useEffect(() => {
    if (initialPreviewUrl) {
      setPreview({
        previewUrl: initialPreviewUrl,
        previewTrackName: initialTrackName || 'Preview',
        itunesArtistId: Number(itunesArtistId) || 0,
      });
      setHasResolved(true);
    } else {
      setPreview(null);
      setHasResolved(false);
    }
    setIsLoading(false);
    hasForceRefreshedRef.current = false;
    pendingPlayRef.current = false;
  }, [nodeId, initialPreviewUrl, initialTrackName, itunesArtistId]);

  const playTrack = useCallback((trackPreviewUrl: string) => {
    audioController.play(nodeId, trackPreviewUrl, (mediaErr) => {
      const numericId = Number(itunesArtistId);
      if (numericId > 0 && !hasForceRefreshedRef.current) {
        hasForceRefreshedRef.current = true;
        console.log(`[AudioPreviewPlayer] Playback error for ${nodeId} (iTunes ID: ${numericId}). Auto self-healing with fresh iTunes preview...`);
        setIsLoading(true);
        resolveArtistAudioPreview(numericId, undefined, extractTrailingCountryIso(nodeId), true)
          .then(freshRes => {
            setIsLoading(false);
            if (freshRes?.previewUrl) {
              setPreview(freshRes);
              setHasResolved(true);
              onPreviewResolvedRef.current?.({
                previewUrl: freshRes.previewUrl,
                previewTrackName: freshRes.previewTrackName,
                itunesArtistId: freshRes.itunesArtistId,
              });
              audioController.play(nodeId, freshRes.previewUrl);
            } else {
              console.warn(`[AudioPreviewPlayer] Self-healing failed for ${nodeId}: No preview found.`);
            }
          })
          .catch(err => {
            setIsLoading(false);
            console.warn(`[AudioPreviewPlayer] Self-healing lookup failed for ${nodeId}:`, err);
          });
      } else {
        console.warn('[GlobalAudioController] Audio playback error:', mediaErr);
      }
    });
  }, [nodeId, itunesArtistId]);

  // On-demand fetch if previewUrl is missing but verified itunesArtistId exists
  useEffect(() => {
    if (preview?.previewUrl || hasResolved) return;

    const numericId = Number(itunesArtistId);
    if (!numericId || numericId <= 0) {
      // Do not lock hasResolved = true prematurely while details is still loading
      return;
    }

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsLoading(true);

    resolveArtistAudioPreview(numericId, ac.signal, extractTrailingCountryIso(nodeId))
      .then(res => {
        if (!ac.signal.aborted) {
          setHasResolved(true);
          setIsLoading(false);
          if (res) {
            setPreview(res);
            onPreviewResolvedRef.current?.({
              previewUrl: res.previewUrl,
              previewTrackName: res.previewTrackName,
              itunesArtistId: res.itunesArtistId,
            });
            if (pendingPlayRef.current) {
              pendingPlayRef.current = false;
              playTrack(res.previewUrl);
            }
          }
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setHasResolved(true);
          setIsLoading(false);
        }
      });

    return () => {
      ac.abort();
    };
  }, [nodeId, itunesArtistId, hasResolved, preview?.previewUrl, playTrack]);

  // Stop playback on node switch or unmount
  useEffect(() => {
    return () => {
      if (audioController.getCurrentTrackId() === nodeId) {
        audioController.stop();
      }
    };
  }, [nodeId]);

  // Subscribe to global playback updates
  useEffect(() => {
    const unsubscribe = audioController.subscribe((activeId, activePlaying, time, dur) => {
      if (activeId === nodeId) {
        setIsPlaying(activePlaying);
        setCurrentTime(time);
        if (dur > 0) setDuration(dur);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    });

    return unsubscribe;
  }, [nodeId]);

  const handleTogglePlay = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!preview?.previewUrl) return;

    if (isPlaying) {
      audioController.pause();
    } else {
      playTrack(preview.previewUrl);
    }
  }, [isPlaying, preview?.previewUrl, playTrack]);

  // If loading preview for a verified itunesArtistId, display centered glassmorphic pulse (clickable to auto-play when resolved)
  if (isLoading && !preview?.previewUrl) {
    return (
      <div 
        className={`absolute inset-0 flex items-center justify-center cursor-pointer select-none z-30 ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          pendingPlayRef.current = true;
        }}
        tabIndex={0}
        role="button"
        aria-label="Loading audio preview... Click to auto-play when ready"
        title="Loading audio preview... Click to auto-play when ready"
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            pendingPlayRef.current = true;
          }
        }}
      >
        <div className="w-12 h-12 rounded-full bg-black/45 border border-white/20 flex items-center justify-center animate-pulse backdrop-blur-sm shadow-md transition-transform duration-200 hover:scale-105 active:scale-95">
          <div className="w-4 h-4 rounded-full bg-white/30" />
        </div>
      </div>
    );
  }

  // Silent fallback: if resolved and no preview was found (or unindexed), render completely empty
  if (hasResolved && !preview?.previewUrl) {
    return null;
  }

  if (!preview?.previewUrl) {
    return null;
  }

  // Calculate circular progress (0 to 1) for 48px (12rem) watermark button
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div 
      className={`absolute inset-0 z-30 select-none cursor-pointer flex items-center justify-center ${className}`}
      onClick={handleTogglePlay}
      tabIndex={0}
      role="button"
      aria-label={isPlaying ? "Pause Preview" : `Play 30s Audio Preview: ${preview.previewTrackName}`}
      title={isPlaying ? "Pause Preview" : `Play 30s Audio Preview: ${preview.previewTrackName}`}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleTogglePlay(e as any);
        }
      }}
    >
      {/* Concentric "One-SVG" Watermark Disk */}
      <div className="relative w-12 h-12 flex items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95">
        <svg className="w-12 h-12 pointer-events-none" viewBox="0 0 52 52">
          {/* Layer 1: Background Glass Disk (Locked to exact cx/cy) */}
          <circle
            cx="26"
            cy="26"
            r={radius}
            className={`transition-colors duration-200 ${
              isPlaying 
                ? 'fill-black/75 stroke-primary/40' 
                : currentTime > 0
                  ? 'fill-black/60 stroke-primary/30'
                  : 'fill-black/20 hover:fill-black/35 stroke-white/10'
            }`}
            strokeWidth="1.5"
          />

          {/* Layer 2: Subtle Track Ring */}
          <circle
            cx="26"
            cy="26"
            r={radius}
            className="stroke-white/5 fill-none"
            strokeWidth="2.5"
          />

          {/* Layer 3: Active Yellow Progress Ring (Rotated in SVG coordinate space) */}
          {(isPlaying || currentTime > 0) && (
            <circle
              cx="26"
              cy="26"
              r={radius}
              className="stroke-primary fill-none transition-[stroke-dashoffset] duration-150 ease-linear"
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
          )}
        </svg>

        {/* Center Action Element: Raw Countdown when Playing; Optically Centered Play Icon when Idle/Paused */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {isPlaying ? (
            <span className="font-mono text-xs font-bold text-primary tracking-tight select-none">
              {Math.max(1, Math.ceil(duration - currentTime))}
            </span>
          ) : (
            <svg className="w-4 h-4 fill-white/85 select-none translate-x-[0.5px]" viewBox="0 0 20 20">
              <polygon points="7,4 17,10 7,16" />
            </svg>
          )}
        </div>
      </div>

      {/* Restored Bottom Gradient HUD: Track Name ONLY (Visible strictly when playing) */}
      <div className={`absolute bottom-0 inset-x-0 h-11 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end justify-center px-3 pb-2 pointer-events-none transition-opacity duration-300 ${
        isPlaying ? 'opacity-100' : 'opacity-0'
      }`}>
        <span className="text-xs font-medium text-white/90 truncate max-w-[150px] drop-shadow-md text-center">
          {preview.previewTrackName}
        </span>
      </div>
    </div>
  );
};

export interface AlbumAudioPreviewButtonProps {
  nodeId: string;
  albumIndex: number;
  artistName: string;
  albumName: string;
  itunesArtistId?: number | null;
  itunesCollectionId?: number | null;
  className?: string;
}

/**
 * Architecture V45.17: Compact, strictly on-click JIT 30-second audio preview button
 * for Essential Listening album rows. Coordinates single active playback through the
 * singleton GlobalAudioController using namespaced track IDs (`${nodeId}::album::${albumIndex}`).
 */
export const AlbumAudioPreviewButton: React.FC<AlbumAudioPreviewButtonProps> = ({
  nodeId,
  albumIndex,
  artistName,
  albumName,
  itunesArtistId,
  itunesCollectionId,
  className = '',
}) => {
  const trackId = `${nodeId}::album::${albumIndex}`;
  const countryIso = extractTrailingCountryIso(nodeId);

  const [preview, setPreview] = useState<AudioPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(() =>
    isAlbumPreviewConfirmedUnavailable({
      nodeId,
      artistName,
      albumName,
      itunesCollectionId,
      countryIso,
    })
  );
  const [needsGestureRetry, setNeedsGestureRetry] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasForceRefreshedRef = useRef(false);

  // Reset local state when artist/album identity changes
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPreview(null);
    setIsLoading(false);
    setNeedsGestureRetry(false);
    hasForceRefreshedRef.current = false;
    setIsUnavailable(
      isAlbumPreviewConfirmedUnavailable({
        nodeId,
        artistName,
        albumName,
        itunesCollectionId,
        countryIso,
      })
    );
  }, [nodeId, albumIndex, artistName, albumName, itunesCollectionId, countryIso]);

  // Subscribe to global singleton playback state
  useEffect(() => {
    setIsPlaying(audioController.isTrackPlaying(trackId));
    const unsubscribe = audioController.subscribe((activeId, activePlaying) => {
      setIsPlaying(activeId === trackId && activePlaying);
    });
    return unsubscribe;
  }, [trackId]);

  // Abort in-flight lookup & stop playback if this album row unmounts while active
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (audioController.getCurrentTrackId() === trackId) {
        audioController.stop();
      }
    };
  }, [trackId]);

  const playAlbumPreviewUrl = useCallback(
    (previewUrl: string) => {
      setNeedsGestureRetry(false);
      audioController.play(trackId, previewUrl, (mediaErr) => {
        if (mediaErr?.name === 'NotAllowedError') {
          // iOS Safari async gesture expiry: keep resolved preview cached so the next tap plays synchronously
          setNeedsGestureRetry(true);
          return;
        }
        if (!hasForceRefreshedRef.current) {
          hasForceRefreshedRef.current = true;
          setIsLoading(true);
          resolveAlbumAudioPreview({
            nodeId,
            artistName,
            albumName,
            itunesArtistId,
            itunesCollectionId,
            countryIso,
            forceRefresh: true,
          })
            .then((fresh) => {
              setIsLoading(false);
              if (fresh?.previewUrl) {
                setPreview(fresh);
                audioController.play(trackId, fresh.previewUrl, (retryErr) => {
                  if (retryErr?.name === 'NotAllowedError') {
                    setNeedsGestureRetry(true);
                  }
                });
              } else if (
                isAlbumPreviewConfirmedUnavailable({
                  nodeId,
                  artistName,
                  albumName,
                  itunesCollectionId,
                  countryIso,
                })
              ) {
                setIsUnavailable(true);
              }
            })
            .catch(() => {
              setIsLoading(false);
            });
        }
      });
    },
    [trackId, nodeId, artistName, albumName, itunesArtistId, itunesCollectionId, countryIso]
  );

  const handleTogglePlay = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isUnavailable || isLoading) return;

      if (isPlaying) {
        audioController.pause();
        return;
      }

      if (preview?.previewUrl) {
        playAlbumPreviewUrl(preview.previewUrl);
        return;
      }

      abortControllerRef.current?.abort();
      const ac = new AbortController();
      abortControllerRef.current = ac;
      setIsLoading(true);
      setNeedsGestureRetry(false);

      try {
        const resolved = await resolveAlbumAudioPreview({
          nodeId,
          artistName,
          albumName,
          itunesArtistId,
          itunesCollectionId,
          signal: ac.signal,
          countryIso,
        });

        if (ac.signal.aborted) return;
        setIsLoading(false);

        if (resolved?.previewUrl) {
          setPreview(resolved);
          playAlbumPreviewUrl(resolved.previewUrl);
        } else if (
          isAlbumPreviewConfirmedUnavailable({
            nodeId,
            artistName,
            albumName,
            itunesCollectionId,
            countryIso,
          })
        ) {
          setIsUnavailable(true);
        }
      } catch {
        if (!ac.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      isUnavailable,
      isLoading,
      isPlaying,
      preview?.previewUrl,
      playAlbumPreviewUrl,
      nodeId,
      artistName,
      albumName,
      itunesArtistId,
      itunesCollectionId,
      countryIso,
    ]
  );

  const ariaLabel = isUnavailable
    ? `No audio preview available for ${albumName}`
    : isLoading
      ? `Loading audio preview for ${albumName}`
      : isPlaying
        ? `Pause preview for ${albumName}`
        : `Play 30s preview for ${albumName}`;

  const titleText = isUnavailable
    ? 'No preview available'
    : isLoading
      ? 'Loading preview...'
      : isPlaying
        ? `Pause: ${preview?.previewTrackName || albumName}`
        : needsGestureRetry
          ? 'Tap again to play preview'
          : preview?.previewTrackName
            ? `Play preview: ${preview.previewTrackName}`
            : `Play 30s preview for ${albumName}`;

  return (
    <button
      type="button"
      onClick={handleTogglePlay}
      disabled={isUnavailable}
      aria-label={ariaLabel}
      aria-pressed={isPlaying}
      title={titleText}
      data-testid={`album-preview-btn-${albumIndex}`}
      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:ring-inset ${
        isUnavailable
          ? 'bg-zinc-900/40 border border-zinc-800/60 text-zinc-600 opacity-35 cursor-not-allowed'
          : isLoading
            ? 'bg-zinc-800/80 border border-primary/40 text-primary animate-pulse cursor-wait'
            : isPlaying
              ? 'bg-primary/20 border border-primary/60 text-primary cursor-pointer hover:bg-primary/30 active:scale-95'
              : 'bg-zinc-900/80 border border-zinc-700/60 text-zinc-400 hover:text-primary hover:border-primary/50 hover:bg-zinc-800 cursor-pointer active:scale-95'
      } ${className}`}
    >
      {isLoading ? (
        <span className="w-2.5 h-2.5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
      ) : isPlaying ? (
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="2.5" width="3.5" height="11" rx="0.8" />
          <rect x="9.5" y="2.5" width="3.5" height="11" rx="0.8" />
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5 fill-current translate-x-[0.5px]" viewBox="0 0 16 16" aria-hidden="true">
          <polygon points="4,2.5 13.5,8 4,13.5" />
        </svg>
      )}
    </button>
  );
};



/**
 * Architecture V40: Instant 30-Second iTunes Audio Preview Player Component
 * Zero-token, on-demand client streaming overlaid on artist artwork in Deep Cuts and Magazine View.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { resolveArtistAudioPreview, AudioPreviewResult } from '../services/itunesPreviewService';

// ─── SINGLETON GLOBAL AUDIO MANAGER ──────────────────────────────────────────
// Guarantees only ONE audio preview plays at any time across the entire application.
class GlobalAudioController {
  private static instance: GlobalAudioController;
  private audio: HTMLAudioElement | null = null;
  private currentTrackId: string | null = null;
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

  public play(trackId: string, previewUrl: string) {
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
      this.audio = new Audio(previewUrl);
      this.audio.volume = 0.85;

      this.audio.addEventListener('play', () => this.notify());
      this.audio.addEventListener('pause', () => this.notify());
      this.audio.addEventListener('timeupdate', () => this.notify());
      this.audio.addEventListener('ended', () => {
        this.stop();
      });

      this.audio.addEventListener('error', (e) => {
        // Architecture V40: Ignore harmless teardown events triggered when audio.src is cleared on stop/unmount
        if (!this.audio?.src || this.audio.src === '' || this.audio.src === window.location.href || !this.currentTrackId) return;
        console.warn('[GlobalAudioController] Audio playback error:', e);
        this.stop();
      });

      this.audio.play().catch(err => {
        if (err.name === 'AbortError') return; // Silence rapid tap interruption
        console.warn('[GlobalAudioController] Play stream error:', err);
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
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = '';
      } catch (e) {}
      this.audio = null;
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
  }, [nodeId, initialPreviewUrl, initialTrackName, itunesArtistId]);

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

    resolveArtistAudioPreview(numericId, ac.signal)
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
  }, [nodeId, itunesArtistId, hasResolved, preview?.previewUrl]);

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

  const handleTogglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!preview?.previewUrl) return;

    if (isPlaying) {
      audioController.pause();
    } else {
      audioController.play(nodeId, preview.previewUrl);
    }
  }, [nodeId, isPlaying, preview?.previewUrl]);

  // If loading preview for a verified itunesArtistId, display centered glassmorphic pulse
  if (isLoading && !preview?.previewUrl) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-30 ${className}`}>
        <div className="w-12 h-12 rounded-full bg-black/45 border border-white/20 flex items-center justify-center animate-pulse backdrop-blur-sm shadow-md">
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



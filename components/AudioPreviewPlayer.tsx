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

  private notify(isPlaying: boolean) {
    const time = this.audio ? this.audio.currentTime : 0;
    const dur = this.audio && !isNaN(this.audio.duration) ? this.audio.duration : 30;
    this.listeners.forEach(fn => fn(this.currentTrackId, isPlaying, time, dur));
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  public isTrackPlaying(trackId: string): boolean {
    return this.currentTrackId === trackId && !!this.audio && !this.audio.paused;
  }

  public play(trackId: string, previewUrl: string) {
    if (this.currentTrackId === trackId && this.audio) {
      if (this.audio.paused) {
        this.audio.play().catch(err => {
          console.warn('[GlobalAudioController] Play failed:', err);
          this.notify(false);
        });
        this.notify(true);
      }
      return;
    }

    // Stop current audio if playing different track
    this.stop();

    try {
      this.currentTrackId = trackId;
      this.audio = new Audio(previewUrl);
      this.audio.volume = 0.85;

      this.audio.addEventListener('timeupdate', () => {
        this.notify(true);
      });

      this.audio.addEventListener('ended', () => {
        this.stop();
      });

      this.audio.addEventListener('error', (e) => {
        console.warn('[GlobalAudioController] Audio playback error:', e);
        this.stop();
      });

      this.audio.play().then(() => {
        this.notify(true);
      }).catch(err => {
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
      this.notify(false);
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

  // If loading preview for a verified itunesArtistId, display subtle 28px shimmer loader
  if (isLoading && !preview?.previewUrl) {
    return (
      <div className={`flex items-center justify-center my-2.5 w-full select-none ${className}`}>
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/80 shadow-md animate-pulse">
          <div className="w-5 h-5 rounded-full bg-zinc-800" />
          <div className="w-24 h-3 rounded bg-zinc-800" />
          <div className="w-8 h-3 rounded bg-zinc-800/60" />
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

  // Calculate circular progress (0 to 1)
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className={`flex items-center justify-center my-2.5 w-full select-none ${className}`}>
      <div 
        onClick={handleTogglePlay}
        className="group flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/70 hover:border-zinc-500 shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-200 cursor-pointer max-w-full"
        title={isPlaying ? "Pause Preview" : "Play 30s Audio Preview"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleTogglePlay(e as any);
          }
        }}
      >
        {/* Play/Pause Button with SVG Progress Ring */}
        <div className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center">
          <svg className="absolute inset-0 w-6 h-6 -rotate-90 pointer-events-none" viewBox="0 0 26 26">
            {/* Background ring */}
            <circle
              cx="13"
              cy="13"
              r={radius}
              className="stroke-zinc-700/60 fill-none"
              strokeWidth="2"
            />
            {/* Active progress ring */}
            {isPlaying && (
              <circle
                cx="13"
                cy="13"
                r={radius}
                className="stroke-primary fill-none transition-[stroke-dashoffset] duration-150 ease-linear"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            )}
          </svg>

          {/* Center Play/Pause Icon Button */}
          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
            isPlaying 
              ? 'bg-primary text-brand-black shadow-[0_0_8px_rgba(246,228,104,0.4)]' 
              : 'bg-zinc-200 text-zinc-950 group-hover:bg-white group-hover:scale-105'
          }`}>
            {isPlaying ? (
              // Pause Icon
              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              // Play Icon
              <svg className="w-2.5 h-2.5 fill-current translate-x-[0.5px]" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>

        {/* Track Title */}
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-200 truncate max-w-[130px] sm:max-w-[190px] leading-tight group-hover:text-white transition-colors">
              {preview.previewTrackName}
            </span>
            <span className="text-[9px] uppercase tracking-wider font-semibold text-zinc-500 flex-shrink-0">
              30s
            </span>
          </div>
        </div>

        {/* Remaining / Elapsed Pill */}
        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/90 px-1.5 py-0.5 rounded border border-zinc-700/50 flex-shrink-0">
          {isPlaying 
            ? `${Math.max(0, Math.ceil(duration - currentTime))}s` 
            : 'Preview'}
        </span>
      </div>
    </div>
  );
};


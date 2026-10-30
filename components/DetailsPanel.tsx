import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import { Node, NodeDetails, GraphData, View, ChatMessage, StackItem, UserTaste, TasteProfile, COST_PER_AI_CALL } from '../types';
import { streamNodeChat, streamLocalHeuristicChat, fetchNodeDetails } from '../services/geminiService';
import { normalizeArtistId, titleCaseArtistId, cleanArtistDisplayName, cleanLabelDisplayName, isNodeInSeedList, getArtistDocWithRedirect, enforceArtistCacheSchema, isArtistIdMatch } from '../services/artistCacheService';
import { analyticsService } from '../services/analyticsService';
import { Spinner, HelpIcon, MicIcon, LoadingSpinner, DETAIL_THINKING_STEPS, StackIcon, BandcampIcon } from './Icons';
import { TokenConfirmationDialog, PROFILE_COLORS, MODAL_PROFILE_COLORS } from './SharedModals';
import { SegmentedTextToggle } from './ui/SegmentedTextToggle';
import { db, auth, functions } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { TOKEN_PRICING } from '../shared/tokenEconomy';
import { formatSystemTimestamp, extractInitials } from '../utils/formatters';
import { Select, InputSizes, LayoutSizes, Button } from './DesignSystem';
import { Flame, Pin } from 'lucide-react';
import { useDominantColor } from '../hooks/useDominantColor';
const SENTINEL_INSIGHT = 'No insight provided.';

export const getArtistDisplayName = (details: any, node: any): string => {
  if (node?.type === 'label') {
    const raw = (node?.label && typeof node.label === 'string' && node.label.trim())
      ? node.label.trim()
      : (node?.id || '');
    return cleanLabelDisplayName(raw);
  }
  if (details?.details?.artist && typeof details.details.artist === 'string' && details.details.artist.trim()) {
    return cleanArtistDisplayName(details.details.artist.trim());
  }
  if (node?.label && typeof node.label === 'string' && node.label.trim()) {
    return cleanArtistDisplayName(node.label.trim());
  }
  return cleanArtistDisplayName(node?.id || '');
};


declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

// --- Sub-component: Shared Empty State ---
const ZceneEmptyState: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => (
    <div className="max-w-md w-full pointer-events-auto">
        <div className="flex items-center justify-center mb-2 gap-1">
            <div className="w-10 shrink-0 invisible" aria-hidden="true" />
            <h3 className="text-xs font-medium text-white text-center">Create Your Zcene</h3>
            <button onClick={() => onNavigate(View.Help)} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors pointer-events-auto shrink-0 leading-none" title="Help">
                <HelpIcon className="!text-[18px]" />
            </button>
        </div>
        <div className="mt-3 text-zinc-400 text-sm space-y-4">
            <p className="text-center px-4">Start with a few of your favorite artists, and Zcene will map how they connect across genres, labels, origins, and scenes.</p>
            <div className="text-left bg-zinc-800/30 p-5 rounded-xl border border-zinc-700/50 mx-4 text-sm">
                <p className="font-medium text-zinc-200 mb-2">How it works</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                    <li>Add 1–5 artists (or import your library).</li>
                    <li>Create your Zcene.</li>
                    <li>Drag, filter, and explore connections.</li>
                </ol>
            </div>
        </div>
    </div>
);

// --- Sub-component: Safe YouTube Player with Error Detection ---
interface SafeYoutubePlayerProps {
  videoId?: string | null;
  artistDisplay: string;
}

const SafeYoutubePlayer: React.FC<SafeYoutubePlayerProps> = ({ videoId, artistDisplay }) => {
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!videoId) return;

    setHasError(false);

    // Dynamic injection of the YouTube IFrame API script (only if not already injected)
    if (!window.YT && !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    let player: any = null;
    let isDestroyed = false;

    const initPlayer = () => {
      if (!containerRef.current || isDestroyed) return;
      
      const playerDivId = `yt-player-${videoId}`;
      containerRef.current.innerHTML = `<div id="${playerDivId}" class="w-full h-full"></div>`;

      try {
        player = new window.YT.Player(playerDivId, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            color: 'white',
            origin: window.location.origin
          },
          events: {
            onError: (event: any) => {
              console.warn('SafeYoutubePlayer error detected:', event.data);
              // YT.Player error codes:
              // 2: Invalid parameter
              // 5: HTML5 player error
              // 100: Video not found (removed/private)
              // 101/150: Video embedding restricted by owner/label
              if ([2, 5, 100, 101, 150].includes(event.data)) {
                setHasError(true);
              }
            }
          }
        });
        playerRef.current = player;
      } catch (err) {
        console.error('Failed to initialize YT.Player:', err);
        setHasError(true);
      }
    };

    const checkAPIAndInit = () => {
      if (isDestroyed) return;
      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        setTimeout(checkAPIAndInit, 100);
      }
    };

    checkAPIAndInit();

    return () => {
      isDestroyed = true;
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (e) {
          // ignore destroy errors
        }
      }
    };
  }, [videoId]);

  if (!videoId) {
    const src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(artistDisplay + ' official music video')}`;
    return (
      <iframe
        src={src}
        className="w-full h-full aspect-video border-0 bg-zinc-950"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-zinc-950 border border-zinc-800 text-center gap-3 relative overflow-hidden">
        {/* Subtle scanline texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)' }} />
        <span className="material-symbols-outlined text-zinc-600 !text-3xl">domain_disabled</span>
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">Embedding Blocked</h5>
          <p className="text-[10px] text-zinc-500 max-w-[240px] mt-1.5 leading-relaxed">
            The uploader or label has restricted this video from playing on external domains. You can watch it directly on YouTube:
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-[200px] mt-1 z-10">
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold uppercase tracking-wider text-brand-black bg-primary px-3 py-2 hover:bg-white transition-all text-center rounded-none"
          >
            Watch on YouTube ↗
          </a>
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(artistDisplay + ' live')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-zinc-800 px-3 py-2 hover:bg-zinc-900 transition-all text-center"
          >
            Search Live Footage ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full aspect-video border-0 bg-zinc-950" />
  );
};

// --- Helper: Highlighted Text ---
export const HighlightedText: React.FC<{ text: string; query?: string }> = ({ text, query }) => {
    if (!query || !query.trim()) return <>{text}</>;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <span key={index} className="bg-primary text-brand-black font-bold px-0.5 rounded-sm">
                        {part}
                    </span>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    );
};

export const renderWithHighlights = (children: React.ReactNode, query?: string): React.ReactNode => {
    if (!query || !query.trim()) return children;
    
    return React.Children.map(children, child => {
        if (typeof child === 'string') {
            return <HighlightedText text={child} query={query} />;
        }
        return child;
    });
};

// --- Sub-component: Single Detail Card ---
interface NodeDetailsCardProps {
  node: Node;
  details: NodeDetails | null;
  isLoading: boolean;
  isGlobalLoading: boolean;
  graphData: GraphData;
  libraryArtists: string[];
  seedArtists: string[];
  onAddArtist: (artistName: string) => void;
  isSmallScreen: boolean;
  onTogglePin: () => void;
  isPinned: boolean;
  pinSequence?: number;
  onNodeClick: (node: Node | null, forceActionState?: boolean) => void;

  onNavigate: (view: View) => void;
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  isChatLoading: boolean;
  chatMode: 'instant' | 'live';
  onChatModeChange: (mode: 'instant' | 'live') => void;
  liveMessageCount: number;
  hasActiveDeepWebSession?: boolean;
  onDeleteMessage?: (index: number) => void;
  onClearChat?: () => void;
  isFullScreenMode?: boolean;
  isHero?: boolean;
  onAddToStack: (node: Node, link?: string) => void;
  onToggleMagazineView?: () => void;
  searchQuery?: string;
  isGuest?: boolean;
  user?: any;
  onAuthRequest?: () => void;
  userTaste?: UserTaste;
  isAdmin?: boolean;
  onUpdateTasteProfile?: (taste: UserTaste) => Promise<void>;
  onShowToast?: (message: string) => void;
  onOpenTasteModal?: () => void;
  isActive?: boolean;
  onStashArtist?: (artistName: string) => void;
  onOpenStackDrawer?: () => void;
}

const parseTourDates = (text: string): { isTouring: boolean; dates: string[] } => {
    const cleaned = text.trim();
    if (!cleaned) {
        return { isTouring: false, dates: [] };
    }
    const lower = cleaned.toLowerCase();
    if (
        lower.includes("no active tour dates found") || 
        lower.includes("not touring") || 
        lower.includes("no upcoming events") || 
        lower.includes("no tour dates")
    ) {
        return { isTouring: false, dates: [] };
    }

    const lines = cleaned.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            let processed = line.replace(/^[•\-\*\d\.\s\u2022\u2013\u2014]+/, '').trim();
            processed = processed.replace(/\s*[\-\u2013\u2014]\s*/, ' — ');
            return processed;
        })
        .filter(line => line.length > 0 && line.includes('—'));

    if (lines.length === 0) {
        return { isTouring: false, dates: [] };
    }

    return { isTouring: true, dates: lines };
};

const isTourCacheStale = (tourCachedAtString: string | undefined): boolean => {
    if (!tourCachedAtString) return true;
    const cachedDate = new Date(tourCachedAtString);
    if (isNaN(cachedDate.getTime())) return true;
    
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - cachedDate.getTime()) >= sevenDaysMs;
};

// ---------------------------------------------------------------------------
// ProfileRow — per-profile row in the Style Compatibility Meter.
// Fully controlled: isExpanded and onToggle are driven by the parent list
// so that only one profile row can be expanded at a time (mutual exclusivity).
// ---------------------------------------------------------------------------
interface ProfileRowProps {
    data: {
        profile: TasteProfile;
        matches: number;
        totalActive: number;
        criteria: Array<{ id: string; name: string; active: boolean; matched: boolean; value: string }>;
    };
    colorHex: string;
    isSmallScreen: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    userTaste: UserTaste | null | undefined;
    onUpdateTasteProfile?: (taste: UserTaste) => void;
}

const ProfileRow: React.FC<ProfileRowProps> = ({ data, colorHex, isSmallScreen, isExpanded, onToggle, userTaste, onUpdateTasteProfile }) => {

    return (
        <div className="flex flex-col gap-1 group">
            {/* Header: profile name | hits count | remove button */}
            <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-300 font-medium">{data.profile.name}</span>
                <div className="flex items-center relative z-[60]">
                    <span className="font-mono font-bold" style={{ color: colorHex }}>
                        {data.matches}/{data.totalActive} Hits
                    </span>
                    {/* Remove button: hover-gated on desktop, visible when expanded on mobile */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!userTaste) return;
                            const newTaste = userTaste.filter(p => p.id !== data.profile.id);
                            onUpdateTasteProfile?.(newTaste);
                        }}
                        className={`flex flex-shrink-0 items-center justify-center transition-all text-zinc-500 hover:text-white rounded-full hover:bg-zinc-800 relative z-[60] ${
                            isSmallScreen
                                ? (isExpanded ? 'w-4 h-4 ml-1.5 opacity-100' : 'w-0 h-4 ml-0 opacity-0 pointer-events-none overflow-hidden')
                                : 'w-0 h-4 ml-0 opacity-0 group-hover:w-4 group-hover:h-4 group-hover:ml-1.5 group-hover:opacity-100 overflow-hidden'
                        }`}
                        title="Remove Profile"
                    >
                        <span className="material-symbols-outlined !text-[12px]">close</span>
                    </button>
                </div>
            </div>
            {/* Bar grid: tappable on mobile to reveal criterion labels */}
            <div
                className={`grid grid-cols-5 gap-1.5 w-full relative ${
                    isSmallScreen ? 'cursor-pointer' : 'group'
                }`}
                onClick={isSmallScreen ? onToggle : undefined}
                role={isSmallScreen ? 'button' : undefined}
                aria-expanded={isSmallScreen ? isExpanded : undefined}
                aria-label={isSmallScreen ? `${data.profile.name} style breakdown` : undefined}
            >
                {data.criteria.map((c, idx) => {
                    const isActive = c.active;
                    const isMatched = c.matched;
                    let bgStyle: React.CSSProperties = {};
                    let borderStyle: React.CSSProperties = {};

                    if (isActive) {
                        if (isMatched) {
                            bgStyle = { backgroundColor: colorHex };
                            borderStyle = { borderColor: colorHex, borderStyle: 'solid' };
                        } else {
                            bgStyle = { backgroundColor: 'transparent' };
                            borderStyle = { borderColor: '#52525b', borderStyle: 'solid' };
                        }
                    } else {
                        bgStyle = { backgroundColor: 'transparent' };
                        borderStyle = { borderColor: '#52525b', borderStyle: 'dashed' };
                    }

                    const positionClass =
                        idx === 0
                            ? 'left-0 translate-x-0 text-left'
                            : idx === 4
                            ? 'right-8 left-auto translate-x-0 text-right'
                            : 'left-1/2 -translate-x-1/2 text-center';

                    return (
                        <div
                            key={c.id}
                            className="h-2 border transition-all duration-300 relative"
                            style={{ ...bgStyle, ...borderStyle }}
                        >
                            {isActive && c.value && (
                                isSmallScreen ? (
                                    // Mobile: persistent inline label — visible only when row is expanded
                                    isExpanded ? (
                                        <div className={`absolute bottom-full mb-1 ${positionClass} max-w-[80px] sm:max-w-[100px] bg-zinc-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-[70] truncate`}>
                                            {c.value}
                                        </div>
                                    ) : null
                                ) : (
                                    // Desktop: hover tooltip
                                    <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 ${positionClass} max-w-[80px] sm:max-w-[100px] bg-zinc-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-[70] truncate`}>
                                        {c.value}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const NodeDetailsCard: React.FC<NodeDetailsCardProps> = ({
  node, details, isLoading, isGlobalLoading, graphData, libraryArtists, seedArtists, onAddArtist, isSmallScreen, 
  onTogglePin, isPinned, pinSequence, onNodeClick, onNavigate, 
  chatHistory, onSendMessage, isChatLoading, chatMode, onChatModeChange, liveMessageCount, hasActiveDeepWebSession = false, onDeleteMessage, onClearChat, isFullScreenMode = false, isHero = false, onAddToStack, onToggleMagazineView, searchQuery, isGuest = false, onAuthRequest, user, userTaste, isAdmin = false,
  onUpdateTasteProfile, onShowToast, onOpenTasteModal, isActive = true, onStashArtist, onOpenStackDrawer
}) => {
    const handleAddToTaste = async (node: Node, details: NodeDetails) => {
        if (!user) {
            onAuthRequest?.();
            return;
        }
        if (!onUpdateTasteProfile) return;
        const currentTaste = userTaste || [];

        if (currentTaste.length >= 5) {
            if (onShowToast) {
                onShowToast("Maximum 5 taste profiles reached");
            }
            if (onOpenTasteModal) {
                onOpenTasteModal();
            }
            return;
        }

        const profileName = getArtistDisplayName(details, node);
        const rawGenreStr = details?.details?.genre || '';
        const genreArray = rawGenreStr.split(',').map(s => s.trim()).filter(Boolean);
        const genre = genreArray.length > 0 ? genreArray[0] : '';
        let style = details?.details?.style || (details as any)?.style || '';

        if (!style) {
            if (genreArray.length > 1) {
                style = genreArray[1];
            } else if (genreArray.length === 1 && details.summary) {
                const keywords = ["melodic", "post", "experimental", "heavy", "progressive", "raw", "ambient", "pop"];
                const summaryLower = details.summary.toLowerCase();
                for (const keyword of keywords) {
                    if (summaryLower.includes(keyword)) {
                        style = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                        break;
                    }
                }
            }
        }

        const rawOrigin = details?.details?.origin || '';
        const origin = rawOrigin.replace(/,\s*(USA|United States|UK|U\.S\.A\.|U\.K\.)$/i, '').trim();
        let eraMin = null;
        const foundedStr = details?.details?.founded;
        if (foundedStr) {
            const match = foundedStr.match(/\d{4}/);
            if (match) eraMin = parseInt(match[0], 10);
        }

        const newProfile: TasteProfile = {
            id: crypto.randomUUID(),
            name: profileName || `Profile ${currentTaste.length + 1}`,
            color: MODAL_PROFILE_COLORS[currentTaste.length % MODAL_PROFILE_COLORS.length].name,
            isActive: true,
            favoriteLabel: (associatedLabels ? associatedLabels.split(',')[0].trim() : '') || '',
            favoriteGenre: genre,
            style: style,
            favoriteOrigin: origin,
            eraMin: eraMin,
            eraMax: null
        };

        const updatedTaste = [...currentTaste, newProfile];
        await onUpdateTasteProfile(updatedTaste);
        if (onShowToast) {

        }
    };

    const isLocked = useMemo(() => {
        return !!(details && details.summary && details.summary.trim().length > 5 && !details._isSentinel);
    }, [details]);

    const isArtistNode = node.type === 'artist';
    const isLabelNode = node.type === 'label';

    const sentinelRef = useRef<HTMLDivElement>(null);
    const panelScrollRef = useRef<HTMLDivElement>(null);
    // Measures the rendered height of the non-sticky action icons block dynamically.
    // Used as the scroll target so the value adapts automatically (e.g. when style bars change).
    const actionIconsRef = useRef<HTMLDivElement>(null);
    // Guards against re-running the scroll effect when the same node re-renders.
    const lastScrolledNodeId = useRef<string | null>(null);

    // Effect 1 — Guard Invalidator (must be declared BEFORE the scroll effect).
    // React runs effects in declaration order within the same commit. By resetting
    // lastScrolledNodeId to null here, the scroll effect below is guaranteed to see
    // a cleared guard when isFullScreenMode transitions back to false (Magazine exit) or on pagination.
    useEffect(() => {
        if (isFullScreenMode) {
            // Explicitly reset the header state on Magazine entry so the titles don't render small.
            setIsHeaderStuck(false);
        } else {
            // Clear the guard on Magazine exit OR on pagination change
            // so the scroll executor runs on the fresh view.
            lastScrolledNodeId.current = null;
        }
    }, [isFullScreenMode, isActive]);

    // Effect 2 — Scroll Executor.
    // Fire AFTER content is stable (details resolved + isLocked), not during the loading skeleton.
    // On Magazine exit, Effect 1 above has already reset the guard to null in this same commit,
    // so the node.id check correctly passes and the scroll fires for the current node.
    useEffect(() => {
        if (isFullScreenMode || !isActive || !panelScrollRef.current || !details || !isLocked) return;

        // Simple guard: null (cleared by invalidator on Magazine exit) or a different node → scroll.
        if (lastScrolledNodeId.current === node.id) return;
        lastScrolledNodeId.current = node.id;

        // Pre-set compact state so the header is already at its final height before rAF fires.
        // When onScroll reads scrollTop it will call setIsHeaderStuck(true) — same value, no re-render loop.
        setIsHeaderStuck(true);

        // Force-Scroll Polling: During the 300ms horizontal pagination transition, the browser's layout engine
        // can forcefully clamp or ignore single vertical scrollTop assignments on the moving flex item.
        // We continuously enforce the target offset for 350ms to guarantee it sticks as it settles into the viewport.
        let rafId: number;
        const startTime = Date.now();

        const forceScroll = () => {
            if (!panelScrollRef.current || !actionIconsRef.current) return;
            
            const panel = panelScrollRef.current;
            const targetOffset = actionIconsRef.current.offsetHeight;
            const maxScroll = panel.scrollHeight - panel.clientHeight;

            // Only apply if the layout has enough space, preventing it from clamping to 0 and triggering onScroll(false)
            if (maxScroll >= targetOffset) {
                panel.scrollTop = targetOffset;
            }

            if (Date.now() - startTime < 350) {
                rafId = requestAnimationFrame(forceScroll);
            }
        };
        
        rafId = requestAnimationFrame(forceScroll);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [node.id, details, isLocked, isFullScreenMode, isActive]);

    useEffect(() => {
        if (!isFullScreenMode || !sentinelRef.current) return;
        const scrollContainer = sentinelRef.current.closest('.overflow-y-auto') || window;
        let lastStuck = false;
        let frameId = 0;
        let timeoutId: NodeJS.Timeout;

        const checkStuck = () => {
            if (!sentinelRef.current) return;
            const rect = sentinelRef.current.getBoundingClientRect();
            
            let boundaryTop = 0;
            if (scrollContainer instanceof Element) {
                boundaryTop = scrollContainer.getBoundingClientRect().top;
            }
            
            // Add a 1px buffer to ensure smooth trigger
            const isStuck = rect.top <= boundaryTop + 1;
            
            if (isStuck !== lastStuck) {
                lastStuck = isStuck;
                setIsHeaderStuck(isStuck);
            }
        };

        const onScroll = () => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(checkStuck);
        };

        // Initial check with slight delay for layout to settle
        timeoutId = setTimeout(checkStuck, 50);

        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });

        return () => {
            scrollContainer.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            cancelAnimationFrame(frameId);
            clearTimeout(timeoutId);
        };
    }, [isFullScreenMode]);
    const [chatInput, setChatInput] = useState('');

    const [clickedChips, setClickedChips] = useState<Set<string>>(new Set());
    const [isCatalogOpen, setIsCatalogOpen] = useState(!isFullScreenMode);
    const [isConnectionsOpen, setIsConnectionsOpen] = useState(!isFullScreenMode);

    useEffect(() => {
        setIsCatalogOpen(!isFullScreenMode);
        setIsConnectionsOpen(!isFullScreenMode);
    }, [isFullScreenMode]);
    // Tracks which profile row is expanded on mobile — only one at a time.
    const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
    const styleBarContainerRef = useRef<HTMLDivElement>(null);

    // Reset expanded row when navigating to a different artist card.
    useEffect(() => { setExpandedProfileId(null); }, [node.id]);

    // Close expanded style breakdown when tapping or clicking outside
    useEffect(() => {
        if (!expandedProfileId) return;

        const handleClickOutside = (event: PointerEvent | MouseEvent | TouchEvent) => {
            if (
                styleBarContainerRef.current &&
                !styleBarContainerRef.current.contains(event.target as globalThis.Node)
            ) {
                setExpandedProfileId(null);
            }
        };

        document.addEventListener('pointerdown', handleClickOutside, true);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside, true);
        };
    }, [expandedProfileId]);
    
    const { queryChips, connectionPeers } = useMemo(() => {
        const chips = isLabelNode ? [
            "What is their legacy in the scene?",
            "What genres do they specialize in?",
            "Who are their most notable artists?",
            "When were they founded and where?"
        ] : [
            "Where are they from?",
            "What sound do they have?",
            "What labels are they on?",
            "Recent history?"
        ];
        
        const peerLinks = graphData.links.filter(l => 
            ((typeof l.source === 'object' ? l.source.id : l.source) === node.id || 
            (typeof l.target === 'object' ? l.target.id : l.target) === node.id)
        );
        
        const peers = peerLinks.map(l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === node.id ? targetId : sourceId;
        }).filter(peerId => {
            const peerNode = graphData.nodes.find(n => n.id === peerId);
            return peerNode && peerNode.type === 'artist';
        });

        const formatTitle = (str: string) => {
            return str.split(/[-\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        };
        const connectionPeers = Array.from(new Set(peers)).map(peer => cleanArtistDisplayName(peer as string, graphData.nodes)).sort();
        
        return { queryChips: chips, connectionPeers };
    }, [node.id, isLabelNode, graphData.links, graphData.nodes]);

    const associatedLabels = useMemo(() => {
        if (!isArtistNode) return '';

        // 1. Direct metadata fallback check
        const directLabel = (details?.details as any)?.label || (node as any)?.recordLabel || (node as any)?.labels;
        if (directLabel) {
            if (Array.isArray(directLabel)) {
                const joined = directLabel.filter(Boolean).map(l => cleanLabelDisplayName(l)).filter(Boolean).join(', ');
                if (joined) return joined;
            } else if (typeof directLabel === 'string' && directLabel.trim()) {
                return cleanLabelDisplayName(directLabel.trim());
            }
        }

        // 2. Edge traversal in graphData
        if (!graphData?.links || !graphData?.nodes) return '';

        const labelSet = new Set<string>();
        const activeId = node.id;
        const activeNorm = normalizeArtistId(activeId);

        for (const link of graphData.links) {
            const sourceNode = typeof link.source === 'object'
                ? link.source
                : graphData.nodes.find(n => n.id === link.source);
            const targetNode = typeof link.target === 'object'
                ? link.target
                : graphData.nodes.find(n => n.id === link.target);

            if (!sourceNode || !targetNode) continue;

            const isSourceActive = sourceNode.id === activeId || normalizeArtistId(sourceNode.id) === activeNorm;
            const isTargetActive = targetNode.id === activeId || normalizeArtistId(targetNode.id) === activeNorm;

            if (isSourceActive && targetNode.type === 'label') {
                const rawName = targetNode.label || targetNode.id;
                const displayName = cleanLabelDisplayName(rawName, graphData.nodes) || rawName;
                if (displayName) labelSet.add(displayName);
            } else if (isTargetActive && sourceNode.type === 'label') {
                const rawName = sourceNode.label || sourceNode.id;
                const displayName = cleanLabelDisplayName(rawName, graphData.nodes) || rawName;
                if (displayName) labelSet.add(displayName);
            }
        }

        return Array.from(labelSet).join(', ');
    }, [isArtistNode, node.id, (details?.details as any)?.label, (node as any)?.recordLabel, (node as any)?.labels, graphData?.links, graphData?.nodes]);

    const [isListening, setIsListening] = useState(false);
    const [imageTier, setImageTier] = useState<'source' | 'placeholder'>('source');
    const [imgLoaded, setImgLoaded] = useState(false);
    const [isIdCopied, setIsIdCopied] = useState(false);
    const [isHeaderStuck, setIsHeaderStuck] = useState(true);
    const imgRef = useRef<HTMLImageElement>(null);

    const currentImageUrl = useMemo(() => {
        if (imageTier === 'source' && details?.imageUrl) {
            return details.imageUrl;
        }
        return null;
    }, [imageTier, details?.imageUrl]);

    const localDominantColor = useDominantColor(currentImageUrl, node.label || node.id || '');

    const availableImageTiers = useMemo(() => {
        const tiers: ('source' | 'placeholder')[] = [];
        if (details?.imageUrl) tiers.push('source');
        tiers.push('placeholder');
        return tiers;
    }, [details?.imageUrl]);
    

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const prevHistoryLength = useRef(chatHistory.length);

    const libraryArtistSet = useMemo(() => new Set(libraryArtists.map(a => normalizeArtistId(a))), [libraryArtists]);

    const resolvedArtistName = getArtistDisplayName(details, node);
    const normalizedArtistNodeId = isArtistNode ? normalizeArtistId(resolvedArtistName) : '';

    const isLibraryArtist = isArtistNode && libraryArtistSet.has(normalizedArtistNodeId);
    const isSeedArtist = isArtistNode && isNodeInSeedList(node.id || node.label || '', seedArtists);

    const activeTasteProfilesData = useMemo(() => {
        if (!userTaste || !Array.isArray(userTaste) || !details) return [];

        const activeProfiles = userTaste.filter(p => p.isActive);
        
        return activeProfiles.map(profile => {
            const favLabelActive = !!profile.favoriteLabel?.trim();
            const favGenreActive = !!profile.favoriteGenre?.trim();
            const styleActive = !!profile.style?.trim();
            const favOriginActive = !!profile.favoriteOrigin?.trim();
            const eraActive = profile.eraMin !== null || profile.eraMax !== null;

            const hasTasteData = favLabelActive || favGenreActive || styleActive || favOriginActive || eraActive;

            let favLabelMatched = false;
            let favGenreMatched = false;
            let styleMatched = false;
            let favOriginMatched = false;
            let eraMatched = false;

            // 1. Match Favorite Label
            if (favLabelActive) {
                const favLabel = profile.favoriteLabel.toLowerCase().trim();
                const labelString = (associatedLabels || (details?.details as any)?.label || '').toLowerCase().trim();
                favLabelMatched = !!labelString && (labelString.includes(favLabel) || favLabel.includes(labelString));
            }

            // 2. Match Favorite Genre
            if (favGenreActive) {
                const favGenre = profile.favoriteGenre.toLowerCase().trim();
                const genre = (details?.details?.genre || '').toLowerCase().trim();
                favGenreMatched = !!genre && (genre.includes(favGenre) || favGenre.includes(genre));
            }

            // 3. Match Style
            if (styleActive) {
                const rawStyle = (profile.style || '').trim().toLowerCase();
                const nodeStyle = (details?.details?.style || (details as any)?.style || '').toLowerCase().trim();
                const genre = (details?.details?.genre || '').toLowerCase();
                const bio = (details?.summary || '').toLowerCase();
                const deepCutDesc = (details?.recommendationReason || '').toLowerCase();

                // Evaluate exact-phrase match first to prevent false-positives from multi-word styles (e.g. "Dream Pop", "Wall of Sound")
                if (rawStyle.length > 0 && (
                    (nodeStyle.length > 0 && (nodeStyle.includes(rawStyle) || rawStyle.includes(nodeStyle))) ||
                    genre.includes(rawStyle) ||
                    bio.includes(rawStyle) ||
                    deepCutDesc.includes(rawStyle)
                )) {
                    styleMatched = true;
                } else if (rawStyle.includes(',')) {
                    // Secondary fallback for legacy comma-separated entries (e.g. "melodic, post")
                    const styleTokens = rawStyle.split(',').map(k => k.trim()).filter(k => k.length > 0);
                    styleMatched = styleTokens.some(token => 
                        (nodeStyle.length > 0 && nodeStyle.includes(token)) ||
                        genre.includes(token) ||
                        bio.includes(token) ||
                        deepCutDesc.includes(token)
                    );
                }
            }

            // 4. Match Favorite Origin
            if (favOriginActive) {
                const favOrigin = profile.favoriteOrigin.toLowerCase().trim();
                const origin = (details?.details?.origin || '').toLowerCase().trim();
                favOriginMatched = !!origin && (origin.includes(favOrigin) || favOrigin.includes(origin));
            }

            // 5. Match Founded Year Range
            if (eraActive) {
                const foundedStr = details?.details?.founded || '';
                if (foundedStr) {
                    const yearMatch = foundedStr.match(/\b(19\d{2}|20\d{2})\b/);
                    let year = yearMatch ? parseInt(yearMatch[0]) : null;
                    
                    if (!year) {
                        const decadeMatch = foundedStr.match(/\b(\d{2})s\b/);
                        if (decadeMatch) {
                            const decVal = parseInt(decadeMatch[1]);
                            year = decVal >= 50 ? 1900 + decVal : 2000 + decVal;
                        }
                    }
                    
                    if (year) {
                        let isEraMatch = true;
                        if (profile.eraMin !== null && year < profile.eraMin) {
                            isEraMatch = false;
                        }
                        if (profile.eraMax !== null && year > profile.eraMax) {
                            isEraMatch = false;
                        }
                        eraMatched = isEraMatch;
                    }
                }
            }

            const criteria = [
                { id: 'label', name: 'Label', active: favLabelActive, matched: favLabelMatched, value: profile.favoriteLabel || '' },
                { id: 'genre', name: 'Genre', active: favGenreActive, matched: favGenreMatched, value: profile.favoriteGenre || '' },
                { id: 'style', name: 'Style', active: styleActive, matched: styleMatched, value: profile.style || '' },
                { id: 'origin', name: 'Origin', active: favOriginActive, matched: favOriginMatched, value: profile.favoriteOrigin || '' },
                { id: 'founded', name: 'Founded', active: eraActive, matched: eraMatched, value: (profile.eraMin !== null && profile.eraMax !== null) ? `${profile.eraMin} – ${profile.eraMax}` : (profile.eraMin !== null ? `${profile.eraMin}+` : (profile.eraMax !== null ? `Until ${profile.eraMax}` : '')) }
            ];

            const totalActive = (favLabelActive ? 1 : 0) + (favGenreActive ? 1 : 0) + (styleActive ? 1 : 0) + (favOriginActive ? 1 : 0) + (eraActive ? 1 : 0);
            const matches = (favLabelMatched ? 1 : 0) + (favGenreMatched ? 1 : 0) + (styleMatched ? 1 : 0) + (favOriginMatched ? 1 : 0) + (eraMatched ? 1 : 0);

            return {
                profile,
                hasTasteData,
                totalActive,
                matches,
                criteria
            };
        });
    }, [userTaste, details, node.id, node.label, associatedLabels]);



    useEffect(() => {
        setImgLoaded(false);
        if (details?.imageUrl) {
            setImageTier('source');
        } else {
            // Only regress to placeholder if we didn't previously have a valid image URL.
            // This prevents the image from blinking out during a transient background
            // revalidation pass that returns an empty imageUrl before the full data settles.
            setImageTier(prev => prev === 'source' ? 'placeholder' : prev);
        }
    }, [node.id, details?.imageUrl]);

    useEffect(() => {
        if (imgRef.current && imgRef.current.complete && currentImageUrl) {
            setImgLoaded(true);
        }
    }, [currentImageUrl]);

    const handleImageError = () => {
        setImgLoaded(false);
        setImageTier('placeholder');
    };

    useEffect(() => {
      if (chatHistory.length > 0 && (chatHistory.length > prevHistoryLength.current || isChatLoading)) {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }
      prevHistoryLength.current = chatHistory.length;
    }, [chatHistory, isChatLoading]);

    const wasPinnedRef = useRef(isPinned);
    
    useEffect(() => {
        if (isFullScreenMode && isPinned && !wasPinnedRef.current) {
            // Card was just pinned in Magazine View — anchor viewport to its top
            const SCROLL_PADDING = 40; // Same padding used elsewhere for floating headers
            const timeoutId = setTimeout(() => {
                const container = document.getElementById('magazine-scroll-container');
                const targetEl = document.getElementById(`magazine-card-${node.id}`);
                if (container && targetEl) {
                    const containerRect = container.getBoundingClientRect();
                    const targetRect = targetEl.getBoundingClientRect();
                    const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
                    container.scrollTo({ top: relativeTop - SCROLL_PADDING, behavior: 'smooth' });
                }
            }, 50); // Small delay to allow the React DOM to re-order the cards first
            return () => clearTimeout(timeoutId);
        }
        wasPinnedRef.current = isPinned;
    }, [isPinned, isFullScreenMode, node.id]);

    const handleSend = () => {
      if (!chatInput.trim() || isChatLoading) return;
      onSendMessage(chatInput);
      setChatInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSpeechToText = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        setIsListening(true);
        recognition.start();
        recognition.onresult = (event: any) => setChatInput(event.results[0][0].transcript);
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
    };



    const handleCopyId = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const displayName = getArtistDisplayName(details, node);
            await navigator.clipboard.writeText(displayName);
            setIsIdCopied(true);
            setTimeout(() => setIsIdCopied(false), 2000);
            analyticsService.track('Node ID Copied', { node_id: node.id });
        } catch (err) {
            console.error("Failed to copy ID", err);
        }
    };

    const links = useMemo(() => {
        // --- Deterministic Catalog Fallbacks (Section 5 / Link Hardening) ---
        // The client fully owns both purchase-tier buttons. AI-provided raw domains are never
        // rendered directly — hijacked official sites return HTTP 200 and bypass the http-sanitiser.
        // Both search destinations are structurally guaranteed never to 404 or redirect to spam.
        const artistDisplay = getArtistDisplayName(details, node);
        const bandcampSearchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(artistDisplay)}`;
        const officialSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(artistDisplay)}+official+website`;

        // Null-filter AI-supplied links (strips empty strings, non-http, legacy cache junk).
        // AI is instructed not to include Official Website or Bandcamp, so aiLinks should
        // only contain Wikipedia and other grounded reference links.
        const aiLinks = (details?.links || []).filter(l => !!l.url);

        // Honour an AI-verified Bandcamp URL if present; otherwise use the search fallback.
        const hasBandcampFromAi = aiLinks.some(l => /bandcamp/i.test(l.site));
        const bandcampEntry = hasBandcampFromAi
            ? null
            : { site: 'Bandcamp', url: bandcampSearchUrl };

        // Official Website: ALWAYS use the deterministic Google search URL.
        // Never render a raw AI-provided official domain — even a valid-looking domain may be
        // a hijacked asset that resolves 200 OK but serves malicious or spam content.
        const officialEntry = { site: 'Official Website', url: officialSearchUrl };

        const all = [
            ...aiLinks.filter(l => !/bandcamp|official website/i.test(l.site)), // Wikipedia + other info links
            ...(bandcampEntry ? [bandcampEntry] : aiLinks.filter(l => /bandcamp/i.test(l.site))),
            officialEntry,
        ];

        const purchase = all.filter(l => /bandcamp|official website/i.test(l.site));
        const info     = all.filter(l => !/bandcamp|official website/i.test(l.site));
        return { purchase, info };
    }, [details?.links, node.id]);

    const headerSizeClass = isFullScreenMode 
        ? 'text-5xl font-bold tracking-tight'
        : 'text-xl font-medium';

    const panelContent = (
        <>
            <div className={`flex flex-col min-h-full ${isFullScreenMode ? '' : 'pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:pb-20'}`}>
                {/* 1. Action Icons (Not Sticky) — ref measures its rendered height for the dynamic scroll target */}
                <div ref={actionIconsRef} className={`pt-3 ${isFullScreenMode ? 'px-0 bg-transparent' : 'px-4 bg-zinc-900'} z-20 flex-shrink-0`}>
                    <div className={`flex items-center justify-end gap-1 flex-shrink-0 ${isFullScreenMode ? 'w-fit ml-auto' : ''}`}>
                            {(isArtistNode || isLabelNode) && (
                                <button
                                    onClick={() => {
                                        if (!user) {
                                            onAuthRequest?.();
                                            return;
                                        }
                                        onAddToStack(node, links.purchase?.[0]?.url);
                                        onOpenStackDrawer?.();
                                    }}
                                    className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 active:scale-95 leading-none cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800"
                                    title="Save to My Stack"
                                >
                                    <StackIcon className="!text-[18px]" />
                                </button>
                            )}
                            {isArtistNode && details && (
                                <button
                                    onClick={() => handleAddToTaste(node, details)}
                                    className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800 active:scale-95 leading-none text-zinc-400 hover:text-white hover:bg-zinc-800"
                                    title="Add to Style"
                                >
                                    <Flame size={18} />
                                </button>
                            )}


                            <button 
                                onClick={(e) => {
                                    e.currentTarget.blur();
                                    onTogglePin();
                                }} 
                                className={`relative w-8 h-8 flex flex-shrink-0 items-center justify-center border rounded-xl active:scale-95 transition-all duration-200 leading-none ${
                                    isPinned 
                                        ? 'border-zinc-700/50 text-primary bg-zinc-900 hover:text-primary hover:border-zinc-500 hover:bg-zinc-800' 
                                        : 'border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-800'
                                }`} 
                                title={isPinned ? "Unpin Card" : "Pin Card"}
                            >
                                <Pin className="w-[18px] h-[18px]" />
                                {pinSequence !== undefined && (
                                    <div className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-zinc-900 border border-zinc-700 text-[9px] font-bold text-white rounded-full">
                                        {pinSequence}
                                    </div>
                                )}
                            </button>


                        </div>
                </div>

                <div ref={sentinelRef} className="w-full h-[1px] -mt-[1px] pointer-events-none" />
                {/* 2. Artist Name & Pills */}
                <div 
                    className={`transition-all duration-300 flex-shrink-0 sticky z-40 w-full ${
                        isFullScreenMode 
                            ? isHeaderStuck ? 'top-2' : 'top-0'
                            : `top-0 border-b ${isHeaderStuck ? 'border-zinc-800/50 bg-zinc-900' : 'border-transparent bg-transparent'}`
                    }`}
                >
                    <div className={`transition-all duration-300 ${
                        isFullScreenMode
                            ? isHeaderStuck
                                ? 'w-fit bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-full px-3 md:px-4 py-1.5 shadow-lg -ml-1 md:-ml-4'
                                : 'w-full bg-transparent border border-transparent px-0 pt-2 pb-1'
                            : `w-full px-4 ${isHeaderStuck ? 'py-2' : 'pt-2 pb-1'}`
                    }`}>
                    <div className={`flex flex-col ${isHeaderStuck ? 'gap-0' : 'gap-1.5'} min-w-0 flex-grow transition-all duration-300`}>
                            <div className="flex items-center gap-2">
                                <div 
                                    onClick={handleCopyId}
                                    className="group flex items-center gap-2 cursor-copy w-fit transition-all active:scale-[0.98] min-w-0"
                                    title="Click to copy name"
                                >
                                    <h3 className={`${isHeaderStuck ? 'text-base font-medium' : headerSizeClass} text-white leading-[0.9] py-1 break-words min-w-0 ${isFullScreenMode ? '' : 'transition-all duration-300'}`}>
                                        <HighlightedText text={getArtistDisplayName(details, node) || ''} query={searchQuery} />
                                    </h3>
                                    <span className={`material-symbols-outlined !text-[16px] flex-shrink-0 transition-all duration-300 ${isIdCopied ? 'text-primary opacity-100 scale-110' : 'text-zinc-500 opacity-0 group-hover:opacity-100'}`}>
                                        {isIdCopied ? 'check' : 'content_copy'}
                                    </span>
                                </div>
                            </div>
                            <div className={`flex flex-wrap items-center gap-2 transition-all duration-300 overflow-hidden ${isHeaderStuck ? 'max-h-0 opacity-0 mt-0' : 'max-h-10 opacity-100 mt-1'}`}>
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded-xl">{node.type}</span>
                                {isSeedArtist && <span className="text-[10px] font-semibold uppercase tracking-widest bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-xl">ROOT</span>}
                                {isLibraryArtist && <span className="text-[10px] font-semibold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-xl">LIBRARY</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`flex-grow min-h-0 relative ${isFullScreenMode ? 'pt-6 pb-4 px-0 overflow-x-clip' : 'px-4 pt-6 pb-8'}`}>
                    {isLoading && !isLocked && details && (
                        <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center text-center space-y-8 h-full ${isFullScreenMode ? 'bg-zinc-900/50 backdrop-blur-sm' : 'bg-zinc-900/90 backdrop-blur-sm bg-zinc-900'}`}>
                            <LoadingSpinner 
                                steps={DETAIL_THINKING_STEPS}
                                subtext="Typically takes 20–30 seconds to dig for details."
                            />
                        </div>
                    )}
                    {(!details || !isLocked) && (
                        node.type === 'founded' || node.type === 'country' ? (
                            <div className="flex flex-col items-center justify-center text-center py-12 px-6 space-y-6 h-full bg-zinc-900 text-zinc-300">
                                <div className="w-16 h-16 rounded-full bg-zinc-800/80 flex items-center justify-center border border-zinc-700/50 shadow-inner">
                                    <span className="material-symbols-outlined text-zinc-400 !text-3xl select-none">
                                        {node.type === 'founded' ? 'calendar_today' : 'public'}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-xl font-bold tracking-tight text-white">{node.label || node.id}</h4>
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                                        {node.type === 'founded' ? 'Founded Year' : 'Origin Location'}
                                    </p>
                                </div>
                                <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">
                                    {node.type === 'founded' 
                                        ? "This metadata node represents the year connected artists were formed or active."
                                        : "This metadata node represents the geographic origin of connected artists."
                                    }
                                </p>
                            </div>
                        ) : isLoading ? (
                            <div className="flex flex-col items-center justify-center text-center py-12 space-y-8 h-full bg-zinc-900">
                                <LoadingSpinner 
                                    steps={DETAIL_THINKING_STEPS}
                                    subtext="Typically takes 20–30 seconds to dig for details."
                                />
                            </div>
                        ) : isGlobalLoading ? (
                            <div className="flex flex-col items-center justify-center text-center py-12 space-y-8 h-full bg-zinc-900">
                                <LoadingSpinner 
                                    steps={["Waiting for Connections to settle...", "Mapping relationships first...", "Synchronising nodes..."]}
                                    subtext="Graph mapping takes priority. Details will follow."
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-12 px-6 space-y-6 h-full bg-zinc-900 text-zinc-300">
                                <div className="w-16 h-16 rounded-full bg-zinc-850 flex items-center justify-center border border-zinc-800/50 shadow-inner">
                                    <span className="material-symbols-outlined text-zinc-400 !text-3xl select-none">
                                        music_note
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-xl font-bold tracking-tight text-white">{node.label || node.id}</h4>
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                                        Data Unavailable
                                    </p>
                                </div>
                                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
                                    Deep Cut details for this node could not be loaded.
                                </p>
                            </div>
                        )
                    )}

                    {details && (
                        <div className={`space-y-6 text-zinc-300 ${isFullScreenMode ? 'pb-6' : 'pb-16'}`}>
                            {/* Compatibility Meter (Hidden for Labels) */}
                            {!isLabelNode && activeTasteProfilesData.length > 0 && (
                                <div ref={styleBarContainerRef} className="flex flex-col gap-2 w-full -mt-1.5">

                                        <div className="flex flex-col gap-2">

                                            {activeTasteProfilesData.map((data) => {
                                                const hexMap: Record<string, string> = {
                                                    purple: '#a855f7',
                                                    teal: '#2dd4bf',
                                                    sky: '#38bdf8',
                                                    indigo: '#6366f1',
                                                    pink: '#ec4899',
                                                    orange: '#f97316'
                                                };
                                                const colorHex = hexMap[data.profile.color] || '#a855f7';
                                                return (
                                                    <ProfileRow
                                                        key={data.profile.id}
                                                        data={data}
                                                        colorHex={colorHex}
                                                        isSmallScreen={isSmallScreen}
                                                        isExpanded={expandedProfileId === data.profile.id}
                                                        onToggle={() => setExpandedProfileId(prev =>
                                                            prev === data.profile.id ? null : data.profile.id
                                                        )}
                                                        userTaste={userTaste}
                                                        onUpdateTasteProfile={onUpdateTasteProfile}
                                                    />
                                                );
                                            })}
                                            {/* Single Master Header for Sub-labels */}
                                            <div className="grid grid-cols-5 gap-1.5 w-full text-[8px] font-mono tracking-widest uppercase select-none text-zinc-500 mt-0">
                                                <span className="text-center truncate">LABEL</span>
                                                <span className="text-center truncate">GENRE</span>
                                                <span className="text-center truncate">STYLE</span>
                                                <span className="text-center truncate">ORIGIN</span>
                                                <span className="text-center truncate">FOUNDED</span>
                                            </div>
                                        </div>
                                </div>
                            )}

                            {!isLabelNode && (
                                <div className="relative mx-auto w-fit">
                                {imageTier !== 'placeholder' && currentImageUrl ? (
                                    <>
                                        {/* Ambient Glow */}
                                        <div className={`absolute ${isFullScreenMode ? 'inset-[-20%] blur-2xl' : 'inset-[-15%] rounded-full opacity-35 blur-2xl'} transition-colors duration-1000 z-0 pointer-events-none`} style={isFullScreenMode ? { background: 'radial-gradient(ellipse at center, var(--scene-accent, transparent) 0%, transparent 70%)' } : { backgroundColor: 'var(--scene-accent, transparent)' }} />
                                        <div className={`w-40 h-40 sm:w-44 sm:h-44 flex-shrink-0 mx-auto bg-zinc-900 overflow-hidden relative ring-1 ring-white/10 ring-inset rounded-lg group z-10 ${isFullScreenMode ? 'shadow-[0_48px_120px_0px_rgba(0,0,0,1),0_12px_40px_0px_rgba(0,0,0,0.9)]' : 'shadow-[0_12px_36px_0px_rgba(0,0,0,0.85),0_3px_8px_0px_rgba(0,0,0,0.65)]'}`}>
                                            {/* Temporary Loading Skeleton while image loads */}
                                            {!imgLoaded && (
                                                <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-6 text-center bg-zinc-900 overflow-hidden z-10">
                                                    <img 
                                                        src={isLabelNode 
                                                            ? "https://storage.googleapis.com/zcene-prod-assets/Deep%20Cut%20background.png"
                                                            : "https://storage.googleapis.com/zcene-prod-assets/Artist%20background.png"
                                                        }
                                                        alt="Background" 
                                                        className="absolute inset-0 w-full h-full object-cover opacity-30 filter blur-sm scale-105 transition-transform duration-1000 group-hover:scale-100" 
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/60 to-transparent" />
                                                    <div className="relative z-10 flex flex-col items-center justify-center space-y-2">
                                                        <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center backdrop-blur-sm group-hover:border-purple-500/50 transition-colors duration-500">
                                                            <span className="material-symbols-outlined text-zinc-400 group-hover:text-purple-400 transition-colors duration-500 text-2xl">
                                                                {isLabelNode ? 'album' : 'music_note'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Primary / Secondary Image */}
                                            <img 
                                                ref={imgRef}
                                                src={currentImageUrl} 
                                                alt={getArtistDisplayName(details, node)} 
                                                className={`relative w-full h-full object-cover block scale-105 group-hover:scale-100 transition-all duration-1000 ${imgLoaded ? 'opacity-100 z-20' : 'opacity-0 z-0'}`}
                                                onLoad={() => setImgLoaded(true)}
                                                onError={handleImageError}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className={`w-40 h-40 sm:w-44 sm:h-44 flex-shrink-0 mx-auto bg-gradient-to-br from-zinc-800/40 to-zinc-900/80 overflow-hidden relative ring-1 ring-white/10 ring-inset rounded-lg z-10 flex items-center justify-center ${isFullScreenMode ? 'shadow-[0_48px_120px_0px_rgba(0,0,0,1),0_12px_40px_0px_rgba(0,0,0,0.9)]' : 'shadow-[0_12px_36px_0px_rgba(0,0,0,0.85),0_3px_8px_0px_rgba(0,0,0,0.65)]'}`}>
                                        <span className="text-8xl font-black text-white/5 uppercase select-none absolute bottom-0 right-0 translate-y-[14%] translate-x-[8%] leading-none">
                                            {extractInitials(getArtistDisplayName(details, node))}
                                        </span>
                                    </div>
                                )}
                                </div>
                            )}

                            {(() => {
                                const hasInsight = details.recommendationReason &&
                                    details.recommendationReason !== SENTINEL_INSIGHT &&
                                    details.recommendationReason.trim().length > 0;
                                // Fallback: strip all common markdown syntax from summary before
                                // displaying it as a quote. Raw Gemini output can contain bold (**),
                                // italic (*/_), headings (#), links ([text](url)), and inline code (`)
                                // which must not leak through to the serif quote display.
                                const stripMarkdown = (text: string) =>
                                    text
                                        .replace(/\*\*(.+?)\*\*/g, '$1')   // bold **text**
                                        .replace(/\*(.+?)\*/g, '$1')        // italic *text*
                                        .replace(/_(.+?)_/g, '$1')          // italic _text_
                                        .replace(/#{1,6}\s*/g, '')           // headings
                                        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
                                        .replace(/`(.+?)`/g, '$1')          // inline code
                                        .trim();
                                const summaryFallback = details.summary
                                    ? stripMarkdown(details.summary).substring(0, 120) + (details.summary.length > 120 ? '...' : '')
                                    : null;
                                const quoteText = hasInsight ? details.recommendationReason : summaryFallback;
                                return quoteText ? (
                                    <div className="pt-2 relative z-10">
                                        <p className="italic text-zinc-100 leading-tight font-serif tracking-tight text-xl">
                                            "<HighlightedText text={quoteText} query={searchQuery} />"
                                        </p>
                                    </div>
                                ) : null;
                            })()}



                            {isArtistNode ? (
                                <div className="grid grid-cols-3 gap-x-4 gap-y-4 py-4 border-b border-zinc-800/50">
                                    {/* Row 1: Label | Genre | Style */}
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Label</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {associatedLabels || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Genre</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.genre || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Style</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.style || (details as any)?.style || '—'}
                                        </p>
                                    </div>

                                    {/* Row 2: Origin | Founded | (Empty <div>) */}
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Origin</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.origin || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Founded</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.founded || '—'}
                                        </p>
                                    </div>
                                    <div className="min-w-0" aria-hidden="true" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-x-4 py-4 border-b border-zinc-800/50">
                                    {/* Row 1: Genre | Origin | Founded */}
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Genre</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.genre || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Origin</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.origin || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Founded</h4>
                                        <p className="text-sm font-normal text-zinc-200 break-words leading-snug">
                                            {details.details?.founded || '—'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <h4 className="font-bold text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Bio</h4>
                                <div className={`leading-relaxed text-zinc-300 markdown-bio ${isFullScreenMode ? 'text-base font-normal' : 'text-sm'} ${isHero ? 'column-count-1 md:column-count-2 md:gap-12' : ''}`}>
                                    <Markdown components={{
                                        p: ({node, children, ...props}) => <p className="mb-4" {...props}>{renderWithHighlights(children, searchQuery)}</p>,
                                        strong: ({node, children, ...props}) => <strong className="font-semibold text-white" {...props}>{renderWithHighlights(children, searchQuery)}</strong>,
                                        li: ({node, children, ...props}) => <li className="marker:text-primary" {...props}>{renderWithHighlights(children, searchQuery)}</li>
                                    }}>{details.summary}</Markdown>
                                </div>
                            </div>

                            {!isLabelNode && details.members && details.members.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-widest">Members</h4>
                                    <p className="text-sm text-zinc-400">{details.members.join(' • ')}</p>
                                </div>
                            )}

                            {details.details?.notableArtists && details.details.notableArtists.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-3 text-[10px] uppercase tracking-widest">
                                        {isLabelNode ? 'Released Artists / Scene Circle' : 'Scene Circle'}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {details.details.notableArtists.map(artistName => {
                                            const normalizedArtist = normalizeArtistId(artistName);
                                            const existingNode = graphData?.nodes.find(n => 
                                                n.type === 'artist' && isArtistIdMatch(n.id, artistName)
                                            );
                                            const isExistingInGraph = !!existingNode;

                                            if (isGuest) {
                                              return (
                                                <div 
                                                    key={artistName} 
                                                    className="border border-zinc-800 bg-zinc-900/50 text-zinc-500 py-1.5 px-4 text-sm rounded-xl"
                                                >
                                                    <span className="truncate px-0.5 tracking-normal">{artistName}</span>
                                                </div>
                                              );
                                            }
                                            return (
                                                <button 
                                                    key={artistName} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isExistingInGraph) {
                                                            if (onNodeClick && existingNode) {
                                                                onNodeClick(existingNode);
                                                            }
                                                        } else {
                                                            if (onStashArtist) {
                                                                onStashArtist(artistName);
                                                            } else {
                                                                onAddArtist(normalizedArtist);
                                                            }
                                                        }
                                                    }}
                                                    className={`border py-1.5 px-4 transition-all text-sm flex items-center gap-1.5 rounded-xl cursor-pointer ${
                                                        isExistingInGraph 
                                                            ? 'border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700' 
                                                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 active:scale-95'
                                                    }`}
                                                >
                                                    <span className="truncate tracking-normal">{artistName}</span>
                                                    {isExistingInGraph ? (
                                                        <span className="material-symbols-outlined !text-[14px] text-primary">check_circle</span>
                                                    ) : (
                                                        <StackIcon className="!text-[14px] opacity-70" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {details.discography && details.discography.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-widest">
                                        {isLabelNode ? 'Key Catalog Releases' : 'Essential Listening'}
                                    </h4>
                                    <div className="grid grid-cols-1 gap-2">
                                        {details.discography.map((album, i) => (
                                            <div key={i} className="flex justify-between items-baseline border-b border-zinc-800/50 pb-1">
                                                <span className="text-zinc-200 px-0.5 tracking-normal text-sm">{album.albumName}</span>
                                                <span className="text-zinc-500 flex-shrink-0 font-mono text-[10px]">{album.releaseYear}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {links.purchase.length > 0 && (
                                <div className="pt-6">
                                    <button 
                                        onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                                        className="flex w-full items-center justify-between font-semibold text-zinc-500 text-[10px] uppercase tracking-widest mb-4 hover:text-zinc-300 transition-colors"
                                    >
                                        <span>{isLabelNode ? 'Label Catalog' : 'Artist Catalog'}</span>
                                        <span className="material-symbols-outlined !text-[16px]">
                                            {isCatalogOpen ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                    {isCatalogOpen && (
                                        <div className="p-5 bg-primary/5 border-[0.5px] border-primary">
                                            <div className="flex flex-col gap-3">
                                                {/* Watch on YouTube button (Hidden for labels) */}
                                            {!isLabelNode && (() => {
                                                const artistDisplay = getArtistDisplayName(details, node);
                                                const youtubeVideoId = details.youtubeVideoId;
                                                const youtubeUrl = youtubeVideoId && youtubeVideoId.length === 11
                                                    ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
                                                    : `https://www.youtube.com/results?search_query=${encodeURIComponent(artistDisplay)}+official+music+video`;

                                                return (
                                                    <a 
                                                        href={youtubeUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="flex items-center justify-start px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.98] bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-700 hover:border-zinc-600"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="material-symbols-outlined !text-[18px]">
                                                                play_circle
                                                            </span>
                                                            <span className="px-0.5 tracking-normal text-sm">
                                                                YouTube
                                                            </span>
                                                        </div>
                                                    </a>
                                                );
                                            })()}

                                            {links.purchase.map((link, i) => {
                                                const isBandcamp = /bandcamp/i.test(link.site);
                                                return (
                                                    <a 
                                                        key={i} 
                                                        href={link.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="flex items-center justify-start px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.98] bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-700 hover:border-zinc-600"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {isBandcamp ? (
                                                                <BandcampIcon className="w-[18px] h-[18px] flex-shrink-0" />
                                                            ) : (
                                                                <span className="material-symbols-outlined !text-[18px]">
                                                                    public
                                                                </span>
                                                            )}
                                                            <span className="px-0.5 tracking-normal text-sm">
                                                                {isBandcamp ? 'Bandcamp' : link.site}
                                                            </span>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}


                            <div className="pt-6 border-t border-zinc-800">
                                <button 
                                    onClick={() => setIsConnectionsOpen(!isConnectionsOpen)}
                                    className="flex w-full items-center justify-between font-semibold text-zinc-500 text-[10px] uppercase tracking-widest mb-4 hover:text-zinc-300 transition-colors"
                                >
                                    <span>Deep Connections</span>
                                    <span className="material-symbols-outlined !text-[16px]">
                                        {isConnectionsOpen ? 'expand_less' : 'expand_more'}
                                    </span>
                                </button>
                                {isConnectionsOpen && (
                                    <>
                                        {isGuest ? (
                                    <div className="flex flex-col items-center justify-center text-center p-6 bg-zinc-900/50 rounded-xl border border-zinc-800/80">
                                        <span className="material-symbols-outlined !text-4xl text-primary/50 mb-3">lock</span>
                                        <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-200 mb-2">DEEPER CONNECTION</h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto mb-4">
                                            Unlock our advanced AI assistant features to map deeper relationships across your music canvas.
                                        </p>
                                        {user ? (
                                            <button 
                                                onClick={() => onAuthRequest?.()}
                                                className={`w-full flex items-center justify-center gap-2 bg-primary ${isSmallScreen ? 'px-8 py-4 text-lg rounded-2xl' : 'px-6 py-2 text-sm rounded-xl'} font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                                    <line x1="12" y1="11" x2="12" y2="17" />
                                                    <line x1="9" y1="14" x2="15" y2="14" />
                                                </svg>
                                                Save to my Zcenes
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => onAuthRequest?.()}
                                                className={`w-full flex items-center justify-center gap-2 bg-primary ${isSmallScreen ? 'px-8 py-4 text-lg rounded-2xl' : 'px-6 py-2 text-sm rounded-xl'} font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                                    <polyline points="10 17 15 12 10 7" />
                                                    <line x1="15" y1="12" x2="3" y2="12" />
                                                </svg>
                                                Sign in to save
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        <div className="flex flex-col bg-zinc-950/20 border border-zinc-800/50 p-4">
                                            <div ref={chatContainerRef} className={`max-h-60 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-zinc-800 pr-1 ${chatHistory.length === 0 ? 'hidden' : 'mb-4'}`}>
                                            {chatHistory.length === 0 ? null : (
                                            chatHistory.map((msg, i) => (
                                                <div key={i} className={`flex flex-col group relative ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <div className={`max-w-[90%] px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-200 border-r-4 border-primary' : 'bg-zinc-900/50 text-zinc-300 border-l-4 border-zinc-600 shadow-sm'} rounded-xl`}>
                                                        {msg.text}
                                                    </div>
                                                    {msg.timestamp && (
                                                        <span className="font-mono text-xs text-zinc-300 font-normal mt-1 px-1 flex items-center gap-2">
                                                            {formatSystemTimestamp(msg.timestamp)}
                                                            {onDeleteMessage && (
                                                                <button 
                                                                    onClick={() => onDeleteMessage(i)}
                                                                    className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 transition-opacity p-0.5 inline-flex items-center"
                                                                    title="Delete Message"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[12px] leading-none">delete</span>
                                                                </button>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                        {isChatLoading && (
                                            <div className="flex items-start">
                                                <div className="bg-zinc-900 border-l-4 border-primary px-4 py-2 flex items-center gap-2 rounded-xl">
                                                    <div className="flex gap-1">
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mb-3">
                                        <SegmentedTextToggle
                                            value={chatMode}
                                            onChange={(val) => onChatModeChange(val as 'instant' | 'live')}
                                            options={[
                                                { id: 'instant', label: 'Instant AI' },
                                                { id: 'live', label: 'Deep Web' }
                                            ]}
                                            className="w-[180px] h-8"
                                        />
                                        <div className="flex items-center gap-3">
                                            {onClearChat && chatHistory.length > 0 && (
                                                <button 
                                                    onClick={onClearChat}
                                                    className="px-3 py-1.5 text-[10px] text-zinc-500 hover:text-red-400 hover:bg-red-500/10 uppercase tracking-widest font-semibold rounded-lg transition-colors border border-transparent flex items-center justify-center"
                                                >
                                                    Clear Chat
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="relative min-h-[160px] flex flex-col">
                                        {chatMode === 'live' ? (
                                            <div className="flex flex-col flex-1 gap-2">
                                                <div className="relative flex-1 flex flex-col">
                                                    <textarea
                                                        value={chatInput}
                                                        onChange={(e) => setChatInput(e.target.value)}
                                                        onKeyDown={handleKeyDown}
                                                        placeholder="Consult Zcene AI..."
                                                        className="flex-1 w-full h-full bg-zinc-950 border border-zinc-700 py-2 pl-4 pr-16 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary transition-all rounded-xl resize-none scrollbar-thin scrollbar-thumb-zinc-700"
                                                    />
                                                    <div className="absolute right-2 bottom-3 flex flex-col items-center gap-2">
                                                    {!chatInput.trim() ? (
                                                        <button 
                                                            onClick={handleSpeechToText}
                                                            className={`w-8 h-8 flex flex-shrink-0 items-center justify-center transition-colors rounded-xl ${isListening ? 'text-primary animate-pulse' : 'text-zinc-500 active:text-zinc-300'}`}
                                                            title="Speak"
                                                        >
                                                            <MicIcon className="!text-[22px]" />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => setChatInput('')}
                                                            className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-500 active:text-white transition-colors rounded-xl"
                                                            title="Clear message"
                                                        >
                                                            <span className="material-symbols-outlined !text-[18px]">close</span>
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={handleSend}
                                                        disabled={!chatInput.trim() || isChatLoading}
                                                        className={`w-8 h-8 flex flex-shrink-0 items-center justify-center transition-all duration-300 rounded-xl ${
                                                            !chatInput.trim() || isChatLoading
                                                                ? 'bg-zinc-800 text-zinc-600'
                                                                : 'bg-primary text-brand-black active:scale-95'
                                                        }`}
                                                        title="Send"
                                                    >
                                                        <span className="material-symbols-outlined !text-[22px]">arrow_upward</span>
                                                    </button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-start px-1">
                                                    {(() => {
                                                        const isSessionUnlockedAndActive = hasActiveDeepWebSession && liveMessageCount < 3;
                                                        const displayedMessagesUsed = isSessionUnlockedAndActive
                                                            ? Math.min(3, Math.max(0, liveMessageCount))
                                                            : (hasActiveDeepWebSession && liveMessageCount >= 3 ? 3 : 0);
                                                        return (
                                                            <div className="text-[10px] text-zinc-500 font-mono tracking-widest flex items-center gap-1">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${isSessionUnlockedAndActive ? 'bg-primary' : 'bg-red-500 animate-pulse'}`}></span>
                                                                {displayedMessagesUsed} / 3 Messages
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {queryChips.map((chip, idx) => {
                                                    const isClicked = clickedChips.has(chip);
                                                    return (
                                                    <button 
                                                        key={idx}
                                                        onClick={() => {
                                                            setClickedChips(prev => new Set(prev).add(chip));
                                                            onSendMessage(chip);
                                                        }}
                                                        disabled={isChatLoading}
                                                        className={`px-4 py-1.5 border transition-colors text-xs rounded-full disabled:opacity-50 text-left flex items-center gap-1 ${
                                                            isClicked 
                                                                ? 'bg-zinc-950 border-zinc-800 text-zinc-600 cursor-default' 
                                                                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                                        }`}
                                                    >
                                                        {chip}
                                                        {isClicked && <span className="material-symbols-outlined !text-[12px] opacity-70">check</span>}
                                                    </button>
                                                )})}
                                                {connectionPeers.length > 0 && (
                                                    <div className="relative">
                                                        <select
                                                            className="appearance-none px-4 py-1.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors text-xs text-zinc-400 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary pr-8"
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    const query = `What is the connection to ${e.target.value}?`;
                                                                    setClickedChips(prev => new Set(prev).add(query));
                                                                    onSendMessage(query);
                                                                    e.target.value = "";
                                                                }
                                                            }}
                                                        >
                                                            <option value="">What is the connection to...</option>
                                                            {connectionPeers.map(peer => (
                                                                <option key={peer} value={peer}>{peer}</option>
                                                            ))}
                                                        </select>
                                                        <span className="material-symbols-outlined !text-[14px] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">expand_more</span>
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </div>
                                    </div>
                                    </div>
                                )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>


        </>
    );

    if (isFullScreenMode) {
        return (
            <div 
              key="magazine-card"
              className="w-full min-w-[320px] bg-transparent relative break-words h-fit overflow-y-visible mb-4 md:mb-6 break-inside-avoid transition-all duration-500"
              style={{ '--scene-accent': localDominantColor } as React.CSSProperties}
            >
                {panelContent}
            </div>
        );
    }

    return (
        <div 
          key="side-panel"
          ref={panelScrollRef}
          className="w-full min-w-[320px] bg-zinc-900 relative break-words h-full border border-zinc-900 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 transition-all duration-500"
          style={{ overscrollBehaviorY: 'auto', '--scene-accent': localDominantColor } as React.CSSProperties}
          onScroll={(e) => setIsHeaderStuck(e.currentTarget.scrollTop > 10)}
        >
            {panelContent}
        </div>
    );
};

// --- MAIN COMPONENT: DetailsPanel ---
interface DetailsPanelProps {
  selectedNode: Node | null;
  activeNodes: Node[];
  detailsCache: Map<string, NodeDetails>;
  onUpdateDetailsCache?: (cache: Map<string, NodeDetails>) => void;
  loadingNodeIds: Set<string>;
  onTogglePinNode: (nodeId: string) => void;
  pinnedNodes: Set<string>;
  onRefreshNode: (nodeId: string) => void;
  error: string | null;
  systemError: string | null;
  graphData: GraphData;
  libraryArtists: string[];
  seedArtists: string[];
  onAddArtist: (artistName: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isSmallScreen: boolean;
  onNodeClick: (node: Node | null, forceActionState?: boolean) => void;

  onNavigate: (view: View) => void;
  isGlobalLoading: boolean;
  onCancelGlobalLoading: () => void;
  unreadCount: number;
  isActive: boolean;
  collapseBtnRef?: React.RefObject<HTMLButtonElement | null>;
  isMagazineViewOpen: boolean;
  onMagazineViewToggle: (isOpen: boolean) => void;
  chatHistories: Map<string, ChatMessage[]>;
  onUpdateChatHistories: (histories: Map<string, ChatMessage[]> | ((prev: Map<string, ChatMessage[]>) => Map<string, ChatMessage[]>)) => void;
  onAddToStack: (node: Node, link?: string) => void;
  isGuest?: boolean;
  user?: any;
  onAuthRequest?: () => void;
  userTaste?: UserTaste;
  isAdmin?: boolean;
  tokenBalance?: number;
  projectId?: string;
  onUpdateTasteProfile?: (taste: UserTaste) => Promise<void>;
  onShowToast?: (message: string) => void;
  onOpenTasteModal?: () => void;
  projectName?: string;
  onStashArtist?: (artistName: string) => void;
  onOpenStackDrawer?: () => void;
  activeDeepWebSession?: { sessionId: string; remainingMessages: number } | null;
  onUpdateDeepWebSession?: (session: { sessionId: string; remainingMessages: number } | null | ((prev: { sessionId: string; remainingMessages: number } | null) => { sessionId: string; remainingMessages: number } | null)) => void;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  selectedNode, activeNodes, detailsCache, onUpdateDetailsCache, loadingNodeIds, onTogglePinNode, pinnedNodes, onRefreshNode,
  error, systemError, graphData, libraryArtists, seedArtists, onAddArtist, isCollapsed, onToggleCollapse,
  isSmallScreen, onNodeClick, onNavigate, isGlobalLoading, onCancelGlobalLoading, unreadCount, isActive, collapseBtnRef,
  isMagazineViewOpen, onMagazineViewToggle, chatHistories, onUpdateChatHistories, onAddToStack,
  isGuest = false, onAuthRequest, user, userTaste, isAdmin = false, tokenBalance = 0, projectId,
  onUpdateTasteProfile, onShowToast, onOpenTasteModal, projectName, onStashArtist, onOpenStackDrawer,
  activeDeepWebSession, onUpdateDeepWebSession
}) => {
    const [viewedIndex, setViewedIndex] = useState(0);
    const [chatLoadingMap, setChatLoadingMap] = useState<Map<string, boolean>>(new Map());
    const [magazineSortBy, setMagazineSortBy] = useState<'none' | 'artist' | 'label'>('none');
    const [magazineSearchQuery, setMagazineSearchQuery] = useState('');
    const [isListeningMagazineSearch, setIsListeningMagazineSearch] = useState(false);
    const [hasSeenMagazineView, setHasSeenMagazineView] = useState(false);
    const [jitLoadingIds, setJitLoadingIds] = useState<Set<string>>(new Set());

    const [renderMode, setRenderMode] = useState<'magazine' | 'panel'>(isMagazineViewOpen ? 'magazine' : 'panel');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget.scrollTop > 500) {
            setShowScrollTop(true);
        } else {
            setShowScrollTop(false);
        }
    };

    const scrollToTop = () => {
        const container = document.getElementById('magazine-scroll-container');
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        if (isMagazineViewOpen) {
            setIsTransitioning(true);
            setRenderMode('magazine');
            setTimeout(() => setIsTransitioning(false), 50);
        } else {
            setIsTransitioning(true);
            setTimeout(() => {
                setRenderMode('panel');
                setIsTransitioning(false);
            }, 300);
        }
    }, [isMagazineViewOpen]);

    // JIT Stub Fallback (Rule 17)
    useEffect(() => {
        if (!selectedNode || isGlobalLoading) return;
        
        const normId = normalizeArtistId(selectedNode.id);
        const details = detailsCache.get(normId);
        
        if (details?._isStub && !jitLoadingIds.has(normId) && !loadingNodeIds.has(normId)) {
            console.log(`[JIT Hydration] Intercepted stub for node ${normId}. Triggering live hydration.`);
            setJitLoadingIds(prev => new Set(prev).add(normId));
            
            fetchNodeDetails(selectedNode, graphData, seedArtists.join('::'))
                .then(newDetails => {
                    if (newDetails && onUpdateDetailsCache) {
                        onUpdateDetailsCache(new Map(detailsCache).set(normId, newDetails));
                        console.log(`[JIT Hydration] Success for ${normId}`);
                    }
                })
                .catch(err => {
                    console.error(`[JIT Hydration] Failed for ${normId}`, err);
                })
                .finally(() => {
                    setJitLoadingIds(prev => {
                        const next = new Set(prev);
                        next.delete(normId);
                        return next;
                    });
                });
        }
    }, [selectedNode, detailsCache, isGlobalLoading, loadingNodeIds, jitLoadingIds, graphData, seedArtists, onUpdateDetailsCache]);

    const handleMagazineSpeechToText = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        setIsListeningMagazineSearch(true);
        recognition.start();
        recognition.onresult = (event: any) => setMagazineSearchQuery(event.results[0][0].transcript);
        recognition.onerror = () => setIsListeningMagazineSearch(false);
        recognition.onend = () => setIsListeningMagazineSearch(false);
    };
    
    const [chatModes, setChatModes] = useState<Map<string, 'instant' | 'live'>>(new Map());
    const getChatMode = (nodeId: string) => chatModes.get(nodeId) || 'instant';
    const [liveMessageCount, setLiveMessageCount] = useState<number>(() => {
        if (activeDeepWebSession && typeof activeDeepWebSession.remainingMessages === 'number') {
            return Math.max(0, 3 - activeDeepWebSession.remainingMessages);
        }
        return 3;
    });

    useEffect(() => {
        if (activeDeepWebSession && typeof activeDeepWebSession.remainingMessages === 'number') {
            deepWebSessionIdRef.current = activeDeepWebSession.sessionId;
            setLiveMessageCount(Math.max(0, 3 - activeDeepWebSession.remainingMessages));
        } else if (!activeDeepWebSession) {
            deepWebSessionIdRef.current = null;
            setLiveMessageCount(3);
        }
    }, [activeDeepWebSession]);

    const [pendingChatMessage, setPendingChatMessage] = useState<{ nodeId: string; message: string } | null>(null);
    const [deepWebUnlockError, setDeepWebUnlockError] = useState<string | null>(null);
    const deepWebSessionIdRef = useRef<string | null>(null);

    const magazineBtnState: 'disabled' | 'attention' | 'neutral' = hasSeenMagazineView ? 'neutral' : 'attention';
    
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const minSwipeDistance = 50;
    // Fix B — Reset stale touch coordinates whenever the panel is shown/hidden.
    // Prevents a prior gesture's coordinates from leaking across a tab switch
    // and being misread as a forward swipe inside handleTouchEnd.
    useEffect(() => {
        touchStartX.current = null;
        touchEndX.current = null;
    }, [isActive]);

    const trackRef = useRef<HTMLDivElement>(null);
    const activeDotRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!trackRef.current || !activeDotRef.current) return;

        const centerDot = () => {
            const track = trackRef.current;
            const dot = activeDotRef.current;
            if (track && dot) {
                const scrollTarget = dot.offsetLeft - (track.clientWidth / 2) + (dot.clientWidth / 2);
                track.scrollTo({ left: scrollTarget, behavior: 'smooth' });
            }
        };

        centerDot();

        const resizeObserver = new ResizeObserver(() => centerDot());
        resizeObserver.observe(trackRef.current);
        
        return () => resizeObserver.disconnect();
    }, [viewedIndex, activeNodes.length]);

    const isSelectedNodeHydrating = useMemo(() => {
        if (!selectedNode) return false;
        const normId = normalizeArtistId(selectedNode.id);
        const details = detailsCache.get(selectedNode.id) || 
                        detailsCache.get(selectedNode.id.toLowerCase()) || 
                        detailsCache.get(normId);
        return !details;
    }, [selectedNode, detailsCache]);

    const isReconciliationPending = useMemo(() => {
        return isGlobalLoading || loadingNodeIds.size > 0 || isSelectedNodeHydrating;
    }, [isGlobalLoading, loadingNodeIds, isSelectedNodeHydrating]);



    const hasOpenedMagazineRef = useRef(false);
    const lastScrolledNodeIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isMagazineViewOpen) {
            hasOpenedMagazineRef.current = false;
            lastScrolledNodeIdRef.current = null;
            return;
        }

        if (!hasOpenedMagazineRef.current) {
            hasOpenedMagazineRef.current = true;
            const container = document.getElementById('magazine-scroll-container');
            if (container) {
                container.scrollTop = 0;
            }
            if (selectedNode) {
                lastScrolledNodeIdRef.current = selectedNode.id;
            }
            return;
        }

        if (selectedNode && selectedNode.id !== lastScrolledNodeIdRef.current) {
            // On mobile a 300ms tab-switch animation (duration-300) runs concurrently
            // with this scroll. Wait for it to fully settle before measuring bounding
            // rects. On desktop there is no tab animation, 50ms is sufficient.
            const SCROLL_DELAY = isSmallScreen ? 350 : 50;
            // Small breathing room so the card top doesn't sit flush against the
            // container edge. Increased to 40px to absorb the browser's momentum
            // bounce on downward scrolls. Must be less than actionIconsRef.offsetHeight
            // (~44px) so the sentinel stays below the boundary (big title renders).
            const SCROLL_PADDING = 40;

            const timeoutId = setTimeout(() => {
                const container = document.getElementById('magazine-scroll-container');
                const targetEl = document.getElementById(`magazine-card-${selectedNode.id}`);
                if (container && targetEl) {
                    const containerRect = container.getBoundingClientRect();
                    const targetRect = targetEl.getBoundingClientRect();
                    const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
                    // Scroll the card top to the container top, minus a small padding.
                    // The floating mobile header (h-16) sits *above* the container in
                    // the DOM, so containerRect.top already accounts for it — no
                    // additional header offset subtraction is needed here.
                    container.scrollTo({ top: relativeTop - SCROLL_PADDING, behavior: 'smooth' });
                    // Only commit the guard AFTER a scroll actually fires.
                    // If the card doesn't exist (e.g. API failure), the guard stays
                    // null/stale so the next state change can retry the scroll.
                    lastScrolledNodeIdRef.current = selectedNode.id;
                }
            }, SCROLL_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [selectedNode, isMagazineViewOpen]);

    const chatHistoriesRef = useRef(chatHistories);
    useEffect(() => { chatHistoriesRef.current = chatHistories; }, [chatHistories]);

    const handleSendMessage = async (nodeId: string, message: string, forceLive = false, overrideDeepWebSessionId?: string) => {
        const currentMode = getChatMode(nodeId);
        if (currentMode === 'live' && liveMessageCount >= 3 && !forceLive) {
            if (isGuest) {
                onAuthRequest?.();
                return;
            }
            setDeepWebUnlockError(null);
            setPendingChatMessage({ nodeId, message });
            return;
        }

        const history = (chatHistoriesRef.current || chatHistories).get(nodeId) || [];
        const newHistory = [...history, { role: 'user', text: message, timestamp: Date.now() } as ChatMessage];
        
        onUpdateChatHistories((prev) => {
            const next = new Map(prev);
            next.set(nodeId, newHistory);
            return next;
        });
        setChatLoadingMap(prev => new Map(prev).set(nodeId, true));
        let didIncrementLiveCount = false;

        try {
            const currentNode = activeNodes.find(n => n.id.toLowerCase() === nodeId.toLowerCase());
            if (!currentNode) return;

            if (currentMode === 'instant') {
                const aiTimestamp = Date.now();
                await streamLocalHeuristicChat(
                    currentNode,
                    message,
                    detailsCache,
                    graphData,
                    (chunk) => {
                        onUpdateChatHistories((prev) => {
                            const next = new Map(prev);
                            next.set(nodeId, [...newHistory, { role: 'model', text: chunk, timestamp: aiTimestamp } as ChatMessage]);
                            return next;
                        });
                    }
                );
            } else {
                setLiveMessageCount(prev => {
                    const nextCount = prev + 1;
                    onUpdateDeepWebSession?.((prevSession) => {
                        if (!prevSession) return prevSession;
                        return {
                            ...prevSession,
                            remainingMessages: Math.max(0, 3 - nextCount),
                        };
                    });
                    return nextCount;
                });
                didIncrementLiveCount = true;
                const aiTimestamp = Date.now();
                let idToken: string | undefined;
                try {
                    if (auth?.currentUser && typeof auth.currentUser.getIdToken === 'function') {
                        idToken = await auth.currentUser.getIdToken();
                    }
                } catch (_) {}
                const activeSessionId = overrideDeepWebSessionId || deepWebSessionIdRef.current || undefined;
                const chatPromise = streamNodeChat(
                    currentNode,
                    history,
                    message,
                    graphData,
                    (chunk) => {
                        onUpdateChatHistories((prev) => {
                            const next = new Map(prev);
                            next.set(nodeId, [...newHistory, { role: 'model', text: chunk, timestamp: aiTimestamp } as ChatMessage]);
                            return next;
                        });
                    },
                    {
                        idToken,
                        deepWebSessionId: activeSessionId,
                        useSearch: true,
                        detailsCache,
                        projectId: projectId || undefined,
                        projectName,
                        seedArtists,
                        userTaste,
                        nodeId: currentNode.id,
                        nodeName: cleanArtistDisplayName(currentNode.id, graphData.nodes),
                    }
                );

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Chat request timed out")), 20000)
                );

                await Promise.race([chatPromise, timeoutPromise]);
            }
        } catch (err: any) {
            console.error("Chat error:", err);
            const isLeaseExhaustedError =
                err?.message?.includes("SESSION_EXHAUSTED") ||
                err?.message?.includes("DEEP_WEB_SESSION_REQUIRED") ||
                err?.message?.includes("INVALID_SESSION") ||
                err?.message?.includes("SESSION_OWNER_MISMATCH");
            if (isLeaseExhaustedError) {
                // Quota recovery: reset liveMessageCount back to threshold so TokenConfirmationDialog prompts for a fresh lease
                setLiveMessageCount(3);
                deepWebSessionIdRef.current = null;
                onUpdateDeepWebSession?.(null);
            } else if (didIncrementLiveCount) {
                // Roll back optimistic message increment and preserve deepWebSessionIdRef on transient/auth/network errors
                setLiveMessageCount(prev => {
                    const rolledBack = Math.max(0, prev - 1);
                    onUpdateDeepWebSession?.((prevSession) => {
                        if (!prevSession) return prevSession;
                        return {
                            ...prevSession,
                            remainingMessages: Math.max(0, 3 - rolledBack),
                        };
                    });
                    return rolledBack;
                });
            }
            const errorMessage = isLeaseExhaustedError
                ? "Deep Connections session expired or unauthorized. Send again to unlock a 3-message session."
                : err?.message?.includes("timed out") 
                    ? "The AI is taking too long to respond. Your Deep Connections session is still active — please try again."
                    : "Connection interrupted — your Deep Connections session is still active. Please try sending your message again.";
            
            onUpdateChatHistories((prev) => {
                const next = new Map(prev);
                next.set(nodeId, [
                    ...newHistory, 
                    { role: 'model', text: errorMessage } as ChatMessage
                ]);
                return next;
            });
        } finally {
            setChatLoadingMap(prev => new Map(prev).set(nodeId, false));
        }
    };

    const handleDeleteMessage = (nodeId: string, index: number) => {
        onUpdateChatHistories((prev) => {
            const history = prev.get(nodeId) || [];
            const newHistory = [...history];
            newHistory.splice(index, 1);
            const next = new Map(prev);
            next.set(nodeId, newHistory);
            return next;
        });
    };

    const handleClearChat = (nodeId: string) => {
        onUpdateChatHistories((prev) => {
            const next = new Map(prev);
            next.set(nodeId, []);
            return next;
        });
    };

    const filteredAndSortedNodes = useMemo(() => {
        if (systemError) return [];
        let result = [...activeNodes];
        const pinnedSequenceArr = Array.from(pinnedNodes);

        // Component-Level Primacy: If activeNodes is empty but we have a selectedNode that is locked,
        // display the selectedNode card immediately instead of flashing the spinner.
        if (result.length === 0 && selectedNode) {
            const normId = normalizeArtistId(selectedNode.id);
            const details = detailsCache.get(selectedNode.id) || 
                            detailsCache.get(selectedNode.id.toLowerCase()) || 
                            detailsCache.get(normId);
            const isLocked = !!(details && details.summary && details.summary.trim().length > 5 && !details._isSentinel);
            if (isLocked) {
                result = [selectedNode];
            }
        }

        // Filter
        if (isMagazineViewOpen && magazineSearchQuery.trim()) {
            const query = magazineSearchQuery.toLowerCase().trim();
            result = result.filter(node => {
                const details = detailsCache.get(node.id) || detailsCache.get(node.id.toLowerCase()) || detailsCache.get(normalizeArtistId(node.id));
                return (
                    getArtistDisplayName(details, node).toLowerCase().includes(query) ||
                    details?.details?.genre?.toLowerCase().includes(query) ||
                    (details?.details?.style || (details as any)?.style || '').toLowerCase().includes(query) ||
                    details?.details?.origin?.toLowerCase().includes(query) ||
                    details?.summary?.toLowerCase().includes(query)
                );
            });
        }

        // Sort
        result.sort((a, b) => {
            // 1. Sort by Pinned State first
            const isAPinned = pinnedNodes.has(a.id) || pinnedNodes.has(a.id.toLowerCase());
            const isBPinned = pinnedNodes.has(b.id) || pinnedNodes.has(b.id.toLowerCase());
            
            if (isAPinned && isBPinned) {
                let idxA = pinnedSequenceArr.indexOf(a.id);
                if (idxA === -1) idxA = pinnedSequenceArr.indexOf(a.id.toLowerCase());
                
                let idxB = pinnedSequenceArr.indexOf(b.id);
                if (idxB === -1) idxB = pinnedSequenceArr.indexOf(b.id.toLowerCase());
                
                return idxA - idxB;
            }
            if (isAPinned && !isBPinned) return -1;
            if (!isAPinned && isBPinned) return 1;

            // 2. Magazine Sort (if applicable)
            if (isMagazineViewOpen && magazineSortBy !== 'none') {
                if (magazineSortBy === 'artist') {
                    const isArtistA = a.type !== 'label';
                    const isArtistB = b.type !== 'label';
                    if (isArtistA && !isArtistB) return -1;
                    if (!isArtistA && isArtistB) return 1;
                    return (a.label || a.id).localeCompare(b.label || b.id);
                }
                
                if (magazineSortBy === 'label') {
                    const isLabelA = a.type === 'label';
                    const isLabelB = b.type === 'label';
                    if (isLabelA && !isLabelB) return -1;
                    if (!isLabelA && isLabelB) return 1;
                    return (a.label || a.id).localeCompare(b.label || b.id);
                }
            }
            
            return 0; // Preserve default chronological order
        });

        return result;
    }, [activeNodes, isMagazineViewOpen, magazineSortBy, magazineSearchQuery, detailsCache, pinnedNodes]);

    const handleNext = useCallback(() => {
        if (filteredAndSortedNodes && viewedIndex < filteredAndSortedNodes.length - 1) {
            const nextIdx = viewedIndex + 1;
            setViewedIndex(nextIdx);
            onNodeClick(filteredAndSortedNodes[nextIdx], true);
        }
    }, [viewedIndex, filteredAndSortedNodes, onNodeClick]);

    const handlePrev = useCallback(() => {
        if (filteredAndSortedNodes && viewedIndex > 0) {
            const prevIdx = viewedIndex - 1;
            setViewedIndex(prevIdx);
            onNodeClick(filteredAndSortedNodes[prevIdx], true);
        }
    }, [viewedIndex, filteredAndSortedNodes, onNodeClick]);

    const handleTouchStart = (e: React.TouchEvent) => {
        // Fix A: ignore gestures when panel is not the active tab
        if (isMagazineViewOpen || !isActive) return;
        touchEndX.current = null;
        touchStartX.current = e.targetTouches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isMagazineViewOpen || !isActive) return;
        touchEndX.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        // Fix A: ignore if panel is not active, or if we have no valid gesture coords
        if (isMagazineViewOpen || !isActive || !touchStartX.current || !touchEndX.current) return;
        const distance = touchStartX.current - touchEndX.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe) handleNext();
        if (isRightSwipe) handlePrev();
    };

    const toggleFullScreen = () => {
        onMagazineViewToggle(!isMagazineViewOpen);
    };



    const viewedNode = useMemo(() => {
        return filteredAndSortedNodes[viewedIndex] || null;
    }, [filteredAndSortedNodes, viewedIndex]);

    useEffect(() => {
        if (selectedNode && filteredAndSortedNodes && filteredAndSortedNodes.length > 0) {
            const idx = filteredAndSortedNodes.findIndex(n => n.id.toLowerCase() === selectedNode.id.toLowerCase());
            if (idx !== -1) {
                setViewedIndex(idx);
            }
        }
    }, [selectedNode, filteredAndSortedNodes]);

    const viewedNodeDetails = viewedNode 
        ? (detailsCache.get(viewedNode.id) || detailsCache.get(viewedNode.id.toLowerCase()) || detailsCache.get(normalizeArtistId(viewedNode.id)) || null)
        : null;
    const viewedNodeImageUrl = viewedNodeDetails?.imageUrl || (viewedNodeDetails?.details as any)?.imageUrl || undefined;
    const dominantColor = useDominantColor(viewedNodeImageUrl, viewedNode?.label || viewedNode?.id || '');

    const isProfileGenuinelyDisplayed = useMemo(() => {
        if (isGlobalLoading || systemError || !viewedNode || filteredAndSortedNodes.length === 0) {
            return false;
        }

        const normId = normalizeArtistId(viewedNode.id);
        const isNodeLoading = loadingNodeIds.has(viewedNode.id) || jitLoadingIds.has(normId);
        if (isNodeLoading) return false;

        const isMetadata = viewedNode.type === 'genre' || viewedNode.type === 'origin' || viewedNode.type === 'founded';
        if (isMetadata) return true;

        const details = detailsCache.get(viewedNode.id) || 
                        detailsCache.get(viewedNode.id.toLowerCase()) || 
                        detailsCache.get(normId);

        return !!(details && details.summary && details.summary.trim().length > 0 && !details._isSentinel);
    }, [isGlobalLoading, systemError, viewedNode, filteredAndSortedNodes.length, loadingNodeIds, jitLoadingIds, detailsCache]);

    const backgroundLoadingCount = useMemo(() => {
        let count = loadingNodeIds.size;
        if (viewedNode && loadingNodeIds.has(viewedNode.id)) {
            count--;
        }
        return Math.max(0, count);
    }, [loadingNodeIds, viewedNode]);

    const seedCount = seedArtists.length || 1;
    const aiArtistsCount = useMemo(() => {
        if (!graphData?.nodes) return 0;
        return graphData.nodes.filter(n => !isNodeInSeedList(n.id || n.label || '', seedArtists) && (n.type === 'artist' || !n.type)).length;
    }, [graphData, seedArtists]);
    const labelsCount = useMemo(() => {
        if (!graphData?.nodes) return 0;
        return graphData.nodes.filter(n => n.type === 'label').length;
    }, [graphData]);
    const deepCutsCount = useMemo(() => {
        return activeNodes.filter(n => n.type === 'artist' || n.type === 'label' || !n.type).length;
    }, [activeNodes]);

    const sanitizedRationaleText = useMemo(() => {
        if (!graphData?.synthesisRationale) return '';
        let sanitized = graphData.synthesisRationale;
        
        sanitized = sanitized.replace(/^[ \t]*([•\-\*])[ \t]+/gm, '- ');
        sanitized = sanitized.replace(/(^|\n)([ \t]*-[ \t]*)[\n]+[ \t]*/g, '$1$2');
        sanitized = sanitized.replace(/([^\n])\n([ \t]*- )/g, '$1\n\n$2');
        
        const cleanLines = sanitized.split('\n').filter(line => {
            const isFallback = (!graphData.synthesisRationale && (graphData.nodes?.length === 1 || graphData.nodes?.length === 2));
            if (isFallback && line.trim().startsWith('[')) return false;
            return true;
        });
        
        return cleanLines.join('\n');
    }, [graphData?.synthesisRationale, graphData?.nodes?.length]);

    return (
        <div 
          className="w-full h-full flex flex-col bg-zinc-900 overflow-hidden relative min-h-0 outline-none transition-colors duration-700"
          style={{
            '--scene-accent': dominantColor,
            ...(isMagazineViewOpen ? {
              backgroundImage: 'linear-gradient(rgba(17, 17, 19, 0.8), rgba(17, 17, 19, 0.8)), url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            } : {})
          } as React.CSSProperties}
        >
            {isSmallScreen ? (
                <div className={`flex-shrink-0 z-[60] transition-all duration-300 ${isMagazineViewOpen ? `bg-transparent ${LayoutSizes.topHeader} border-b border-zinc-700/50` : 'bg-zinc-900 h-0 overflow-hidden border-transparent'}`}>
                    <div className="px-4 flex items-center justify-between gap-4 h-full">
                        <div className="flex items-center gap-2 flex-grow animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="relative flex-grow max-w-none">
                                <span className={`material-symbols-outlined absolute top-1/2 -translate-y-1/2 text-zinc-500 ${InputSizes.md.leftIcon}`}>search</span>
                                <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                    type="search"
                                    placeholder="Search..."
                                    value={magazineSearchQuery}
                                    onChange={(e) => setMagazineSearchQuery(e.target.value)}
                                    className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all ${InputSizes.md.magazineSearch}`}
                                />
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                    {magazineSearchQuery && (
                                        <button onClick={() => setMagazineSearchQuery('')} className={`flex items-center justify-center text-zinc-400 hover:text-white transition-colors leading-none ${InputSizes.md.iconBtn}`} aria-label="Clear search"><span className={`material-symbols-outlined ${InputSizes.md.icon}`}>close</span></button>
                                    )}
                                </div>
                            </div>

                            <div className="relative shrink-0 w-[110px]">
                                <Select 
                                    variant="md"
                                    value={magazineSortBy}
                                    onChange={(e) => setMagazineSortBy(e.target.value as any)}
                                >
                                    <option value="none">Sort</option>
                                    <option value="artist">Artist</option>
                                    <option value="label">Label</option>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                isMagazineViewOpen ? (
                    <div className={`${LayoutSizes.topHeader} flex-shrink-0 border-b border-zinc-700/50 bg-transparent z-[60] relative px-4 md:px-6 lg:px-8`}>
                        <div className="max-w-[1400px] mx-auto w-full h-full flex items-center justify-between relative">
                            <div className="flex items-center gap-4 overflow-hidden w-full h-full -mx-1 px-1">
                                <div className="flex items-center gap-4 flex-grow animate-in fade-in slide-in-from-left-4 duration-500">
                                    <div className="flex items-center gap-3 flex-grow max-w-none md:max-w-md">
                                        <div className="relative flex-grow">
                                            <span className={`material-symbols-outlined absolute top-1/2 -translate-y-1/2 text-zinc-500 ${InputSizes.md.leftIcon}`}>search</span>
                                            <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                                type="search"
                                                placeholder="Search..."
                                                value={magazineSearchQuery}
                                                onChange={(e) => setMagazineSearchQuery(e.target.value)}
                                                className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all ${InputSizes.md.magazineSearch}`}
                                            />
                                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                {magazineSearchQuery && (
                                                    <button onClick={() => setMagazineSearchQuery('')} className={`flex items-center justify-center text-zinc-400 hover:text-white transition-colors leading-none ${InputSizes.md.iconBtn}`} aria-label="Clear search"><span className={`material-symbols-outlined ${InputSizes.md.icon}`}>close</span></button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Select 
                                                variant="md"
                                                value={magazineSortBy}
                                                onChange={(e) => setMagazineSortBy(e.target.value as any)}
                                            >
                                                <option value="none">Default</option>
                                                <option value="artist">Artist</option>
                                                <option value="label">Label</option>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {!isSmallScreen && (
                                <div className="flex items-center gap-0.5 ml-4 shrink-0">
                                    <Button 
                                        variant="primary"
                                        size="md"
                                        onClick={() => onMagazineViewToggle(false)}
                                        title="Close Magazine View"
                                    >
                                        <span>Close</span>
                                        <span className="material-symbols-outlined !text-[18px]">close</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className={`${LayoutSizes.headerBar} flex-shrink-0 border-b border-zinc-600/50 flex items-center relative z-[60] bg-zinc-900 ${isCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
                        {!isCollapsed && (
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Deep Cuts</h2>
                                    <span className={`h-5 w-5 flex flex-shrink-0 items-center justify-center text-[9px] font-bold border rounded-md transition-all duration-500 ${unreadCount > 0 ? 'bg-zinc-900 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                        {activeNodes.length}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className={`flex items-center gap-0.5 ${isCollapsed ? 'w-8 justify-center' : ''}`}>
                            <button 
                                ref={collapseBtnRef}
                                onClick={onToggleCollapse} 
                                className="relative z-[70] w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors leading-none pointer-events-auto" 
                                title={isCollapsed ? "Expand Deep Cuts" : "Collapse Deep Cuts"}
                            >
                                <span className="material-symbols-outlined !text-[18px]">{isCollapsed ? 'right_panel_open' : 'right_panel_close'}</span>
                            </button>
                        </div>
                    </div>
                )
            )}

            {isCollapsed && !isSmallScreen && !isMagazineViewOpen ? (
                <div className="flex-grow flex flex-col items-center justify-between py-6 relative text-zinc-400">
                    <div className="flex-grow flex flex-col items-center justify-center gap-y-6">
                    </div>
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center px-2">
                        <button onClick={onToggleCollapse} className="group relative" title="View Deep Cuts">
                             <span className={`h-8 w-8 flex items-center justify-center text-sm font-bold border-2 rounded-md transition-all duration-500 ${unreadCount > 0 && !systemError ? 'bg-zinc-900 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'} group-active:scale-95`}>
                                {systemError ? 0 : activeNodes.length}
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-grow flex flex-col min-h-0 h-full overflow-hidden">
                    {!isMagazineViewOpen && filteredAndSortedNodes.length > 0 && (
                        <div className="flex justify-between items-center w-full px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 flex-shrink-0 gap-3">
                            {filteredAndSortedNodes.length > 1 && (
                                <>
                                    <button 
                                        onClick={handlePrev} 
                                        disabled={viewedIndex <= 0}
                                        className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors disabled:opacity-20 disabled:pointer-events-none leading-none select-none outline-none focus:outline-none"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
                                    </button>
                                    
                                    <div className="flex-1 flex justify-center items-center overflow-hidden px-4">
                                        <div className="relative flex items-center overflow-hidden w-full h-6 max-w-[240px] lg:max-w-[280px]">
                                            <div 
                                                ref={trackRef}
                                                className="flex items-center flex-nowrap overflow-x-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full h-full px-1 justify-center"
                                            >
                                                {filteredAndSortedNodes.map((node, i) => {
                                                    const isLoading = loadingNodeIds.has(node.id) || jitLoadingIds.has(normalizeArtistId(node.id));
                                                    const isActive = i === viewedIndex;
                                                    return (
                                                        <div 
                                                            key={node.id}
                                                            ref={isActive ? activeDotRef : null} 
                                                            onClick={() => { setViewedIndex(i); onNodeClick(node, true); }}
                                                            className="flex items-center justify-center h-full px-[2px] cursor-pointer group"
                                                            title={`${node.type === 'label' ? cleanLabelDisplayName(node.label || node.id) : cleanArtistDisplayName(node.label || node.id)}${isLoading ? ' (Generating...)' : ''}`}
                                                        >
                                                            <div 
                                                                className={`transition-all flex-shrink-0 rounded-full ${
                                                                    isActive 
                                                                        ? 'w-4 h-1 bg-primary' 
                                                                        : isLoading 
                                                                            ? 'w-1.5 h-1.5 bg-primary/80 animate-pulse' 
                                                                            : 'w-1 h-1 bg-zinc-600 group-hover:bg-zinc-400'
                                                                }`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            
                                            {/* Gradient fades for the edges */}
                                            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-zinc-900 to-transparent pointer-events-none" />
                                            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handleNext} 
                                        disabled={viewedIndex === filteredAndSortedNodes.length - 1}
                                        className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors disabled:opacity-20 disabled:pointer-events-none leading-none select-none outline-none focus:outline-none"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <div 
                        id="magazine-scroll-container"
                        className={`flex-grow relative min-h-0 ${isMagazineViewOpen ? 'overflow-y-auto px-4 md:px-6 lg:px-8 scrollbar-thin scrollbar-thumb-zinc-800 overflow-x-clip' : 'overflow-hidden'}`}
                        onScroll={isMagazineViewOpen ? handleScroll : undefined}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={isMagazineViewOpen ? { touchAction: 'pan-y', overscrollBehaviorY: 'auto', overflowAnchor: 'none' } : {}}
                    >
                        {isMagazineViewOpen && graphData?.synthesisRationale && (
                            <div className="max-w-[1400px] mx-auto pt-12 md:pt-16 pb-12 mb-8 border-b border-zinc-800/50 transition-opacity duration-500 ease-in-out opacity-100 px-0">
                                <div className="flex items-center flex-wrap gap-2 gap-y-2 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                        ROOT ARTISTS: {seedCount}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                        ARTISTS: {aiArtistsCount}
                                    </span>
                                    {labelsCount > 0 && (
                                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                            LABELS: {labelsCount}
                                        </span>
                                    )}
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                        DEEP CUTS: {deepCutsCount}
                                    </span>
                                </div>
                                <h1 className="text-7xl font-bold tracking-tighter text-white mb-10 leading-tight" style={{ wordBreak: 'break-word' }}>
                                    {projectName || (seedArtists && seedArtists.length > 0 ? seedArtists.join(' / ') : 'Magazine')}
                                </h1>
                                <div className="markdown-bio text-base leading-relaxed text-zinc-300 columns-1 md:columns-2 lg:columns-3 gap-12 font-sans">
                                    <Markdown
                                        components={{
                                            p: ({node, children, ...props}) => <p className="mb-6" {...props}>{renderWithHighlights(children, magazineSearchQuery)}</p>,
                                            strong: ({node, children, ...props}) => <strong className="font-semibold text-white" {...props}>{renderWithHighlights(children, magazineSearchQuery)}</strong>,
                                            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-6 space-y-2" {...props} />,
                                            li: ({node, children, ...props}) => <li className="marker:text-primary" {...props}>{renderWithHighlights(children, magazineSearchQuery)}</li>
                                        }}
                                    >
                                        {sanitizedRationaleText}
                                    </Markdown>
                                </div>
                            </div>
                        )}
                        {/* 4) DEEP CUT CARDS GRID (Z-INDEX 10) */}
                        <div 
                            className={`${renderMode === 'magazine' 
                                ? `grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] gap-12 items-start max-w-[1400px] mx-auto pt-4 md:pt-6 lg:pt-8 pb-[calc(env(safe-area-inset-bottom)_+_3rem)] transition-opacity duration-300 ease-in-out ${!isMagazineViewOpen || isTransitioning ? 'opacity-0 min-w-[100vw]' : 'opacity-100 w-full'}` 
                                : `flex h-full w-full transition-all duration-300 ease-in-out will-change-transform touch-pan-y ${isTransitioning ? 'opacity-0' : 'opacity-100'}`
                            } relative z-10`}
                            style={renderMode === 'panel' ? { 
                                transform: `translateX(-${viewedIndex * 100}%)`,
                                overscrollBehaviorX: 'none'
                            } : {}}
                        >
                            {filteredAndSortedNodes.length === 0 || systemError ? (
                                <div className="absolute inset-0 z-10 flex items-center justify-center text-center p-8 pointer-events-none">
                                    {(isReconciliationPending || (Boolean(graphData?.nodes && graphData.nodes.length > 0) && !magazineSearchQuery.trim() && seedArtists && seedArtists.length > 0)) && !systemError ? (
                                        <div className="flex flex-col items-center justify-center gap-6">
                                            {isGlobalLoading ? (
                                                <LoadingSpinner 
                                                    steps={["Waiting for Connections to settle...", "Mapping relationships first...", "Synchronising nodes..."]}
                                                    subtext="Graph mapping takes priority. Details will follow."
                                                />
                                            ) : (
                                                <LoadingSpinner 
                                                    steps={DETAIL_THINKING_STEPS}
                                                    subtext="Typically takes 20–30 seconds to dig for details."
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <ZceneEmptyState onNavigate={onNavigate} />
                                            {magazineSearchQuery && (
                                                <p className="text-zinc-500 text-sm">No results matching "{magazineSearchQuery}"</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                (() => {
                                    const pinnedArray = Array.from(pinnedNodes);
                                    return filteredAndSortedNodes.map((node) => {
                                        const details = detailsCache.get(node.id) || detailsCache.get(node.id.toLowerCase()) || detailsCache.get(normalizeArtistId(node.id)) || null;
                                        const isRichData = details && details.imageUrl && details.summary.length > 200;
                                        const isHero = isMagazineViewOpen && (node.id === selectedNode?.id || (isRichData && node.type === 'artist'));
                                        const pinSequenceIndex = pinnedArray.findIndex((id: any) => typeof id === 'string' && id.toLowerCase() === node.id.toLowerCase());
                                        const pinSequence = pinSequenceIndex !== -1 ? pinSequenceIndex + 1 : undefined;

                                        return (
                                        <div 
                                            key={node.id} 
                                            id={`magazine-card-${node.id}`}
                                            className={`${renderMode === 'magazine' 
                                                ? 'inline-block w-full max-w-2xl text-left' 
                                                : 'w-full h-full flex-shrink-0 overflow-hidden'}`}
                                        >
                                            <NodeDetailsCard
                                                node={node}
                                                details={details}
                                                isLoading={loadingNodeIds.has(node.id) || jitLoadingIds.has(normalizeArtistId(node.id))}
                                                isGlobalLoading={isGlobalLoading}
                                                graphData={graphData}
                                                libraryArtists={libraryArtists}
                                                seedArtists={seedArtists}
                                                onAddArtist={onAddArtist}
                                                isSmallScreen={isSmallScreen}
                                                onTogglePin={() => onTogglePinNode(node.id)}
                                                isPinned={pinnedNodes.has(node.id) || pinnedNodes.has(node.id.toLowerCase())}
                                                pinSequence={pinSequence}
                                                onNodeClick={onNodeClick}
                                                onNavigate={onNavigate}
                                                chatHistory={chatHistories.get(node.id) || []}
                                                onSendMessage={(msg) => handleSendMessage(node.id, msg)}
                                                isChatLoading={chatLoadingMap.get(node.id) || false}
                                                chatMode={getChatMode(node.id)}
                                                onChatModeChange={(mode) => setChatModes(prev => new Map(prev).set(node.id, mode))}
                                                liveMessageCount={liveMessageCount}
                                                hasActiveDeepWebSession={Boolean(deepWebSessionIdRef.current)}
                                                onDeleteMessage={(index) => handleDeleteMessage(node.id, index)}
                                                onClearChat={() => handleClearChat(node.id)}
                                                isFullScreenMode={isMagazineViewOpen}
                                                isHero={isHero}
                                                onAddToStack={onAddToStack}
                                                onToggleMagazineView={() => onMagazineViewToggle(!isMagazineViewOpen)}
                                                searchQuery={isMagazineViewOpen ? magazineSearchQuery : undefined}
                                                isGuest={isGuest}
                                                user={user}
                                                onAuthRequest={onAuthRequest}
                                                userTaste={userTaste}
                                                isAdmin={isAdmin}

                                                onUpdateTasteProfile={onUpdateTasteProfile}
                                                onShowToast={onShowToast}
                                                onOpenTasteModal={onOpenTasteModal}
                                                isActive={node.id === viewedNode?.id}
                                                onStashArtist={onStashArtist}
                                                onOpenStackDrawer={onOpenStackDrawer}
                                            />
                                        </div>
                                    );
                                })
                                })()
                            )}
                        </div>
                        {!isMagazineViewOpen && error && activeNodes.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center p-8 text-center bg-zinc-900/50 backdrop-blur-sm z-50">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {!isMagazineViewOpen && isProfileGenuinelyDisplayed && (
                            <div className={`absolute ${isSmallScreen ? 'bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]' : 'bottom-6'} left-0 right-0 flex justify-center pointer-events-none z-50`}>
                                <Button 
                                    variant="primary"
                                    size="md"
                                    onClick={() => {
                                        setHasSeenMagazineView(true);
                                        onMagazineViewToggle(true);
                                    }}
                                    className="pointer-events-auto shadow-2xl active:scale-95"
                                >
                                    <span className="material-symbols-outlined !text-[18px]">auto_stories</span>
                                    <span>Magazine</span>
                                </Button>
                            </div>
                        )}

                    </div>
                    {isMagazineViewOpen && typeof document !== 'undefined' && createPortal(
                        <div className="fixed bottom-8 left-0 right-0 z-[1050] px-6 md:px-8 pointer-events-none flex items-center justify-between">
                            <div className="w-12 md:w-16"></div> 
                            
                            {isSmallScreen && (
                                <Button
                                    variant="primary"
                                    size="md"
                                    onClick={() => onMagazineViewToggle(false)}
                                    className="pointer-events-auto shadow-2xl active:scale-95"
                                >
                                    <span className="material-symbols-outlined !text-[18px]">close</span>
                                    <span>Close</span>
                                </Button>
                            )}
                            {!isSmallScreen && <div className="w-12 md:w-16"></div>}

                            <div 
                                onClick={scrollToTop} 
                                className={`w-12 md:w-16 flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-all duration-300 cursor-pointer pointer-events-auto ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
                                aria-label="Scroll to top"
                            >
                                <span className="material-symbols-outlined !text-[20px]">expand_less</span>
                                <span className="text-[9px] font-bold uppercase tracking-[0.3em] ml-[0.3em]">Top</span>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            )}
            
            {pendingChatMessage && createPortal(
                <TokenConfirmationDialog
                    isOpen={true}
                    onClose={() => {
                        setPendingChatMessage(null);
                        setDeepWebUnlockError(null);
                    }}
                    onConfirm={async () => {
                        const target = pendingChatMessage;
                        if (!target) return;
                        setDeepWebUnlockError(null);
                        try {
                            const unlockCallable = httpsCallable(functions, 'unlockDeepWebSessionCallable');
                            const currentNode = activeNodes.find(n => n.id.toLowerCase() === target.nodeId.toLowerCase());
                            const res = await unlockCallable({
                                projectId: projectId || undefined,
                                nodeId: target.nodeId,
                                nodeName: currentNode?.label || cleanArtistDisplayName(target.nodeId, graphData.nodes) || target.nodeId,
                                projectName: projectName || undefined,
                            });
                            const data = res?.data as { sessionId?: string; remainingMessages?: number } | undefined;
                            const mintedSessionId = data?.sessionId || undefined;
                            const remaining = typeof data?.remainingMessages === 'number'
                                ? Math.max(0, Math.min(3, Math.floor(data.remainingMessages)))
                                : 3;
                            deepWebSessionIdRef.current = mintedSessionId || null;
                            const used = Math.max(0, 3 - remaining);
                            setLiveMessageCount(used);
                            if (mintedSessionId) {
                                onUpdateDeepWebSession?.({ sessionId: mintedSessionId, remainingMessages: remaining });
                            }
                            setPendingChatMessage(null);
                            handleSendMessage(target.nodeId, target.message, true, mintedSessionId);
                        } catch (err: any) {
                            console.error('[DetailsPanel] Failed to unlock Deep Web session:', err);
                            setDeepWebUnlockError(
                                err?.message?.includes('INSUFFICIENT_TOKENS')
                                    ? 'Insufficient tokens to unlock Deep Connections. Please top up and try again.'
                                    : err?.message || 'Unable to unlock Deep Connections session. Please try again.'
                            );
                        }
                    }}
                    type="live_chat_search"
                    tokenCost={TOKEN_PRICING.DEEP_WEB_CONSULT}
                    tokenBalance={tokenBalance}
                    isAdmin={isAdmin}
                    error={deepWebUnlockError}
                    cachedArtists={[]}
                    missingArtists={["All Artists & Zcenes (No Expiration)"]}
                />,
                document.body
            )}
            
        </div>
    );
};
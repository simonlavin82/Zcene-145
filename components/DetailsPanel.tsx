import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import { Node, NodeDetails, GraphData, View, ChatMessage, StackItem, UserTaste, COST_PER_AI_CALL } from '../types';
import { streamNodeChat, fetchLiveTourData } from '../services/geminiService';
import { normalizeArtistId, titleCaseArtistId, getArtistDocWithRedirect } from '../services/artistCacheService';
import { analyticsService } from '../services/analyticsService';
import { Spinner, HelpIcon, MicIcon, LoadingSpinner, DETAIL_THINKING_STEPS, StackIcon } from './Icons';
import { TokenConfirmationDialog, FullItineraryDialog } from './SharedModals';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

const SENTINEL_INSIGHT = 'No insight provided.';

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
        <div className="mt-3 text-zinc-400 text-xs space-y-4">
            <p className="text-center px-4">Start with a few of your favourite artists, and Zcene will map how they connect across genres, labels, origins, and scenes.</p>
            <div className="text-left bg-zinc-800/30 p-5 rounded-none border border-zinc-700/50 mx-4 text-xs">
                <p className="font-medium text-zinc-200 mb-2">How it works</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                    <li>Add 1–25 artists (or import your library).</li>
                    <li>Create your Zcene.</li>
                    <li>Drag, filter, and explore the spiderweb.</li>
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
            className="text-[10px] font-bold uppercase tracking-wider text-brand-black bg-primary px-3 py-2 hover:bg-white transition-all text-center rounded-none shadow-[2px_2px_0px_#000]"
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
  onRefresh: () => void;
  onClose: () => void;
  onNodeClick: (node: Node | null) => void;
  onNavigate: (view: View) => void;
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  isChatLoading: boolean;
  isFullScreenMode?: boolean;
  isHero?: boolean;
  isInStack: boolean;
  onToggleStack: (node: Node, link?: string) => void;
  onToggleMagazineView?: () => void;
  isGuest?: boolean;
  user?: any;
  onAuthRequest?: () => void;
  userTaste?: UserTaste;
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

const NodeDetailsCard: React.FC<NodeDetailsCardProps> = ({
    node, details, isLoading, isGlobalLoading, graphData, libraryArtists, seedArtists, onAddArtist, isSmallScreen, onRefresh, onClose, onNodeClick, onNavigate,
    chatHistory, onSendMessage, isChatLoading, isFullScreenMode = false, isHero = false, isInStack, onToggleStack, onToggleMagazineView, isGuest = false, onAuthRequest, user,
    userTaste
}) => {
    const [chatInput, setChatInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [isIdCopied, setIsIdCopied] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    
    const [tourStatus, setTourStatus] = useState<'idle' | 'cost_warning' | 'fetching' | 'resolved_summary' | 'full_itinerary_modal'>('idle');
    const [tourDates, setTourDates] = useState<string[]>([]);
    const [tourError, setTourError] = useState<string | null>(null);

    useEffect(() => {
        const cachedDates = details?.tourDates;
        const cachedTimestamp = details?.tourCachedAt;

        if (cachedTimestamp && !isTourCacheStale(cachedTimestamp)) {
            setTourDates(cachedDates || []);
            setTourStatus('resolved_summary');
        } else {
            setTourStatus('idle');
            setTourDates([]);
        }
        setTourError(null);
    }, [node.id, details]);

    const handleFetchTourData = async () => {
        setTourStatus('fetching');
        setTourError(null);
        try {
            const data = await fetchLiveTourData(node.id);
            const parsed = parseTourDates(data);
            const freshDates = parsed.isTouring ? parsed.dates : [];
            const freshCachedAt = new Date().toISOString();

            setTourDates(freshDates);
            setTourStatus('resolved_summary');

            // Mutate local memory details object to persist it during active session
            if (details) {
                details.tourDates = freshDates;
                details.tourCachedAt = freshCachedAt;
            }

            // Sync to global Firestore document under detailsCache JSON
            const cacheId = normalizeArtistId(node.id);
            (async () => {
                try {
                    const existingSnap = await getArtistDocWithRedirect(cacheId);
                    if (existingSnap.exists()) {
                        const snapData = existingSnap.data();
                        let existingDetailsCache: any = {};
                        if (snapData && snapData.detailsCache) {
                            existingDetailsCache = typeof snapData.detailsCache === 'string'
                                ? JSON.parse(snapData.detailsCache)
                                : snapData.detailsCache;
                        }

                        const updatedDetails = {
                            ...existingDetailsCache,
                            tourDates: freshDates,
                            tourCachedAt: freshCachedAt
                        };

                        await updateDoc(doc(db, 'artists', existingSnap.id), {
                            detailsCache: JSON.stringify(updatedDetails)
                        });
                        console.log(`[Tour Cache] Successfully synced tour data to Firestore for: ${existingSnap.id}`);
                    }
                } catch (dbErr) {
                    console.warn("[Tour Cache] Failed to sync tour data back to Firestore:", dbErr);
                }
            })();
        } catch (err) {
            console.error("Failed to fetch live tour data:", err);
            setTourError("Failed to fetch live tour data. Please try again.");
            setTourStatus('idle');
        }
    };

    const chatEndRef = useRef<HTMLDivElement>(null);
    const prevHistoryLength = useRef(chatHistory.length);

    const libraryArtistSet = useMemo(() => new Set(libraryArtists.map(a => normalizeArtistId(a))), [libraryArtists]);
    const seedArtistSet = useMemo(() => new Set(seedArtists.map(a => normalizeArtistId(a))), [seedArtists]);

    const isArtistNode = node.type === 'artist';
    const isLabelNode = node.type === 'label';
    const normalizedArtistNodeId = isArtistNode ? normalizeArtistId(node.id) : '';

    const isLibraryArtist = isArtistNode && libraryArtistSet.has(normalizedArtistNodeId);
    const isSeedArtist = isArtistNode && seedArtistSet.has(normalizedArtistNodeId);
    const isAiSuggestion = isArtistNode && !isSeedArtist;
    const isManualAdd = isArtistNode && isSeedArtist && !isLibraryArtist;

    const tasteCompatibility = useMemo(() => {
        if (!userTaste || !details) return {
            hasTasteData: false,
            totalActive: 0,
            matches: 0,
            criteria: [
                { id: 'genre', name: 'Genre', active: false, matched: false },
                { id: 'origin', name: 'Origin', active: false, matched: false },
                { id: 'era', name: 'Era', active: false, matched: false }
            ]
        };

        const favGenreActive = !!userTaste.favoriteGenre?.trim();
        const favOriginActive = !!userTaste.favoriteOrigin?.trim();
        const eraActive = userTaste.eraMin !== null || userTaste.eraMax !== null;

        const hasTasteData = favGenreActive || favOriginActive || eraActive;

        let favGenreMatched = false;
        let favOriginMatched = false;
        let eraMatched = false;

        // 1. Match Favorite Genre
        if (favGenreActive) {
            const favGenre = userTaste.favoriteGenre.toLowerCase().trim();
            const genre = (details?.details?.genre || '').toLowerCase().trim();
            favGenreMatched = !!genre && (genre.includes(favGenre) || favGenre.includes(genre));
        }

        // 2. Match Favorite Origin
        if (favOriginActive) {
            const favOrigin = userTaste.favoriteOrigin.toLowerCase().trim();
            const origin = (details?.details?.origin || '').toLowerCase().trim();
            favOriginMatched = !!origin && (origin.includes(favOrigin) || favOrigin.includes(origin));
        }

        // 3. Match Era Range
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
                    if (userTaste.eraMin !== null && year < userTaste.eraMin) {
                        isEraMatch = false;
                    }
                    if (userTaste.eraMax !== null && year > userTaste.eraMax) {
                        isEraMatch = false;
                    }
                    eraMatched = isEraMatch;
                }
            }
        }

        const criteria = [
            { id: 'genre', name: 'Genre', active: favGenreActive, matched: favGenreMatched },
            { id: 'origin', name: 'Origin', active: favOriginActive, matched: favOriginMatched },
            { id: 'era', name: 'Era', active: eraActive, matched: eraMatched }
        ];

        const totalActive = (favGenreActive ? 1 : 0) + (favOriginActive ? 1 : 0) + (eraActive ? 1 : 0);
        const matches = (favGenreMatched ? 1 : 0) + (favOriginMatched ? 1 : 0) + (eraMatched ? 1 : 0);

        return {
            hasTasteData,
            totalActive,
            matches,
            criteria
        };
    }, [userTaste, details, node.id, node.label]);



    useEffect(() => {
        setImageError(false);
        setImgLoaded(false);
    }, [node.id, details?.imageUrl]);

    useEffect(() => {
        if (imgRef.current && imgRef.current.complete) {
            setImgLoaded(true);
        }
    }, [details?.imageUrl]);

    useEffect(() => {
      if (chatHistory.length > 0 && (chatHistory.length > prevHistoryLength.current || isChatLoading)) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      prevHistoryLength.current = chatHistory.length;
    }, [chatHistory, isChatLoading]);

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
            await navigator.clipboard.writeText(node.id);
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
        const bandcampSearchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(node.id)}`;
        const officialSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(node.id)}+official+website`;

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

    return (
        <div 
          className={`w-full min-w-[320px] bg-zinc-900 relative break-words transition-all duration-500 ${isFullScreenMode ? 'h-fit border border-zinc-800/80 shadow-2xl overflow-hidden mb-4 md:mb-6 break-inside-avoid' : 'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800'}`}
          style={{ overscrollBehaviorY: 'auto' }}
        >
            <div className="flex flex-col min-h-full">
                <div className={`px-4 pt-3 pb-3 border-b border-zinc-800/50 bg-zinc-900 z-20 flex-shrink-0 ${isFullScreenMode ? 'md:px-6' : ''}`}>
                    <div className="flex flex-col gap-2 mb-2">
                        <div className="flex items-center justify-end gap-1 flex-shrink-0">
                            {(isArtistNode || isLabelNode) && (
                                <button
                                    onClick={() => onToggleStack(node, links.purchase?.[0]?.url)}
                                    className={`w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 active:scale-95 leading-none ${isInStack ? 'text-primary bg-primary/5 border-primary/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                                    title={isInStack ? "Remove from My Stack" : "Save to My Stack"}
                                >
                                    <StackIcon className="!text-[18px]" />
                                </button>
                            )}
                            {isArtistNode && !isGuest && (
                                <button
                                    onClick={() => onAddArtist(normalizeArtistId(node.id))}
                                    className={`w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 active:scale-95 leading-none ${isSeedArtist ? 'text-primary bg-primary/5 border-primary/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-primary'}`}
                                    title={isSeedArtist ? "Remove from Seeds" : "Add to Seeds"}
                                >
                                    <span className="material-symbols-outlined !text-[18px]">
                                        {isSeedArtist ? 'check_circle' : 'add_circle'}
                                    </span>
                                </button>
                            )}

                            <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-800 active:scale-95 transition-all duration-200 leading-none" title="Remove Card">
                                    <span className="material-symbols-outlined !text-[18px]">remove</span>
                            </button>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-grow">
                            <div className="flex items-center gap-2">
                                <div 
                                    onClick={handleCopyId}
                                    className="group flex items-center gap-2 cursor-copy w-fit transition-all active:scale-[0.98] min-w-0"
                                    title="Click to copy name"
                                >
                                    <h3 className={`${headerSizeClass} text-white leading-[0.9] py-1 break-normal`}>
                                        {details?.details?.artist
                                            || (node.label && /^[a-z]/.test(node.label) ? titleCaseArtistId(node.label) : node.label)
                                            || titleCaseArtistId(node.id)}
                                    </h3>
                                    <span className={`material-symbols-outlined !text-[16px] flex-shrink-0 transition-all duration-300 ${isIdCopied ? 'text-primary opacity-100 scale-110' : 'text-zinc-500 opacity-0 group-hover:opacity-100'}`}>
                                        {isIdCopied ? 'check' : 'content_copy'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 border border-zinc-700/50 rounded-md">{node.type}</span>
                                {isManualAdd && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 border border-emerald-500/30 rounded-md">Manual</span>}
                                {isAiSuggestion && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] bg-purple-500/20 text-purple-400 px-2 py-0.5 border border-purple-500/30 flex items-center gap-1 rounded-md"><span className="material-symbols-outlined !text-[12px]">star</span>AI</span>}
                                {isLibraryArtist && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] bg-sky-500/20 text-sky-400 px-2 py-0.5 border border-sky-500/30 rounded-md">Library</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`px-4 space-y-10 flex-grow min-h-0 ${isFullScreenMode ? 'py-4 md:px-8' : 'py-8'}`}>
                    {!details && (
                        <div className="flex flex-col items-center justify-center text-center py-12 space-y-8 h-full bg-zinc-900">
                            {isLoading ? (
                                <LoadingSpinner 
                                    steps={DETAIL_THINKING_STEPS}
                                    subtext="Typically takes 20–30 seconds to dig for details."
                                />
                            ) : isGlobalLoading ? (
                                <LoadingSpinner 
                                    steps={["Waiting for the Spiderweb to settle...", "Mapping relationships first...", "Synchronising nodes..."]}
                                    subtext="Graph mapping takes priority. Details will follow."
                                />
                            ) : (
                                <LoadingSpinner 
                                    steps={["Queued for background synthesis...", "Awaiting active slot in worker queue...", "Serialised processing active..."]}
                                    subtext="Serialised processing preserves synthesis integrity."
                                />
                            )}
                            <button 
                                onClick={onClose}
                                className="rounded-xl border border-zinc-600 px-6 py-2 text-sm font-medium text-zinc-300 transition-colors active:bg-zinc-800"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {details && (
                        <div className="space-y-10 text-zinc-300 pb-16">
                            {/* Compatibility Meter */}
                            <div className="flex flex-col gap-1.5 w-full">
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                                    <span>MY TASTE</span>
                                    {tasteCompatibility.hasTasteData ? (
                                        <span className="font-mono text-[#a855f7] font-bold">
                                            {tasteCompatibility.matches}/{tasteCompatibility.totalActive} Hits
                                        </span>
                                    ) : (
                                        <span className="text-zinc-500 normal-case font-medium">Empty Taste Profile</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 w-full">
                                    {tasteCompatibility.criteria.map((c) => {
                                        let bgClass = '';
                                        let borderClass = '';
                                        if (c.active) {
                                            if (c.matched) {
                                                bgClass = 'bg-[#a855f7]';
                                                borderClass = 'border-[#a855f7]';
                                            } else {
                                                bgClass = 'bg-transparent';
                                                borderClass = 'border-[#52525b] border-solid';
                                            }
                                        } else {
                                            bgClass = 'bg-transparent';
                                            borderClass = 'border-[#52525b] border-dashed';
                                        }
                                        return (
                                            <div 
                                                key={c.id} 
                                                className={`h-2 border transition-all duration-300 ${bgClass} ${borderClass}`}
                                                title={`${c.name}: ${c.active ? (c.matched ? 'Matched' : 'Unmatched') : 'Not Configured'}`}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between text-[8px] font-mono tracking-widest text-zinc-500 uppercase select-none">
                                    {tasteCompatibility.criteria.map((c) => {
                                        let textClass = 'text-zinc-600';
                                        if (c.active) {
                                            textClass = c.matched ? 'text-[#a855f7] font-bold' : 'text-zinc-400';
                                        }
                                        return (
                                            <span key={c.id} className={textClass}>
                                                {c.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {details.imageUrl && !imageError && (
                                <div className={`aspect-video w-full bg-zinc-800 overflow-hidden relative border border-zinc-800/50 shadow-2xl transition-opacity duration-700 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}>
                                    <img 
                                        ref={imgRef}
                                        src={details.imageUrl} 
                                        alt={details?.details?.artist || node.label || titleCaseArtistId(node.id)} 
                                        className="w-full h-full object-cover scale-105 hover:scale-100 transition-transform duration-1000"
                                        onLoad={() => setImgLoaded(true)}
                                        onError={() => setImageError(true)}
                                    />
                                </div>
                            )}

                            {(() => {
                                const hasInsight = details.recommendationReason &&
                                    details.recommendationReason !== SENTINEL_INSIGHT &&
                                    details.recommendationReason.trim().length > 0;
                                // Fallback: strip markdown bold markers from summary and use first 120 chars
                                const summaryFallback = details.summary
                                    ? details.summary.replace(/\*\*/g, '').trim().substring(0, 120) + (details.summary.length > 120 ? '...' : '')
                                    : null;
                                const quoteText = hasInsight ? details.recommendationReason : summaryFallback;
                                return quoteText ? (
                                    <div className="pt-2">
                                        <p className="italic text-zinc-100 leading-tight font-serif tracking-tight text-2xl">
                                            "{quoteText}"
                                        </p>
                                    </div>
                                ) : null;
                            })()}

                            <div className={`grid ${isHero ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'} gap-8 py-4 border-b border-zinc-800/50`}>
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Genre</h4>
                                    <p className="text-sm font-normal text-zinc-200">{details.details?.genre || 'Unknown'}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Origin</h4>
                                    <p className="text-sm font-normal text-zinc-200">{details.details?.origin || 'Unknown'}</p>
                                </div>
                                {details.details?.founded && (
                                    <div>
                                        <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">Founded</h4>
                                        <p className="text-sm font-normal text-zinc-200">{details.details.founded}</p>
                                    </div>
                                )}
                                {(() => {
                                    return (
                                        <div>
                                            <h4 className="font-bold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">
                                                Status
                                            </h4>
                                            <div className="flex flex-col gap-1">
                                                {tourStatus === 'idle' && (
                                                    <div className="flex flex-col gap-1">
                                                        <button 
                                                            onClick={() => {
                                                                setTourError(null);
                                                                setTourStatus('cost_warning');
                                                            }}
                                                            className="text-zinc-400 hover:text-primary transition-colors text-sm font-normal underline underline-offset-4 decoration-zinc-700 text-left w-fit"
                                                        >
                                                            Check tours
                                                        </button>
                                                        {tourError && (
                                                            <p className="text-xs text-red-400 mt-1">{tourError}</p>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {tourStatus === 'fetching' && (
                                                    <div className="flex items-center gap-2 text-sm font-normal text-zinc-200 animate-pulse">
                                                        Checking...
                                                    </div>
                                                )}
 
                                                {(tourStatus === 'resolved_summary' || tourStatus === 'full_itinerary_modal') && (
                                                    <div className="space-y-1">
                                                        {tourDates.length > 0 ? (
                                                            <>
                                                                <p className="text-sm font-normal text-zinc-200">
                                                                    • {tourDates[0]}
                                                                </p>
                                                                <button 
                                                                    onClick={() => setTourStatus('full_itinerary_modal')}
                                                                    className="text-primary hover:underline text-xs font-semibold mt-1 text-left block"
                                                                >
                                                                    view tour
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <p className="text-sm font-normal text-zinc-400">
                                                                No active tour dates found for 2026.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-bold text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Bio</h4>
                                <div className={`leading-relaxed text-zinc-300 markdown-bio ${isHero ? 'text-[clamp(1rem,1.2vw,1.125rem)] font-normal column-count-1 md:column-count-2 md:gap-12' : 'text-base'}`}>
                                    <Markdown>{details.summary}</Markdown>
                                </div>
                            </div>

                            {details.members && details.members.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-widest">Personnel</h4>
                                    <p className="text-base text-zinc-400">{details.members.join(' • ')}</p>
                                </div>
                            )}

                            {details.details?.notableArtists && details.details.notableArtists.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-3 text-[10px] uppercase tracking-widest">Scene Circle</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {details.details.notableArtists.map(artistName => {
                                            const isAlreadySeed = seedArtistSet.has(normalizeArtistId(artistName));
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
                                                    onClick={() => onAddArtist(normalizeArtistId(artistName))}
                                                    disabled={isAlreadySeed}
                                                    className={`border py-1.5 px-4 transition-all text-sm flex items-center gap-1.5 rounded-xl ${
                                                        isAlreadySeed 
                                                            ? 'text-primary border-primary/30 bg-primary/5 cursor-default' 
                                                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 active:scale-95'
                                                    }`}
                                                >
                                                    <span className="truncate tracking-normal">{artistName}</span>
                                                    {!isAlreadySeed && <span className="material-symbols-outlined !text-[14px]">add_circle</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {details.discography && details.discography.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-widest">Essential Listening</h4>
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
                                <div className="p-5 bg-primary/5 border-2 border-primary/20 relative">
                                    <div className="absolute -top-3 left-4 bg-zinc-900 px-2 text-[10px] font-semibold uppercase tracking-widest text-primary rounded-none">
                                        Artist Catalog
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        {links.purchase.map((link, i) => {
                                            const isBandcamp = /bandcamp/i.test(link.site);
                                            return (
                                                <a 
                                                    key={i} 
                                                    href={link.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className={`flex items-center justify-center px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.98] ${
                                                        isBandcamp 
                                                            ? 'bg-primary text-brand-black hover:opacity-90' 
                                                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined !text-[18px]">
                                                            {isBandcamp ? 'shopping_bag' : 'public'}
                                                        </span>
                                                        <span className="px-0.5 tracking-normal text-sm">
                                                            {isBandcamp ? `Shop on ${link.site}` : link.site}
                                                        </span>
                                                    </div>
                                                </a>
                                            );
                                        })}

                                        {/* Watch on YouTube button styled identically to Official Website */}
                                        {(() => {
                                            const rawLabel = node.label || '';
                                            const sanitisedLabel = rawLabel && /^[a-z]/.test(rawLabel) ? titleCaseArtistId(rawLabel) : rawLabel;
                                            const artistDisplay = details?.details?.artist || sanitisedLabel || titleCaseArtistId(node.id);
                                            const youtubeVideoId = details.youtubeVideoId;
                                            const youtubeUrl = youtubeVideoId && youtubeVideoId.length === 11
                                                ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
                                                : `https://www.youtube.com/results?search_query=${encodeURIComponent(artistDisplay)}+official+music+video`;

                                            return (
                                                <a 
                                                    href={youtubeUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="flex items-center justify-center px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.98] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined !text-[18px]">
                                                            play_circle
                                                        </span>
                                                        <span className="px-0.5 tracking-normal text-sm">
                                                            Watch on YouTube
                                                        </span>
                                                    </div>
                                                </a>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {links.info.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-widest">Metadata</h4>
                                    <div className="flex flex-wrap gap-4 pt-1">
                                        {links.info.map((link, i) => (
                                            <a 
                                                key={i} 
                                                href={link.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="text-zinc-400 active:text-primary transition-all text-sm underline underline-offset-4 decoration-zinc-700 font-medium"
                                            >
                                                {link.site}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-6 border-t border-zinc-800">
                                <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest mb-4">
                                    Deep Connections
                                </h4>
                                
                                {isGuest ? (
                                    <div className="flex flex-col items-center justify-center text-center p-6 bg-zinc-900/50 rounded-none border border-zinc-800/80">
                                        <span className="material-symbols-outlined !text-4xl text-primary/50 mb-3">lock</span>
                                        <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-200 mb-2">DEEPER CONNECTION</h5>
                                        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                                            Unlock our advanced AI assistant features to map deeper relationships across your music canvas.
                                        </p>
                                        {user ? (
                                            <button 
                                                onClick={() => onAuthRequest?.()}
                                                className={`w-full flex items-center justify-center gap-2 bg-primary ${isSmallScreen ? 'px-8 py-4 text-lg rounded-2xl' : 'px-6 py-2 text-sm rounded-xl'} font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg`}
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
                                                className={`w-full flex items-center justify-center gap-2 bg-primary ${isSmallScreen ? 'px-8 py-4 text-lg rounded-2xl' : 'px-6 py-2 text-sm rounded-xl'} font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg`}
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
                                    <div className="space-y-4 bg-zinc-950/20 border border-zinc-800/50 p-4">
                                            <div className="max-h-60 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-zinc-800 pr-1">
                                        {chatHistory.length === 0 ? (
                                            <p className="text-sm text-zinc-500 text-center py-4 italic">
                                                Inquire about history or relative scene positioning.
                                            </p>
                                        ) : (
                                            chatHistory.map((msg, i) => (
                                                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <div className={`max-w-[90%] px-4 py-2 text-base ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-200 border-r-4 border-primary' : 'bg-zinc-900/50 text-zinc-300 border-l-4 border-zinc-600 shadow-sm'} rounded-none`}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        {isChatLoading && (
                                            <div className="flex items-start">
                                                <div className="bg-zinc-900 border-l-4 border-primary px-4 py-2 flex items-center gap-2 rounded-none">
                                                    <div className="flex gap-1">
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>

                                    <div className="relative pt-2">
                                        <textarea
                                            rows={3}
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Consult Zcene AI..."
                                            className="w-full bg-zinc-900 border border-zinc-800 py-3.5 lg:py-2 pl-4 pr-16 text-base lg:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-all rounded-xl resize-none min-h-[80px] scrollbar-thin scrollbar-thumb-zinc-700"
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
                                                        : 'bg-primary text-brand-black shadow-[0_0_12px_rgba(246,228,104,0.3)] active:scale-95'
                                                }`}
                                                title="Send"
                                            >
                                                <span className="material-symbols-outlined !text-[22px]">arrow_upward</span>
                                            </button>
                                        </div>
                                    </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Token Confirmation Dialog */}
            {tourStatus === 'cost_warning' && createPortal(
                <TokenConfirmationDialog
                    isOpen={true}
                    onClose={() => setTourStatus('idle')}
                    onConfirm={handleFetchTourData}
                    type="live_tour_search"
                    cost={COST_PER_AI_CALL}
                    cachedArtists={[]}
                    missingArtists={[details?.details?.artist || node.label || titleCaseArtistId(node.id)]}
                />,
                document.body
            )}

            {/* Full Itinerary Modal Container */}
            {tourStatus === 'full_itinerary_modal' && createPortal(
                <FullItineraryDialog
                    isOpen={true}
                    onClose={() => setTourStatus('resolved_summary')}
                    artistName={details?.details?.artist || node.label || titleCaseArtistId(node.id)}
                    tourDates={tourDates}
                />,
                document.body
            )}
        </div>
    );
};

// --- MAIN COMPONENT: DetailsPanel ---
interface DetailsPanelProps {
  selectedNode: Node | null;
  activeNodes: Node[];
  detailsCache: Map<string, NodeDetails>;
  loadingNodeIds: Set<string>;
  onCloseNode: (nodeId: string) => void;
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
  onNodeClick: (node: Node | null) => void;
  onNavigate: (view: View) => void;
  isGlobalLoading: boolean;
  onCancelGlobalLoading: () => void;
  unreadCount: number;
  isActive: boolean;
  collapseBtnRef?: React.RefObject<HTMLButtonElement | null>;
  isMagazineViewOpen: boolean;
  onMagazineViewToggle: (isOpen: boolean) => void;
  chatHistories: Map<string, ChatMessage[]>;
  onUpdateChatHistories: (histories: Map<string, ChatMessage[]>) => void;
  stack: StackItem[];
  onToggleStack: (node: Node, link?: string) => void;
  isGuest?: boolean;
  user?: any;
  onAuthRequest?: () => void;
  userTaste?: UserTaste;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  selectedNode, activeNodes, detailsCache, loadingNodeIds, onCloseNode, onRefreshNode,
  error, systemError, graphData, libraryArtists, seedArtists, onAddArtist, isCollapsed, onToggleCollapse,
  isSmallScreen, onNodeClick, onNavigate, isGlobalLoading, onCancelGlobalLoading, unreadCount, isActive, collapseBtnRef,
  isMagazineViewOpen, onMagazineViewToggle, chatHistories, onUpdateChatHistories, stack, onToggleStack,
  isGuest = false, onAuthRequest, user, userTaste
}) => {
    const [viewedIndex, setViewedIndex] = useState(0);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [magazineSortBy, setMagazineSortBy] = useState<'none' | 'name' | 'genre' | 'origin' | 'founded'>('none');
    const [magazineSearchQuery, setMagazineSearchQuery] = useState('');
    
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const minSwipeDistance = 50;

    useEffect(() => {
        if (selectedNode && activeNodes && activeNodes.length > 0) {
            const idx = activeNodes.findIndex(n => n.id.toLowerCase() === selectedNode.id.toLowerCase());
            if (idx !== -1) {
                setViewedIndex(idx);
            }
        }
    }, [selectedNode, activeNodes]);

    const handleSendMessage = async (nodeId: string, message: string) => {
        const history = chatHistories.get(nodeId) || [];
        const newHistory = [...history, { role: 'user', text: message } as ChatMessage];
        
        onUpdateChatHistories(new Map(chatHistories).set(nodeId, newHistory));
        setIsChatLoading(true);

        try {
            const currentNode = activeNodes.find(n => n.id.toLowerCase() === nodeId.toLowerCase());
            if (!currentNode) return;

            const chatPromise = streamNodeChat(
                currentNode,
                history,
                message,
                graphData,
                (chunk) => {
                    onUpdateChatHistories(new Map(chatHistories).set(nodeId, [...newHistory, { role: 'model', text: chunk } as ChatMessage]));
                }
            );

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Chat request timed out")), 20000)
            );

            await Promise.race([chatPromise, timeoutPromise]);
        } catch (err: any) {
            console.error("Chat error:", err);
            const errorMessage = err?.message?.includes("timed out") 
                ? "The AI is taking too long to respond. Please try again."
                : "Failed to get a response. Please try again.";
            
            onUpdateChatHistories(new Map(chatHistories).set(nodeId, [
                ...newHistory, 
                { role: 'model', text: errorMessage } as ChatMessage
            ]));
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleNext = useCallback(() => {
        if (activeNodes && viewedIndex < activeNodes.length - 1) {
            const nextIdx = viewedIndex + 1;
            setViewedIndex(nextIdx);
            onNodeClick(activeNodes[nextIdx]);
        }
    }, [viewedIndex, activeNodes, onNodeClick]);

    const handlePrev = useCallback(() => {
        if (activeNodes && viewedIndex > 0) {
            const prevIdx = viewedIndex - 1;
            setViewedIndex(prevIdx);
            onNodeClick(activeNodes[prevIdx]);
        }
    }, [viewedIndex, activeNodes, onNodeClick]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isMagazineViewOpen) return;
        touchEndX.current = null;
        touchStartX.current = e.targetTouches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isMagazineViewOpen) return;
        touchEndX.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (isMagazineViewOpen || !touchStartX.current || !touchEndX.current) return;
        const distance = touchStartX.current - touchEndX.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe) handleNext();
        if (isRightSwipe) handlePrev();
    };

    const toggleFullScreen = () => {
        onMagazineViewToggle(!isMagazineViewOpen);
    };

    const filteredAndSortedNodes = useMemo(() => {
        if (systemError) return [];
        let result = [...activeNodes];

        // Filter
        if (isMagazineViewOpen && magazineSearchQuery.trim()) {
            const query = magazineSearchQuery.toLowerCase().trim();
            result = result.filter(node => {
                const details = detailsCache.get(node.id) || detailsCache.get(node.id.toLowerCase()) || detailsCache.get(normalizeArtistId(node.id));
                return (
                    (details?.details?.artist || node.label || titleCaseArtistId(node.id)).toLowerCase().includes(query) ||
                    details?.details?.genre?.toLowerCase().includes(query) ||
                    details?.details?.origin?.toLowerCase().includes(query) ||
                    details?.summary?.toLowerCase().includes(query)
                );
            });
        }

        // Sort
        if (isMagazineViewOpen && magazineSortBy !== 'none') {
            result.sort((a, b) => {
                const detailsA = detailsCache.get(a.id) || detailsCache.get(a.id.toLowerCase()) || detailsCache.get(normalizeArtistId(a.id));
                const detailsB = detailsCache.get(b.id) || detailsCache.get(b.id.toLowerCase()) || detailsCache.get(normalizeArtistId(b.id));
                
                if (magazineSortBy === 'name') {
                    return (a.label || a.id).localeCompare(b.label || b.id);
                }
                
                const valA = (detailsA?.details?.[magazineSortBy] || '').toString().toLowerCase();
                const valB = (detailsB?.details?.[magazineSortBy] || '').toString().toLowerCase();
                
                if (!valA && valB) return 1;
                if (valA && !valB) return -1;
                
                return valA.localeCompare(valB);
            });
        }

        return result;
    }, [activeNodes, isMagazineViewOpen, magazineSortBy, magazineSearchQuery, detailsCache]);

    return (
        <div 
          className="w-full h-full flex flex-col bg-zinc-900 overflow-hidden relative min-h-0"
          style={isMagazineViewOpen ? {
            backgroundImage: 'url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
          } : {}}
        >
            {isSmallScreen ? (
                <div className={`flex-shrink-0 border-b border-zinc-600/50 bg-zinc-900 z-[60] transition-all duration-300 ${isMagazineViewOpen ? 'h-fit py-3' : 'h-0 overflow-hidden'}`}>
                    <div className="px-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base text-white font-bold uppercase tracking-widest">Deep Cut</h2>
                                <span className="h-5 w-5 flex items-center justify-center text-[9px] font-bold border rounded-md bg-zinc-800 text-zinc-500 border-zinc-700">
                                    {activeNodes.length}
                                </span>
                            </div>
                            <button 
                                onClick={() => onMagazineViewToggle(false)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium shrink-0 leading-none"
                                title="Exit Magazine View"
                            >
                                <span>Exit Magazine</span>
                                <span className="material-symbols-outlined !text-[14px]">close</span>
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="relative flex-grow">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px]">search</span>
                                <input 
                                    type="text"
                                    placeholder="Filter magazine..."
                                    value={magazineSearchQuery}
                                    onChange={(e) => setMagazineSearchQuery(e.target.value)}
                                    className="w-full appearance-none border border-zinc-700 bg-zinc-900/60 py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                />
                            </div>

                            <div className="relative shrink-0 w-[110px]">
                                <select 
                                    value={magazineSortBy}
                                    onChange={(e) => setMagazineSortBy(e.target.value as any)}
                                    className="w-full appearance-none border border-zinc-700 bg-zinc-900 py-2 pl-3 pr-8 text-xs text-zinc-300 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none transition-all cursor-pointer"
                                >
                                    <option value="none">Sort</option>
                                    <option value="name">Name</option>
                                    <option value="genre">Genre</option>
                                    <option value="origin">Origin</option>
                                    <option value="founded">Founded</option>
                                </select>
                                <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 !text-[16px]">arrow_drop_down</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                isMagazineViewOpen ? (
                    <div className="h-12 flex-shrink-0 border-b border-zinc-600/50 bg-zinc-900 z-[60] relative">
                        <div className="max-w-[1400px] mx-auto w-full h-full px-4 md:px-6 lg:px-8 flex items-center justify-between relative">
                            <div className="flex items-center gap-4 overflow-hidden w-full">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base text-white font-bold uppercase tracking-widest whitespace-nowrap">Deep Cut</h2>
                                    <span className={`h-5 w-5 flex flex-shrink-0 items-center justify-center text-[9px] font-bold border rounded-md transition-all duration-500 ${unreadCount > 0 ? 'bg-brand-black text-primary border-primary/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                        {activeNodes.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 flex-grow animate-in fade-in slide-in-from-left-4 duration-500">
                                    <div className="h-6 w-px bg-zinc-700 mx-2 hidden md:block" />
                                    <div className="flex items-center gap-3 flex-grow max-w-2xl">
                                        <div className="relative flex-grow">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px]">search</span>
                                            <input 
                                                type="text"
                                                placeholder="Filter magazine..."
                                                value={magazineSearchQuery}
                                                onChange={(e) => setMagazineSearchQuery(e.target.value)}
                                                className="w-full appearance-none border border-zinc-700 bg-zinc-900/60 py-2 pl-10 pr-4 text-base lg:text-sm text-white placeholder:text-zinc-500 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-zinc-500 uppercase tracking-widest hidden sm:block">Sort by</span>
                                            <div className="relative">
                                                <select 
                                                    value={magazineSortBy}
                                                    onChange={(e) => setMagazineSortBy(e.target.value as any)}
                                                    className="w-full appearance-none border border-zinc-700 bg-zinc-900 py-2 pl-4 pr-10 text-base lg:text-sm text-zinc-300 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none transition-all cursor-pointer"
                                                >
                                                    <option value="none">Default</option>
                                                    <option value="name">Name</option>
                                                    <option value="genre">Genre</option>
                                                    <option value="origin">Origin</option>
                                                    <option value="founded">Founded</option>
                                                </select>
                                                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 !text-[18px]">arrow_drop_down</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5 ml-4 shrink-0">
                                <button 
                                    onClick={() => onMagazineViewToggle(false)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium shrink-0 leading-none"
                                    title="Exit Magazine View"
                                >
                                    <span>Exit Magazine</span>
                                    <span className="material-symbols-outlined !text-[14px]">close</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={`h-12 flex-shrink-0 border-b border-zinc-600/50 flex items-center relative z-[60] bg-zinc-900 ${isCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
                        {!isCollapsed && (
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base text-white font-bold uppercase tracking-widest whitespace-nowrap">Deep Cut</h2>
                                    <span className={`h-5 w-5 flex flex-shrink-0 items-center justify-center text-[9px] font-bold border rounded-md transition-all duration-500 ${unreadCount > 0 ? 'bg-brand-black text-primary border-primary/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
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
                                title={isCollapsed ? "Expand Deep Cut" : "Collapse Deep Cut"}
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
                        <button onClick={onToggleCollapse} className="group relative" title="View Deep Cut">
                             <span className={`h-8 w-8 flex items-center justify-center text-sm font-bold border-2 rounded-md transition-all duration-500 ${unreadCount > 0 && !systemError ? 'bg-brand-black text-primary border-primary/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'} group-active:scale-95`}>
                                {systemError ? 0 : activeNodes.length}
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-grow flex flex-col min-h-0 h-full overflow-hidden">
                    {!isMagazineViewOpen && activeNodes.length > 0 && (
                        <div className="flex justify-between items-center w-full px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 flex-shrink-0 gap-3">
                            <div className="flex items-center space-x-3 overflow-hidden">
                                {activeNodes.length > 1 && (
                                    <>
                                        <button 
                                            onClick={handlePrev} 
                                            disabled={viewedIndex <= 0}
                                            className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors disabled:opacity-20 disabled:pointer-events-none leading-none"
                                        >
                                            <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
                                        </button>
                                        <button 
                                            onClick={handleNext} 
                                            disabled={viewedIndex === activeNodes.length - 1}
                                            className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors disabled:opacity-20 disabled:pointer-events-none leading-none"
                                        >
                                            <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
                                        </button>
                                        
                                        <div className="relative flex items-center max-w-[80px] sm:max-w-[120px] overflow-hidden flex-shrink-0">
                                            <div className="flex items-center gap-1 flex-nowrap pr-4 overflow-hidden">
                                                {activeNodes.map((node, i) => (
                                                    <div 
                                                        key={node.id} 
                                                        onClick={() => { setViewedIndex(i); onNodeClick(node); }}
                                                        className={`h-1 transition-all cursor-pointer flex-shrink-0 rounded-full ${i === viewedIndex ? 'w-4 bg-primary' : 'w-1 bg-zinc-600 active:bg-zinc-400'}`}
                                                        title={node.label || titleCaseArtistId(node.id)}
                                                    />
                                                ))}
                                            </div>
                                            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-r from-transparent to-zinc-900 pointer-events-none" />
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => onMagazineViewToggle(!isMagazineViewOpen)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium shrink-0 leading-none"
                                title="Enter Magazine View"
                            >
                                <span className="material-symbols-outlined !text-[16px]">auto_stories</span>
                                <span>Magazine View</span>
                            </button>
                        </div>
                    )}

                    <div 
                        className={`flex-grow relative min-h-0 ${isMagazineViewOpen ? 'overflow-y-auto p-4 md:p-6 lg:p-8 scrollbar-thin scrollbar-thumb-zinc-800' : 'overflow-hidden'}`}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={isMagazineViewOpen ? { touchAction: 'pan-y', overscrollBehaviorY: 'auto' } : {}}
                    >
                        <div 
                            className={`${isMagazineViewOpen 
                                ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] gap-6 items-start w-full max-w-[1400px] mx-auto pb-12' 
                                : 'flex h-full w-full transition-transform duration-300 ease-in-out will-change-transform touch-pan-y'}`}
                            style={!isMagazineViewOpen ? { 
                                transform: `translateX(-${viewedIndex * 100}%)`,
                                overscrollBehaviorX: 'none'
                            } : {}}
                        >
                            {filteredAndSortedNodes.length === 0 || systemError ? (
                                <div className="absolute inset-0 z-10 flex items-center justify-center text-center p-8 pointer-events-none">
                                    {(isGlobalLoading && !systemError) ? (
                                        <div className="flex flex-col items-center justify-center gap-6">
                                            <LoadingSpinner 
                                                steps={["Waiting for the Spiderweb to settle...", "Mapping relationships first...", "Synchronising nodes..."]}
                                                subtext="Graph mapping takes priority. Details will follow."
                                            />
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
                                filteredAndSortedNodes.map((node) => {
                                    const details = detailsCache.get(node.id) || detailsCache.get(node.id.toLowerCase()) || detailsCache.get(normalizeArtistId(node.id)) || null;
                                    const isRichData = details && details.imageUrl && details.summary.length > 200;
                                    const isHero = isMagazineViewOpen && (node.id === selectedNode?.id || (isRichData && node.type === 'artist'));
                                    const isInStack = stack.some(item => item.id.toLowerCase() === node.id.toLowerCase());

                                    return (
                                        <div 
                                            key={node.id} 
                                            className={`transition-all duration-700 ${isMagazineViewOpen 
                                                ? 'inline-block w-full max-w-2xl text-left' 
                                                : 'w-full h-full flex-shrink-0 overflow-hidden'}`}
                                        >
                                            <NodeDetailsCard
                                                node={node}
                                                details={details}
                                                isLoading={loadingNodeIds.has(node.id)}
                                                isGlobalLoading={isGlobalLoading}
                                                graphData={graphData}
                                                libraryArtists={libraryArtists}
                                                seedArtists={seedArtists}
                                                onAddArtist={onAddArtist}
                                                isSmallScreen={isSmallScreen}
                                                onRefresh={() => onRefreshNode(node.id)}
                                                onClose={() => onCloseNode(node.id)}
                                                onNodeClick={onNodeClick}
                                                onNavigate={onNavigate}
                                                chatHistory={chatHistories.get(node.id) || []}
                                                onSendMessage={(msg) => handleSendMessage(node.id, msg)}
                                                isChatLoading={isChatLoading}
                                                isFullScreenMode={isMagazineViewOpen}
                                                isHero={isHero}
                                                isInStack={isInStack}
                                                onToggleStack={onToggleStack}
                                                onToggleMagazineView={() => onMagazineViewToggle(!isMagazineViewOpen)}
                                                isGuest={isGuest}
                                                user={user}
                                                onAuthRequest={onAuthRequest}
                                                userTaste={userTaste}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {!isMagazineViewOpen && error && activeNodes.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center p-8 text-center bg-zinc-900/50 backdrop-blur-sm z-50">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
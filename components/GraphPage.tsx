import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { GraphData, Node, ParsedArtist, View, NodeDetails, Link, ChatMessage, StackItem, DiscoveryFilters, UserTaste } from '../types';
import { User } from '../services/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { normalizeArtistId, titleCaseArtistId, cleanArtistDisplayName } from '../services/artistCacheService';
import HelpPage from './HelpPage';
import Header from './Header';
import MusicGraph from './MusicGraph';
import { DetailsPanel } from './DetailsPanel';
import { LoadingSpinner, ZceneAbbreviatedLogo, FaviconLogo, SortControls, LegendSymbol, HelpIcon, MicIcon, Spinner, StackIcon, LibraryIcon } from './Icons';
import { analyticsService } from '../services/analyticsService';
import AdSenseUnit from './AdSenseUnit';
import OnboardingTooltip from './OnboardingTooltip';
import * as d3 from 'd3';
import { RootsBreakdownButton, Select, InputSizes, LayoutSizes, Checkbox, CanvasControlStyles } from './DesignSystem';
import { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';
import { nodeTypeColorMap } from '../utils/formatters';

// Inform TypeScript about the SpeechRecognition and WakeLock APIs
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
  interface Navigator {
    readonly wakeLock: WakeLock;
  }
  interface WakeLock {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  }
  interface WakeLockSentinel extends EventTarget {
    readonly released: boolean;
    release(): Promise<void>;
    onrelease: ((this: WakeLockSentinel, ev: Event) => any) | null;
  }
}

// --- Types and Constants ---

const MAX_SEED_ARTISTS = 5;

type FilterKeys = 'genre' | 'label' | 'country' | 'founded' | 'seed' | 'recommended';
type MobileTab = 'artists' | 'spiderweb' | 'details';
type SortKey = 'name' | 'dateAdded' | 'selected';

interface SelectedArtist {
  name: string;
  enabled: boolean;
}

interface GraphPageProps {
  data: GraphData;
  baseGraph: GraphData | null;
  libraryArtists: ParsedArtist[];
  seedArtists: string;
  onRegenerate: (newArtists: string) => void;
  onFork?: (newArtists: string) => void;
  isLoading: boolean;
  onCancelGeneration: () => void;
  onFileUpload: (file: File) => void;
  onNodeClick: (node: Node | null, forceActionState?: boolean) => void;
  selectedNode: Node | null;
  peekedNode: Node | null;
  activeNodes: Node[];
  detailsCache: Map<string, NodeDetails>;
  onUpdateDetailsCache: (cache: Map<string, NodeDetails>) => void;
  loadingNodeIds: Set<string>;
  isHydrating?: boolean;
  onCloseNode: (nodeId: string) => void;
  onRefreshNode: (nodeId: string) => void;
  detailsError: string | null;
  systemError: string | null;
  onLogoClick: () => void;
  onNavigate: (view: View) => void;
  onClearLibrary: () => void;
  onClearZcene: () => void;
  isActive: boolean;
  chatHistories: Map<string, ChatMessage[]>;
  onUpdateChatHistories: (histories: Map<string, ChatMessage[]>) => void;
  onShowToast: (message: string) => void;
  onRefreshUI: () => void;
  stack: StackItem[];
  onToggleStack: (node: Node, link?: string) => void;
  lastViewedStackCount: number;
  onUpdateLastViewedStackCount: (count: number) => void;
  discoveryFilters: DiscoveryFilters;
  onUpdateDiscoveryFilters: (filters: DiscoveryFilters) => void;
  areFiltersChanged?: boolean;
  isMagazineViewOpen: boolean;
  onUpdateIsMagazineViewOpen: (isOpen: boolean) => void;
  onExtendNode?: (node: Node) => void;
  onRemoveNode?: (node: Node) => void;
  user: User | null;
  profile: any;
  onUpdateProfile: (updates: any) => void;
  isAuthInitialized: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onSaveToDashboard?: () => void;
  onDeleteAccount?: () => void;
  isAdmin?: boolean;
  onShareZcene?: () => Promise<string | null>;
  isSharingZcene?: boolean;
  isGuest?: boolean;
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isStackDialogOpen: boolean;
  setIsStackDialogOpen: (open: boolean) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  disambiguationDialog: {
    isOpen: boolean;
    query: string;
    candidates: DisambiguationCandidate[];
    isLiveAISuggestions?: boolean;
    showBack?: boolean;
  } | null;
  onSelectDisambiguation: (choice: string | 'synthesis' | 'cancel' | 'back') => void;
  onStashArtist?: (artistName: string) => void;
}

const DEFAULT_LEFT_PANEL_WIDTH = 320;
const DEFAULT_RIGHT_PANEL_WIDTH = 380;
const MIN_PANEL_WIDTH = 250;
const MAX_PANEL_WIDTH = 600;
const COLLAPSED_WIDTH = 64;
const MIN_GRAPH_WIDTH = 400;

// --- Components ---
import { GenerativeRationaleModal, DisambiguationModal, DisambiguationCandidate } from './SharedModals';


const DiscoveryFiltersPanel: React.FC<{
  filters: DiscoveryFilters;
  onUpdate: (filters: DiscoveryFilters) => void;
  isGuest?: boolean;
  onAuthRequest?: () => void;
  userTaste?: UserTaste;
}> = ({ filters, onUpdate, isGuest, onAuthRequest, userTaste }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isGuest) {
    return null;
  }

  const updateField = (field: keyof DiscoveryFilters, value: any) => {
    onUpdate({ ...filters, [field]: value });
  };

  const activeProfiles = Array.isArray(userTaste) ? userTaste.filter(p => p.isActive) : [];
  const hasTasteData = activeProfiles.length > 0 && activeProfiles.some(p => 
    p.style?.trim() ||
    p.favoriteGenre?.trim() ||
    p.favoriteOrigin?.trim() ||
    p.eraMin !== null ||
    p.eraMax !== null
  );

  const handleApplyTaste = () => {
    if (!userTaste || !Array.isArray(userTaste)) return;
    const active = userTaste.filter(p => p.isActive);
    if (active.length === 0) return;

    let minEra: number | undefined = undefined;
    let maxEra: number | undefined = undefined;
    const genres = new Set<string>();
    const origins = new Set<string>();

    active.forEach(p => {
      if (p.eraMin !== null) {
        minEra = minEra === undefined ? p.eraMin : Math.min(minEra, p.eraMin);
      }
      if (p.eraMax !== null) {
        maxEra = maxEra === undefined ? p.eraMax : Math.max(maxEra, p.eraMax);
      }
      if (p.favoriteGenre?.trim()) genres.add(p.favoriteGenre.trim());
      if (p.favoriteOrigin?.trim()) origins.add(p.favoriteOrigin.trim());
    });

    onUpdate({
      ...filters,
      foundedAfter: minEra,
      foundedBefore: maxEra,
      includeGenres: genres.size > 0 ? Array.from(genres) : undefined,
      includeOrigins: origins.size > 0 ? Array.from(origins) : undefined,
    });
  };

  const hasActiveFilters = filters.foundedAfter || 
                          filters.foundedBefore ||
                          (filters.includeGenres && filters.includeGenres.length > 0) ||
                          (filters.includeOrigins && filters.includeOrigins.length > 0) || 
                          (filters.excludeOrigins && filters.excludeOrigins.length > 0) || 
                          filters.additionalInstructions;

  return (
    <div className="px-4 mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest group"
      >
        <span className={`material-symbols-outlined !text-sm transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
        Seed Filters
        {hasActiveFilters && !isExpanded && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 rounded-none bg-zinc-800/30 border border-zinc-700/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {hasTasteData && (
            <button
              type="button"
              onClick={handleApplyTaste}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium leading-none cursor-pointer"
            >
              Apply Style
            </button>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Founded Era Range (Years)</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <input
                  type="number"
                  placeholder="Min Year"
                  value={filters.foundedAfter || ''}
                  onChange={(e) => updateField('foundedAfter', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-1">
                <input
                  type="number"
                  placeholder="Max Year"
                  value={filters.foundedBefore || ''}
                  onChange={(e) => updateField('foundedBefore', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Include Genres</label>
            <input
              type="text"
              placeholder="e.g. Hardcore Punk, Grunge"
              value={filters.includeGenres?.join(', ') || ''}
              onChange={(e) => updateField('includeGenres', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Include Origins</label>
            <input
              type="text"
              placeholder="e.g. Canada, UK"
              value={filters.includeOrigins?.join(', ') || ''}
              onChange={(e) => updateField('includeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Exclude Origins</label>
            <input
              type="text"
              placeholder="e.g. Australia"
              value={filters.excludeOrigins?.join(', ') || ''}
              onChange={(e) => updateField('excludeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Additional Instructions</label>
            <textarea
              placeholder="e.g. Only underground artists..."
              value={filters.additionalInstructions || ''}
              onChange={(e) => updateField('additionalInstructions', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all min-h-[60px] resize-none"
            />
          </div>
          
          {hasActiveFilters && (
            <button 
              onClick={() => onUpdate({})}
              className="text-[10px] font-bold text-primary/60 hover:text-primary uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined !text-xs">restart_alt</span>
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Shared Empty State Component
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
                <li>Add 1–5 artists (or import your library).</li>
                <li>Create your Zcene.</li>
                <li>Drag, filter, and explore the spiderweb.</li>
            </ol>
        </div>
    </div>
  </div>
);

const UpdateInterceptModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    onOverwrite: () => void;
    onSaveAsNew: () => void;
    confirmOverwrite: boolean;
    setConfirmOverwrite: (val: boolean) => void;
}> = ({ isOpen, onClose, onOverwrite, onSaveAsNew, confirmOverwrite, setConfirmOverwrite }) => {
    if (!isOpen) return null;
    return (
        <ModalBackdrop className="z-[110]" onClick={onClose}>
            <ModalContainer className="sm:max-w-md">
                <ModalHeader>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary !text-[18px]">account_tree</span>
                        <h3 className="font-medium text-white text-base">Update Zcene</h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined !text-[18px]">close</span>
                    </button>
                </ModalHeader>
                <ModalBody>
                    <p className="text-zinc-300 text-sm mb-4">
                        You are about to generate a new spiderweb. Would you like to fork a new Zcene, or overwrite the existing one?
                    </p>
                    <div className="p-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl hover:bg-zinc-800/50 transition-colors">
                        <Checkbox 
                            checked={confirmOverwrite}
                            onChange={(e) => setConfirmOverwrite(e.target.checked)}
                            label="I understand that overwriting will replace my current spiderweb."
                        />
                    </div>
                </ModalBody>
                <ModalFooter className="flex flex-col sm:flex-row gap-3 justify-end items-center">
                    <button 
                        onClick={onOverwrite} 
                        disabled={!confirmOverwrite}
                        className={`w-full sm:w-auto px-4 py-2 rounded-xl font-medium text-sm transition-all text-center ${confirmOverwrite ? 'bg-zinc-800 text-red-400 border border-red-500/30 hover:bg-red-500/10' : 'bg-zinc-800/50 text-zinc-600 border border-zinc-800 cursor-not-allowed'}`}
                    >
                        Overwrite Existing
                    </button>
                    <button 
                        onClick={onSaveAsNew} 
                        className="w-full sm:w-auto px-4 py-2 bg-white text-brand-black rounded-xl font-medium text-sm transition-colors hover:opacity-90 text-center"
                    >
                        Save as New Zcene
                    </button>
                </ModalFooter>
            </ModalContainer>
        </ModalBackdrop>
    );
};

const LimitReachedDialog: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <ModalBackdrop className="z-[110]" onClick={onClose}>
            <ModalContainer className="sm:max-w-md">
                <ModalHeader>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-yellow-400 !text-[18px]">warning</span>
                        <h3 className="font-medium text-white text-base">Artist Limit Reached</h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined !text-[18px]">close</span>
                    </button>
                </ModalHeader>
                <ModalBody>
                    To ensure the best performance and graph quality, you can only add up to 5 seed artists.
                </ModalBody>
                <ModalFooter>
                    <button onClick={onClose} className="px-4 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-colors hover:opacity-90">
                        Got it
                    </button>
                </ModalFooter>
            </ModalContainer>
        </ModalBackdrop>
    );
};



const LibraryDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  libraryArtists: ParsedArtist[];
  selectedArtists: SelectedArtist[];
  onArtistToggle: (artistName: string) => void;
  uniqueGenres: string[];
  artistGenreMap: Map<string, Set<string>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onTriggerClear: () => void;
}> = ({
  isOpen, onClose, libraryArtists, selectedArtists, onArtistToggle, uniqueGenres,
  artistGenreMap, fileInputRef, onTriggerClear
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'dateAdded', direction: 'desc' });
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const genrePopoverRef = useRef<HTMLDivElement>(null);
  
  const selectedArtistNames = useMemo(() => new Set(selectedArtists.map(a => a.name)), [selectedArtists]);

  const handleSortChange = (key: SortKey) => {
    setSortConfig(prev => {
        if (prev.key === key) {
            return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  };

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]);
  };

  useEffect(() => {
    if (!isGenreOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (genrePopoverRef.current && !genrePopoverRef.current.contains(e.target as HTMLElement)) {
        setIsGenreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isGenreOpen]);

  const handleSpeechToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);
    recognition.start();

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchTerm(transcript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        alert("Microphone access was denied. Please enable microphone permissions in your browser settings to use speech-to-text.");
      } else {
        console.error("Speech recognition error", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };
  };

  const sortedAndFilteredLibraryArtists = useMemo(() => {
    const sorted = [...libraryArtists].sort((a, b) => {
        if (sortConfig.key === 'selected') {
            const aIsSelected = selectedArtistNames.has(a.name);
            const bIsSelected = selectedArtistNames.has(b.name);
            if (aIsSelected === bIsSelected) return a.name.localeCompare(b.name);
            return sortConfig.direction === 'asc' ? (aIsSelected ? 1 : -1) : (aIsSelected ? -1 : 1);
        }
        if (sortConfig.key === 'name') {
            return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        if (a.dateAdded === null) return 1;
        if (b.dateAdded === null) return -1;
        return sortConfig.direction === 'desc' 
            ? b.dateAdded.getTime() - a.dateAdded.getTime()
            : a.dateAdded.getTime() - b.dateAdded.getTime();
    });
    
    const genreFiltered = selectedGenres.length === 0
        ? sorted
        : sorted.filter(artist => {
            const normalizedArtistId = normalizeArtistId(artist.name);
            const artistGenres = artistGenreMap.get(normalizedArtistId) || artistGenreMap.get(artist.name) || artistGenreMap.get(artist.name.trim());
            if (!artistGenres) return false;
            
            return selectedGenres.some(selected => {
                const selLower = selected.trim().toLowerCase();
                return Array.from(artistGenres).some(g => g.trim().toLowerCase() === selLower);
            });
        });

    if (!searchTerm) return genreFiltered;
    
    return genreFiltered.filter(artist => artist.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [libraryArtists, searchTerm, sortConfig, selectedGenres, artistGenreMap, selectedArtistNames]);

  if (!isOpen) return null;  return (
    <ModalBackdrop className="z-[110]" onClick={onClose}>
        <ModalContainer className="max-w-3xl h-[90vh] max-h-[700px]">
            <ModalHeader>
                <div className="flex items-center gap-2">
                    <LibraryIcon className="text-primary !text-[18px]" />
                    <h3 className="text-lg font-medium text-white">Your Music Library ({libraryArtists.length})</h3>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none aspect-square">
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
            </ModalHeader>

            <div className="relative z-10 p-4 flex-shrink-0 border-b border-zinc-700 space-y-3">
                <div className="relative">
                    <span className={`material-symbols-outlined absolute top-1/2 -translate-y-1/2 text-zinc-500 ${InputSizes.md.leftIcon}`}>search</span>
                    <input
                        type="search"
                        placeholder="Search your library..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none font-normal ${InputSizes.md.magazineSearch}`}
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {!searchTerm && (
                            <button
                                onClick={handleSpeechToText}
                                className={`flex flex-shrink-0 items-center justify-center transition-colors leading-none ${InputSizes.md.iconBtn} ${isListening ? 'text-primary animate-pulse' : 'text-zinc-400 hover:text-white'}`}
                                title="Search by voice"
                            >
                                <MicIcon className={InputSizes.md.icon} />
                            </button>
                        )}
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')} 
                                className={`flex items-center justify-center text-zinc-400 hover:text-white transition-colors leading-none ${InputSizes.md.iconBtn}`}
                                aria-label="Clear search"
                            >
                                <span className={`material-symbols-outlined ${InputSizes.md.icon}`}>close</span>
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-row items-center justify-between gap-3 w-full">
                    <SortControls sortConfig={sortConfig} onSortChange={handleSortChange} />
                    <div className="static sm:relative shrink-0" ref={genrePopoverRef}>
                        <button
                            onClick={() => setIsGenreOpen(v => !v)}
                            className={`flex items-center gap-2 rounded-xl border px-3 ${LayoutSizes.controlBar} text-xs font-medium transition-colors ${
                                selectedGenres.length > 0
                                    ? 'border-primary/60 bg-primary/10 text-primary'
                                    : 'border-zinc-700 bg-zinc-950 text-zinc-200'
                            }`}
                            aria-expanded={isGenreOpen}
                        >
                            <span className="material-symbols-outlined !text-[14px]">filter_list</span>
                            {selectedGenres.length > 0 ? `${selectedGenres.length} Genre${selectedGenres.length > 1 ? 's' : ''}` : 'All Genres'}
                            <span className="material-symbols-outlined !text-[14px] transition-transform duration-200" style={{ transform: isGenreOpen ? 'rotate(180deg)' : '' }}>expand_more</span>
                        </button>
                        {isGenreOpen && uniqueGenres.length > 0 && (
                            <div className="absolute top-full left-4 right-4 sm:left-auto sm:right-0 mt-2 sm:mt-1.5 w-auto sm:w-56 max-w-none rounded-xl border border-zinc-700 bg-zinc-950 z-20 flex flex-col">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 rounded-t-xl">
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Filter by Genre</span>
                                    {selectedGenres.length > 0 && (
                                        <button onClick={() => setSelectedGenres([])} className="text-[10px] font-semibold text-zinc-400 hover:text-primary transition-colors uppercase tracking-widest">
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5 rounded-b-xl">
                                    {[...uniqueGenres].sort().map(genre => {
                                        const isChecked = selectedGenres.includes(genre);
                                        return (
                                            <label key={genre} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${ isChecked ? 'bg-primary/10' : 'hover:bg-zinc-800/80' }`}>
                                                <span className={`material-symbols-outlined !text-[16px] flex-shrink-0 transition-colors ${ isChecked ? 'text-primary' : 'text-zinc-600' }`}>
                                                    {isChecked ? 'check_box' : 'check_box_outline_blank'}
                                                </span>
                                                <input type="checkbox" checked={isChecked} onChange={() => handleGenreToggle(genre)} className="sr-only" />
                                                <span className={`text-xs select-none truncate ${ isChecked ? 'text-white font-medium' : 'text-zinc-300' }`}>{genre}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4" style={{ overscrollBehaviorY: 'contain' }}>
                {sortedAndFilteredLibraryArtists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3 min-h-[200px]">
                        <span className="material-symbols-outlined !text-4xl text-zinc-700">search_off</span>
                        <p className="text-sm font-medium">No artists found matching selected filters.</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {sortedAndFilteredLibraryArtists.map(artist => (
                            <button
                                key={artist.name}
                                onClick={() => onArtistToggle(artist.name)}
                                className={`w-full text-left rounded-xl px-4 py-3 text-base sm:py-2 sm:text-sm font-medium transition-colors flex items-center justify-between ${
                                    selectedArtistNames.has(artist.name)
                                        ? 'text-white bg-zinc-700/80'
                                        : 'text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                            >
                                <span className="truncate select-none">{artist.name}</span>
                                <span className={`material-symbols-outlined transition-colors ${selectedArtistNames.has(artist.name) ? 'text-primary' : 'text-transparent'}`}>
                                   check_circle
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <ModalFooter className="justify-between">
                <button onClick={onTriggerClear} className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                    <span className="material-symbols-outlined !text-[18px]">delete_sweep</span>
                    Clear Library
                </button>
                <button onClick={onClose} className="rounded-xl bg-white px-6 py-2 text-sm font-medium text-brand-black transition-opacity hover:opacity-90">Done</button>
            </ModalFooter>
        </ModalContainer>
    </ModalBackdrop>
  );
};

const GraphPage: React.FC<GraphPageProps> = ({
  data, baseGraph, libraryArtists, seedArtists, onRegenerate, onFork, isLoading,
  onCancelGeneration, onFileUpload, onNodeClick, selectedNode, peekedNode,
  activeNodes, detailsCache, onUpdateDetailsCache, loadingNodeIds, onCloseNode, onRefreshNode, detailsError, systemError, onLogoClick, onNavigate, onClearLibrary, onClearZcene, isActive,
  chatHistories, onUpdateChatHistories, onShowToast, onRefreshUI, stack, onToggleStack,
  lastViewedStackCount, onUpdateLastViewedStackCount,
  discoveryFilters, onUpdateDiscoveryFilters, areFiltersChanged = false,
  isMagazineViewOpen, onUpdateIsMagazineViewOpen,
  onExtendNode, onRemoveNode,
  user, profile, onUpdateProfile, isAuthInitialized, onLogin, onLogout,
  onDeleteAccount,
  onSaveToDashboard,
  isAdmin,
  onShareZcene, isSharingZcene,
  isGuest = false,
  projectName = "",
  onProjectNameChange,
  isProfileOpen, setIsProfileOpen,
  isDeleteAccountModalOpen, setIsDeleteAccountModalOpen,
  isStackDialogOpen, setIsStackDialogOpen,
  isMenuOpen, setIsMenuOpen,
  disambiguationDialog, onSelectDisambiguation,
  onStashArtist,
  isHydrating
}) => {
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const hasInitializedPanelRef = useRef(false);

  useEffect(() => {
      if (hasInitializedPanelRef.current || data.nodes.length === 0) return;
      hasInitializedPanelRef.current = true;
      const isFirst = data.nodes.length === seedArtists.split('::').filter(Boolean).length;
      setIsLeftPanelCollapsed(!isFirst);
  }, [data.nodes.length, seedArtists]);
  const [isDetailsPanelCollapsed, setIsDetailsPanelCollapsed] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [viewedRationale, setViewedRationale] = useState<string | null>(null);
  
  const [selectedSeedArtists, setSelectedSeedArtists] = useState<SelectedArtist[]>(() =>
    seedArtists.split('::').map(a => a.trim()).filter(Boolean).map(name => ({ name, enabled: true }))
  );
  useEffect(() => {
    setSelectedSeedArtists(seedArtists.split('::').map(a => a.trim()).filter(Boolean).map(name => ({ name, enabled: true })));
  }, [seedArtists]);
  
  const handleToggleArtist = (artistName: string) => {
    setSelectedSeedArtists(prev => prev.map(a => 
      a.name === artistName ? { ...a, enabled: !a.enabled } : a
    ));
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  const [isSmallScreen, setIsSmallScreen] = useState(() => {
      if (typeof window !== 'undefined') {
          return !window.matchMedia('(min-width: 768px)').matches;
      }
      return false;
  });
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  
  const [isListeningForArtists, setIsListeningForArtists] = useState(false);
  const [isListeningForGraph, setIsListeningForGraph] = useState(false);

  // Tooltip Target Refs
  const artistInputRef = useRef<HTMLInputElement>(null);
  const createZceneBtnRef = useRef<HTMLButtonElement>(null);
  
  const mobileGraphAreaRef = useRef<HTMLDivElement>(null);
  const desktopGraphAreaRef = useRef<HTMLDivElement>(null);
  const mobileLegendAreaRef = useRef<HTMLDivElement>(null);
  const desktopLegendAreaRef = useRef<HTMLDivElement>(null);

  const deepCutTabRef = useRef<HTMLButtonElement>(null);
  const detailsCollapseBtnRef = useRef<HTMLButtonElement>(null);
  const mobileTabContainerRef = useRef<HTMLDivElement>(null);
  
  const centerColumnRef = useRef<HTMLDivElement>(null);
  const [adSize, setAdSize] = useState<'small' | 'large'>('small');

  const [activeTab, setActiveTab] = useState<MobileTab>(() => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const path = window.location.pathname;
        if (path.startsWith('/z/') || path.startsWith('/project/') || params.has('shareId') || params.has('id') || params.has('seeds')) return 'spiderweb';
        if (params.has('selected')) return 'details';
    }
    const seeds = seedArtists ? seedArtists.split('::').map(a => a.trim()).filter(Boolean) : [];
    if (seeds.length > 0) return 'spiderweb';
    return 'artists';
  });

  const [isLibraryDialogOpen, setIsLibraryDialogOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [pendingUpdateSeed, setPendingUpdateSeed] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [isExpectingUpload, setIsExpectingUpload] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const leftPanelPreCollapseWidth = useRef(DEFAULT_LEFT_PANEL_WIDTH);
  const rightPanelPreCollapseWidth = useRef(DEFAULT_RIGHT_PANEL_WIDTH);
  const resizingPanelRef = useRef<'left' | 'right' | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const [activeFilters, setActiveFilters] = useState<Record<FilterKeys, boolean>>({
      genre: true,
      label: true,
      country: true, 
      founded: true, 
      seed: true,
      recommended: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const [readNodeIds, setReadNodeIds] = useState<Set<string>>(new Set());

  // --- WAKE LOCK LOGIC ---
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    console.log('Current Auth User:', user);
    // Explicitly as requested:
    // @ts-ignore
    import('../services/firebase').then(({ auth }) => {
        console.log('Current Auth User (direct from auth):', auth.currentUser);
    });
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.debug('Wake lock request was disallowed by permissions policy.');
      } else {
        console.error(`${err.name}, ${err.message}`);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isLoading) requestWakeLock();
    else releaseWakeLock();
    return () => { releaseWakeLock(); };
  }, [isLoading, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoading) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoading, requestWakeLock]);

  useEffect(() => {
    if (isSmallScreen && seedArtists) {
      const seeds = seedArtists.split('::').map(a => a.trim()).filter(Boolean);
      if (seeds.length > 0) {
        setActiveTab('spiderweb');
      }
    }
  }, [seedArtists, isSmallScreen]);

  useEffect(() => {
    if (isSmallScreen && mobileTabContainerRef.current) mobileTabContainerRef.current.scrollLeft = 0;
  }, [activeTab, isSmallScreen]);

  useEffect(() => {
    if (isSmallScreen && isMagazineViewOpen && activeTab !== 'details') {
      setActiveTab('details');
    }
  }, [isMagazineViewOpen, isSmallScreen, activeTab]);



  // Local state for guest onboarding
  const [localOnboarding, setLocalOnboarding] = useState<{ [key: string]: boolean }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('zcene_onboarding_progress');
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  const isShareIdActive = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    return path.startsWith('/z/') || path.startsWith('/project/') || params.has('shareId') || params.has('id');
  }, []);

  const onboardingProgress = useMemo(() => {
    if (user) {
      return profile?.onboardingProgress || {};
    }
    return localOnboarding;
  }, [user, profile?.onboardingProgress, localOnboarding]);

  const [visibleTooltips, setVisibleTooltips] = useState<{ [key: string]: boolean }>({
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
  });

  const updateOnboarding = (step: string) => {
    const next = { ...onboardingProgress, [step]: true };
    if (user) {
      onUpdateProfile({ onboardingProgress: next });
    } else {
      setLocalOnboarding(next);
      try {
        localStorage.setItem('zcene_onboarding_progress', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
    }
    setVisibleTooltips(prev => ({ ...prev, [step]: false }));
  };

  const handleRestartWalkthrough = useCallback(() => {
    if (user) {
      onUpdateProfile({ onboardingProgress: {} });
    } else {
      setLocalOnboarding({});
      try {
        localStorage.removeItem('zcene_onboarding_progress');
      } catch (e) {
        console.error(e);
      }
    }
    // Clear read/visited node IDs
    setReadNodeIds(new Set());
    // Clear selection
    onNodeClick(null);
    // Reset tabs and collapse panels
    setActiveTab('artists');
    onUpdateIsMagazineViewOpen(false);
    setIsDetailsPanelCollapsed(true);
    setIsLeftPanelCollapsed(false);
    
    // Show a toast to notify user

  }, [user, onUpdateProfile, onNodeClick, onUpdateIsMagazineViewOpen, onShowToast]);

  useEffect(() => {
    if (!isActive) {
        setVisibleTooltips({ step1: false, step2: false, step3: false, step4: false, step5: false });
        return;
    }
    const isGraphVisible = isSmallScreen ? activeTab === 'spiderweb' : true;
    const isArtistsVisible = isSmallScreen ? activeTab === 'artists' : true;
    const hasData = data.nodes.length > 0;
    const newVisibleTooltips = { step1: false, step2: false, step3: false, step4: false, step5: false };
    
    if (isShareIdActive) {
        // Guest/Share onboarding: restrict to step3, step5 (as a 2-step tour)
        if (hasData && !isLoading) {
            if (!onboardingProgress.step3 && isGraphVisible) {
                newVisibleTooltips.step3 = true;
            } else if (!onboardingProgress.step5 && selectedNode) {
                newVisibleTooltips.step5 = true;
            }
        }
    } else {
        // Regular onboarding
        if (!onboardingProgress.step1) {
            if (isArtistsVisible) newVisibleTooltips.step1 = true;
        } else if (selectedSeedArtists.length > 0 && !onboardingProgress.step2 && !isLoading && !hasData) {
            if (isArtistsVisible) newVisibleTooltips.step2 = true;
        } else if (hasData && !isLoading) {
            if (!onboardingProgress.step3 && isGraphVisible) newVisibleTooltips.step3 = true;
            else if (!onboardingProgress.step5 && selectedNode) newVisibleTooltips.step5 = true;
        }
    }
    setVisibleTooltips(newVisibleTooltips);
  }, [isActive, data.nodes.length, onboardingProgress, isSmallScreen, activeTab, isLoading, selectedNode, selectedSeedArtists.length, isShareIdActive]);

  const handleSpeechToText = (target: 'artists' | 'graph') => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech recognition is not supported."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    if (target === 'artists') setIsListeningForArtists(true);
    else setIsListeningForGraph(true);
    recognition.start();
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (target === 'artists') {
          setSearchTerm(prev => prev ? `${prev}, ${transcript}` : transcript);
          if (!onboardingProgress.step1) updateOnboarding('step1');
      } else {
          setSearchQuery(transcript);
          if (selectedNode) onNodeClick(null);
      }
    };
    recognition.onerror = () => { setIsListeningForArtists(false); setIsListeningForGraph(false); };
    recognition.onend = () => { setIsListeningForArtists(false); setIsListeningForGraph(false); };
  };

  useEffect(() => {
    if (isExpectingUpload && libraryArtists.length > 0) {
        setIsLibraryDialogOpen(true);
        setIsExpectingUpload(false);
    }
  }, [libraryArtists, isExpectingUpload]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateScreenSize = () => setIsSmallScreen(!mediaQuery.matches);
    updateScreenSize();
    mediaQuery.addEventListener('change', updateScreenSize);
    window.addEventListener('resize', updateScreenSize);
    return () => {
        mediaQuery.removeEventListener('change', updateScreenSize);
        window.removeEventListener('resize', updateScreenSize);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    if (path.startsWith('/z/') || path.startsWith('/project/') || params.has('shareId') || params.has('id')) {
      setActiveTab('spiderweb');
    }
  }, []);
  
  
  
  useEffect(() => {
    if (isLeftPanelCollapsed) {
        if (leftPanelWidth > COLLAPSED_WIDTH) leftPanelPreCollapseWidth.current = leftPanelWidth;
        setLeftPanelWidth(COLLAPSED_WIDTH);
    } else setLeftPanelWidth(leftPanelPreCollapseWidth.current);
  }, [isLeftPanelCollapsed]);

  useEffect(() => {
    if (isDetailsPanelCollapsed) {
        if (rightPanelWidth > COLLAPSED_WIDTH) rightPanelPreCollapseWidth.current = rightPanelWidth;
        setRightPanelWidth(COLLAPSED_WIDTH);
    } else setRightPanelWidth(rightPanelPreCollapseWidth.current);
  }, [isDetailsPanelCollapsed]);

  const handleNodeClickInternal = useCallback((node: Node | null, forceActionState = false) => {
    onNodeClick(node, forceActionState);
    if (node) {
      analyticsService.track('Node Clicked', { node_id: node?.id, node_type: node?.type });
      if (!isSmallScreen) {
        setIsLeftPanelCollapsed(true);
      } else {
        setActiveTab('details');
      }
    }
  }, [onNodeClick, isSmallScreen]);

  const isDetailsVisible = useMemo(() => isSmallScreen ? activeTab === 'details' : !isDetailsPanelCollapsed, [isSmallScreen, activeTab, isDetailsPanelCollapsed]);



  useEffect(() => {
    if (isLoading && isDetailsPanelCollapsed) {
      setIsDetailsPanelCollapsed(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (selectedNode && isDetailsVisible) {
        setReadNodeIds(prev => {
            const normalizedId = selectedNode.id.trim().toLowerCase();
            if (prev.has(normalizedId)) return prev;
            const next = new Set(prev);
            next.add(normalizedId);
            return next;
        });
    }
  }, [selectedNode, isDetailsVisible]);

  useEffect(() => {
    if (selectedNode && isDetailsPanelCollapsed) {
      setIsDetailsPanelCollapsed(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (isMagazineViewOpen && isDetailsPanelCollapsed) {
      setIsDetailsPanelCollapsed(false);
    }
  }, [isMagazineViewOpen, isDetailsPanelCollapsed]);

  useEffect(() => {
    if (isMagazineViewOpen && activeNodes.length > 0) {
      setReadNodeIds(prev => {
        const next = new Set(prev);
        let changed = false;
        activeNodes.forEach(node => {
          const id = node.id.trim().toLowerCase();
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [isMagazineViewOpen, activeNodes]);

  const { uniqueGenres, artistGenreMap } = useMemo(() => {
    const sourceGraph = baseGraph && baseGraph.nodes.length > 0 ? baseGraph : data;
    if (!sourceGraph) return { uniqueGenres: [], artistGenreMap: new Map() };
    const genres = new Set<string>();
    const map = new Map<string, Set<string>>();
    const artistNodes = new Map(sourceGraph.nodes.filter(n => n.type === 'artist').map(n => [n.id, n]));
    const genreNodes = new Map(sourceGraph.nodes.filter(n => n.type === 'genre').map(n => [n.id, n]));
    sourceGraph.links.forEach(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        let artistId: string | null = null;
        let genreId: string | null = null;
        if (artistNodes.has(sourceId) && genreNodes.has(targetId)) { artistId = sourceId; genreId = targetId; }
        else if (artistNodes.has(targetId) && genreNodes.has(sourceId)) { artistId = targetId; genreId = sourceId; }
        if (artistId && genreId) {
            genres.add(genreId);
            if (!map.has(artistId)) map.set(artistId, new Set());
            map.get(artistId)!.add(genreId);
        }
    });
    return { uniqueGenres: Array.from(genres).sort(), artistGenreMap: map };
  }, [data, baseGraph]);

  const handleShareZcene = useCallback(async () => {
    if (isSharing || isSharingZcene || !onShareZcene) return;
    
    const baseUrl = window.location.origin + window.location.pathname;
    analyticsService.track('Share Initiated', { type: 'global_zcene', seed_count: selectedSeedArtists.length });
    
    setIsSharing(true);
    try {
      await onShareZcene();
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, isSharingZcene, onShareZcene, selectedSeedArtists, selectedNode]);

  const isOverLimit = selectedSeedArtists.length > MAX_SEED_ARTISTS;
  
  const isArtistPending = useMemo(() => {
    const currentEnabled = selectedSeedArtists.filter(a => a.enabled).map(a => normalizeArtistId(a.name)).sort().join('::');
    const lastGenerated = seedArtists.split('::').map(s => normalizeArtistId(s)).filter(Boolean).sort().join('::');
    const hasSearchTerm = searchTerm.trim().length > 0;
    return (currentEnabled !== lastGenerated && currentEnabled.length > 0) || hasSearchTerm || areFiltersChanged;
  }, [selectedSeedArtists, seedArtists, searchTerm, areFiltersChanged]);

  const memoizedLibraryArtists = useMemo(() => libraryArtists.map(a => a.name), [libraryArtists]);
  const memoizedSeedArtists = useMemo(() => selectedSeedArtists.filter(a => a.enabled).map(a => a.name), [selectedSeedArtists]);
  const memoizedAllSeedArtists = useMemo(() => selectedSeedArtists.map(a => a.name), [selectedSeedArtists]);

  // My Stack Action State logic: Action if stack size has grown since last visit to dialog
  const isStackNew = useMemo(() => stack.length > lastViewedStackCount, [stack.length, lastViewedStackCount]);
  const unreadDetailsCount = useMemo(() => activeNodes.filter(n => !readNodeIds.has(n.id.trim().toLowerCase())).length, [activeNodes, readNodeIds]);
  const artistIndicatorStyles = useMemo(() => isArtistPending ? 'bg-zinc-900 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700', [isArtistPending]);
  
  const isFirstGeneration = useMemo(() => data.nodes.length === 0 && !seedArtists, [data.nodes.length, seedArtists]);

  const handleApplyChanges = () => {
    if (!user) {
      onLogin();
      return;
    }
    let currentArtists = [...selectedSeedArtists];
    
    // Implicit Add: If there's text in the search term, add it first
    if (searchTerm.trim()) {
      const newArtists = searchTerm.split(';').map(a => a.trim()).filter(Boolean);
      if (newArtists.length > 0) {
        const uniqueNew = newArtists.filter(name => !currentArtists.some(s => normalizeArtistId(s.name) === normalizeArtistId(name)));
        
        if (currentArtists.length + uniqueNew.length > MAX_SEED_ARTISTS) {
          setShowLimitDialog(true);
          return;
        }

        const artistsToAdd = newArtists.map(artistName => {
          const libraryMatch = libraryArtists.find(a => normalizeArtistId(a.name) === normalizeArtistId(artistName));
          return libraryMatch ? libraryMatch.name : artistName;
        }).filter(name => !currentArtists.some(a => normalizeArtistId(a.name) === normalizeArtistId(name)));

        const newBatch = artistsToAdd.map(name => ({ name, enabled: true }));
        currentArtists = [...currentArtists, ...newBatch];
        
        // Update state so UI reflects addition
        setSelectedSeedArtists(currentArtists);
        setSearchTerm('');
        if (!onboardingProgress.step1) updateOnboarding('step1');
      }
    }

    const enabledArtists = currentArtists.filter(a => a.enabled).map(a => a.name);
    if (enabledArtists.length === 0 || isOverLimit) return;
    
    const newSeed = enabledArtists.join('::');
    
    if (!isFirstGeneration) {
      setPendingUpdateSeed(newSeed);
      setConfirmOverwrite(false);
      setIsUpdateModalOpen(true);
      return;
    }

    onRegenerate(newSeed);
    
    if (isSmallScreen) { setActiveTab('spiderweb'); setIsLeftPanelCollapsed(true); } else setIsLeftPanelCollapsed(true);
    if (!onboardingProgress.step2) updateOnboarding('step2');
  };
  
  const handleAddFromSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const newArtists = searchTerm.split(';').map(a => a.trim()).filter(Boolean);
    if (newArtists.length > 0) {
      const uniqueNew = newArtists.filter(name => !selectedSeedArtists.some(s => normalizeArtistId(s.name) === normalizeArtistId(name)));
      if (selectedSeedArtists.length + uniqueNew.length > MAX_SEED_ARTISTS) { setShowLimitDialog(true); return; }
      setSelectedSeedArtists(prev => {
        const existingNorms = new Set(prev.map(a => normalizeArtistId(a.name)));
        const artistsToAdd = newArtists.map(artistName => {
            const libraryMatch = libraryArtists.find(a => normalizeArtistId(a.name) === normalizeArtistId(artistName));
            return libraryMatch ? libraryMatch.name : artistName;
          }).filter(name => !existingNorms.has(normalizeArtistId(name)));
        return [...prev, ...artistsToAdd.map(name => ({ name, enabled: true }))];
      });
      setSearchTerm('');
      if (!onboardingProgress.step1) updateOnboarding('step1');
    }
  };

  const handleRemoveArtist = (artistToRemove: string) => {
    if (selectedNode && selectedNode.id === artistToRemove) onNodeClick(null);
    setSelectedSeedArtists(prev => prev.filter(a => a.name !== artistToRemove));
  };
  
  const handleLibraryArtistToggle = (artistName: string) => {
    const normName = normalizeArtistId(artistName);
    const isAlreadySelected = selectedSeedArtists.some(a => normalizeArtistId(a.name) === normName);
    if (!isAlreadySelected && selectedSeedArtists.length >= MAX_SEED_ARTISTS) { setShowLimitDialog(true); return; }
    setSelectedSeedArtists(prev => {
        const isSelected = prev.some(a => normalizeArtistId(a.name) === normName);
        if (isSelected) return prev.filter(a => normalizeArtistId(a.name) !== normName);
        else return [...prev, { name: artistName, enabled: true }];
    });
    if (!onboardingProgress.step1) updateOnboarding('step1');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) { setIsExpectingUpload(true); onFileUpload(file); event.target.value = ''; }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingPanelRef.current) return;
    e.preventDefault();
    const dx = e.clientX - startXRef.current;
    if (resizingPanelRef.current === 'left') {
        const newWidth = startWidthRef.current + dx;
        const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, MAX_PANEL_WIDTH));
        setLeftPanelWidth(clampedWidth);
        leftPanelPreCollapseWidth.current = clampedWidth;
    } else {
        const newWidth = startWidthRef.current - dx;
        const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, MAX_PANEL_WIDTH));
        setRightPanelWidth(clampedWidth);
        rightPanelPreCollapseWidth.current = clampedWidth;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
      resizingPanelRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback((panel: 'left' | 'right') => (e: React.MouseEvent) => {
      e.stopPropagation();
      resizingPanelRef.current = panel;
      startXRef.current = e.clientX;
      startWidthRef.current = panel === 'left' ? leftPanelWidth : rightPanelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
  }, [leftPanelWidth, rightPanelWidth, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleToggleLeftPanel = useCallback(() => {
    const isOpening = isLeftPanelCollapsed;
    if (isOpening && !isDetailsPanelCollapsed) {
        const totalWidth = window.innerWidth;
        const potentialCenterWidth = totalWidth - leftPanelPreCollapseWidth.current - rightPanelPreCollapseWidth.current - (16 * 3);
        if (potentialCenterWidth < MIN_GRAPH_WIDTH) setIsDetailsPanelCollapsed(true);
    }
    setIsLeftPanelCollapsed(prev => !prev);
  }, [isLeftPanelCollapsed, isDetailsPanelCollapsed]);

  const selectFirstUnread = useCallback(() => {
    if (isGuest) return;
    const firstUnread = activeNodes.find(n => !readNodeIds.has(n.id.trim().toLowerCase()));
    if (firstUnread) onNodeClick(firstUnread);
  }, [activeNodes, readNodeIds, onNodeClick, isGuest]);
  
  const toggleDetailsPanel = useCallback(() => {
    const isOpening = isDetailsPanelCollapsed;
    if (isOpening) {
        if (!onboardingProgress.step5) updateOnboarding('step5');
        if (!isLeftPanelCollapsed) {
            const totalWidth = window.innerWidth;
            const wouldBeCramped = (totalWidth - leftPanelWidth - rightPanelPreCollapseWidth.current - (16 * 3)) < MIN_GRAPH_WIDTH;
            if (wouldBeCramped) setIsLeftPanelCollapsed(true);
        }
        const isCurrentRead = selectedNode && readNodeIds.has(selectedNode.id.trim().toLowerCase());
        if (!selectedNode || isCurrentRead) selectFirstUnread();
    }
    setIsDetailsPanelCollapsed(prev => !prev);
  }, [isDetailsPanelCollapsed, isLeftPanelCollapsed, leftPanelWidth, onboardingProgress.step5, selectedNode, readNodeIds, selectFirstUnread]);

  const handleViewFromStack = useCallback((id: string) => {
    const node = data.nodes.find(n => n.id.toLowerCase() === id.toLowerCase());
    if (node) {
        onNodeClick(node);
        if (isSmallScreen) setActiveTab('details');
        else if (isDetailsPanelCollapsed) toggleDetailsPanel();
    } else {
        onShowToast(`"${id}" is not in your current map`);
    }
  }, [data.nodes, onNodeClick, isSmallScreen, isDetailsPanelCollapsed, toggleDetailsPanel, onShowToast]);

  const ConfirmDeleteModal = () => (
    <ModalBackdrop className="z-[110]" onClick={() => setShowConfirmDelete(false)}>
      <ModalContainer className="text-left">
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400 !text-[18px]">delete</span>
            <h3 className="text-base font-medium text-white">Clear Library</h3>
          </div>
          <button 
            onClick={() => setShowConfirmDelete(false)} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="p-5 space-y-4 text-sm text-zinc-400">
          <p className="leading-relaxed">
            Are you sure? This action cannot be undone and will remove all imported artists.
          </p>
        </div>

        <ModalFooter>
          <button 
            onClick={() => setShowConfirmDelete(false)} 
            className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onClearLibrary();
              setSelectedSeedArtists([]);
              setShowConfirmDelete(false);
              setIsLibraryDialogOpen(false);
            }} 
            className="px-4 py-1.5 bg-red-500 text-white rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
          >
            Clear
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );

  const enabledArtistsCount = selectedSeedArtists.filter(a => a.enabled).length;

  const loadingSubtext = isHydrating 
    ? "Hydrating curatorial dataset..." 
    : "Mapping your Zcene connections... This usually takes a minute or two to find the best musical paths.";

  const totalPendingCount = useMemo(() => {
    if (!searchTerm.trim()) return enabledArtistsCount;
    const newArtists = searchTerm.split(',').map(a => a.trim()).filter(Boolean);
    const uniqueNewCount = newArtists.filter(name => !selectedSeedArtists.some(s => normalizeArtistId(s.name) === normalizeArtistId(name))).length;
    return enabledArtistsCount + uniqueNewCount;
  }, [searchTerm, enabledArtistsCount, selectedSeedArtists]);

  const createButtonLabel = useMemo(() => {
    const hasSearch = searchTerm.trim().length > 0;
    if (hasSearch) {
        return isFirstGeneration ? 'Add & Create Zcene' : 'Add & Update Zcene';
    }
    return isFirstGeneration ? 'Create Zcene' : 'Update Zcene';
  }, [searchTerm, isFirstGeneration]);

  const ArtistsPanelContent = (
    <div className="flex flex-col flex-1 bg-zinc-900 overflow-hidden relative">
        <div className="flex-grow overflow-y-auto" style={{ overscrollBehaviorY: 'contain', flexBasis: 0 }}>
            <div className="px-4 pt-4 pb-2">
            {!isGuest && (
              <div className="mb-3">
                {libraryArtists.length > 0 ? (
                    <button onClick={() => { setIsLibraryDialogOpen(true); if (!onboardingProgress.step1) updateOnboarding('step1'); }} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium leading-none">
                      <span className="material-symbols-outlined !text-[16px]">library_music</span>
                      Select from Library ({libraryArtists.length})
                    </button>
                ) : (
                    <button onClick={() => { fileInputRef.current?.click(); if (!onboardingProgress.step1) updateOnboarding('step1'); }} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all text-xs font-medium leading-none">
                      <span className="material-symbols-outlined !text-[16px]">upload</span>
                      Import Music Library
                    </button>
                )}
              </div>
            )}
            {!isGuest && (
              <form onSubmit={handleAddFromSearch} className="relative">
                  <input ref={artistInputRef} onFocus={() => { if (!onboardingProgress.step1) updateOnboarding('step1'); }} type="search" placeholder="Add artist" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 pl-4 pr-12 text-sm font-normal text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all" />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {!searchTerm && (
                          <button type="button" onClick={() => handleSpeechToText('artists')} className={`w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl transition-colors leading-none ${isListeningForArtists ? 'text-primary animate-pulse' : 'text-zinc-400 hover:text-white'}`} title="Search by voice">
                            <MicIcon className="!text-[18px]" />
                          </button>
                      )}
                      {searchTerm && (
                          <button type="button" onClick={() => setSearchTerm('')} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors leading-none" aria-label="Clear search">
                              <span className="material-symbols-outlined !text-[18px]">close</span>
                          </button>
                      )}
                      <button type="submit" disabled={!searchTerm.trim()} className={`flex items-center justify-center rounded-xl w-7 h-7 flex-shrink-0 transition-all duration-300 disabled:cursor-not-allowed leading-none ${!searchTerm.trim() ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-brand-black hover:scale-110 active:scale-95'}`} aria-label="Add artists">
                          <span className="material-symbols-outlined !text-lg">add</span>
                      </button>
                  </div>
              </form>
            )}
          </div>
          {selectedSeedArtists.length > 0 && (
            <div className="px-4 pt-2 pb-4">
                <h3 className="text-[10px] font-medium mb-2 uppercase tracking-widest text-zinc-500">Seed Artists</h3>
              <div className="space-y-1">
                {selectedSeedArtists.map(artist => (
                  <div key={artist.name} className="flex items-center gap-1 group">
                    <button 
                      onClick={() => handleToggleArtist(artist.name)}
                      className={`flex items-center gap-3 flex-grow overflow-hidden text-left p-2 rounded-xl backdrop-blur-sm transition-all ${
                        artist.enabled ? 'bg-zinc-700/60 text-white' : 'bg-zinc-800/20 text-zinc-500'
                      }`}
                    >
                      <span className={`material-symbols-outlined !text-[18px] transition-colors ${artist.enabled ? 'text-primary' : 'text-zinc-600'}`}>
                        {artist.enabled ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span className="text-sm select-none truncate">{cleanArtistDisplayName(artist.name, data?.nodes)}</span>
                    </button>
                    <button onClick={() => handleRemoveArtist(artist.name)} className="flex-shrink-0 text-zinc-500 w-8 h-8 flex items-center justify-center rounded-xl hover:text-red-400 transition-colors leading-none" title={`Remove ${cleanArtistDisplayName(artist.name, data?.nodes)}`}><span className="material-symbols-outlined !text-[18px]">remove_circle</span></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DiscoveryFiltersPanel 
            filters={discoveryFilters} 
            onUpdate={onUpdateDiscoveryFilters} 
            isGuest={isGuest}
            onAuthRequest={() => { user ? onSaveToDashboard?.() : onLogin(); }}
            userTaste={profile?.taste}
          />

          {/* New Inline Action Button: Moving from absolute footer to inline flow */}
          <div className="px-4 pt-4 pb-12">


            {!isGuest ? (
              <button 
                  ref={createZceneBtnRef} 
                  onClick={handleApplyChanges} 
                  disabled={!isArtistPending || isLoading || isOverLimit} 
                  className={`w-full flex items-center justify-center gap-2 bg-white px-6 py-2 text-sm rounded-xl font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${visibleTooltips.step2 ? 'animate-pulse' : ''}`}
              >
                  <span>{createButtonLabel}</span>
                  <span className={`h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all duration-500 bg-transparent border-brand-black text-brand-black`}>
                      {totalPendingCount}
                  </span>
              </button>
            ) : (
              <div className="flex flex-col gap-4 p-5 bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-sm shadow-none rounded-none">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#f97316] animate-pulse-orange" />
                  <p className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-bold">
                    {user ? 'Shared Access' : 'Guest Mode'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-100 font-medium mb-1">Previewing Project</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {user 
                      ? 'You are viewing a shared Zcene. You can save a copy to your own dashboard to start editing.' 
                      : 'You are viewing a shared Zcene. Creating and editing is restricted to your own projects.'}
                  </p>
                </div>
                
                <div className="pt-2 flex flex-col gap-2">
                  {user ? (
                    <button 
                      onClick={onSaveToDashboard}
                      className="w-full flex items-center justify-center gap-2 bg-white px-6 py-2 text-sm rounded-xl font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                      Save to my Zcenes
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={onSaveToDashboard}
                        className="w-full flex items-center justify-center gap-2 bg-white px-6 py-2 text-sm rounded-xl font-medium text-brand-black transition-all duration-500 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                          <polyline points="10 17 15 12 10 7" />
                          <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                        Sign in to save
                      </button>
                      <p className="text-[10px] text-zinc-600 text-center px-2 leading-relaxed">
                        Create an account and we will save this to your Zcene project dashboard, where you can access and edit it anytime.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );

  const tabIndex = useMemo(() => {
    if (activeTab === 'artists') return 0;
    if (activeTab === 'spiderweb') return 1;
    return 2;
  }, [activeTab]);

  const legendConfig: Record<FilterKeys, { label: string; shape: React.ReactNode }> = {
    seed: { label: 'Seed Artist', shape: <LegendSymbol symbol={d3.symbolCircle} size={400} style={{ color: nodeTypeColorMap.seed }} className="stroke-1 fill-zinc-700"/> },
    recommended: { label: 'AI Artist', shape: <LegendSymbol symbol={d3.symbolStar} size={400} style={{ color: nodeTypeColorMap.ai }} className="-mt-0.5"/> },
    founded: { label: 'Founded', shape: <LegendSymbol symbol={d3.symbolCross} size={320} style={{ color: nodeTypeColorMap.founded }} /> },
    label: { label: 'Label', shape: <LegendSymbol symbol={d3.symbolDiamond} size={320} style={{ color: nodeTypeColorMap.label }} /> },
    genre: { label: 'Genre', shape: <LegendSymbol symbol={d3.symbolSquare} size={260} style={{ color: nodeTypeColorMap.genre }} /> },
    country: { label: 'Origin', shape: <LegendSymbol symbol={d3.symbolTriangle} size={260} style={{ color: nodeTypeColorMap.country }} /> },
  };
  const legendOrder: FilterKeys[] = ['seed', 'recommended', 'label', 'genre', 'country', 'founded'];
  const toggleFilterInternal = (filter: FilterKeys) => {
    setActiveFilters(prev => { const newState = !prev[filter]; analyticsService.track('Filter Toggled', { filter, is_active: newState }); return { ...prev, [filter]: newState }; });
    if (!onboardingProgress.step3) updateOnboarding('step3');
  };

  const displayBadgeCount = systemError ? 0 : activeNodes.length;

  return (
    <div 
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
            backgroundImage: 'linear-gradient(rgba(17, 17, 19, 0.8), rgba(17, 17, 19, 0.8)), url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }}
    >
        <OnboardingTooltip isVisible={visibleTooltips.step1} content="Add your seed artists to start your Zcene. These are your starting points, you can type them or select from your library." position="bottom" anchorRef={artistInputRef} onDismiss={() => updateOnboarding('step1')} />
        <OnboardingTooltip isVisible={visibleTooltips.step2} content="Click here to create your Zcene from your selected artists and see the connections visually." position="top" anchorRef={createZceneBtnRef} onDismiss={() => updateOnboarding('step2')} />
        <OnboardingTooltip isVisible={visibleTooltips.step3} content="Drag, zoom and toggle node types to focus on what matters most: Seed Artists, AI Artists, Genres, Labels, Origins, Founded." position={isSmallScreen ? "top" : "bottom"} anchorRef={isSmallScreen ? mobileLegendAreaRef : desktopLegendAreaRef} onDismiss={() => updateOnboarding('step3')} />
        <OnboardingTooltip isVisible={visibleTooltips.step5} content="This is the Deep Cut, explore bios, connections, and insights." position={isSmallScreen ? "bottom" : "left"} anchorRef={isSmallScreen ? deepCutTabRef : detailsCollapseBtnRef} onDismiss={() => updateOnboarding('step5')} />

        <input type="file" accept=".csv,.txt,.xml" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        <LibraryDialog isOpen={isLibraryDialogOpen} onClose={() => setIsLibraryDialogOpen(false)} libraryArtists={libraryArtists} selectedArtists={selectedSeedArtists} onArtistToggle={handleLibraryArtistToggle} uniqueGenres={uniqueGenres} artistGenreMap={artistGenreMap} fileInputRef={fileInputRef} onTriggerClear={() => setShowConfirmDelete(true)} />
        <LimitReachedDialog isOpen={showLimitDialog} onClose={() => setShowLimitDialog(false)} />
        <UpdateInterceptModal 
            isOpen={isUpdateModalOpen}
            onClose={() => setIsUpdateModalOpen(false)}
            confirmOverwrite={confirmOverwrite}
            setConfirmOverwrite={setConfirmOverwrite}
            onOverwrite={() => {
                setIsUpdateModalOpen(false);
                onRegenerate(pendingUpdateSeed);
                if (isSmallScreen) { setActiveTab('spiderweb'); setIsLeftPanelCollapsed(true); } else setIsLeftPanelCollapsed(true);
                if (!onboardingProgress.step2) updateOnboarding('step2');
            }}
            onSaveAsNew={() => {
                setIsUpdateModalOpen(false);
                if (onFork) onFork(pendingUpdateSeed);
                if (isSmallScreen) { setActiveTab('spiderweb'); setIsLeftPanelCollapsed(true); } else setIsLeftPanelCollapsed(true);
                if (!onboardingProgress.step2) updateOnboarding('step2');
            }}
        />
        {showConfirmDelete && <ConfirmDeleteModal />}
        
        <Header
            user={user}
            onLogoClick={onLogoClick}
            view="graph"
            projectName={projectName}
            onProjectNameChange={onProjectNameChange}
            isSmallScreen={isSmallScreen}
            isMagazineViewOpen={isMagazineViewOpen}
            stackCount={stack.length}
            isStackNew={isStackNew}
            onOpenStack={() => { setIsStackDialogOpen(true); if (stack.length !== lastViewedStackCount) onUpdateLastViewedStackCount(stack.length); }}
            onShare={handleShareZcene}
            isSharing={isSharing || isSharingZcene}
            isCopied={isCopied}
            onNavigate={onNavigate}
            onLogout={onLogout}
            onDeleteAccount={() => onDeleteAccount?.()}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            isAdmin={isAdmin}
            isGuest={isGuest}
            onLogin={onLogin}
            userTaste={profile?.taste}
            onSaveTaste={async (taste) => {
              await onUpdateProfile({ taste });
            }}
            onRestartWalkthrough={handleRestartWalkthrough}
        />

        {isSmallScreen ? (
            <>
                <div className="flex-grow flex-shrink min-h-0 flex flex-col overflow-hidden relative">
                    <div className={`flex-shrink-0 ${LayoutSizes.headerBar} border-b border-zinc-700/50 bg-zinc-900 relative z-20 ${isMagazineViewOpen ? 'hidden' : ''}`}>
                        <nav className="flex h-full">
                            {(['artists', 'spiderweb', 'details'] as MobileTab[]).map(tab => {
                                const totalDetails = displayBadgeCount;
                                return (
                                    <button key={tab} ref={tab === 'details' ? deepCutTabRef : null} onClick={() => { setActiveTab(tab); if (tab === 'details') { if (!onboardingProgress.step5) updateOnboarding('step5'); /* Fix C: only auto-select when nothing is selected; preserve explicit user tap */ if (!selectedNode) selectFirstUnread(); } }} className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'text-primary border-primary' : 'text-zinc-400 border-transparent hover:text-white active:text-white'}`}>
                                        <span className="uppercase tracking-widest">{tab === 'details' ? 'Deep Cut' : tab}</span>
                                        {tab === 'artists' && (
                                            <span className={`h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border shadow-sm transition-all duration-500 ${artistIndicatorStyles}`}>
                                                {enabledArtistsCount}
                                            </span>
                                        )}
                                        {tab === 'details' && (
                                            <span className={`h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border shadow-sm transition-all duration-500 ${unreadDetailsCount > 0 ? 'bg-zinc-900 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                                {totalDetails}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                    <div ref={mobileTabContainerRef} className="flex-grow overflow-hidden relative z-10 min-h-0" style={{ overscrollBehaviorY: 'contain' }}>
                        <div className="flex h-full transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${tabIndex * 100}%)` }}>
                            <div className="w-full flex-shrink-0 flex flex-col min-h-0 overflow-hidden relative">{ArtistsPanelContent}</div>
                            <div className="w-full flex-shrink-0 flex flex-col min-h-0 overflow-hidden relative">
                                <div className="h-full flex flex-col overflow-hidden">

                                    <div className="flex-grow relative min-h-0 bg-zinc-900" ref={mobileGraphAreaRef}>{(isLoading || isHydrating) && (<div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md z-[90] flex flex-col items-center justify-center gap-4 pointer-events-auto"><LoadingSpinner subtext={loadingSubtext} /></div>)}{isFirstGeneration && !(isLoading || isHydrating) && (<div className="absolute inset-0 z-10 flex items-center justify-center text-center p-8 pointer-events-none"><ZceneEmptyState onNavigate={onNavigate} /></div>)}{data.nodes.length > 0 && (<MusicGraph data={data} libraryArtists={memoizedLibraryArtists} seedArtists={memoizedSeedArtists} onNodeClick={handleNodeClickInternal} selectedNode={selectedNode} peekedNode={peekedNode} isSmallScreen={isSmallScreen} activeFilters={activeFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} toggleFilter={toggleFilterInternal} legendConfig={legendConfig} legendOrder={legendOrder} legendRef={desktopLegendAreaRef} onInteraction={() => { if (!onboardingProgress.step3) updateOnboarding('step3'); }} onLegendInteraction={() => { if (!onboardingProgress.step3) updateOnboarding('step3'); }} isGuest={isGuest} detailsCache={detailsCache} isActive={isActive} />)}</div>
                                </div>
                            </div>
                            <div className={`w-full flex-shrink-0 h-full flex flex-col min-h-0 overflow-hidden relative ${isMagazineViewOpen ? 'fixed inset-0 z-[1000] pt-0 md:pt-4' : ''}`}>
                                <div className="h-full flex flex-col overflow-hidden bg-zinc-900" style={{ overscrollBehaviorY: 'contain' }}>
                                    <DetailsPanel 
                                        projectName={projectName}
                                        selectedNode={selectedNode} 
                                        activeNodes={activeNodes} 
                                        isAdmin={isAdmin}
                                        detailsCache={detailsCache} onUpdateDetailsCache={onUpdateDetailsCache}
                                        loadingNodeIds={loadingNodeIds} 
                                        onCloseNode={onCloseNode} 
                                        onRefreshNode={onRefreshNode} 
                                        onExtendNode={onExtendNode} 
                                        error={detailsError} 
                                        systemError={systemError}
                                        graphData={data} 
                                        libraryArtists={memoizedLibraryArtists} 
                                        seedArtists={memoizedAllSeedArtists}
                                        onAddArtist={(artist) => {
                                            const normalizedArtist = normalizeArtistId(artist);
                                            const isAlreadySeed = selectedSeedArtists.some(s => normalizeArtistId(s.name) === normalizedArtist);
                                            if (isAlreadySeed) {
                                                setSelectedSeedArtists(prev => prev.filter(s => normalizeArtistId(s.name) !== normalizedArtist));

                                            } else {
                                                setSelectedSeedArtists(prev => [...prev, { name: artist, enabled: true }]);

                                            }
                                        }}
                                        isCollapsed={false} 
                                        onToggleCollapse={() => {}} 
                                        isSmallScreen={isSmallScreen} 
                                        onNodeClick={handleNodeClickInternal} 
                                        onNavigate={onNavigate} 
                                        isGlobalLoading={isLoading} 
                                        onCancelGlobalLoading={onCancelGeneration} 
                                        unreadCount={unreadDetailsCount} 
                                        isMagazineViewOpen={isMagazineViewOpen} 
                                        onMagazineViewToggle={onUpdateIsMagazineViewOpen} 
                                        chatHistories={chatHistories} 
                                        onUpdateChatHistories={onUpdateChatHistories} 
                                        isActive={isActive} 
                                        stack={stack} 
                                        onToggleStack={onToggleStack} 
                                        isGuest={isGuest}
                                        user={user}
                                        onAuthRequest={() => { user ? onSaveToDashboard?.() : onLogin(); }}
                                        userTaste={profile?.taste}
                                        onUpdateTasteProfile={async (taste) => { await onUpdateProfile({ taste }); }}
                                        onShowToast={onShowToast}
                                        onOpenTasteModal={() => window.dispatchEvent(new CustomEvent('open-taste-modal'))}
                                        onStashArtist={(artistName) => {
                                            const normalizedId = normalizeArtistId(artistName);
                                            const isAlreadyInStack = stack.some(item => item.id === normalizedId);
                                            if (!isAlreadyInStack) {
                                                const nodeToAdd = { id: normalizedId, type: 'artist' as const, label: titleCaseArtistId(artistName), group: 0 };
                                                onToggleStack(nodeToAdd);
                                            }
                                            setIsStackDialogOpen(true);
                                        }}
                                        onOpenStackDrawer={() => setIsStackDialogOpen(true)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {!isMagazineViewOpen && (
                    <div className="flex-shrink-0 border-t border-zinc-700/50 bg-zinc-900 py-0 px-2 text-center relative z-50">
                        <div className="text-zinc-500 text-[10px] sm:text-xs">
                            <div 
                                className="mx-auto flex justify-center items-center cursor-pointer" 
                                style={{ minHeight: '50px' }}
                                onClickCapture={(e) => {
                                    e.preventDefault();
                                    onNavigate(View.Home);
                                    setTimeout(() => {
                                        const supportEl = document.getElementById('support');
                                        if (supportEl) {
                                            supportEl.scrollIntoView({ behavior: 'smooth' });
                                        }
                                    }, 100);
                                }}
                            >
                                <AdSenseUnit 
                                    adClient="ca-pub-9665950244000141" 
                                    adSlot="3666473373" 
                                    style={{ display: 'inline-block', width: '320px', height: '50px' }} 
                                    customImageUrl="https://storage.googleapis.com/zcene-prod-assets/Zcene%20App%20Mobile%20(slim).png"
                                    linkUrl="#/merch"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </>
        ) : (
            <main className={`flex-grow flex flex-row relative min-h-0 gap-4 ${isSmallScreen ? 'px-4' : 'px-6 lg:px-8'} pb-6`}>
                <aside style={{ width: `${leftPanelWidth}px` }} className={`relative h-full z-50 flex flex-col flex-shrink-0 bg-zinc-900 border border-zinc-600/50 transition-all duration-300 ease-in-out overflow-hidden min-h-0 ${isMagazineViewOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {!isLeftPanelCollapsed && (<div onMouseDown={handleMouseDown('left')} className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none touch-none z-10 group" aria-label="Resize left panel" role="separator"><div className="w-full h-full bg-transparent group-hover:bg-primary/20 transition-colors"></div></div>)}
                    <div className={`${LayoutSizes.headerBar} flex-shrink-0 border-b border-zinc-600/50 flex items-center relative z-[60] ${isLeftPanelCollapsed ? 'justify-center px-1' : 'justify-between px-4'}`}>{!isLeftPanelCollapsed && (<div className="flex items-center gap-2 overflow-hidden"><h2 className="text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Artists</h2><span className={`h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all duration-500 shadow-sm ${artistIndicatorStyles}`}>{enabledArtistsCount}</span></div>)}<button onClick={handleToggleLeftPanel} className="relative z-[70] w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none pointer-events-auto" title={isLeftPanelCollapsed ? "Expand Panel" : "Collapse Panel"}><span className="material-symbols-outlined !text-[18px]">{isLeftPanelCollapsed ? 'left_panel_open' : 'left_panel_close'}</span></button></div>
                    {isLeftPanelCollapsed ? (<div className="flex-grow flex-col items-center justify-between py-6 text-zinc-400"><div className="flex flex-col items-center gap-y-6">{ libraryArtists.length > 0 ? (<button onClick={() => { setIsLibraryDialogOpen(true); if (!onboardingProgress.step1) updateOnboarding('step1'); }} title="Select from Library" className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"><span className="material-symbols-outlined !text-[18px]">library_music</span></button>) : (<button onClick={() => { fileInputRef.current?.click(); if (!onboardingProgress.step1) updateOnboarding('step1'); }} title="Import Music Library" className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"><span className="material-symbols-outlined !text-[18px]">upload</span></button>)}</div><div className="absolute bottom-6 left-1/2 -translate-x-1/2"><button onClick={handleApplyChanges} disabled={!isArtistPending || isLoading || isOverLimit} className="group" title="Update Zcene"><span className={`h-8 w-8 rounded-md flex items-center justify-center text-sm font-bold border-2 transition-all duration-500 ${artistIndicatorStyles} ${enabledArtistsCount === 0 ? 'opacity-100' : 'group-active:scale-95'}`}>{enabledArtistsCount}</span></button></div></div>) : ( <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">{ArtistsPanelContent}</div> )}
                </aside>

                <div ref={centerColumnRef} className={`flex-1 min-w-0 flex flex-col gap-4 relative z-10 transition-opacity duration-300 ${isMagazineViewOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <div className="flex-1 relative min-h-0 flex flex-col bg-zinc-900 border border-zinc-600/50 overflow-hidden">
                        <div className={`${LayoutSizes.headerBar} px-4 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between overflow-hidden`}><h2 className="text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Spiderweb</h2></div>
                        <div className="flex-grow relative min-h-0" ref={desktopGraphAreaRef}>{(isLoading || isHydrating) && (<div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md z-[90] flex flex-col items-center justify-center gap-4 pointer-events-auto"><LoadingSpinner subtext={loadingSubtext} /></div>)}{isFirstGeneration && !(isLoading || isHydrating) && (<div className="absolute inset-0 z-10 flex items-center justify-center text-center p-8 pointer-events-none"><ZceneEmptyState onNavigate={onNavigate} /></div>)}{data.nodes.length > 0 && (<MusicGraph data={data} libraryArtists={memoizedLibraryArtists} seedArtists={memoizedSeedArtists} onNodeClick={handleNodeClickInternal} selectedNode={selectedNode} peekedNode={peekedNode} isSmallScreen={isSmallScreen} activeFilters={activeFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} toggleFilter={toggleFilterInternal} legendConfig={legendConfig} legendOrder={legendOrder} legendRef={desktopLegendAreaRef} onInteraction={() => { if (!onboardingProgress.step3) updateOnboarding('step3'); }} onLegendInteraction={() => { if (!onboardingProgress.step3) updateOnboarding('step3'); }} isGuest={isGuest} detailsCache={detailsCache} isActive={isActive} />)}</div>
                    </div>
                    <div key={`ad-container-${adSize}`} className="flex-shrink-0 bg-zinc-900 border border-zinc-600/50 px-2 py-0 flex justify-center items-center overflow-hidden">
                        <div className="text-zinc-500 text-[10px] text-center max-w-full">
                            {adSize === 'small' ? (
                                <div 
                                    className="mx-auto flex justify-center items-center cursor-pointer" 
                                    style={{ minHeight: '50px', width: '320px' }}
                                    onClickCapture={(e) => {
                                        e.preventDefault();
                                        onNavigate(View.Home);
                                        setTimeout(() => {
                                            const supportEl = document.getElementById('support');
                                            if (supportEl) {
                                                supportEl.scrollIntoView({ behavior: 'smooth' });
                                            }
                                        }, 100);
                                    }}
                                >
                                    <AdSenseUnit 
                                        adClient="ca-pub-9665950244000141" 
                                        adSlot="3666473373" 
                                        style={{ display: 'inline-block', width: '320px', height: '50px' }} 
                                        customImageUrl="https://storage.googleapis.com/zcene-prod-assets/Zcene%20App%20Mobile%20(slim).png"
                                        linkUrl="#/merch"
                                    />
                                </div>
                            ) : (
                                <div 
                                    className="mx-auto flex justify-center items-center cursor-pointer" 
                                    style={{ minHeight: '90px', width: '728px', maxWidth: '100%' }}
                                    onClickCapture={(e) => {
                                        e.preventDefault();
                                        onNavigate(View.Home);
                                        setTimeout(() => {
                                            const supportEl = document.getElementById('support');
                                            if (supportEl) {
                                                supportEl.scrollIntoView({ behavior: 'smooth' });
                                            }
                                        }, 100);
                                    }}
                                >
                                    <AdSenseUnit 
                                        adClient="ca-pub-9665950244000141" 
                                        adSlot="3666473373" 
                                        style={{ display: 'inline-block', width: '728px', height: '90px' }} 
                                        customImageUrl="https://storage.googleapis.com/zcene-prod-assets/Zcene%20App%20Desktop.png"
                                        linkUrl="#/merch"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <aside style={isMagazineViewOpen ? {} : { width: `${rightPanelWidth}px` }} className={`z-50 flex flex-col flex-shrink-0 outline-none transition-colors transition-[width] duration-300 ease-in-out ${isMagazineViewOpen ? '!fixed !inset-0 !top-0 !left-0 !m-0 !w-screen !h-screen !z-[1000] bg-zinc-900 border border-zinc-900' : 'relative h-full bg-zinc-900 border border-zinc-600/50 overflow-hidden'}`}>
                       {!isDetailsPanelCollapsed && !isMagazineViewOpen && (
                         <div onMouseDown={handleMouseDown('right')} className="absolute top-0 left-0 h-full w-2 cursor-col-resize select-none touch-none z-10 group" aria-label="Resize right panel" role="separator">
                           <div className="w-full h-full bg-transparent group-hover:bg-primary/20 transition-colors"></div>
                         </div>
                       )}
                       <DetailsPanel 
                         projectName={projectName}
                         selectedNode={selectedNode} 
                         activeNodes={activeNodes} 
                         isAdmin={isAdmin}
                         detailsCache={detailsCache} onUpdateDetailsCache={onUpdateDetailsCache}
                         loadingNodeIds={loadingNodeIds} 
                         onCloseNode={nodeId => onCloseNode(nodeId)} 
                         onRefreshNode={nodeId => onRefreshNode(nodeId)} 
                         onExtendNode={onExtendNode} 
                         error={detailsError} 
                         systemError={systemError}
                         graphData={data} 
                         libraryArtists={memoizedLibraryArtists} 
                         seedArtists={memoizedAllSeedArtists} 
                         onAddArtist={(artist) => {
                              const normalizedArtist = normalizeArtistId(artist);
                              const isAlreadySeed = selectedSeedArtists.some(s => normalizeArtistId(s.name) === normalizedArtist);
                              if (isAlreadySeed) {
                                  setSelectedSeedArtists(prev => prev.filter(s => normalizeArtistId(s.name) !== normalizedArtist));

                              } else {
                                  setSelectedSeedArtists(prev => [...prev, { name: artist, enabled: true }]);

                              }
                         }} 
                         isCollapsed={isDetailsPanelCollapsed} 
                         onToggleCollapse={toggleDetailsPanel}
                         isSmallScreen={isSmallScreen} 
                         onNodeClick={handleNodeClickInternal} 
                         onNavigate={onNavigate} 
                         isGlobalLoading={isLoading} 
                         onCancelGlobalLoading={onCancelGeneration} 
                         unreadCount={systemError ? 0 : unreadDetailsCount} 
                         collapseBtnRef={detailsCollapseBtnRef} 
                         isMagazineViewOpen={isMagazineViewOpen} 
                         onMagazineViewToggle={onUpdateIsMagazineViewOpen} 
                         chatHistories={chatHistories} 
                         onUpdateChatHistories={onUpdateChatHistories} 
                         isActive={isActive} 
                         stack={stack} 
                         onToggleStack={onToggleStack} 
                         isGuest={isGuest}
                         user={user}
                         onAuthRequest={() => { user ? onSaveToDashboard?.() : onLogin(); }}
                         userTaste={profile?.taste}
                         onUpdateTasteProfile={async (taste) => { await onUpdateProfile({ taste }); }}
                         onShowToast={onShowToast}
                         onOpenTasteModal={() => window.dispatchEvent(new CustomEvent('open-taste-modal'))}
                         onStashArtist={(artistName) => {
                              const normalizedId = normalizeArtistId(artistName);
                              const isAlreadyInStack = stack.some(item => item.id === normalizedId);
                              if (!isAlreadyInStack) {
                                  const nodeToAdd = { id: normalizedId, type: 'artist' as const, label: titleCaseArtistId(artistName), group: 0 };
                                  onToggleStack(nodeToAdd);
                              }
                              setIsStackDialogOpen(true);
                         }}
                         onOpenStackDrawer={() => setIsStackDialogOpen(true)}
                       />
                </aside>
            </main>
        )}
        <DisambiguationModal
          isOpen={!!disambiguationDialog}
          query={disambiguationDialog?.query || ''}
          candidates={disambiguationDialog?.candidates || []}
          isLiveAISuggestions={disambiguationDialog?.isLiveAISuggestions}
          showBack={disambiguationDialog?.showBack}
          onSelect={onSelectDisambiguation}
        />
    </div>
  );
};

export default GraphPage;
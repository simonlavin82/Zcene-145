import { ModalFooter, ModalContainer, ModalBackdrop, ModalHeader, ModalBody } from './ui/Dialog';
import { Input } from './DesignSystem';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  StackItem, Node, UserTaste, DisambiguationCandidateStub, 
  ERA_MIN_BOUND, ERA_MAX_BOUND, 
  CANONICAL_COUNTRIES_22, CANONICAL_GENRE_TAXONOMY, CANONICAL_GENRES_FLAT,
  CANONICAL_STYLE_TAXONOMY, CANONICAL_STYLES_FLAT 
} from '../types';
import { StackIcon, VisibilityIcon, VisibilityOffIcon } from './Icons';
import Markdown from 'react-markdown';
import { isNodeInSeedList, cleanArtistDisplayName, cleanLabelDisplayName, normalizeLabelId } from '../services/artistCacheService';
import { sanitizeAnchorLabelInput } from '../services/cacheQualification';
import { Flame, Waypoints } from 'lucide-react';
import { formatSystemTimestamp } from '../utils/formatters';
import { db, functions } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  TOKEN_PRICING,
  TOP_UP_TIERS,
  TOP_UP_TIER_LIST,
  TokenTopUpTierId,
} from '../shared/tokenEconomy';

// --- My Stack Dialog Component ---
export const MyStackDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  stack: StackItem[];
  onRemove: (docId: string) => void;
  onView: (id: string | null) => void;
  onAddArtist: (artistName: string) => void;
  seedArtists: string[];
}> = ({ isOpen, onClose, stack, onRemove, onView, onAddArtist, seedArtists }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <ModalBackdrop onClick={onClose} className="z-[2000]">
        <ModalContainer>
            <ModalHeader>
                <div className="flex items-center gap-2">
                    <StackIcon className="text-primary !text-[18px]" />
                    <h3 className="text-lg font-medium text-white">My Stack ({stack.length})</h3>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none aspect-square">
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
            </ModalHeader>
            <ModalBody className="p-4 space-y-3">
                {stack.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                        <div className="w-16 h-16 rounded-none bg-zinc-800/50 flex items-center justify-center text-zinc-600">
                             <StackIcon className="!text-4xl" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-zinc-300 font-medium">Your stack is empty.</p>
                            <p className="text-zinc-500 text-sm">Save artists or labels from the Deep Cut cards to build your personal shortlist.</p>
                        </div>
                    </div>
                ) : (
                    [...stack].sort((a, b) => b.dateSaved - a.dateSaved).map(item => {
                        const nameToCopy = item.displayName || cleanArtistDisplayName(item.id);
                        const isCopied = copiedId === item.id;
                        
                        return (
                            <div key={item.docId || item.id} className="group flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 px-3 -mx-3 rounded-lg transition-colors">
                                <div 
                                    className="flex-grow min-w-0 cursor-pointer flex flex-col justify-center -translate-y-0.5"
                                    onClick={() => handleCopy(item.id, nameToCopy)}
                                    title="Click to copy name"
                                >
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[15px] font-medium text-white truncate leading-snug">{nameToCopy}</h4>
                                        {isCopied ? (
                                            <span className="material-symbols-outlined text-primary !text-[14px]">check_circle</span>
                                        ) : (
                                            <span className="material-symbols-outlined text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity !text-[14px]">content_copy</span>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-1.5 mt-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800/50 px-1 py-[2px] rounded-sm leading-none shrink-0 mt-[2px]">{item.type}</span>
                                        <span className="text-[11px] text-zinc-500 font-mono leading-normal break-words">
                                            {formatSystemTimestamp(item.dateSaved)}
                                            {item.discoveredVia && ` • via ${item.discoveredVia}`}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center flex-shrink-0 pl-4">
                                    <button 
                                        onClick={() => onRemove(item.docId || item.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        title="Remove from stack"
                                    >
                                        <span className="material-symbols-outlined !text-[16px]">delete</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </ModalBody>
            <ModalFooter>
                <button onClick={onClose} className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors">
                    Cancel
                </button>
                <button onClick={onClose} className="px-6 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90">
                    Done
                </button>
            </ModalFooter>
        </ModalContainer>
    </ModalBackdrop>
  );
};

import { AnimatePresence, motion } from 'framer-motion';


export const PROFILE_COLORS = [
  { name: 'purple', class: 'bg-[#a855f7]' },
  { name: 'teal', class: 'bg-[#2dd4bf]' },
  { name: 'sky', class: 'bg-[#38bdf8]' },
  { name: 'indigo', class: 'bg-[#6366f1]' },
  { name: 'pink', class: 'bg-[#ec4899]' },
  { name: 'orange', class: 'bg-[#f97316]' },
  { name: 'black', class: 'bg-[#18181b] border border-zinc-700' },
  { name: 'white', class: 'bg-[#f4f4f5]' }
];

export const MODAL_PROFILE_COLORS = PROFILE_COLORS.filter(c => c.name !== 'black' && c.name !== 'white');

export const STYLE_ERA_MAX = new Date().getFullYear();

const DEFAULT_POPULAR_LABELS = [
  '4AD', 'Atlantic', 'Blue Note', 'Century Media', 'Columbia', 'Deathwish Inc.',
  'Def Jam', 'Dischord', 'Domino', 'Elektra', 'Epitaph', 'Factory Records',
  'Fueled by Ramen', 'Geffen', 'Island', 'Jagjaguwar', 'Matador', 'Merge Records',
  'Motown', 'Mute', 'Nuclear Blast', 'Polydor', 'Rise Records', 'Rough Trade',
  'Sargent House', 'Sire', 'Sparrow', 'Sub Pop', 'Tooth & Nail', 'Virgin', 'Warp', 'XL Recordings'
];

export const MyTasteDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  taste?: UserTaste;
  onSave: (taste: UserTaste) => Promise<void>;
}> = ({ isOpen, onClose, taste, onSave }) => {
  const [profiles, setProfiles] = useState<UserTaste>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [cachedLabelNames, setCachedLabelNames] = useState<string[]>(DEFAULT_POPULAR_LABELS);
  const hasLoadedLabelsRef = useRef(false);

  const labelContainerRef = useRef<HTMLDivElement>(null);
  const genreContainerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);
  const originContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (labelContainerRef.current && !labelContainerRef.current.contains(e.target as globalThis.Node)) {
        setIsLabelOpen(false);
      }
      if (genreContainerRef.current && !genreContainerRef.current.contains(e.target as globalThis.Node)) {
        setIsGenreOpen(false);
      }
      if (styleContainerRef.current && !styleContainerRef.current.contains(e.target as globalThis.Node)) {
        setIsStyleOpen(false);
      }
      if (originContainerRef.current && !originContainerRef.current.contains(e.target as globalThis.Node)) {
        setIsOriginOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Firestore labels on open
  useEffect(() => {
    if (!isOpen || hasLoadedLabelsRef.current) return;
    hasLoadedLabelsRef.current = true;
    const fetchCachedLabels = async () => {
      try {
        const snap = await getDocs(collection(db, 'labels'));
        const names: string[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const rawName = d?.detailsCache?.name || d?.detailsCache?.details?.artist || d?.seedArtists || d?.labelId || d?.artistId || docSnap.id;
          if (rawName && typeof rawName === 'string') {
            const display = cleanLabelDisplayName(rawName);
            if (display) {
              names.push(display);
            }
          }
        });
        if (names.length > 0) {
          const byNorm = new Map<string, string>();
          [...DEFAULT_POPULAR_LABELS, ...names].forEach(l => {
            const display = cleanLabelDisplayName(l);
            if (display) {
              const norm = normalizeLabelId(display);
              if (norm && !byNorm.has(norm)) {
                byNorm.set(norm, display);
              }
            }
          });
          setCachedLabelNames(Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b)));
        }
      } catch (err) {
        // Non-fatal fallback to default popular labels
      }
    };
    fetchCachedLabels();
  }, [isOpen]);

  // Sync state if taste changes
  React.useEffect(() => {
    if (isOpen) {
      const initialProfiles = taste?.length ? JSON.parse(JSON.stringify(taste)) : [];
      setProfiles(initialProfiles);
      if (initialProfiles.length > 0) {
        setActiveTabId(initialProfiles[0].id);
      } else {
        setActiveTabId(null);
      }
    } else {
      setActiveTabId(null);
    }
  }, [isOpen, taste]);

  if (!isOpen) return null;

  const activeProfile = profiles.find(p => p.id === activeTabId) || null;
  const activeProfileIndex = profiles.findIndex(p => p.id === activeTabId);

  const updateProfile = (fieldOrUpdates: any, value?: any) => {
    setProfiles(prev => {
      const idx = prev.findIndex(p => p.id === activeTabId);
      if (idx === -1) return prev;
      const next = [...prev];
      if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
        next[idx] = { ...next[idx], ...fieldOrUpdates };
      } else {
        next[idx] = { ...next[idx], [fieldOrUpdates]: value };
      }
      return next;
    });
  };

  const handleAddProfile = () => {
    if (profiles.length >= 5) return;
    const newProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      name: `Profile ${profiles.length + 1}`,
      color: MODAL_PROFILE_COLORS[profiles.length % MODAL_PROFILE_COLORS.length].name,
      isActive: true,
      favoriteLabel: '',
      favoriteGenre: '',
      style: '',
      favoriteOrigin: '',
      eraMin: null,
      eraMax: null
    };
    setProfiles([...profiles, newProfile]);
    setActiveTabId(newProfile.id);
  };

  const handleDeleteProfile = () => {
    if (activeProfileIndex === -1) return;
    const newProfiles = profiles.filter(p => p.id !== activeTabId);
    setProfiles(newProfiles);
    if (newProfiles.length > 0) {
      setActiveTabId(newProfiles[0].id);
    } else {
      setActiveTabId(null);
    }
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      await onSave(profiles);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const getColorClass = (colorName: string) => {
    const colorObj = PROFILE_COLORS.find(c => c.name === colorName);
    return colorObj ? colorObj.class : 'bg-zinc-500';
  };

  return (
    <ModalBackdrop className="z-[2000]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-primary" />
            <h3 className="text-lg font-medium text-white">Style Profiles</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="bg-zinc-900/50 border-b border-zinc-800 px-3 py-2 flex flex-wrap items-center overflow-x-auto scrollbar-hide gap-1.5">
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveTabId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTabId === p.id 
                  ? `bg-zinc-800 text-white border border-zinc-600` 
                  : `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent`
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${getColorClass(p.color)} ${!p.isActive ? 'opacity-30' : ''}`} />
                {p.name}
                {profiles.length > 1 && activeTabId === p.id && (
                  <div 
                    onClick={(e) => { e.stopPropagation(); handleDeleteProfile(); }}
                    className="flex items-center justify-center rounded-full hover:bg-zinc-700/50 p-0.5 ml-1 transition-colors text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px]">close</span>
                  </div>
                )}
              </div>
            </button>
          ))}
          {profiles.length < 5 && (
            <button
              onClick={handleAddProfile}
              className="px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center border border-transparent"
            >
              <span className="material-symbols-outlined !text-[16px]">add</span>
            </button>
          )}
        </div>

        <div className="flex-grow overflow-y-auto p-5 space-y-5 h-[400px]">
          {!activeProfile ? (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              No profiles yet. Click + to create one.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Color Theme</label>
                  <div className="flex items-center gap-2">
                    {MODAL_PROFILE_COLORS.map(color => (
                      <button
                        key={color.name}
                        onClick={() => updateProfile('color', color.name)}
                        className={`w-4 h-4 rounded-full transition-transform ${color.class} ${activeProfile.color === color.name ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : 'hover:scale-110'}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Active</label>
                  <button 
                    onClick={() => updateProfile('isActive', !activeProfile.isActive)}
                    className="w-10 h-5 rounded-full relative transition-colors bg-zinc-800"
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${activeProfile.isActive ? 'translate-x-5 bg-primary' : 'bg-zinc-400'}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Profile Name</label>
                <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                  type="text" 
                  value={activeProfile.name}
                  onChange={(e) => updateProfile('name', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>
              
              <hr className="border-zinc-800" />

              <div className="space-y-1.5" ref={labelContainerRef}>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Label</label>
                <div className="relative">
                  <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                    type="text" 
                    placeholder="Search or add label (e.g. Sub Pop, 4AD, Atlantic)..."
                    value={activeProfile.favoriteLabel ?? ''}
                    onFocus={() => setIsLabelOpen(true)}
                    onChange={(e) => {
                      updateProfile('favoriteLabel', e.target.value);
                      setIsLabelOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const raw = activeProfile.favoriteLabel ?? '';
                        const sanitized = sanitizeAnchorLabelInput(raw);
                        const clean = cleanLabelDisplayName(sanitized) || sanitized;
                        if (clean) {
                          e.preventDefault();
                          updateProfile('favoriteLabel', clean);
                          setIsLabelOpen(false);
                        }
                      }
                    }}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                  />
                  {isLabelOpen && (() => {
                    const rawTyped = activeProfile.favoriteLabel ?? '';
                    const sanitizedTyped = sanitizeAnchorLabelInput(rawTyped);
                    const cleanedTyped = cleanLabelDisplayName(sanitizedTyped) || sanitizedTyped;
                    const filteredLabels = cachedLabelNames.filter(l => {
                      const lNorm = normalizeLabelId(l);
                      return l.toLowerCase().includes(sanitizedTyped.toLowerCase()) ||
                        lNorm.includes(normalizeLabelId(sanitizedTyped));
                    }).slice(0, 25);
                    const canCreateCustom = cleanedTyped.length > 0 &&
                      !cachedLabelNames.some(sel => normalizeLabelId(sel) === normalizeLabelId(cleanedTyped) || sel.toLowerCase() === cleanedTyped.toLowerCase());

                    if (filteredLabels.length === 0 && !canCreateCustom) return null;

                    return (
                      <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-xl shadow-xl py-1">
                        {canCreateCustom && (
                          <button
                            type="button"
                            onClick={() => {
                              updateProfile('favoriteLabel', cleanedTyped);
                              setIsLabelOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-zinc-800 transition-colors flex items-center justify-between border-b border-zinc-800/80"
                          >
                            <span>Use custom label &ldquo;{cleanedTyped}&rdquo;</span>
                            <span className="text-[9px] font-mono uppercase">Enter</span>
                          </button>
                        )}
                        {filteredLabels.map(label => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              updateProfile('favoriteLabel', label);
                              setIsLabelOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-1.5" ref={genreContainerRef}>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Genre</label>
                <div className="relative">
                  <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                    type="text" 
                    placeholder="Search or enter genre (e.g. Hardcore Punk, Alternative Rock)..."
                    value={activeProfile.favoriteGenre}
                    onFocus={() => setIsGenreOpen(true)}
                    onChange={(e) => {
                      updateProfile('favoriteGenre', e.target.value);
                      setIsGenreOpen(true);
                    }}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                  />
                  {isGenreOpen && (
                    <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-xl shadow-xl py-1">
                      {Object.entries(CANONICAL_GENRE_TAXONOMY).map(([category, genres]) => {
                        const q = (activeProfile.favoriteGenre || '').trim().toLowerCase();
                        const matches = genres.filter(g =>
                          g.toLowerCase().includes(q) ||
                          category.toLowerCase().includes(q)
                        );
                        if (matches.length === 0) return null;
                        return (
                          <div key={category} className="py-1">
                            <div className="px-3 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                              {category}
                            </div>
                            {matches.map(genre => (
                              <button
                                key={genre}
                                type="button"
                                onClick={() => {
                                  updateProfile('favoriteGenre', genre);
                                  setIsGenreOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                              >
                                {genre}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {CANONICAL_GENRES_FLAT.filter(g =>
                        g.toLowerCase().includes((activeProfile.favoriteGenre || '').trim().toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-2 text-[11px] text-zinc-500">No matching canonical genres</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5" ref={styleContainerRef}>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Style</label>
                <div className="relative">
                  <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                    type="text" 
                    placeholder="Search or enter style (e.g. Melodic, Lo-Fi, Math)..."
                    value={activeProfile.style}
                    onFocus={() => setIsStyleOpen(true)}
                    onChange={(e) => {
                      updateProfile('style', e.target.value);
                      setIsStyleOpen(true);
                    }}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                  />
                  {isStyleOpen && (
                    <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-xl shadow-xl py-1">
                      {Object.entries(CANONICAL_STYLE_TAXONOMY).map(([category, styles]) => {
                        const q = (activeProfile.style || '').trim().toLowerCase();
                        const matches = styles.filter(s =>
                          s.toLowerCase().includes(q) ||
                          category.toLowerCase().includes(q)
                        );
                        if (matches.length === 0) return null;
                        return (
                          <div key={category} className="py-1">
                            <div className="px-3 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                              {category}
                            </div>
                            {matches.map(style => (
                              <button
                                key={style}
                                type="button"
                                onClick={() => {
                                  updateProfile('style', style);
                                  setIsStyleOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                              >
                                {style}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {CANONICAL_STYLES_FLAT.filter(s =>
                        s.toLowerCase().includes((activeProfile.style || '').trim().toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-2 text-[11px] text-zinc-500">No matching canonical styles</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5" ref={originContainerRef}>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Origin</label>
                <div className="relative">
                  <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                    type="text" 
                    placeholder="Search country or enter origin (e.g. United States, Baltimore)..."
                    value={activeProfile.favoriteOrigin}
                    onFocus={() => setIsOriginOpen(true)}
                    onChange={(e) => {
                      updateProfile('favoriteOrigin', e.target.value);
                      setIsOriginOpen(true);
                    }}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                  />
                  {isOriginOpen && (() => {
                    const q = (activeProfile.favoriteOrigin || '').trim().toLowerCase();
                    const filtered = CANONICAL_COUNTRIES_22.filter(c =>
                      c.toLowerCase().includes(q)
                    );
                    return (
                      <div className="absolute z-30 mt-1 w-full max-h-44 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-xl shadow-xl py-1">
                        {filtered.length > 0 ? (
                          filtered.map(country => (
                            <button
                              key={country}
                              type="button"
                              onClick={() => {
                                updateProfile('favoriteOrigin', country);
                                setIsOriginOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-between"
                            >
                              <span>{country}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-[11px] text-zinc-500">No matching canonical countries (custom origin will be used)</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                const minEraVal = activeProfile.eraMin !== null && activeProfile.eraMin !== undefined ? activeProfile.eraMin : ERA_MIN_BOUND;
                const maxEraVal = activeProfile.eraMax !== null && activeProfile.eraMax !== undefined ? activeProfile.eraMax : STYLE_ERA_MAX;
                const isEraActive = activeProfile.eraMin !== null || activeProfile.eraMax !== null;
                const eraSpan = STYLE_ERA_MAX - ERA_MIN_BOUND;
                const minPercent = ((minEraVal - ERA_MIN_BOUND) / eraSpan) * 100;
                const maxPercent = ((maxEraVal - ERA_MIN_BOUND) / eraSpan) * 100;

                const handleEraRangeChange = (nextMin: number, nextMax: number) => {
                  const clampedMin = Math.max(ERA_MIN_BOUND, Math.min(nextMin, nextMax));
                  const clampedMax = Math.min(STYLE_ERA_MAX, Math.max(nextMin, nextMax));
                  updateProfile({
                    eraMin: clampedMin > ERA_MIN_BOUND ? clampedMin : null,
                    eraMax: clampedMax < STYLE_ERA_MAX ? clampedMax : null
                  });
                };

                const handleResetEra = () => {
                  updateProfile({ eraMin: null, eraMax: null });
                };

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                        Founded Range
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono ${isEraActive ? 'text-primary font-semibold' : 'text-zinc-500'}`}>
                          {isEraActive ? `${minEraVal} – ${maxEraVal}` : `${ERA_MIN_BOUND} – ${STYLE_ERA_MAX}`}
                        </span>
                        {isEraActive && (
                          <button
                            type="button"
                            onClick={handleResetEra}
                            className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
                            title={`Reset Founded range to ${ERA_MIN_BOUND} – ${STYLE_ERA_MAX}`}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative h-6 flex items-center select-none">
                      <div className="w-full h-1.5 bg-zinc-950 border border-zinc-800 rounded-full relative overflow-hidden">
                        <div
                          className={`absolute top-0 bottom-0 rounded-full transition-colors ${isEraActive ? 'bg-primary' : 'bg-zinc-600/50'}`}
                          style={{ left: `${minPercent}%`, width: `${Math.max(0, maxPercent - minPercent)}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min={ERA_MIN_BOUND}
                        max={STYLE_ERA_MAX}
                        step={1}
                        value={minEraVal}
                        aria-label="Minimum Founded Year"
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value), maxEraVal);
                          handleEraRangeChange(val, maxEraVal);
                        }}
                        className="absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-grab"
                        style={{ zIndex: minEraVal > STYLE_ERA_MAX - 5 ? 5 : 3 }}
                      />
                      <input
                        type="range"
                        min={ERA_MIN_BOUND}
                        max={STYLE_ERA_MAX}
                        step={1}
                        value={maxEraVal}
                        aria-label="Maximum Founded Year"
                        onChange={(e) => {
                          const val = Math.max(Number(e.target.value), minEraVal);
                          handleEraRangeChange(minEraVal, val);
                        }}
                        className="absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-grab"
                        style={{ zIndex: 4 }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                      <span>{ERA_MIN_BOUND}</span>
                      <span>1980</span>
                      <span>1995</span>
                      <span>2010</span>
                      <span>{STYLE_ERA_MAX}</span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <ModalFooter>
          <div className="flex justify-end items-center w-full">
            <div className="flex gap-2">
              <button onClick={onClose} disabled={isSaving} className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Done'}
              </button>
            </div>
          </div>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};

// --- Simulated Stripe Top-Up Modal Component (V38 Prepaid Token Economy) ---
export interface SimulatedStripeModalProps {
  isOpen: boolean;
  initialTierId?: TokenTopUpTierId | null;
  currentBalance?: number;
  onClose: () => void;
  onSuccess?: (newBalance: number, tokensCredited: number) => void;
}

export const SimulatedStripeModal: React.FC<SimulatedStripeModalProps> = ({
  isOpen,
  initialTierId,
  currentBalance = 0,
  onClose,
  onSuccess,
}) => {
  const [selectedTierId, setSelectedTierId] = useState<TokenTopUpTierId>(initialTierId || 'gbp_10');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTierId(initialTierId || 'gbp_10');
      setIsProcessing(false);
      setErrorMsg(null);
    }
  }, [isOpen, initialTierId]);

  if (!isOpen) return null;

  const selectedTier = TOP_UP_TIERS[selectedTierId] || TOP_UP_TIERS.gbp_10;

  const handleConfirmPurchase = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const topUpCallable = httpsCallable(functions, 'simulateStripeTopUpCallable');
      const result = await topUpCallable({ tierId: selectedTier.id });
      const data = result.data as { tokenBalance?: number; addedTokens?: number; tokensCredited?: number };
      const nextBalance = typeof data?.tokenBalance === 'number' ? data.tokenBalance : currentBalance + selectedTier.tokens;
      const credited = typeof data?.addedTokens === 'number'
        ? data.addedTokens
        : typeof data?.tokensCredited === 'number'
          ? data.tokensCredited
          : selectedTier.tokens;
      onSuccess?.(nextBalance, credited);
      onClose();
    } catch (err: any) {
      console.error('[SimulatedStripeModal] Top-up failed:', err);
      setErrorMsg(err?.message || 'Unable to process simulated top-up. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ModalBackdrop className="z-[2200]" onClick={isProcessing ? undefined : onClose}>
      <ModalContainer data-testid="simulated-stripe-modal" className="max-w-md w-full">
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">bolt</span>
            <h3 className="text-lg font-medium text-white">Top Up Zcene Tokens</h3>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Stripe Sim
            </span>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none disabled:opacity-40"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="p-5 space-y-4 text-sm text-zinc-300">
          <div className="grid grid-cols-3 gap-2.5">
            {TOP_UP_TIER_LIST.map((tier) => {
              const isSelected = tier.id === selectedTier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  data-testid={`stripe-tier-${tier.id}`}
                  disabled={isProcessing}
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 border-primary text-white shadow-[0_0_20px_rgba(255,95,31,0.15)]'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {tier.featured && (
                    <span className="absolute -top-2 px-1.5 py-0.2 rounded-full bg-primary text-brand-black text-[9px] font-bold uppercase tracking-wider">
                      Popular
                    </span>
                  )}
                  <span className="text-lg font-semibold text-white">{tier.priceDisplay}</span>
                  <span className="text-xs font-mono text-primary font-semibold mt-0.5">
                    {tier.tokens} Tokens
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-medium text-white leading-relaxed" data-testid="stripe-sim-headline">
              Stripe Checkout Simulation — Confirm {selectedTier.priceDisplay} Top-Up for {selectedTier.tokens} Tokens
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              No real card charge is made during beta testing. Confirming credits {selectedTier.tokens} Tokens directly to your Zcene wallet.
            </p>
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-500">Wallet Balance:</span>
              <span className="text-zinc-200">
                {currentBalance}T <span className="text-zinc-500">→</span>{' '}
                <strong className="text-primary">{currentBalance + selectedTier.tokens} Tokens</strong>
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/50 rounded-lg p-2.5">
              {errorMsg}
            </div>
          )}
        </div>

        <ModalFooter>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="stripe-confirm-button"
            disabled={isProcessing}
            onClick={handleConfirmPurchase}
            className="px-5 py-2 bg-primary text-brand-black rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined !text-[15px] animate-spin">progress_activity</span>
                <span>Crediting...</span>
              </>
            ) : (
              <span>Confirm {selectedTier.priceDisplay} Top-Up</span>
            )}
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};

// --- Token Confirmation Interceptor Dialog Component (V38 Token Spend & Top-Up Gate) ---
export const TokenConfirmationDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (authorizationToken?: string) => void;
  type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization' | 'live_tour_search' | 'live_synthesis' | 'live_chat_search';
  cachedArtists: string[];
  missingArtists: string[];
  enrichmentArtists?: string[];
  tokenCost?: number;
  tokenBalance?: number;
  isAdmin?: boolean;
  onOpenTopUp?: (tierId?: TokenTopUpTierId) => void;
  onBack?: () => void;
  error?: string | null;
}> = ({
  isOpen,
  onClose,
  onConfirm,
  type,
  cachedArtists,
  missingArtists,
  enrichmentArtists,
  tokenCost,
  tokenBalance = 0,
  isAdmin = false,
  onOpenTopUp,
  onBack,
  error,
}) => {
  if (!isOpen) return null;

  const effectiveTokenCost =
    typeof tokenCost === 'number'
      ? tokenCost
      : type === 'live_chat_search'
        ? TOKEN_PRICING.DEEP_WEB_CONSULT
        : type === 'live_synthesis'
          ? TOKEN_PRICING.COMPLEX_QUERY
          : TOKEN_PRICING.SINGLE_SEED;

  const hasSufficientBalance = isAdmin || tokenBalance >= effectiveTokenCost;
  const deficit = Math.max(0, effectiveTokenCost - tokenBalance);
  const remainingBalance = Math.max(0, tokenBalance - effectiveTokenCost);

  const allSelectedSubjects = Array.from(
    new Set([...(cachedArtists || []), ...(enrichmentArtists || []), ...(missingArtists || [])])
  ).filter(Boolean);

  const triggerTopUp = (tierId?: TokenTopUpTierId) => {
    if (onOpenTopUp) {
      onOpenTopUp(tierId);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-topup-modal', { detail: { tierId } }));
    }
  };

  const modalTitle = isAdmin
    ? type === 'live_synthesis'
      ? 'Confirm Live Synthesis'
      : type === 'live_chat_search'
        ? 'Unlock Deep Connections (Admin)'
        : 'Confirm Curation (Admin)'
    : !hasSufficientBalance
      ? 'Top Up Required to Continue'
      : type === 'live_chat_search'
        ? 'Unlock Deep Connections'
        : effectiveTokenCost >= TOKEN_PRICING.COMPLEX_QUERY || type === 'live_synthesis'
          ? 'Confirm Complex Synthesis'
          : 'Confirm Zcene Curation';

  const isPureAdminCacheHit =
    isAdmin &&
    (!missingArtists || missingArtists.length === 0) &&
    (!enrichmentArtists || enrichmentArtists.length === 0);

  const barMax = Math.max(tokenBalance, effectiveTokenCost, 50);
  const currentBarPct = Math.min(100, Math.round((tokenBalance / barMax) * 100));
  const afterBarPct = Math.min(100, Math.round((remainingBalance / barMax) * 100));

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer data-testid="token-gate-modal">
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">
              {isAdmin ? 'verified_user' : !hasSufficientBalance ? 'account_balance_wallet' : 'bolt'}
            </span>
            <h3 className="text-lg font-medium text-white" data-testid="token-gate-title">
              {modalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="p-5 space-y-4 text-sm text-zinc-400">
          {isAdmin ? (
            <>
              <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/30 rounded-xl px-3.5 py-2">
                <span className="text-xs text-emerald-300 font-medium">Admin Bypass Active</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  ADMIN UNLIMITED · 0T
                </span>
              </div>

              <div className="bg-zinc-900/60 p-4 border border-zinc-800 rounded-xl space-y-2.5">
                <div className="flex justify-between font-mono text-xs border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-500">Query Mode:</span>
                  <span className="text-zinc-300 font-semibold uppercase tracking-wider">
                    {type === 'live_chat_search'
                      ? 'Deep Connections (3 Msgs)'
                      : isPureAdminCacheHit
                        ? 'Direct Topology Hit'
                        : type === 'live_synthesis'
                          ? 'Filtered Live Synthesis'
                          : 'Graph Synthesis'}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-xs border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-500">Estimated Backend Cost:</span>
                  <div className="text-right">
                    <span className="text-primary font-bold">
                      {type === 'live_chat_search'
                        ? '~$0.01 – $0.03'
                        : isPureAdminCacheHit
                          ? '$0.0000 Direct Hit'
                          : '~$0.40 – $0.85 (~£0.30 – £0.65)'}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">
                      Standard user price: {effectiveTokenCost} Tokens
                    </span>
                  </div>
                </div>

                {cachedArtists && cachedArtists.length > 0 && (
                  <div className="space-y-1 pb-1.5 border-b border-zinc-800">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                      Ready (Cached)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {cachedArtists.map(artist => (
                        <span key={artist} className="text-[10px] font-mono bg-zinc-800/80 text-zinc-300 px-2 py-0.5 border border-zinc-700/50 rounded-full">
                          {artist}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {enrichmentArtists && enrichmentArtists.length > 0 && (
                  <div className="space-y-1 pb-1.5 border-b border-zinc-800">
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest block">
                      Enrichment Required
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {enrichmentArtists.map(artist => (
                        <span key={artist} className="text-[10px] font-mono bg-amber-950/20 text-amber-400 px-2 py-0.5 border border-amber-900/30 rounded-full">
                          {artist}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {missingArtists && missingArtists.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-widest block">
                      Live Synthesis Required
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {missingArtists.map(artist => (
                        <span key={artist} className="text-[10px] font-mono bg-red-950/20 text-red-400 px-2 py-0.5 border border-red-900/30 rounded-full">
                          {artist}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="leading-relaxed text-zinc-300">
                {type === 'live_chat_search'
                  ? 'Unlock a 3-message Deep Connections AI session for this artist.'
                  : effectiveTokenCost >= TOKEN_PRICING.COMPLEX_QUERY
                    ? 'Curate this multi-artist or custom-anchored Zcene web and save it permanently to your Zcenes.'
                    : 'Curate this Zcene web and unlock it permanently in your Zcenes.'}
              </p>

              <div className="bg-zinc-900/60 p-4 border border-zinc-800 rounded-xl space-y-3">
                {allSelectedSubjects.length > 0 && (
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                      {type === 'live_chat_search' ? 'Session Scope' : 'Selected Artists'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {allSelectedSubjects.map(subject => (
                        <span
                          key={subject}
                          className="text-xs font-mono bg-zinc-800/90 text-zinc-200 px-2.5 py-0.5 border border-zinc-700/70 rounded-full"
                        >
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-zinc-400">Token Cost:</span>
                  <span className="text-primary font-bold text-sm" data-testid="token-gate-cost">
                    {effectiveTokenCost} Tokens
                  </span>
                </div>

                {/* Juice Bar Preview */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">Your Balance: <strong className="text-zinc-200">{tokenBalance}T</strong></span>
                    {hasSufficientBalance ? (
                      <span className="text-zinc-400">
                        After: <strong className="text-emerald-400">{remainingBalance}T</strong>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold">
                        Need +{deficit}T more
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-300 ${hasSufficientBalance ? 'bg-zinc-600' : 'bg-amber-500/70'}`}
                      style={{ width: `${currentBarPct}%` }}
                    />
                    {hasSufficientBalance && (
                      <div
                        className="h-full bg-primary absolute top-0 left-0 transition-all duration-300"
                        style={{ width: `${afterBarPct}%` }}
                      />
                    )}
                  </div>
                </div>

                {type !== 'live_chat_search' && (
                  <p className="text-[11px] text-zinc-500 leading-relaxed pt-1 border-t border-zinc-800/70">
                    Includes a 1-Token artist lookup if uncached; the remaining balance is only charged when you confirm generation.
                  </p>
                )}
              </div>

              {!hasSufficientBalance && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 space-y-2.5" data-testid="low-balance-topup-box">
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    Top up your Zcene wallet to continue immediately without losing your selection:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {TOP_UP_TIER_LIST.map(tier => (
                      <button
                        key={tier.id}
                        type="button"
                        data-testid={`gate-topup-${tier.id}`}
                        onClick={() => triggerTopUp(tier.id)}
                        className="flex flex-col items-center justify-center py-2 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-amber-500/40 hover:border-primary transition-colors cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-white">{tier.priceDisplay}</span>
                        <span className="text-[10px] font-mono text-primary">+{tier.tokens}T</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-red-400 text-xs mt-2 font-medium">{error}</p>
          )}
        </div>

        <ModalFooter>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              data-testid="token-cancel-button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Cancel
            </button>
          )}

          {!isAdmin && !hasSufficientBalance ? (
            <button
              type="button"
              data-testid="token-authorize-button"
              onClick={() => triggerTopUp('gbp_10')}
              className="px-4 py-2 bg-primary text-brand-black rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 cursor-pointer"
            >
              Top Up Tokens
            </button>
          ) : (
            <button
              type="button"
              data-testid="token-authorize-button"
              onClick={() => onConfirm('authorized')}
              className="px-4 py-2 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 cursor-pointer"
            >
              {isAdmin ? 'Confirm (Admin)' : `Confirm & Spend ${effectiveTokenCost} Tokens`}
            </button>
          )}
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};


// --- Full Itinerary Dialog Component ---



// --- Generative Rationale Modal Component ---
export const GenerativeRationaleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  rationale?: string;
}> = ({ isOpen, onClose, rationale }) => {
  if (!isOpen) return null;

  // Format paragraphs/points for clean display
  const trimmed = rationale ? rationale.trim() : '';
  const isFallback = !trimmed || 
                     trimmed === '[]' || 
                     trimmed === '{}' || 
                     trimmed === 'null' || 
                     trimmed === 'undefined';

  const cleanRationale = !isFallback
    ? rationale!
    : `[Single-Seed Analysis]
- Acoustic & Sonics: Resolved core musical properties and stylistic lineage.
- Scene Context: Mapped direct influences, record label history, and geographic background.
- Overlap Insights: Unified structural connections and surrounding chronological relationships.`;

  // Sanitize literal escape sequences from the JSON payload
  let sanitizedRationale = cleanRationale.replace(/\\n/g, '\n');

  // 1a. Pre-process inline bullets: If a bullet marker immediately follows a period (end of sentence),
  // force it onto a double newline so it gets parsed correctly as a list item.
  sanitizedRationale = sanitizedRationale.replace(/\. \s*[-•*]\s+/g, '.\n\n- ');

  // 1b. Convert varying bullet markers (•, -, *) followed by spaces/newlines into clean markdown list markers
  sanitizedRationale = sanitizedRationale.replace(/(^|\n)[ \t]*[-•*][ \t]*/g, '$1- ');

  // 1c. Sanitize common raw HTML tags that Gemini sometimes outputs instead of markdown
  sanitizedRationale = sanitizedRationale
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?b>/gi, '**')
    .replace(/<\/?strong>/gi, '**')
    .replace(/<\/?i>/gi, '*')
    .replace(/<\/?em>/gi, '*')
    .replace(/<ul>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '');

  // 2. Clean up stray newlines immediately following standard markdown list markers
  sanitizedRationale = sanitizedRationale.replace(/(^|\n)([ \t]*-[ \t]*)[\n]+[ \t]*/g, '$1$2');

  // 3. Enforce a blank line before and between list items so react-markdown parses them as blocks
  sanitizedRationale = sanitizedRationale.replace(/([^\n])\n([ \t]*- )/g, '$1\n\n$2');

  const cleanRationaleLines = sanitizedRationale.split('\n').filter(line => {
    if (isFallback && line.trim().startsWith('[')) return false;
    return true;
  });

  const cleanRationaleMarkdown = cleanRationaleLines.join('\n');

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <Waypoints size={18} className="text-primary" />
            <h3 className="text-base font-medium text-white">Roots Breakdown</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
            title="Close modal"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="flex-grow overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <div className="markdown-bio text-sm leading-relaxed text-zinc-300">
              <Markdown>{cleanRationaleMarkdown}</Markdown>
            </div>
          </div>
        </div>

        <ModalFooter>
          <button 
            onClick={onClose}
            className="px-6 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 active:scale-95 transition-all duration-200"
          >
            Done
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};


export interface DisambiguationCandidate {
  id: string;
  label: string;
  origin: string;
  genre: string;
  isStub?: boolean;
}

export interface DisambiguationModalProps {
  isOpen: boolean;
  query: string;
  candidates: DisambiguationCandidate[];
  onSelect: (choice: string | 'synthesis' | 'cancel' | 'back') => void;
  isLiveAISuggestions?: boolean;
  showBack?: boolean;
}

export const COMMON_COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Puerto Rico',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia',
  'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
  'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe'
];

export interface CountryFilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export const CountryFilterDropdown: React.FC<CountryFilterDropdownProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value.trim()) return COMMON_COUNTRIES;
    const q = value.toLowerCase().trim();
    return COMMON_COUNTRIES.filter(c => c.toLowerCase().includes(q));
  }, [value]);

  return (
    <div className="relative w-full overflow-visible">
      <div className="relative flex items-center">
        <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
          type="text" 
          placeholder="Type origin country..."
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-4 pr-10 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2.5 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
        >
          <span className="material-symbols-outlined !text-[18px]">
            {isOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
          </span>
        </button>
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[1190]" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-700 rounded-xl max-h-48 overflow-y-auto z-[1200] scrollbar-thin py-1">
            <button
              type="button"
              onClick={() => {
                onChange("None of these");
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                value === "None of these" 
                  ? 'bg-primary/10 text-primary font-semibold' 
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>None of these</span>
              {value === "None of these" && (
                <span className="material-symbols-outlined text-primary !text-[14px]">check</span>
              )}
            </button>
            {filtered.length > 0 ? (
              filtered.map((country) => {
                const isSelected = value.toLowerCase().trim() === country.toLowerCase();
                return (
                  <button
                    type="button"
                    key={country}
                    onClick={() => {
                      onChange(country);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected 
                        ? 'bg-primary/10 text-primary font-semibold' 
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>{country}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-primary !text-[14px]">check</span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-2.5 text-xs text-zinc-500 font-mono italic">
                Custom region "{value}" (press Proceed to submit)
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export function DisambiguationModal({ isOpen, query, candidates, onSelect, isLiveAISuggestions = false, showBack = false }: DisambiguationModalProps) {
  const [overrideInput, setOverrideInput] = useState('');
  if (!isOpen) return null;

  // ── STATE A: Cache Miss (0 candidates in cache) ───────────────────────────
  if (candidates.length === 0) {
    return (
      <ModalBackdrop onClick={() => onSelect('cancel')} className="z-[1100]">
        <ModalContainer className="overflow-visible relative z-[1150]">
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              if (overrideInput.trim()) {
                onSelect(`override::${overrideInput.trim()}`);
              } else {
                onSelect('synthesis');
              }
            }} 
            className="flex flex-col w-full" 
            onClick={e => e.stopPropagation()}
          >
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'public' : 'psychology'}</span>
                <h3 className="text-lg font-medium text-white">
                  {isLiveAISuggestions ? 'Validate Origin' : 'Disambiguation'}
                </h3>
              </div>
              <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

          <ModalBody className="overflow-visible flex flex-col gap-4">
            <p className="text-sm font-light text-zinc-400 leading-relaxed">
              {isLiveAISuggestions 
                ? <>We ran a quick live check and did not find a distinct regional entity for <span className="text-primary font-semibold">"{query}"</span>.</>
                : <>No cached records found for <span className="text-primary font-semibold">"{query}"</span>. This artist may be new to the platform, or multiple regional acts share this name.</>}
            </p>

            {isLiveAISuggestions && (
              <div className="flex flex-col gap-2 pt-1 overflow-visible">
                <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            {showBack ? (
              <button
                type="button"
                onClick={() => onSelect('back')}
                className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelect('cancel')}
                className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
              >
                Cancel
              </button>
            )}
            {(!isLiveAISuggestions || overrideInput.trim()) && (
              <button
                type="submit"
                className="px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                {isLiveAISuggestions 
                  ? 'Confirm Origin'
                  : (overrideInput.trim() ? 'Confirm' : 'Search Live AI')}
              </button>
            )}
          </ModalFooter>
        </form>
      </ModalContainer>
    </ModalBackdrop>
    );
  }

  // ── STATE B: Single Candidate — "Look What I Found" ──────────────────────
  // Cache returned 1 record. User confirms cached candidate card or requests live AI search.
  if (candidates.length === 1) {
    const cand = candidates[0];
    return (
      <ModalBackdrop onClick={() => onSelect('cancel')} className="z-[1100]">
        <ModalContainer className="overflow-visible relative z-[1150]">
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              if (overrideInput.trim()) {
                onSelect(`override::${overrideInput.trim()}`);
              } else {
                onSelect('synthesis');
              }
            }}
            className="flex flex-col w-full" onClick={e => e.stopPropagation()}
          >
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'public' : 'travel_explore'}</span>
                <h3 className="text-lg font-medium text-white">
                  {isLiveAISuggestions ? 'Validate Origin' : 'Look What I Found'}
                </h3>
              </div>
              <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

          <ModalBody className="p-5 flex flex-col gap-4 overflow-visible">
            <p className="text-sm font-light text-zinc-400 leading-relaxed">
              {isLiveAISuggestions
                ? <>We ran a quick live check and found a distinct regional entity for <span className="text-primary font-semibold">"{query}"</span>. Is this the act you mean?</>
                : <>We found this in our index for <span className="text-primary font-semibold">"{query}"</span>. Is this the artist you're looking for?</>}
            </p>

            {/* Single candidate card — clicking accepts cached candidate */}
            <button
              type="button"
              onClick={() => onSelect(cand.id)}
              className="w-full text-left p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-700 hover:border-primary/50 transition-all duration-200 flex items-center gap-4 group rounded-xl cursor-pointer"
            >
              <span className="material-symbols-outlined text-zinc-600 group-hover:text-primary group-hover:scale-110 transition-all text-2xl flex-shrink-0">check_circle</span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-white group-hover:text-primary font-medium transition-colors text-base truncate">
                  {cand.label || cand.id}
                </span>
                {(cand.genre || cand.origin) && (
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors uppercase tracking-wider font-semibold">
                    {cand.origin && <span>{cand.origin}</span>}
                    {cand.origin && cand.genre && <span>•</span>}
                    {cand.genre && <span>{cand.genre}</span>}
                  </div>
                )}
              </div>
              <span className="material-symbols-outlined text-primary transition-transform group-hover:translate-x-1 text-[16px] ml-auto flex-shrink-0">
                arrow_forward_ios
              </span>
            </button>

            {isLiveAISuggestions && (
              <div className="flex flex-col gap-2 pt-1 overflow-visible">
                <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
              </div>
            )}
          </ModalBody>
          
          <ModalFooter>
            {showBack ? (
              <button
                type="button"
                onClick={() => onSelect('back')}
                className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelect('cancel')}
                className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
              >
                Cancel
              </button>
            )}
            {isLiveAISuggestions && !overrideInput.trim() ? (
              null // "None of these" is in the dropdown now
            ) : (
              <button
                type="submit"
                className={
                  overrideInput.trim()
                    ? "px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                    : "px-6 py-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                }
              >
                {overrideInput.trim() ? (isLiveAISuggestions ? 'Confirm Origin' : 'Confirm') : 'None of these'}
              </button>
            )}
          </ModalFooter>
        </form>
      </ModalContainer>
    </ModalBackdrop>
    );
  }

  // ── STATE C: Multiple Cached Candidates — "Which Did You Mean?" ───────────
  // Cache returned >1 records. User selects one or requests live AI search.
  return (
    <ModalBackdrop onClick={() => onSelect('cancel')} className="z-[1100]">
      <ModalContainer className="overflow-visible relative z-[1150]">
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (overrideInput.trim()) {
              onSelect(`override::${overrideInput.trim()}`);
            } else {
              onSelect('synthesis');
            }
          }}
          className="flex flex-col w-full" onClick={e => e.stopPropagation()}
        >
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'public' : 'psychology'}</span>
              <h3 className="text-lg font-medium text-white">
                {isLiveAISuggestions ? 'Validate Origin' : 'Disambiguation'}
              </h3>
            </div>
            <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </ModalHeader>

          <ModalBody className="p-5 flex flex-col gap-4 overflow-visible">
            <p className="text-sm font-light text-zinc-400 leading-relaxed">
              {isLiveAISuggestions
                ? <>We found multiple artists matching <span className="text-primary font-semibold">"{query}"</span>. Please select the correct regional act to begin mapping your scene.</>
                : <>We found multiple distinct artists matching <span className="text-primary font-semibold">"{query}"</span>. Which one did you mean?</>}
            </p>

          <div className="flex flex-col gap-3 max-h-[240px] overflow-y-auto pr-1">
            {candidates.map((cand) => (
              <button
                type="button"
                key={cand.id}
                onClick={() => onSelect(cand.id)}
                className="w-full text-left p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-700 hover:border-primary/50 transition-all duration-200 flex items-center gap-4 group rounded-xl cursor-pointer"
              >
                <span className="material-symbols-outlined text-zinc-600 group-hover:text-primary group-hover:scale-110 transition-all text-2xl flex-shrink-0">check_circle</span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-white group-hover:text-primary font-medium transition-colors text-base truncate">
                    {cand.label || cand.id}
                  </span>
                  {(cand.genre || cand.origin) && (
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors uppercase tracking-wider font-semibold">
                      {cand.origin && <span>{cand.origin}</span>}
                      {cand.origin && cand.genre && <span>•</span>}
                      {cand.genre && <span>{cand.genre}</span>}
                    </div>
                  )}
                </div>
                <span className="material-symbols-outlined text-primary transition-transform group-hover:translate-x-1 text-[16px] ml-auto flex-shrink-0">
                  arrow_forward_ios
                </span>
              </button>
            ))}
          </div>

          {isLiveAISuggestions && (
            <div className="flex flex-col gap-2 pt-1 overflow-visible">
              <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
            </div>
          )}
          </ModalBody>

        <ModalFooter>
          {showBack ? (
            <button
              type="button"
              onClick={() => onSelect('back')}
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelect('cancel')}
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Cancel
            </button>
          )}
          {overrideInput.trim() && (
            <button
              type="submit"
              className="px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              {isLiveAISuggestions ? 'Confirm Origin' : 'Confirm'}
            </button>
          )}
          </ModalFooter>
        </form>
      </ModalContainer>
    </ModalBackdrop>
    );
};







// --- Filter Guidance Modal Component ---
import { DiscoveryFilters } from '../types';

export const FilterGuidanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onReRun: (filters: DiscoveryFilters) => void;
  initialFilters?: DiscoveryFilters;
  seedArtists: string[];
  errorMessage?: string;
}> = ({ isOpen, onClose, onReRun, initialFilters = {}, seedArtists, errorMessage }) => {
  const [filters, setFilters] = useState<DiscoveryFilters>(initialFilters);

  // Sync state if initialFilters changes
  React.useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters || {});
    }
  }, [isOpen, initialFilters]);

  if (!isOpen) return null;

  const updateField = (field: keyof DiscoveryFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    onReRun(filters);
  };

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader className="bg-red-950 border-red-900/50">
          <div className="flex items-center gap-2 text-red-400">
            <span className="material-symbols-outlined !text-[18px]">error</span>
            <h3 className="text-lg font-medium">Synthesis Constrained</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-red-400 hover:text-red-300 hover:bg-red-900/50 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="flex-grow overflow-y-auto p-5 space-y-5 max-h-[70vh]">
          <div className="text-sm text-zinc-300 leading-relaxed space-y-3">
            <p>
              The curation engine could not discover any relational bridges between the requested seeds within the applied filters.
            </p>
            {errorMessage && (
              <p className="text-xs text-zinc-500 font-mono p-3 bg-zinc-900/80 rounded-xl border border-zinc-800">
                {errorMessage}
              </p>
            )}
            <p>
              Try widening your search parameters (e.g., expanding the Era range or removing strict constraints) to allow more paths.
            </p>
          </div>

          <div className="bg-zinc-900/40 p-4 border border-zinc-800/80 rounded-none space-y-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                Target Seeds
              </span>
              <div className="flex flex-wrap gap-1.5">
                {seedArtists.map(artist => (
                  <span key={artist} className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 border border-zinc-700/50 rounded-full">
                    {artist}
                  </span>
                ))}
              </div>
            </div>

            <hr className="border-zinc-800" />

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
              <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                type="text"
                placeholder="e.g. Hardcore Punk, Grunge"
                value={filters.includeGenres?.join(', ') || ''}
                onChange={(e) => updateField('includeGenres', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Include Origins</label>
              <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                type="text"
                placeholder="e.g. Canada, UK"
                value={filters.includeOrigins?.join(', ') || ''}
                onChange={(e) => updateField('includeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Exclude Origins</label>
              <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                type="text"
                placeholder="e.g. Australia"
                value={filters.excludeOrigins?.join(', ') || ''}
                onChange={(e) => updateField('excludeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Anchor Labels</label>
              <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                type="text"
                placeholder="e.g. Sub Pop, Dischord Records"
                value={filters.anchorLabels?.join(', ') || ''}
                onChange={(e) => updateField('anchorLabels', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>

          </div>
        </div>

        <ModalFooter>
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
          >
            Cancel
          </button>
          <button 
            onClick={handleApply} 
            className="px-5 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 flex items-center gap-2"
          >
            <span className="material-symbols-outlined !text-[16px]">refresh</span>
            Re-run with adjusted filters
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};

export interface PreFlightSeed {
  id: string;
  query: string;
  predictedOrigin: string;
  genre?: string;
  isKnownCacheHit: boolean;
  candidateId?: string;
  isCorrected?: boolean;
  correctedQuery?: string;
  originalQuery?: string;
  isAmbiguous?: boolean;
  candidates?: DisambiguationCandidateStub[];
  selectedCandidateId?: string;
}

export interface DisambiguationRadioProps {
  key?: React.Key;
  candidate: DisambiguationCandidateStub;
  isSelected: boolean;
  onSelect: () => void;
}

export const DisambiguationRadio: React.FC<DisambiguationRadioProps> = ({ candidate, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'border-amber-500/80 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/40'
      }`}
    >
      <div className="pt-0.5 flex-shrink-0">
        <div
          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
            isSelected ? 'border-amber-400 bg-amber-500' : 'border-zinc-600 bg-transparent'
          }`}
        >
          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-brand-black" />}
        </div>
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium truncate">{candidate.name}</span>
          <span className="text-[10px] text-zinc-300 bg-zinc-800/90 px-2 py-0.5 rounded-md font-normal border border-zinc-700/60">
            {candidate.origin}{candidate.genre ? ` • ${candidate.genre}` : ''}
          </span>
        </div>
        {candidate.disambiguationSnippet && (
          <p className="text-[11px] text-zinc-400 font-light mt-1 leading-relaxed">
            {candidate.disambiguationSnippet}
          </p>
        )}
      </div>
    </div>
  );
}

export interface ConsolidatedValidationModalProps {
  isOpen: boolean;
  seeds: PreFlightSeed[];
  onConfirm: (updatedSeeds?: PreFlightSeed[]) => void;
  onCancel: () => void;
  curationSessionId?: string | null;
  isAdmin?: boolean;
  onOpenTopUp?: (tierId?: TokenTopUpTierId) => void;
}

export function ConsolidatedValidationModal({
  isOpen,
  seeds,
  onConfirm,
  onCancel,
  curationSessionId,
  isAdmin = false,
  onOpenTopUp,
}: ConsolidatedValidationModalProps) {
  const [localSeeds, setLocalSeeds] = React.useState<PreFlightSeed[]>(seeds);
  const [editingSeedId, setEditingSeedId] = React.useState<string | null>(null);
  const [customOrigin, setCustomOrigin] = React.useState<string>('');
  const [customGenre, setCustomGenre] = React.useState<string>('');
  const [isVerifying, setIsVerifying] = React.useState<boolean>(false);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const [needsTopUpForEscape, setNeedsTopUpForEscape] = React.useState<boolean>(false);

  React.useEffect(() => {
    setLocalSeeds(seeds);
    setEditingSeedId(null);
    setVerificationError(null);
    setNeedsTopUpForEscape(false);
    setIsVerifying(false);
  }, [seeds]);

  if (!isOpen) return null;

  const triggerTopUp = (tierId?: TokenTopUpTierId) => {
    if (onOpenTopUp) {
      onOpenTopUp(tierId);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-topup-modal', { detail: { tierId } }));
    }
  };

  const handleSelectCandidate = (seedId: string, candidate: DisambiguationCandidateStub) => {
    setLocalSeeds(prev => prev.map(s => {
      if (s.id === seedId) {
        return {
          ...s,
          selectedCandidateId: candidate.id,
          candidateId: candidate.id,
          predictedOrigin: candidate.origin,
          genre: candidate.genre
        };
      }
      return s;
    }));
  };

  const handleStartEdit = (seed: PreFlightSeed) => {
    setEditingSeedId(seed.id);
    setCustomOrigin(seed.predictedOrigin && seed.predictedOrigin !== 'Unknown Origin' ? seed.predictedOrigin : '');
    setCustomGenre(seed.genre || '');
    setVerificationError(null);
    setNeedsTopUpForEscape(false);
  };

  const handleCancelEdit = () => {
    setEditingSeedId(null);
    setVerificationError(null);
    setNeedsTopUpForEscape(false);
  };

  const handleSaveEdit = async (seed: PreFlightSeed) => {
    if (!customOrigin.trim() || isVerifying) return;
    setIsVerifying(true);
    setVerificationError(null);
    setNeedsTopUpForEscape(false);

    try {
      const validateCallable = httpsCallable(functions, 'validateSeedOriginCallable');
      const seedQuery = seed.correctedQuery || seed.query;
      
      const response = await validateCallable({
        seed: seedQuery,
        originHint: customOrigin.trim(),
        genreHint: customGenre.trim() || undefined,
        ...(curationSessionId ? { curationSessionId, mode: 'escape_hatch' } : {}),
      });

      const data = response.data as any;

      if (data && data.isValid) {
        setLocalSeeds(prev => prev.map(s => {
          if (s.id === seed.id) {
            const hasCollision = !!(data.hasCollision && Array.isArray(data.candidates) && data.candidates.length > 1);
            return {
              ...s,
              predictedOrigin: data.origin || customOrigin.trim(),
              genre: data.genre || customGenre.trim() || s.genre,
              isKnownCacheHit: false, // force fresh pipeline routing
              isAmbiguous: hasCollision,
              candidates: hasCollision ? data.candidates : undefined,
              selectedCandidateId: hasCollision ? data.candidates[0].id : undefined,
              candidateId: data.candidates && data.candidates.length === 1 ? data.candidates[0].id : undefined,
              isCorrected: data.correctedInput || s.isCorrected,
              correctedQuery: (data.id && data.id !== seedQuery) ? data.id : s.correctedQuery
            };
          }
          return s;
        }));
        setEditingSeedId(null);
        setVerificationError(null);
        setNeedsTopUpForEscape(false);
      } else {
        setVerificationError("No significant artist found matching these criteria");
      }
    } catch (err: any) {
      console.warn("[ConsolidatedValidationModal] Re-query bouncer rejected:", err);
      if (err?.message?.includes('INSUFFICIENT_TOKENS') || err?.code === 'functions/failed-precondition') {
        setNeedsTopUpForEscape(true);
        setVerificationError("1 Token required to re-query artist origin.");
      } else {
        setVerificationError("No significant artist found matching these criteria");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const hasInvalidSeeds = localSeeds.some(seed => {
    if (seed.isAmbiguous) {
      return !seed.selectedCandidateId;
    }
    return !seed.predictedOrigin || seed.predictedOrigin.trim() === '' || seed.predictedOrigin === 'Unknown Origin';
  });

  const isConfirmDisabled = hasInvalidSeeds || !!editingSeedId || isVerifying;

  return (
    <ModalBackdrop onClick={onCancel} className="z-[1100]">
      <ModalContainer data-testid="validation-modal" className="!overflow-visible relative z-[1150] max-w-lg w-full">
        <form onSubmit={e => { e.preventDefault(); onConfirm(localSeeds); }} className="flex flex-col w-full" onClick={e => e.stopPropagation()}>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-[18px]">checklist</span>
              <h3 className="text-lg font-medium text-white">Confirm Your Artists</h3>
            </div>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </ModalHeader>
          <ModalBody className="p-5 flex flex-col gap-4 !overflow-visible max-h-[70vh] overflow-y-auto">
            <p className="text-sm font-light text-zinc-400 leading-relaxed">
              Please verify the regional origins and exact acts for your selected artists.
            </p>
            <div className="flex flex-col gap-4">
              {localSeeds.map(seed => {
                const isAmbiguous = !!(seed.isAmbiguous && seed.candidates && seed.candidates.length > 1);

                if (isAmbiguous) {
                  return (
                    <div key={seed.id} className="flex flex-col gap-3 p-3.5 bg-amber-950/20 border border-amber-500/40 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white font-medium text-base truncate">
                          {seed.query}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                          COLLISION DETECTED
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 font-light">
                        Multiple prominent acts share this name. Select your intended artist:
                      </p>
                      <div className="flex flex-col gap-2 mt-1">
                        {seed.candidates!.map(candidate => (
                          <DisambiguationRadio
                            key={candidate.id}
                            candidate={candidate}
                            isSelected={seed.selectedCandidateId === candidate.id}
                            onSelect={() => handleSelectCandidate(seed.id, candidate)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }

                const isEditing = editingSeedId === seed.id;

                return (
                  <div key={seed.id} className="flex flex-col gap-2 p-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-base truncate">
                          {seed.isCorrected && seed.correctedQuery ? seed.correctedQuery : seed.query}
                        </span>
                        {isAdmin && seed.isKnownCacheHit && (
                          <span className="text-[9px] uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full font-semibold">CACHE HIT</span>
                        )}
                      </div>
                      
                      {!isEditing ? (
                        <>
                          <span data-testid="validation-origin-text" className="text-xs text-zinc-400 font-light truncate mt-0.5">
                            {seed.predictedOrigin || 'Unknown Origin'}{seed.genre ? ` • ${seed.genre}` : ''}
                          </span>
                          
                          {seed.isCorrected && seed.originalQuery && (
                            <span className="text-[10px] text-amber-500/80 font-medium truncate mt-0.5">
                              Auto-corrected from "{seed.originalQuery}"
                            </span>
                          )}

                          {/* "Not this artist?" Escape Hatch */}
                          <div className="mt-2 pt-1 border-t border-zinc-800/60 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(seed)}
                              className="text-[11px] text-zinc-400 hover:text-amber-400 transition-colors flex items-center gap-1 font-light underline decoration-zinc-700 underline-offset-2"
                            >
                              <span className="material-symbols-outlined !text-[13px]">help_outline</span>
                              Not this artist?
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2.5 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg flex flex-col gap-2.5">
                          <p className="text-[11px] text-zinc-400 font-light">
                            Specify the intended regional origin or country for <strong>{seed.query}</strong>:
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              disabled={isVerifying}
                              value={customOrigin}
                              onChange={e => setCustomOrigin(e.target.value)}
                              placeholder="e.g. United Kingdom, Australia, Chicago..."
                              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            />
                            <input
                              type="text"
                              disabled={isVerifying}
                              value={customGenre}
                              onChange={e => setCustomGenre(e.target.value)}
                              placeholder="Genre (optional)"
                              className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            />
                          </div>

                          {verificationError && (
                            <div data-testid="bouncer-error" className="flex items-center justify-between gap-2 text-rose-400 text-xs bg-rose-950/40 border border-rose-800/50 rounded-lg p-2">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined !text-[15px] flex-shrink-0">error</span>
                                <span>{verificationError}</span>
                              </div>
                              {needsTopUpForEscape && (
                                <button
                                  type="button"
                                  onClick={() => triggerTopUp('gbp_5')}
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-primary text-brand-black rounded hover:opacity-90 whitespace-nowrap cursor-pointer"
                                >
                                  Top Up
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {!isAdmin && curationSessionId ? '1-Token Flash lookup' : ''}
                            </span>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={isVerifying}
                                onClick={handleCancelEdit}
                                className="px-2.5 py-1 text-[11px] text-zinc-400 hover:text-white rounded disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!customOrigin.trim() || isVerifying}
                                onClick={() => handleSaveEdit(seed)}
                                className="px-3 py-1 text-[11px] font-medium bg-amber-500 text-brand-black rounded hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {isVerifying ? (
                                  <>
                                    <span className="material-symbols-outlined !text-[12px] animate-spin">progress_activity</span>
                                    <span>Verifying...</span>
                                  </>
                                ) : (
                                  <span>Apply</span>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {(!seed.predictedOrigin || seed.predictedOrigin.trim() === '') && !isEditing && (
                      <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-2.5 mt-1 flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-500 !text-[16px] mt-0.5">warning</span>
                        <p className="text-xs text-amber-200/90 leading-relaxed">
                          We couldn't confidently locate this artist. Use "Not this artist?" to specify their region.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent">
              Cancel
            </button>
            <button data-testid="validation-confirm-button" type="submit" disabled={isConfirmDisabled} className={`px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap ${isConfirmDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              Confirm & Generate
            </button>
          </ModalFooter>
        </form>
      </ModalContainer>
    </ModalBackdrop>
  );
}

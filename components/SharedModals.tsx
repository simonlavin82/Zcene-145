import { ModalFooter, ModalContainer, ModalBackdrop, ModalHeader, ModalBody } from './ui/Dialog';
import { Input } from './DesignSystem';
import React, { useState, useMemo } from 'react';
import { StackItem, Node, UserTaste } from '../types';
import { StackIcon, VisibilityIcon, VisibilityOffIcon } from './Icons';
import Markdown from 'react-markdown';
import { isNodeInSeedList, cleanArtistDisplayName } from '../services/artistCacheService';
import { Flame, Waypoints } from 'lucide-react';
import { formatSystemTimestamp } from '../utils/formatters';

// --- My Stack Dialog Component ---
export const MyStackDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  stack: StackItem[];
  onRemove: (node: Node) => void;
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
    <ModalBackdrop onClick={onClose}>
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
                        const nameToCopy = cleanArtistDisplayName(item.id);
                        const isCopied = copiedId === item.id;
                        
                        return (
                            <div key={item.id} className="group flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 px-3 -mx-3 rounded-lg transition-colors">
                                <div 
                                    className="flex-grow min-w-0 cursor-pointer flex flex-col justify-center relative -top-0.5"
                                    onClick={() => handleCopy(item.id, nameToCopy)}
                                    title="Click to copy name"
                                >
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[15px] font-medium text-white truncate leading-tight">{nameToCopy}</h4>
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
                                        onClick={() => onRemove({ id: item.id, type: item.type as any, group: 0 })}
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
                <button onClick={onClose} className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90">
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
  { name: 'emerald', class: 'bg-[#10b981]' },
  { name: 'amber', class: 'bg-[#f59e0b]' },
  { name: 'rose', class: 'bg-[#f43f5e]' },
  { name: 'cyan', class: 'bg-[#06b6d4]' }
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

  const updateProfile = (field: any, value: any) => {
    if (activeProfileIndex === -1) return;
    const newProfiles = [...profiles];
    newProfiles[activeProfileIndex] = { ...newProfiles[activeProfileIndex], [field]: value };
    setProfiles(newProfiles);
  };

  const handleAddProfile = () => {
    if (profiles.length >= 5) return;
    const newProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      name: `Profile ${profiles.length + 1}`,
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length].name,
      isActive: true,
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
    <ModalBackdrop className="z-[120]" onClick={onClose}>
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
                    {PROFILE_COLORS.map(color => (
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
                <input 
                  type="text" 
                  value={activeProfile.name}
                  onChange={(e) => updateProfile('name', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>
              
              <hr className="border-zinc-800" />

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Genre</label>
                <input 
                  type="text" 
                  placeholder="e.g. Hardcore Punk"
                  value={activeProfile.favoriteGenre}
                  onChange={(e) => updateProfile('favoriteGenre', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Style</label>
                <input 
                  type="text" 
                  placeholder="e.g. melodic, post"
                  value={activeProfile.style}
                  onChange={(e) => updateProfile('style', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Origin</label>
                <input 
                  type="text" 
                  placeholder="e.g. Baltimore"
                  value={activeProfile.favoriteOrigin}
                  onChange={(e) => updateProfile('favoriteOrigin', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Era Range (Min / Max Year)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <input 
                      type="number" 
                      placeholder="Min Year"
                      value={activeProfile.eraMin ?? ''}
                      onChange={(e) => updateProfile('eraMin', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <input 
                      type="number" 
                      placeholder="Max Year"
                      value={activeProfile.eraMax ?? ''}
                      onChange={(e) => updateProfile('eraMax', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <ModalFooter>
          <div className="flex justify-end items-center w-full">
            <div className="flex gap-2">
              <button onClick={onClose} disabled={isSaving} className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};

// --- Token Confirmation Interceptor Dialog Component ---
export const TokenConfirmationDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization' | 'live_tour_search' | 'live_synthesis' | 'live_chat_search';
  cachedArtists: string[];
  missingArtists: string[];
  enrichmentArtists?: string[];
  onBack?: () => void;
  error?: string | null;
}> = ({ isOpen, onClose, onConfirm, type, cachedArtists, missingArtists, enrichmentArtists, onBack, error }) => {
  const [password, setPassword] = useState(() => {
    try { return sessionStorage.getItem('zcene_api_password') || ''; } catch(e) { return ''; }
  });
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
            <h3 className="text-lg font-medium text-white">
              {type === 'live_synthesis' ? 'Confirm Live Synthesis' : 'Token Quota Warning'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="p-5 space-y-4 text-sm text-zinc-400">
          <p className="leading-relaxed">
            {type === 'cache_upgrade'
              ? 'The cached entry is out of date and needs a quick re-synthesis query to unlock the latest spiderweb layout and Deep Cut features.'
              : type === 'data_quality_optimization'
                ? 'A data quality issue was detected on this profile (stale placeholders, bad casing, or unparsed formatting). A live AI optimization pass will re-synthesize and heal the cached record.'
                : type === 'live_tour_search'
                  ? 'You are initiating a live search agent lookup to check the latest real-time tour schedules for this artist.'
                  : type === 'live_synthesis'
                    ? 'You are initiating a live music graph synthesis constrained by custom filters. This requires a fresh AI synthesis pass and cannot use standard cached entries.'
                    : 'You are initiating a net-new AI generation flow that requires contacting the live models.'}
          </p>
          <div className="bg-zinc-900/60 p-4 border border-zinc-800 space-y-2.5">
            <div className="flex justify-between font-mono text-xs border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-500">Query Type:</span>
              <span className="text-zinc-300 font-semibold uppercase tracking-wider">
                {type === 'generation' 
                  ? 'Graph Generation' 
                  : type === 'extension' 
                    ? 'Node Expansion' 
                    : type === 'partial_synthesis'
                      ? 'Partial Synthesis (Enrichment)'
                      : type === 'cache_upgrade'
                        ? 'Cache Upgrade'
                        : type === 'data_quality_optimization'
                          ? 'Profile Quality Optimization'
                          : type === 'live_tour_search'
                            ? 'Live Tour Agent Search'
                            : type === 'live_synthesis'
                              ? 'Filtered Live Synthesis'
                              : 'Deep Cut Creation'}
              </span>
            </div>
            <div className="flex justify-between font-mono text-xs border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-500">Estimated Cost:</span>
              <div className="text-right">
                <span className="text-primary font-bold">
                  ~$0.40 – $0.85 (~£0.30 – £0.65)
                </span>
                <span className="text-[9px] text-zinc-500 block mt-0.5 lowercase tracking-wide">
                  Final cost depends on cache recovery and graph complexity.
                </span>
              </div>
            </div>

            {/* Split breakdown of cached vs synthesis required */}
            {cachedArtists && cachedArtists.length > 0 && (
              <div className="space-y-1 pb-1.5 border-b border-zinc-800">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                  Ready (Cached/Free)
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
                  Enrichment Required (Missing Peer Bands/Attributes)
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
                  Synthesis Required (~$0.40 – $0.85)
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

          <div className="pt-2">
            <div className="relative">
              <Input 
                type={showPassword ? 'text' : 'password'}
                placeholder="API Access Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password) onConfirm(password);
                }}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <VisibilityOffIcon className="w-4 h-4" />
                  : <VisibilityIcon className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p className="text-red-400 text-xs mt-2 font-medium">{error}</p>
            )}
          </div>

          {import.meta.env.DEV && (
            <p className="text-xs text-zinc-500 leading-relaxed pt-2">
              Note: All live outbound API dispatches are completely short-circuited with a static JSON payload in sandbox mode to protect billing limits.
            </p>
          )}
        </div>

        <ModalFooter>
          {onBack ? (
            <button 
              onClick={onBack} 
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Back
            </button>
          ) : (
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
            >
              Cancel
            </button>
          )}
          <button 
            onClick={() => onConfirm(password)} 
            disabled={!password}
            className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Confirm
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};


// --- Full Itinerary Dialog Component ---
export const FullItineraryDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  artistName: string;
  tourDates: string[];
}> = ({ isOpen, onClose, artistName, tourDates }) => {
  if (!isOpen) return null;

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">calendar_month</span>
            <h3 className="text-base font-medium text-white">Full Itinerary: {artistName}</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="flex-grow overflow-y-auto p-5 space-y-2 max-h-[60vh]">
          {tourDates.map((date, idx) => (
            <p key={idx} className="text-sm font-normal text-zinc-300 py-1.5 border-b border-zinc-800/40 last:border-0">
              • {date}
            </p>
          ))}
        </div>

        <ModalFooter>
          <button 
            onClick={onClose}
            className="px-5 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
};


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
            className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 active:scale-95 transition-all duration-200"
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
        <input 
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
                className="px-6 py-2 bg-primary text-brand-black rounded-xl font-medium text-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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
                    ? "px-6 py-2 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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
              className="px-6 py-2 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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

export const ExploreActionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  artistName: string;
}> = ({ isOpen, onClose, onConfirm, artistName }) => {
  if (!isOpen) return null;

  return (
    <ModalBackdrop className="z-[130]" onClick={onClose}>
      <ModalContainer>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">explore</span>
            <h3 className="text-lg font-medium text-white">Explore & Expand Spiderweb</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div className="p-5 text-sm text-zinc-300">
          <p className="leading-relaxed">
            You are expanding the spiderweb graph outward from <strong className="text-white font-semibold">{artistName}</strong>. Confirming will generate one additional AI artist node directly connecting to this artist and seamlessly weave it into your active session.
          </p>
        </div>

        <ModalFooter>
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-xl font-medium text-sm transition-colors active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-semibold text-sm active:scale-95 transition-all hover:bg-yellow-400 cursor-pointer"
          >
            Continue
          </button>
        </ModalFooter>
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
            className="px-5 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 flex items-center gap-2"
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
}

export interface ConsolidatedValidationModalProps {
  isOpen: boolean;
  seeds: PreFlightSeed[];
  onConfirm: (finalOrigins: Record<string, string>) => void;
  onCancel: () => void;
}

export function ConsolidatedValidationModal({ isOpen, seeds, onConfirm, onCancel }: ConsolidatedValidationModalProps) {
  const [origins, setOrigins] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    seeds.forEach(s => initial[s.id] = s.predictedOrigin);
    return initial;
  });

  React.useEffect(() => {
    setOrigins(prev => {
      const next: Record<string, string> = {};
      let changed = false;
      seeds.forEach(s => {
        next[s.id] = prev[s.id] !== undefined ? prev[s.id] : s.predictedOrigin;
        if (prev[s.id] === undefined) changed = true;
      });
      return changed ? next : prev;
    });
  }, [seeds]);

  if (!isOpen) return null;

  return (
    <ModalBackdrop onClick={onCancel} className="z-[1100]">
      <ModalContainer className="overflow-visible relative z-[1150]">
        <form onSubmit={e => { e.preventDefault(); onConfirm(origins); }} className="flex flex-col w-full" onClick={e => e.stopPropagation()}>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-[18px]">checklist</span>
              <h3 className="text-lg font-medium text-white">Confirm Your Seeds</h3>
            </div>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </ModalHeader>
          <ModalBody className="p-5 flex flex-col gap-4 overflow-visible">
            <p className="text-sm font-light text-zinc-400 leading-relaxed">
              Please verify the regional origins for your selected artists.
            </p>
            <div className="flex flex-col gap-4">
              {seeds.map(seed => (
                <div key={seed.id} className="flex flex-col gap-2 p-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-base truncate">{seed.query}</span>
                      {seed.genre && (
                        <span className="text-xs text-zinc-400 font-light truncate">{seed.genre}</span>
                      )}
                    </div>
                    {seed.isKnownCacheHit && (
                      <span className="text-[10px] uppercase tracking-wider text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full font-semibold">Cache Hit</span>
                    )}
                  </div>
                  {(!seed.predictedOrigin || seed.predictedOrigin.trim() === '') && (
                    <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-2.5 mb-1 flex items-start gap-2">
                      <span className="material-symbols-outlined text-amber-500 !text-[16px] mt-0.5">warning</span>
                      <p className="text-xs text-amber-200/90 leading-relaxed">
                        We couldn't confidently locate this artist. Please assign an origin manually.
                      </p>
                    </div>
                  )}
                  <CountryFilterDropdown 
                    value={origins[seed.id] || ''} 
                    onChange={v => setOrigins(prev => ({ ...prev, [seed.id]: v }))} 
                  />
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent">
              Cancel
            </button>
            <button type="submit" className="px-6 py-2 bg-primary text-brand-black rounded-xl font-medium text-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap">
              Confirm & Generate
            </button>
          </ModalFooter>
        </form>
      </ModalContainer>
    </ModalBackdrop>
  );
}

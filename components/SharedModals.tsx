import React, { useState } from 'react';
import { StackItem, Node, UserTaste } from '../types';
import { StackIcon } from './Icons';

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
  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 animate-fade-in-down" style={{ animationDuration: '200ms' }} onClick={onClose}>
        <div className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-lg h-[80vh] max-h-[600px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <StackIcon className="text-primary !text-[18px]" />
                    <h3 className="text-lg font-medium text-white">My Stack ({stack.length})</h3>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none aspect-square">
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
            </header>
            <div className="flex-grow overflow-y-auto p-4 space-y-3">
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
                    [...stack].reverse().map(item => {
                        const isArtist = item.type === 'artist';
                        const normalizeId = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').trim();
                        const normalizedSeedSet = new Set(seedArtists.map(a => normalizeId(a)));
                        const isSeedArtist = isArtist && normalizedSeedSet.has(normalizeId(item.id));
                        
                        return (
                            <div key={item.id} className="group bg-zinc-900/60 border border-zinc-700/50 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-zinc-500 transition-colors">
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-md">{item.type}</span>
                                        <span className="text-[9px] text-zinc-600 font-mono">{new Date(item.dateSaved).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="text-lg font-medium text-white truncate">{item.id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h4>
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.link && (
                                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-primary hover:bg-primary/10 transition-colors" title="External Link">
                                            <span className="material-symbols-outlined !text-[18px]">public</span>
                                        </a>
                                    )}
                                    {isArtist && (
                                        <button 
                                            onClick={() => onAddArtist(item.id)}
                                            disabled={isSeedArtist}
                                            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 disabled:text-primary transition-colors active:text-primary disabled:cursor-not-allowed leading-none"
                                            title={isSeedArtist ? "Seed Artist" : "Add to Seeds"}
                                        >
                                            <span className="material-symbols-outlined !text-[18px]">
                                                {isSeedArtist ? 'check_circle' : 'add_circle'}
                                            </span>
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => { onView(item.id); onClose(); }}
                                        className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                        title="View on map"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">visibility</span>
                                    </button>
                                    <button 
                                        onClick={() => onRemove({ id: item.id, type: item.type as any, group: 0 })}
                                        className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        title="Remove from stack"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">delete</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors">
                    Cancel
                </button>
                <button onClick={onClose} className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90">
                    Done
                </button>
            </footer>
        </div>
    </div>
  );
};

import { AnimatePresence, motion } from 'framer-motion';

// --- Header Menu Dropdown Component ---
export const HeaderMenu: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (path: string) => void;
    isAdmin?: boolean;
    isGuest?: boolean;
    onRestartWalkthrough?: () => void;
}> = ({ isOpen, onClose, onNavigate, isAdmin, isGuest = false, onRestartWalkthrough }) => {
    if (!isOpen) return null;

    const menuItems = [
        { label: 'Help', icon: 'help', path: 'help' },
        ...(isAdmin ? [
            { label: 'Design System', icon: 'grid_view', path: 'design' },
            { label: 'Engine', icon: 'settings_input_component', path: 'engine' },
        ] : []),
        ...(!isGuest ? [
            { label: 'Discovery Ledger', icon: 'monitoring', path: 'analytics' },
        ] : []),
        { label: 'Instagram', icon: 'camera_alt', path: 'instagram', isExternal: true },
    ];

    return (
        <>
            <div className="fixed inset-0 z-[105]" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-[110] overflow-hidden p-1.5"
            >
                {menuItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => {
                            if (item.isExternal) {
                                window.open('https://instagram.com/zcene.io', '_blank');
                            } else {
                                onNavigate(item.path);
                            }
                            onClose();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors group"
                    >
                        <span className="material-symbols-outlined !text-[18px] text-zinc-500 group-hover:text-primary">{item.icon}</span>
                        {item.label}
                        {item.isExternal && <span className="material-symbols-outlined !text-[12px] ml-auto opacity-40">open_in_new</span>}
                    </button>
                ))}
                <div className="border-t border-zinc-800/80 my-1.5 pt-1.5">
                    <button
                        onClick={() => {
                            if (onRestartWalkthrough) {
                                onRestartWalkthrough();
                            } else {
                                try {
                                    localStorage.removeItem('zcene_onboarding_progress');
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            onClose();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors group"
                    >
                        <span className="material-symbols-outlined !text-[18px] text-zinc-500 group-hover:text-primary">restart_alt</span>
                        Restart Walkthrough
                    </button>
                </div>
            </motion.div>
        </>
    );
};

export const MyTasteDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  taste?: UserTaste;
  onSave: (taste: UserTaste) => Promise<void>;
}> = ({ isOpen, onClose, taste, onSave }) => {
  const [favoriteArtist, setFavoriteArtist] = useState(taste?.favoriteArtist || '');
  const [favoriteGenre, setFavoriteGenre] = useState(taste?.favoriteGenre || '');
  const [favoriteOrigin, setFavoriteOrigin] = useState(taste?.favoriteOrigin || '');
  const [eraMin, setEraMin] = useState<number | null>(taste?.eraMin ?? null);
  const [eraMax, setEraMax] = useState<number | null>(taste?.eraMax ?? null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if taste changes
  React.useEffect(() => {
    if (isOpen) {
      setFavoriteArtist(taste?.favoriteArtist || '');
      setFavoriteGenre(taste?.favoriteGenre || '');
      setFavoriteOrigin(taste?.favoriteOrigin || '');
      setEraMin(taste?.eraMin ?? null);
      setEraMax(taste?.eraMax ?? null);
    }
  }, [isOpen, taste]);

  if (!isOpen) return null;

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      await onSave({
        favoriteArtist,
        favoriteGenre,
        favoriteOrigin,
        eraMin,
        eraMax
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto" style={{ animationDuration: '200ms' }} onClick={onClose}>
      <div className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in-down" style={{ animationDuration: '200ms' }} onClick={e => e.stopPropagation()}>
        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">favorite</span>
            <h3 className="text-lg font-medium text-white">My Taste Profile</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Customize your permanent music taste. Deep Cut cards will display compatibility indicators based on these criteria.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Favourite Artist</label>
            <input 
              type="text" 
              placeholder="e.g. Turnstile"
              value={favoriteArtist}
              onChange={(e) => setFavoriteArtist(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Favorite Genre</label>
            <input 
              type="text" 
              placeholder="e.g. Hardcore Punk"
              value={favoriteGenre}
              onChange={(e) => setFavoriteGenre(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Favorite Origin</label>
            <input 
              type="text" 
              placeholder="e.g. Baltimore"
              value={favoriteOrigin}
              onChange={(e) => setFavoriteOrigin(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Founded Era Range (Years)</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <input 
                  type="number" 
                  placeholder="Min Year (e.g. 1990)"
                  value={eraMin ?? ''}
                  onChange={(e) => setEraMin(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>
              <div className="space-y-1">
                <input 
                  type="number" 
                  placeholder="Max Year (e.g. 2010)"
                  value={eraMax ?? ''}
                  onChange={(e) => setEraMax(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
          <button onClick={onClose} disabled={isSaving} className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
};

// --- Token Confirmation Interceptor Dialog Component ---
export const TokenConfirmationDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization' | 'live_tour_search' | 'live_synthesis';
  cost: number;
  cachedArtists: string[];
  missingArtists: string[];
  enrichmentArtists?: string[];
}> = ({ isOpen, onClose, onConfirm, type, cost, cachedArtists, missingArtists, enrichmentArtists }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 animate-fade-in-down" 
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
    >
      <div 
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
            <h3 className="text-base font-medium text-white">
              {type === 'live_synthesis' ? 'Confirm Live Synthesis' : 'Token Quota Warning'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

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
              <span className="text-primary font-bold">
                ${cost.toFixed(4)} / query
              </span>
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
                  Synthesis Required (${cost.toFixed(4)} / AI)
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
          {import.meta.env.DEV && (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Note: All live outbound API dispatches are completely short-circuited with a static JSON payload in sandbox mode to protect billing limits.
            </p>
          )}
        </div>

        <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
          <button 
            onClick={onClose} 
            className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined !text-[16px]">check</span>
            Confirm
          </button>
        </footer>
      </div>
    </div>
  );
};

export const CacheChoiceDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (choice: 'cache' | 'synthesis' | 'cancel') => void;
  artists: string[];
  cost: number;
}> = ({ isOpen, onClose, onSelect, artists, cost }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto" 
      style={{ animationDuration: '200ms' }}
      onClick={() => onSelect('cancel')}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-background-dark border border-zinc-700 rounded-none w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[20px]">layers</span>
            <h3 className="text-base font-semibold text-white tracking-wide">Select Spiderweb Depth</h3>
          </div>
          <button 
            onClick={() => onSelect('cancel')} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Existing cached data was found for this combination. Choose how you would like to synthesize your Zcene:
          </p>

          <div className="bg-zinc-900/40 p-3 border border-zinc-800/80 rounded-none space-y-2 mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
              Requested Artists
            </span>
            <div className="flex flex-wrap gap-1.5">
              {artists.map(artist => (
                <span key={artist} className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 border border-zinc-700/50 rounded-full">
                  {artist}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {/* Option A (Instant / Free) */}
            <button
              onClick={() => onSelect('cache')}
              className="w-full text-left p-4 bg-zinc-900/60 border border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800/40 transition-all rounded-xl group relative overflow-hidden flex items-start gap-4 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-zinc-700 transition-colors flex-shrink-0">
                <span className="material-symbols-outlined !text-[22px]">bolt</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                    Load standard cached layout
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-none border border-zinc-700">
                    Instant / Free
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Mounts the minimal cached spiderweb immediately from Firestore database records without burning live AI API credits.
                </p>
              </div>
            </button>

            {/* Option B (Recommended / Full AI Synthesis) */}
            <button
              onClick={() => onSelect('synthesis')}
              className="w-full text-left p-4 bg-primary/5 border border-primary/20 hover:border-primary/50 hover:bg-primary/10 transition-all rounded-xl group relative overflow-hidden flex items-start gap-4 cursor-pointer"
            >
              {/* Subtle background glow */}
              <div className="absolute inset-0 opacity-5 group-hover:opacity-10 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-primary via-transparent to-transparent pointer-events-none transition-opacity" />
              
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors flex-shrink-0">
                <span className="material-symbols-outlined !text-[22px]">auto_awesome</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                    Generate deep interconnected spiderweb
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-primary text-brand-black rounded-none">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                  Bypasses cache, skips existing layout limits, and dispatches queries to Gemini to synthesize a full, rich interconnected node network.
                </p>
                <div className="flex items-center gap-1 text-[10px] font-mono text-primary font-bold">
                  <span className="material-symbols-outlined !text-[12px]">payments</span>
                  <span>Est. Cost: ${cost.toFixed(4)} / query</span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <footer className="p-4 bg-zinc-900 border-t border-zinc-700 flex justify-end">
          <button 
            onClick={() => onSelect('cancel')} 
            className="px-4 py-2 text-zinc-400 hover:text-white text-sm rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </footer>
      </motion.div>
    </div>
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
    <div 
      className="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto"
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
    >
      <div 
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in-down"
        style={{ animationDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
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
        </header>

        <div className="flex-grow overflow-y-auto p-5 space-y-2 max-h-[60vh]">
          {tourDates.map((date, idx) => (
            <p key={idx} className="text-sm font-normal text-zinc-300 py-1.5 border-b border-zinc-800/40 last:border-0">
              • {date}
            </p>
          ))}
        </div>

        <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
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
  const cleanRationaleLines = rationale
    ? rationale.split('\n').filter(line => !line.trim().startsWith('['))
    : [];

  const formattedRationale = cleanRationaleLines.length > 0
    ? cleanRationaleLines.map((line, idx) => {
        if (line.trim().startsWith('-')) {
          return (
            <li key={idx} className="text-zinc-300 text-sm leading-relaxed ml-4 list-disc mt-1.5">
              {line.trim().substring(1).trim()}
            </li>
          );
        }
        return (
          <p key={idx} className="text-zinc-300 text-sm leading-relaxed mt-2">
            {line}
          </p>
        );
      })
    : <p className="text-zinc-500 text-sm">No reasoning chain captures available.</p>;

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto"
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
    >
      <div 
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in-down max-h-[85vh]"
        style={{ animationDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
            <h3 className="text-base font-medium text-white">Roots breakdown</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
            title="Close modal"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <div className="space-y-1.5">
              {formattedRationale}
            </div>
          </div>
        </div>

        <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 active:scale-95 transition-all duration-200"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};




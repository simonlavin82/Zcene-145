import React, { useState, useMemo } from 'react';
import { StackItem, Node, UserTaste } from '../types';
import { StackIcon } from './Icons';
import Markdown from 'react-markdown';
import { isNodeInSeedList } from '../services/artistCacheService';

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
                        const isSeedArtist = isArtist && isNodeInSeedList(item.id || (item as any).name || '', seedArtists);
                        
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
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Favorite Genre</label>
            <input 
              type="text" 
              placeholder="e.g. Hardcore Punk"
              value={favoriteGenre}
              onChange={(e) => setFavoriteGenre(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Favorite Origin</label>
            <input 
              type="text" 
              placeholder="e.g. Baltimore"
              value={favoriteOrigin}
              onChange={(e) => setFavoriteOrigin(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Founded Era Range (Years)</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <input 
                  type="number" 
                  placeholder="Min Year"
                  value={eraMin ?? ''}
                  onChange={(e) => setEraMin(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                />
              </div>
              <div className="space-y-1">
                <input 
                  type="number" 
                  placeholder="Max Year"
                  value={eraMax ?? ''}
                  onChange={(e) => setEraMax(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
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

  // 1. Convert non-standard '•' bullets (and any following newlines/spaces) to standard markdown '- '
  sanitizedRationale = sanitizedRationale.replace(/(^|\n)[ \t]*•[ \t]*[\n]*[ \t]*/g, '$1- ');

  // 2. Clean up stray newlines immediately following standard markdown list markers (- or *)
  sanitizedRationale = sanitizedRationale.replace(/(^|\n)([ \t]*[-*][ \t]*)[\n]+[ \t]*/g, '$1$2');

  const cleanRationaleLines = sanitizedRationale.split('\n').filter(line => {
    if (isFallback && line.trim().startsWith('[')) return false;
    return true;
  });

  const cleanRationaleMarkdown = cleanRationaleLines.join('\n');

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
            <div className="markdown-bio text-sm leading-relaxed text-zinc-300">
              <Markdown>{cleanRationaleMarkdown}</Markdown>
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
  onSelect: (choice: string | 'synthesis' | 'cancel') => void;
  isLiveAISuggestions?: boolean;
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
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-[1200] scrollbar-thin py-1">
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

export const DisambiguationModal: React.FC<DisambiguationModalProps> = ({
  isOpen,
  query,
  candidates,
  onSelect,
  isLiveAISuggestions,
}) => {
  const [overrideInput, setOverrideInput] = useState('');
  if (!isOpen) return null;

  // ── STATE A: Cache Miss (0 candidates in cache) ───────────────────────────
  if (candidates.length === 0) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down pointer-events-auto" style={{ animationDuration: '200ms' }} onClick={() => onSelect('cancel')}>
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (overrideInput.trim()) {
              onSelect(`override::${overrideInput.trim()}`);
            } else {
              onSelect('synthesis');
            }
          }} 
          className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-visible animate-fade-in-down relative z-[1150]" 
          style={{ animationDuration: '200ms' }} 
          onClick={e => e.stopPropagation()}
        >
          <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'auto_awesome' : 'psychology'}</span>
              <h3 className="text-lg font-medium text-white">
                {isLiveAISuggestions ? 'Live AI Validation' : 'Disambiguation'}
              </h3>
            </div>
            <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </header>

          <div className="p-5 flex flex-col gap-4 overflow-visible">
            <p className="text-sm text-zinc-400 leading-relaxed">
              {isLiveAISuggestions 
                ? <>No specific regional variants were identified for <span className="text-primary font-semibold">"{query}"</span> by the AI probe. Proceed by typing origin country below.</>
                : <>No cached records found for <span className="text-primary font-semibold">"{query}"</span>. This artist may be new to the platform, or multiple regional acts share this name.</>}
            </p>

            {isLiveAISuggestions && (
              <div className="flex flex-col gap-2 pt-1 overflow-visible">
                <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
              </div>
            )}
          </div>

          <footer className="p-3 sm:p-4 bg-zinc-900 border-t border-zinc-700 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onSelect('cancel')}
              className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-brand-black rounded-xl font-medium text-sm active:scale-95 transition-all shadow-md cursor-pointer whitespace-nowrap"
            >
              {isLiveAISuggestions 
                ? (overrideInput.trim() ? 'Proceed' : 'Proceed without origin')
                : (overrideInput.trim() ? 'Synthesize with override' : 'Search Live AI')}
            </button>
          </footer>
        </form>
      </div>
    );
  }

  // ── STATE B: Single Candidate — "Look What I Found" ──────────────────────
  // Cache returned 1 record. User confirms cached candidate card or requests live AI search.
  if (candidates.length === 1) {
    const cand = candidates[0];
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down pointer-events-auto" style={{ animationDuration: '200ms' }} onClick={() => onSelect('cancel')}>
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (overrideInput.trim()) {
              onSelect(`override::${overrideInput.trim()}`);
            } else {
              onSelect(cand.id);
            }
          }}
          className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-visible animate-fade-in-down relative z-[1150]" 
          style={{ animationDuration: '200ms' }} 
          onClick={e => e.stopPropagation()}
        >
          <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'auto_awesome' : 'travel_explore'}</span>
              <h3 className="text-lg font-medium text-white">
                {isLiveAISuggestions ? 'Live AI Validation' : 'Look What I Found'}
              </h3>
            </div>
            <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </header>

          <div className="p-5 flex flex-col gap-4 overflow-visible">
            <p className="text-sm text-zinc-400 leading-relaxed">
              {isLiveAISuggestions
                ? <>We ran a quick live check and found a distinct regional entity for <span className="text-primary font-semibold">"{query}"</span>. Is this the act you mean?</>
                : <>We found this in our index for <span className="text-primary font-semibold">"{query}"</span>. Is this the artist you're looking for?</>}
            </p>

            {/* Single candidate card — clicking accepts cached candidate */}
            <button
              type="button"
              onClick={() => onSelect(cand.id)}
              className="w-full text-left p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-700 hover:border-primary/50 transition-all duration-200 flex items-center gap-4 group rounded-xl"
            >
              <span className="material-symbols-outlined text-zinc-500 group-hover:text-primary transition-colors text-2xl flex-shrink-0">check_circle</span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-zinc-100 group-hover:text-primary font-semibold transition-colors text-sm truncate">
                  {cand.label || cand.id}
                </span>
                {(cand.genre || cand.origin) && (
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors uppercase tracking-wider font-semibold">
                    {cand.origin && <span>{cand.origin}</span>}
                    {cand.origin && cand.genre && <span>•</span>}
                    {cand.genre && <span>{cand.genre}</span>}
                  </div>
                )}
              </div>
              <span className="material-symbols-outlined text-zinc-600 group-hover:text-primary transition-colors text-[14px] ml-auto flex-shrink-0">
                arrow_forward_ios
              </span>
            </button>

            {isLiveAISuggestions && (
              <div className="flex flex-col gap-2 pt-1 overflow-visible">
                <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
              </div>
            )}
          </div>
          
          <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onSelect('cancel')}
              className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            {!isLiveAISuggestions ? (
              <button
                type="button"
                onClick={() => onSelect('synthesis')}
                className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">search</span>
                Not This One — Search Live AI
              </button>
            ) : (
              <button
                type="submit"
                className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all shadow-md cursor-pointer whitespace-nowrap"
              >
                {overrideInput.trim() ? 'Synthesize with override' : 'Confirm Selection'}
              </button>
            )}
          </footer>
        </form>
      </div>
    );
  }

  // ── STATE C: Multiple Cached Candidates — "Which Did You Mean?" ───────────
  // Cache returned >1 records. User selects one or requests live AI search.
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down pointer-events-auto" style={{ animationDuration: '200ms' }} onClick={() => onSelect('cancel')}>
      <form 
        onSubmit={(e) => { 
          e.preventDefault(); 
          if (overrideInput.trim()) {
            onSelect(`override::${overrideInput.trim()}`);
          } else {
            onSelect('synthesis');
          }
        }}
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-visible animate-fade-in-down relative z-[1150]" 
        style={{ animationDuration: '200ms' }} 
        onClick={e => e.stopPropagation()}
      >
        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary !text-[18px]">{isLiveAISuggestions ? 'auto_awesome' : 'psychology'}</span>
            <h3 className="text-lg font-medium text-white">
              {isLiveAISuggestions ? 'Live AI Validation' : 'Disambiguation'}
            </h3>
          </div>
          <button type="button" onClick={() => onSelect('cancel')} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none">
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

        <div className="p-5 flex flex-col gap-4 overflow-visible">
          <p className="text-sm text-zinc-400 leading-relaxed">
            {isLiveAISuggestions
              ? <>Our live model identified multiple regional entities matching <span className="text-primary font-semibold">"{query}"</span>. Please specify which one you mean to avoid token waste.</>
              : <>We found multiple distinct artists matching <span className="text-primary font-semibold">"{query}"</span>. Which one did you mean?</>}
          </p>

          <div className="flex flex-col gap-3 max-h-[240px] overflow-y-auto pr-1">
            {candidates.map((cand) => (
              <button
                type="button"
                key={cand.id}
                onClick={() => onSelect(cand.id)}
                className="w-full text-left p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-700 hover:border-primary/50 transition-all duration-200 flex flex-col gap-1 group rounded-xl"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-zinc-200 group-hover:text-primary font-medium transition-colors text-sm">
                    {cand.label || cand.id}
                  </span>
                  <span className="material-symbols-outlined text-zinc-600 group-hover:text-primary transition-colors text-[14px]">
                    arrow_forward_ios
                  </span>
                </div>
                {(cand.genre || cand.origin) && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors uppercase tracking-wider font-semibold">
                    {cand.origin && <span>{cand.origin}</span>}
                    {cand.origin && cand.genre && <span>•</span>}
                    {cand.genre && <span>{cand.genre}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>

          {isLiveAISuggestions && (
            <div className="flex flex-col gap-2 pt-1 overflow-visible">
              <CountryFilterDropdown value={overrideInput} onChange={setOverrideInput} />
            </div>
          )}
        </div>

        <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onSelect('cancel')}
            className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 active:scale-95 transition-all shadow-md cursor-pointer whitespace-nowrap"
          >
            {!isLiveAISuggestions && <span className="material-symbols-outlined !text-[16px]">search</span>}
            {isLiveAISuggestions 
              ? (overrideInput.trim() ? 'Proceed' : 'Proceed without origin')
              : (overrideInput.trim() ? 'Synthesize with override' : 'Search Live AI')}
          </button>
        </footer>
      </form>
    </div>
  );
};







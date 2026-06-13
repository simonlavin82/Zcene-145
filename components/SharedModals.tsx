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

  const seedArtistSet = new Set(seedArtists.map(a => a.toLowerCase()));

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
                        const isSeedArtist = isArtist && seedArtistSet.has(item.id.toLowerCase());
                        
                        return (
                            <div key={item.id} className="group bg-zinc-900/60 border border-zinc-700/50 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-zinc-500 transition-colors">
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-md">{item.type}</span>
                                        <span className="text-[9px] text-zinc-600 font-mono">{new Date(item.dateSaved).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="text-lg font-medium text-white truncate">{item.id}</h4>
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
    onRestartWalkthrough?: () => void;
}> = ({ isOpen, onClose, onNavigate, isAdmin, onRestartWalkthrough }) => {
    if (!isOpen) return null;

    const menuItems = [
        { label: 'Help', icon: 'help', path: 'help' },
        ...(isAdmin ? [
            { label: 'Design System', icon: 'grid_view', path: 'design' },
            { label: 'Engine', icon: 'settings_input_component', path: 'engine' },
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
  type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis';
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
            <h3 className="text-base font-medium text-white">Token Quota Warning</h3>
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
            You are initiating a net-new AI generation flow that requires contacting the live models.
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
          <p className="text-xs text-zinc-500 leading-relaxed">
            Note: All live outbound API dispatches are completely short-circuited with a static JSON payload in sandbox mode to protect billing limits.
          </p>
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



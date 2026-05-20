import React, { useState } from 'react';
import { StackItem, Node } from '../types';
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
            <footer className="p-4 bg-zinc-900 border-t border-zinc-700 flex justify-end">
                <button onClick={onClose} className="rounded-xl bg-primary px-6 py-2 text-sm font-medium text-brand-black transition-opacity hover:opacity-90">
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
        { label: 'Dashboard', icon: 'dashboard', path: 'dashboard' },
        { label: 'Help & FAQ', icon: 'help', path: 'help' },
        ...(isAdmin ? [
            { label: 'Design System', icon: 'grid_view', path: 'design' },
            { label: 'Engine', icon: 'settings_input_component', path: 'engine' },
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


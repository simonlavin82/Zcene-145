import React from 'react';
import { FaviconLogo, StackIcon, Spinner } from './Icons';
import { LayoutSizes } from './DesignSystem';
import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { UserTaste } from '../types';
import { Flame, ArrowLeft, MoreVertical } from 'lucide-react';

import { MyTasteDialog } from './SharedModals';

interface HeaderProps {
  user: User | null;
  onLogoClick: () => void;
  view: 'dashboard' | 'graph';
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  isSmallScreen: boolean;
  isMagazineViewOpen: boolean;
  stackCount: number;
  isStackNew: boolean;
  onOpenStack: () => void;
  onShare?: () => void;
  isSharing?: boolean;
  isCopied?: boolean;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  isAdmin?: boolean;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  isGuest?: boolean;
  onRestartWalkthrough?: () => void;
  userTaste?: UserTaste;
  onSaveTaste?: (taste: UserTaste) => Promise<void>;
  onLogin?: (onSuccess?: () => void) => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onLogoClick,
  view,
  projectName = "",
  onProjectNameChange,
  isSmallScreen,
  isMagazineViewOpen,
  stackCount,
  isStackNew,
  onOpenStack,
  onShare,
  isSharing,
  isCopied,
  onNavigate,
  onLogout,
  onDeleteAccount,
  isAdmin,
  isProfileOpen,
  setIsProfileOpen,
  isDeleteAccountModalOpen,
  setIsDeleteAccountModalOpen,
  isMenuOpen,
  setIsMenuOpen,
  isGuest = false,
  onRestartWalkthrough,
  userTaste,
  onSaveTaste,
  onLogin
}) => {
  const isDashboard = view === 'dashboard';

  const [isTasteDialogOpen, setIsTasteDialogOpen] = React.useState(false);
  const [localTaste, setLocalTaste] = React.useState<UserTaste>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpenTasteModal = () => setIsTasteDialogOpen(true);
    window.addEventListener('open-taste-modal', handleOpenTasteModal);
    return () => window.removeEventListener('open-taste-modal', handleOpenTasteModal);
  }, []);

  React.useEffect(() => {
    if (userTaste && Array.isArray(userTaste)) {
      setLocalTaste(userTaste);
    } else {
      try {
        const saved = localStorage.getItem('zcene_user_taste');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setLocalTaste(parsed);
          } else if (parsed && typeof parsed === 'object') {
            // Migration: Transform legacy single object to array
            const migrated: UserTaste = [{
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
              name: 'Style',
              color: 'purple',
              isActive: true,
              favoriteGenre: parsed.favoriteGenre || '',
              style: parsed.style || '',
              favoriteOrigin: parsed.favoriteOrigin || '',
              eraMin: parsed.eraMin ?? null,
              eraMax: parsed.eraMax ?? null
            }];
            localStorage.setItem('zcene_user_taste', JSON.stringify(migrated));
            setLocalTaste(migrated);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [userTaste]);

  const handleSaveTaste = async (taste: UserTaste) => {
    try {
      localStorage.setItem('zcene_user_taste', JSON.stringify(taste));
      setLocalTaste(taste);
      if (onSaveTaste) {
        await onSaveTaste(taste);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [localName, setLocalName] = React.useState(projectName);

  React.useEffect(() => {
    setLocalName(projectName);
  }, [projectName]);

  const handleCommit = React.useCallback(() => {
    const trimmed = localName.trim();
    if (trimmed === "") {
      const fallback = "Untitled Zcene";
      setLocalName(fallback);
      onProjectNameChange?.(fallback);
    } else if (trimmed !== projectName) {
      onProjectNameChange?.(trimmed);
    }
  }, [localName, projectName, onProjectNameChange]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setLocalName(projectName);
      e.currentTarget.blur();
    }
  }, [projectName]);

  return (
    <header className={`relative z-[100] flex-shrink-0 flex items-center pointer-events-none transition-all duration-300 ${isMagazineViewOpen ? 'hidden md:block h-0 opacity-0 overflow-hidden' : `${LayoutSizes.topHeader} ${isSmallScreen ? 'border-b border-zinc-700/50' : ''} px-4 sm:px-6 lg:px-8`} ${isMagazineViewOpen ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
        <div className="flex items-center w-full h-full">
            <div className="flex items-center flex-grow transition-all gap-2">
                <button 
                  onClick={onLogoClick} 
                  title={isDashboard ? "Back to landing" : "Back to dashboard"} 
                  className="flex-shrink-0 flex justify-center items-center appearance-none bg-transparent border-none outline-none focus:outline-none active:scale-95 cursor-pointer pointer-events-auto p-0 h-8 w-8 md:h-10 md:w-10" 
                  aria-label="Logo"
                >
                    {isDashboard ? (
                        <FaviconLogo className="h-full w-full text-primary pointer-events-none" />
                    ) : (
                        <ArrowLeft className="h-full w-full text-zinc-400 hover:text-white transition-colors pointer-events-none p-1" />
                    )}
                </button>
                
                <div className="flex items-center pointer-events-auto flex-grow max-w-[280px] sm:max-w-[320px] md:max-w-[480px]">
                  {isDashboard ? (
                    <h1 
                      onClick={onLogoClick}
                      className="hidden min-[385px]:block text-base md:text-lg font-medium text-white select-none cursor-pointer hover:text-primary transition-colors tracking-tight whitespace-nowrap"
                    >
                      Own Music Discovery
                    </h1>
                  ) : (
                    isGuest ? (
                      <h1 className={`text-white font-medium ${isSmallScreen ? 'text-base' : 'text-lg'} truncate tracking-tight`}>
                        {projectName || 'Untitled Project'}
                      </h1>
                    ) : (
                      <div className="relative inline-grid grid-cols-1 items-center max-w-full">
                        <span className={`invisible col-start-1 row-start-1 px-1.5 py-1 ${
                          isSmallScreen ? 'text-base' : 'text-lg'
                        } font-medium tracking-tight whitespace-pre`}>
                          {localName || "Untitled Project"}
                        </span>
                        <input
                          value={localName}
                          onChange={(e) => setLocalName(e.target.value)}
                          onBlur={handleCommit}
                          onKeyDown={handleKeyDown}
                          placeholder="Untitled Project"
                          className={`col-start-1 row-start-1 w-full bg-transparent text-white font-medium ${
                            isSmallScreen ? 'text-base' : 'text-lg'
                          } border border-transparent focus:ring-1 focus:ring-primary focus:bg-zinc-900/40 rounded-xl px-1.5 -mx-1.5 py-1 -my-1 placeholder:text-zinc-500 tracking-tight transition-all duration-200 focus:outline-none cursor-text`}
                          title="Rename Project"
                        />
                      </div>
                    )
                  )}
                </div>
            </div>
            
            <div className="flex-shrink-0 flex items-center pointer-events-auto transition-all duration-300 justify-end gap-2 lg:gap-3 pr-0">
            <button 
                onClick={() => {
                  if (!user) {
                    onLogin?.();
                    return;
                  }
                  setIsTasteDialogOpen(true);
                }}
                className={`h-8 hidden md:flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50 relative pl-2 pr-3 gap-2`} 
                title="Style"
            >
                <Flame size={18} />
                <span className="text-xs font-medium">Style</span>
            </button>

            <button 
                onClick={() => {
                  if (!user) {
                    onLogin?.();
                    return;
                  }
                  onOpenStack();
                }}
                className={`h-8 hidden md:flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50 relative pl-2 pr-3 gap-2`} 
                title="My Stack"
            >
                <StackIcon className="!text-[18px]" />
                <span className="text-xs font-medium">My Stack</span>
                {stackCount > 0 && (
                    <span className={`absolute -top-1 -right-1 h-4.5 w-4.5 rounded-md flex items-center justify-center text-[9px] font-bold border shadow-sm transition-all duration-500 ${isStackNew ? 'bg-zinc-900 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                        {stackCount}
                    </span>
                )}
            </button>

            {!isDashboard && onShare && !isSmallScreen && (
              <button 
                  onClick={onShare} 
                  disabled={isSharing}
                  className={`h-8 flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50 relative disabled:opacity-50 disabled:cursor-not-allowed pl-2 pr-3 gap-2`} 
                  title="Share Zcene"
              >
                  <span className="material-symbols-outlined !text-[18px]">{isCopied ? 'check' : 'share'}</span>
                  <span className="text-xs font-medium">Share</span>
                  {isCopied && <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-brand-black text-[10px] font-bold py-1 px-2 rounded-md whitespace-nowrap shadow-xl">Link Copied</span>}
              </button>
            )}

            {/* Mobile Overflow Menu Button */}
            {isSmallScreen && (
                <div className="relative">
                    <button 
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50"
                        title="Menu"
                    >
                        <MoreVertical size={18} />
                        {stackCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background-dark"></span>
                        )}
                    </button>
                    
                    <AnimatePresence>
                      {isMobileMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsMobileMenuOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 top-full mt-2 w-48 z-50 overflow-hidden rounded-xl border border-white/10 bg-brand-black shadow-2xl shadow-black pointer-events-auto text-left animate-fade-in-down antialiased flex flex-col py-1"
                          >
                            {onShare && (
                              <>
                                <button
                                  onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    onShare();
                                  }}
                                  disabled={isSharing}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined !text-[16px] text-zinc-500">share</span>
                                  Share
                                </button>
                                <div className="border-t border-zinc-800 w-full" />
                              </>
                            )}
                            <button
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                if (!user) onLogin?.(); else setIsTasteDialogOpen(true);
                              }}
                              className="w-full text-left px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all flex items-center gap-3"
                            >
                              <Flame size={16} className="text-zinc-500" />
                              Style
                            </button>
                            <button
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                if (!user) onLogin?.(); else onOpenStack();
                              }}
                              className="w-full text-left px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <StackIcon className="!text-[16px] text-zinc-500" />
                                My Stack
                              </div>
                              {stackCount > 0 && (
                                <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  {stackCount}
                                </span>
                              )}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                </div>
            )}

            {/* Profile Icon (Desktop and Mobile) */}
            <div className="flex items-center gap-3 ml-1 relative">
                <button 
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="group relative flex items-center justify-center pointer-events-auto"
                    aria-label="Open profile menu"
                >
                    {user ? (
                        user.photoURL ? (
                            <img 
                                src={user.photoURL} 
                                alt={user.displayName || 'User'} 
                                className="w-8 h-8 rounded-full border border-primary/50 hover:scale-110 transition-transform"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-primary/50 flex items-center justify-center text-[10px] font-bold text-primary hover:scale-110 transition-transform">
                                {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                            </div>
                        )
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 hover:border-primary/50 flex items-center justify-center text-zinc-400 hover:text-primary hover:scale-110 transition-all">
                            <span className="material-symbols-outlined !text-[18px]">account_circle</span>
                        </div>
                    )}
                    {user && (
                        <div className="absolute -bottom-1 -right-1 bg-green-500 w-2.5 h-2.5 rounded-full border-2 border-background-dark"></div>
                    )}
                </button>

                <AnimatePresence>
                  {isProfileOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-56 z-20 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black pointer-events-auto text-left antialiased"
                      >
                        {user ? (
                          <div className="px-3 py-2.5 border-b border-white/5">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Authenticated Account</p>
                            <p className="text-xs font-medium text-zinc-200 truncate">{user.email}</p>
                          </div>
                        ) : (
                          <div className="px-3 py-2.5 border-b border-white/5">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Guest Account</p>
                            <p className="text-xs font-medium text-zinc-400 truncate">Not Signed In</p>
                          </div>
                        )}

                        {!user && onLogin && (
                          <div className="p-1 border-b border-white/5">
                            <button
                              onClick={() => { setIsProfileOpen(false); onLogin(); }}
                              className="w-full bg-white text-brand-black rounded-xl px-4 py-2 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95 text-xs font-semibold cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[14px] text-black font-bold">login</span>
                              Sign In with Google
                            </button>
                          </div>
                        )}
                        <div className="p-1">
                          <button
                            onClick={() => { setIsProfileOpen(false); onNavigate('help'); }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                          >
                            <span className="material-symbols-outlined !text-[16px] text-zinc-500">help</span>
                            Help
                          </button>

                          {isAdmin && (
                            <>
                              <button
                                onClick={() => { setIsProfileOpen(false); onNavigate('design'); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-zinc-500">grid_view</span>
                                Design System
                              </button>
                              <button
                                onClick={() => { setIsProfileOpen(false); onNavigate('engine'); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-zinc-500">settings_input_component</span>
                                Engine
                              </button>
                            </>
                          )}

                          {!isGuest && (
                            <button
                              onClick={() => { setIsProfileOpen(false); onNavigate('analytics'); }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                            >
                              <span className="material-symbols-outlined !text-[16px] text-zinc-500">monitoring</span>
                              Discovery Ledger
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setIsProfileOpen(false);
                              window.open('https://instagram.com/zcene.io', '_blank');
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                          >
                            <span className="material-symbols-outlined !text-[16px] text-zinc-500">camera_alt</span>
                            Instagram
                            <span className="material-symbols-outlined !text-[10px] ml-auto opacity-40">open_in_new</span>
                          </button>

                          <button
                            onClick={() => {
                              setIsProfileOpen(false);
                              if (onRestartWalkthrough) {
                                onRestartWalkthrough();
                              } else {
                                try {
                                  localStorage.removeItem('zcene_onboarding_progress');
                                } catch (e) {
                                  console.error(e);
                                }
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                          >
                            <span className="material-symbols-outlined !text-[16px] text-zinc-500">restart_alt</span>
                            Restart Walkthrough
                          </button>
                        </div>

                        {user && (
                          <>
                            <div className="border-t border-zinc-800/80 my-1.5" />
                            <div className="p-1">
                              <button
                                onClick={() => { setIsProfileOpen(false); onLogout(); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-zinc-500">logout</span>
                                Sign Out
                              </button>
                              <div className="border-t border-zinc-800/80 my-1.5" />
                              <button
                                onClick={() => { setIsProfileOpen(false); setIsDeleteAccountModalOpen(true); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/10 transition-all rounded-lg flex items-center gap-2 group"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-[#ef4444]">delete_forever</span>
                                Delete Account
                              </button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
            </div>
            </div>
        </div>
        <MyTasteDialog 
            isOpen={isTasteDialogOpen} 
            onClose={() => setIsTasteDialogOpen(false)} 
            taste={localTaste} 
            onSave={handleSaveTaste} 
        />
    </header>
  );
};

export default Header;

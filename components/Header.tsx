import React from 'react';
import { FaviconLogo, StackIcon, Spinner } from './Icons';
import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';

import { HeaderMenu } from './SharedModals';

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
  onRestartWalkthrough
}) => {
  const isDashboard = view === 'dashboard';

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
    <header className={`relative z-[100] flex-shrink-0 flex items-center pointer-events-none transition-all duration-300 ${isMagazineViewOpen ? 'hidden md:block h-0 opacity-0 overflow-hidden' : (isSmallScreen ? 'h-16 px-4' : 'h-16 px-6 lg:px-8')} ${isMagazineViewOpen ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
        <div className="flex items-center w-full h-full">
            <div className="flex items-center flex-grow transition-all gap-2">
                <button 
                  onClick={onLogoClick} 
                  title={isDashboard ? "Back to landing" : "Back to dashboard"} 
                  className="flex-shrink-0 flex justify-center items-center appearance-none bg-transparent border-none outline-none focus:outline-none active:scale-95 cursor-pointer pointer-events-auto p-0 h-10 w-10" 
                  aria-label="Logo"
                >
                    <FaviconLogo className="h-full w-full text-primary pointer-events-none" />
                </button>
                
                <div className="flex items-center pointer-events-auto flex-grow max-w-[160px] sm:max-w-[320px] md:max-w-[480px]">
                  {isDashboard ? (
                    <h1 
                      onClick={onLogoClick}
                      className={`truncate ${isSmallScreen ? 'text-base' : 'text-lg'} font-medium text-white select-none cursor-pointer hover:text-primary transition-colors tracking-tight`}
                    >
                      Own Music Discovery
                    </h1>
                  ) : (
                    isGuest ? (
                      <h1 className={`text-white font-medium ${isSmallScreen ? 'text-base' : 'text-lg'} truncate tracking-tight`}>
                        {projectName || 'Untitled Project'}
                      </h1>
                    ) : (
                      <input
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        onBlur={handleCommit}
                        onKeyDown={handleKeyDown}
                        placeholder="Untitled Project"
                        size={Math.max(1, localName.length || 1)}
                        className={`bg-transparent text-white font-medium ${
                          isSmallScreen ? 'text-base' : 'text-lg'
                        } border border-transparent focus:ring-1 focus:ring-primary focus:bg-zinc-900/40 rounded-xl px-1.5 -mx-1.5 py-1 -my-1 placeholder:text-zinc-500 tracking-tight transition-all duration-200 focus:outline-none cursor-text`}
                        title="Rename Project"
                      />
                    )
                  )}
                </div>
            </div>
            
            <div className="flex-shrink-0 flex items-center pointer-events-auto transition-all duration-300 justify-end gap-2 lg:gap-3 pr-0">
            <button 
                onClick={onOpenStack}
                className={`h-8 flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50 relative ${isSmallScreen ? 'w-8' : 'pl-2 pr-3 gap-2'}`} 
                title="My Stack"
            >
                <StackIcon className="!text-[18px]" />
                {!isSmallScreen && <span className="text-xs font-medium">My Stack</span>}
                {stackCount > 0 && (
                    <span className={`absolute -top-1 -right-1 h-4.5 w-4.5 rounded-md flex items-center justify-center text-[9px] font-bold border shadow-sm transition-all duration-500 ${isStackNew ? 'bg-brand-black text-primary border-primary/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                        {stackCount}
                    </span>
                )}
            </button>

            {!isDashboard && onShare && (
              <button 
                  onClick={onShare} 
                  disabled={isSharing}
                  className={`h-8 flex flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 transition-colors leading-none shadow-lg border border-zinc-700/50 relative disabled:opacity-50 disabled:cursor-not-allowed ${isSmallScreen ? 'w-8' : 'pl-2 pr-3 gap-2'}`} 
                  title="Share Zcene"
              >
                  <span className="material-symbols-outlined !text-[18px]">{isCopied ? 'check' : 'share'}</span>
                  {!isSmallScreen && <span className="text-xs font-medium">Share</span>}
                  {isCopied && <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-brand-black text-[10px] font-bold py-1 px-2 rounded-md whitespace-nowrap shadow-xl">Link Copied</span>}
              </button>
            )}

            <div className="relative">
                <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)} 
                    className={`h-8 flex flex-shrink-0 items-center justify-center rounded-xl transition-colors shadow-lg border border-zinc-700/50 ${isMenuOpen ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'} ${isSmallScreen ? 'w-8' : 'pl-2 pr-3 gap-2'}`} 
                    title="Menu"
                >
                    <span className="material-symbols-outlined !text-[18px]">settings</span>
                    {!isSmallScreen && <span className="text-xs font-medium">Settings</span>}
                </button>
                <HeaderMenu 
                    isOpen={isMenuOpen}
                    onClose={() => setIsMenuOpen(false)}
                    onNavigate={onNavigate}
                    isAdmin={isAdmin}
                    onRestartWalkthrough={onRestartWalkthrough}
                />
            </div>


            {user && (
                <div className="flex items-center gap-3 ml-1 relative">
                    <button 
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="group relative flex items-center justify-center pointer-events-auto"
                        aria-label="Open profile menu"
                    >
                        {user.photoURL ? (
                            <img 
                                src={user.photoURL} 
                                alt={user.displayName || 'User'} 
                                className="w-8 h-8 rounded-full border border-primary/50 hover:scale-110 transition-transform"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-primary/50 flex items-center justify-center text-[10px] font-bold text-primary hover:scale-110 transition-transform">
                                {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                            </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-green-500 w-2.5 h-2.5 rounded-full border-2 border-background-dark"></div>
                    </button>

                    <AnimatePresence>
                      {isProfileOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 top-full mt-2 w-56 z-20 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black pointer-events-auto"
                          >
                            <div className="px-3 py-2.5 border-b border-white/5">
                              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Authenticated Account</p>
                              <p className="text-xs font-medium text-zinc-200 truncate">{user.email}</p>
                            </div>
                            <div className="p-1">
                              <button
                                onClick={() => { setIsProfileOpen(false); onLogout(); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-zinc-500">logout</span>
                                Sign Out
                              </button>
                              <div className="border-t border-zinc-800/80 my-1.5" />
                              <button
                                onClick={() => { setIsProfileOpen(false); setIsDeleteAccountModalOpen(true); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/10 transition-all rounded-lg flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined !text-[16px] text-[#ef4444]">delete_forever</span>
                                Delete Account
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                </div>
            )}
            </div>
        </div>
    </header>
  );
};

export default Header;

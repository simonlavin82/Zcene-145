
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { View } from '../types';
import { User } from '../services/firebase';
import { ZceneLogo, InstagramIcon } from './Icons';
import ExampleMusicGraph from './ExampleMusicGraph';
import HeroBackgroundGraph from './HeroBackgroundGraph';
import CollectionIntelligenceVisual from './CollectionIntelligenceVisual';
import ArtistFeatureVisual from './ArtistFeatureVisual';
import AdSenseUnit from './AdSenseUnit';
import { analyticsService } from '../services/analyticsService';

interface HomePageProps {
  onNavigate: (view: View) => void;
  hasExistingGraph?: boolean;
  isActive: boolean;
  user: User | null;
  isAuthInitialized: boolean;
  onLogin: (onSuccess?: () => void) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  onRestartWalkthrough?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate, hasExistingGraph = false, isActive, user, isAuthInitialized, onLogin, onLogout, isAdmin, onRestartWalkthrough }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastInteractionRef = useRef<{ count: number; time: number }>({ count: 0, time: 0 });

  const scrollToNearestCTA = () => {
    const ctas = document.querySelectorAll('.cta-button');
    if (ctas.length === 0) return;

    let nearest: Element | null = null;
    let minDistance = Infinity;

    ctas.forEach(cta => {
      const rect = cta.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = cta;
      }
    });

    if (nearest) {
      (nearest as Element).scrollIntoView({ behavior: 'smooth', block: 'center' });
      const el = nearest as HTMLElement;
      el.classList.add('ring-4', 'ring-primary', 'ring-offset-4', 'ring-offset-background-dark');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-primary', 'ring-offset-4', 'ring-offset-background-dark');
      }, 2000);
    }
  };

  const handleVisualInteraction = () => {
    const now = Date.now();
    const { count, time } = lastInteractionRef.current;
    
    if (now - time > 2000) {
      lastInteractionRef.current = { count: 1, time: now };
    } else {
      const newCount = count + 1;
      lastInteractionRef.current = { count: newCount, time: now };
      
      if (newCount >= 3) {
        scrollToNearestCTA();
        lastInteractionRef.current = { count: 0, time: 0 };
      }
    }
  };

  useEffect(() => {
    const handleHashScroll = () => {
      const isMerch = window.location.pathname === '/merch' || 
                      window.location.hash === '#/merch' || 
                      window.location.hash === '#merch';
      if (isActive && containerRef.current && isMerch) {
        const merchEl = document.getElementById('merch');
        if (merchEl) {
          const topPos = merchEl.offsetTop;
          containerRef.current.scrollTo({ top: topPos, behavior: 'smooth' });
        }
      }
    };

    if (isActive && containerRef.current) {
      const isMerch = window.location.pathname === '/merch' || 
                      window.location.hash === '#/merch' || 
                      window.location.hash === '#merch';
      if (isMerch) {
        handleHashScroll();
      } else {
        containerRef.current.scrollTo(0, 0);
      }
    }

    window.addEventListener('hashchange', handleHashScroll);
    window.addEventListener('popstate', handleHashScroll);
    return () => {
      window.removeEventListener('hashchange', handleHashScroll);
      window.removeEventListener('popstate', handleHashScroll);
    };
  }, [isActive]);

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const scrollToSupport = () => {
    const supportEl = document.getElementById('support');
    if (supportEl && containerRef.current) {
      const topPos = supportEl.offsetTop;
      containerRef.current.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  };

  const handleShareSite = async () => {
    if (isSharing) return;
    
    const baseUrl = window.location.origin + window.location.pathname;
    analyticsService.track('Share Initiated', { type: 'home_footer' });

    if (navigator.share) {
        setIsSharing(true);
        try {
            // Native share is instant to trigger but we want to clear the state 
            // once triggered so the underlying UI isn't spinning indefinitely
            const shareData = {
                title: 'Zcene - Own Music Discovery',
                text: 'Check out Zcene, the most immersive music discovery app to visualize your collection.',
                url: baseUrl,
            };
            setIsSharing(false);
            await navigator.share(shareData);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Native share failed", err);
            }
        } finally {
            setIsSharing(false);
        }
    } else {
        try {
            await navigator.clipboard.writeText(baseUrl);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Clipboard copy failed", err);
        }
    }
  };

  return (
    <div ref={containerRef} className="h-full w-full bg-background-dark text-zinc-200 font-display relative overflow-y-auto">
      {/* Hero Visual Container: Image + Fade constrained to 100vh */}
      <div className="absolute top-0 left-0 w-full h-screen z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-60">
            <HeroBackgroundGraph />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background-dark/20 via-background-dark/80 to-background-dark"></div>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 px-4 sm:px-6 lg:px-8 z-20">
        <div className="flex items-center justify-between py-3 sm:py-4 lg:py-5">
          <div onClick={scrollToTop} className="cursor-pointer">
            <ZceneLogo className="h-8 w-auto text-primary" />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={scrollToSupport}
              className="rounded-xl border border-primary bg-transparent px-4 py-1.5 font-medium text-primary transition-colors hover:bg-primary/20 text-sm"
            >
              Support
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="group relative flex items-center justify-center transition-all hover:opacity-90"
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
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 z-20 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black text-left font-display antialiased"
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
                            onClick={() => {
                              setIsProfileOpen(false);
                              onLogin(() => {
                                onNavigate(hasExistingGraph ? View.Dashboard : View.Graph);
                              });
                            }}
                            className="w-full bg-primary text-black rounded-xl px-4 py-2 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95 text-xs font-semibold cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px] text-black font-bold">login</span>
                            Sign In with Google
                          </button>
                        </div>
                      )}

                      <div className="p-1">
                        <button
                          onClick={() => { setIsProfileOpen(false); onNavigate(View.Help); }}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                        >
                          <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">help</span>
                          Help
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              onClick={() => { setIsProfileOpen(false); onNavigate(View.StyleGuide); }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                            >
                              <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">grid_view</span>
                              Design System
                            </button>
                            <button
                              onClick={() => { setIsProfileOpen(false); onNavigate(View.Engine); }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                            >
                              <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">settings_input_component</span>
                              Engine
                            </button>
                          </>
                        )}

                        {user && (
                          <button
                            onClick={() => { setIsProfileOpen(false); onNavigate(View.Analytics); }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                          >
                            <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">monitoring</span>
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
                          <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">camera_alt</span>
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
                          <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">restart_alt</span>
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
                              <span className="material-symbols-outlined !text-[16px] text-zinc-500 group-hover:text-primary">logout</span>
                              Sign Out
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
      </header>

      {/* Main Content */}
      <main className="z-10 relative">
        {/* Hero Section */}
        <section className="flex items-center justify-center min-h-screen text-center relative">
            <div className="container mx-auto px-4 py-32 sm:px-6 lg:px-8">
                <div className="w-full max-w-4xl mx-auto space-y-8">
                    <h1 className="text-4xl sm:text-5xl md:text-7xl font-medium tracking-tighter text-white">
                        <span className="whitespace-nowrap">Be the Author of Your</span><br />
                        <span className="text-primary whitespace-nowrap">Own Music Discovery</span>
                    </h1>
                    <h2 className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto">
                        Zcene lets you explore music through a <span className="text-white">visual spiderweb</span> map, revealing connections across genres, labels, scenes and eras.
                    </h2>
                    <div className="flex flex-col items-center gap-4">
                        <button
                          onClick={() => {
                            if (!user) {
                              onLogin(() => {
                                onNavigate(hasExistingGraph ? View.Dashboard : View.Graph);
                              });
                            } else {
                              onNavigate(hasExistingGraph ? View.Dashboard : View.Graph);
                            }
                          }}
                          className="cta-button rounded-2xl bg-primary px-8 py-4 text-base sm:text-lg font-medium text-brand-black transition-all hover:scale-105 shadow-xl shadow-primary/20 active:scale-95"
                        >
                          {hasExistingGraph ? 'Resume Your Zcene' : 'Create Your Zcene'}
                        </button>
                        <p className="text-base text-zinc-500">Completely Free. Start by signing in with Google.</p>
                        {!user && <p className="text-xs text-zinc-600 font-normal mt-1">We collect your email address via Google Sign-In to manage your account.</p>}
                    </div>
                </div>
            </div>

            {/* Scroll Indicator */}
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                    duration: 1.5, 
                    repeat: Infinity, 
                    repeatType: "reverse",
                    ease: "easeInOut"
                }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-400 opacity-70"
            >
                <span className="text-[9px] font-bold uppercase tracking-[0.3em] ml-[0.3em]">Scroll</span>
                <span className="material-symbols-outlined !text-[20px]">expand_more</span>
            </motion.div>
        </section>

        {/* Feature: Artists (Zinc 900) */}
        <section className="py-24 sm:py-32 bg-zinc-900/50 border-y border-zinc-800/50">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center space-y-8">
                    <h2 className="text-4xl sm:text-6xl font-medium text-white tracking-tighter uppercase">Artists</h2>
                    <h3 className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                        Instead of endless playlists, <span className="text-white font-medium">navigate your taste</span>, uncover hidden connections, and discover artists that genuinely fit your sound.
                    </h3>
                </div>
                <div 
                    onClick={handleVisualInteraction}
                    className="mt-16 max-w-4xl mx-auto shadow-[0_0_50px_rgba(0,0,0,0.3)] flex flex-col items-center cursor-default pointer-events-auto"
                >
                    <ArtistFeatureVisual />
                </div>
            </div>
        </section>

        {/* Feature: Spiderweb (Background Dark) */}
        <section id="features" className="py-24 sm:py-32 bg-background-dark">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center space-y-12">
                    <div className="space-y-8">
                        <h2 className="text-4xl sm:text-5xl md:text-6xl font-medium text-white tracking-tighter uppercase">Spiderweb</h2>
                        <h3 className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                            Don’t just browse your collection, <span className="text-white font-medium">explore it visually</span> with an immersive spiderweb map. <span className="text-white font-medium">You're in control</span>, toggle seed artists, recommendations, labels, genres, origins and eras.
                        </h3>
                    </div>
                </div>
                <div 
                    onClick={handleVisualInteraction}
                    className="mt-16 max-w-4xl mx-auto flex flex-col items-center cursor-default pointer-events-auto"
                >
                    <ExampleMusicGraph />
                </div>
            </div>
        </section>

        {/* Feature: Deep Cut (Zinc 900) */}
        <section className="py-24 sm:py-32 bg-zinc-900/50 border-y border-zinc-800/50">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center space-y-12">
                    <div className="space-y-8">
                        <h2 className="text-4xl sm:text-6xl font-medium text-white tracking-tighter uppercase">Deep Cut</h2>
                        <h3 className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                            Dig deeper into the artists you love, add new ones, and explore <span className="text-white font-medium">bios, connections, discogs</span> and external links. This is how you <span className="text-white font-medium">curate</span> your next music journey.
                        </h3>
                    </div>
                </div>
                <div 
                    onClick={handleVisualInteraction}
                    className="mt-16 max-w-4xl mx-auto shadow-[0_0_50px_rgba(0,0,0,0.3)] flex flex-col items-center cursor-default pointer-events-auto"
                >
                    <CollectionIntelligenceVisual />
                </div>
            </div>
        </section>

        {/* Support Section (Background Dark) */}
        <section id="support" className="py-20 sm:py-32 bg-background-dark">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-5xl font-medium text-white tracking-tight mb-4">Support The Zcene</h2>
            <h3 className="text-zinc-400 max-w-xl mx-auto mb-12 text-base">
              Zcene is <span className="text-white font-medium">free</span> and built independently. If you find it useful, please consider supporting its future.
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
                {/* Left Card: Buy Me a Coffee */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 space-y-8 flex flex-col rounded-none shadow-xl">
                    <div className="flex-grow space-y-4">
                        <h4 className="text-2xl font-bold text-white uppercase tracking-tight">Buy Me a Coffee</h4>
                        <p className="text-zinc-400 text-base leading-relaxed">
                            A simple, friendly way to help keep the servers running and the code flowing.
                        </p>
                    </div>
                    <a
                      href="https://buymeacoffee.com/zcene"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 self-start hover:scale-105 transition-transform"
                    >
                      <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" className="h-14 w-auto shadow-lg" />
                    </a>
                </div>

                {/* Right Card: T-shirt */}
                <div id="merch" className="relative bg-zinc-900/50 border-2 border-primary p-8 space-y-8 flex flex-col rounded-none shadow-xl shadow-primary/5">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-brand-black px-4 py-1 rounded-none text-[10px] font-black tracking-[0.2em] uppercase shadow-lg">
                        ZCENESTER
                    </div>
                    <div className="flex-grow space-y-4">
                        <h4 className="text-2xl font-bold text-white uppercase tracking-tight">Buy a T-Shirt</h4>
                        <p className="text-zinc-400 text-base leading-relaxed">
                            Represent the community with exclusive, high-quality Zcene T-shirts.
                        </p>
                        <p className="text-zinc-500 text-sm italic">
                            Message me directly to purchase your t-shirt on Instagram.
                        </p>
                    </div>
                    <a
                      href="https://www.instagram.com/zcene.online/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start rounded-xl bg-primary px-8 py-3.5 text-sm font-medium text-brand-black hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                    >
                      Order via Instagram
                    </a>
                </div>
            </div>

            <div className="mt-20 border-t border-zinc-700/50 pt-12">
                <div className="text-zinc-500 text-xs text-center">
                    <div 
                        className="mx-auto flex justify-center items-center lg:hidden cursor-pointer" 
                        style={{ minHeight: '66px' }}
                        onClickCapture={(e) => {
                            e.preventDefault();
                            onNavigate(View.Home);
                            const merchEl = document.getElementById('merch');
                            if (merchEl) {
                                merchEl.scrollIntoView({ behavior: 'smooth' });
                            } else {
                                window.location.hash = 'merch';
                            }
                        }}
                    >
                        <AdSenseUnit
                            adClient="ca-pub-9665950244000141"
                            adSlot="3666473373"
                            style={{ display: 'inline-block', width: '320px', height: '50px' }}
                            customImageUrl="https://storage.googleapis.com/zcene-prod-assets/Zcene%20App%20Mobile%20(slim).png"
                            linkUrl="#merch"
                        />
                    </div>
                    <div 
                        className="hidden mx-auto lg:flex justify-center items-center cursor-pointer" 
                        style={{ minHeight: '90px' }}
                        onClickCapture={(e) => {
                            e.preventDefault();
                            onNavigate(View.Home);
                            const merchEl = document.getElementById('merch');
                            if (merchEl) {
                                merchEl.scrollIntoView({ behavior: 'smooth' });
                            } else {
                                window.location.hash = 'merch';
                            }
                        }}
                    >
                        <AdSenseUnit
                            adClient="ca-pub-9665950244000141"
                            adSlot="3666473373"
                            style={{ display: 'inline-block', width: '728px', height: '90px' }}
                            customImageUrl="https://storage.googleapis.com/zcene-prod-assets/Zcene%20App%20Desktop.png"
                            linkUrl="#merch"
                        />
                    </div>
                </div>
            </div>

          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 sm:py-32 bg-primary">
             <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-brand-black text-center space-y-6">
                    <h2 className="text-3xl sm:text-5xl font-medium tracking-tight">Ready to See Music Differently?</h2>
                    <h3 className="text-base text-black/70 max-w-xl mx-auto">
                        Experience a <span className="font-bold text-brand-black">more immersive</span> way to discover music. Start exploring your Zcene now.
                    </h3>
                    <button
                        onClick={() => {
                          if (!user) {
                            onLogin(() => {
                              onNavigate(hasExistingGraph ? View.Dashboard : View.Graph);
                            });
                          } else {
                            onNavigate(hasExistingGraph ? View.Dashboard : View.Graph);
                          }
                        }}
                        className="cta-button rounded-2xl bg-brand-black px-8 py-4 text-base sm:text-lg font-medium text-white transition-all hover:scale-105 hover:bg-neutral-800 inline-block active:scale-95"
                    >
                        {hasExistingGraph ? 'Resume Your Zcene' : 'Create Your Zcene'}
                    </button>
                    {!user && <p className="text-xs text-black/50 font-normal">We collect your email address via Google Sign-In to manage your account.</p>}
                </div>
             </div>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-zinc-900">
        <div className="container mx-auto">
            <div className="flex flex-col items-center gap-8">
                <div onClick={scrollToTop} className="cursor-pointer">
                    <ZceneLogo className="h-8 w-auto text-primary" />
                </div>
                <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-medium">
                    <button onClick={scrollToTop} className="hover:text-primary transition-colors">Home</button>
                    <button onClick={() => onNavigate(View.Graph)} className="hover:text-primary transition-colors">App</button>
                    <button onClick={() => onNavigate(View.Help)} className="hover:text-primary transition-colors">Help</button>
                    {isAdmin && (
                        <>
                            <button onClick={() => onNavigate(View.StyleGuide)} className="hover:text-primary transition-colors">Design System</button>
                            <button onClick={() => onNavigate(View.Engine)} className="hover:text-primary transition-colors">Engine</button>
                        </>
                    )}
                </nav>
                <div className="flex items-center gap-4 relative">
                    <a href="https://www.instagram.com/zcene.online/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <InstagramIcon className="w-5 h-5 hover:text-primary transition-colors" />
                    </a>
                    <div className="relative">
                        <button 
                            onClick={handleShareSite} 
                            disabled={isSharing}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors relative"
                            title="Share Zcene"
                        >
                            <span className="material-symbols-outlined !text-[18px]">{isCopied ? 'check' : 'share'}</span>
                        </button>
                        {isCopied && (
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-brand-black text-[10px] font-bold py-1 px-2 rounded-none whitespace-nowrap shadow-xl">
                                Link Copied
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-8 border-t border-zinc-600/50 pt-8 text-center">
                <p>© 2026 Zcene. All Rights Reserved.</p>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

import React, { useState } from 'react';
import { View } from '../types';
import { ZceneLogo, InstagramIcon } from './Icons';
import {
  ZCENE_SUPPORT_EMAIL,
  ZCENE_SUPPORT_MAILTO,
  ZCENE_INSTAGRAM_URL
} from '../shared/tokenEconomy';
import { analyticsService } from '../services/analyticsService';

export interface GlobalFooterProps {
  onNavigate: (view: View) => void;
  isAdmin?: boolean;
  showShare?: boolean;
  className?: string;
  currentView?: View;
}

export const GlobalFooter: React.FC<GlobalFooterProps> = ({
  onNavigate,
  isAdmin = false,
  showShare = false,
  className = '',
  currentView
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (currentView === View.Home) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onNavigate(View.Home);
    }
  };

  const handleShareSite = async () => {
    const baseUrl = window.location.origin + window.location.pathname;
    analyticsService.track('Share Initiated', { type: 'global_footer' });

    if (navigator.share) {
      setIsSharing(true);
      try {
        const shareData = {
          title: 'Zcene - Own Music Discovery',
          text: 'Check out Zcene, the most immersive music discovery app to visualize your collection.',
          url: baseUrl,
        };
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Native share failed', err);
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
        console.error('Clipboard copy failed', err);
      }
    }
  };

  return (
    <footer className={`w-full bg-zinc-950 border-t border-zinc-800/60 text-zinc-400 text-sm z-10 relative ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        {/* Multi-Column Desktop Grid / Mobile Stack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 items-center md:items-start text-center md:text-left">
          
          {/* 1. Left / Brand */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <button 
              onClick={handleHomeClick} 
              className="cursor-pointer group transition-opacity hover:opacity-90 inline-flex items-center gap-2"
              aria-label="Zcene Home"
            >
              <ZceneLogo className="h-7 w-auto text-primary" />
            </button>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              Independent, ad-free visual music discovery engine. Pay-as-you-go token curation and shared scene exploration.
            </p>
          </div>

          {/* 2. Center / Navigation */}
          <div className="flex flex-col items-center justify-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-semibold">
              Navigation
            </span>
            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
              <button 
                onClick={handleHomeClick} 
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Home
              </button>
              <button 
                onClick={() => onNavigate(View.Graph)} 
                className="hover:text-primary transition-colors cursor-pointer"
              >
                App
              </button>
              <button 
                onClick={() => onNavigate(View.Help)} 
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Help
              </button>
              {isAdmin && (
                <>
                  <button 
                    onClick={() => onNavigate(View.StyleGuide)} 
                    className="hover:text-primary transition-colors cursor-pointer"
                  >
                    Design System
                  </button>
                  <button 
                    onClick={() => onNavigate(View.Engine)} 
                    className="hover:text-primary transition-colors cursor-pointer"
                  >
                    Engine
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* 3. Right / Support & Community */}
          <div className="flex flex-col items-center md:items-end gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-semibold">
              Support & Community
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Official Support:</span>
              <a 
                href={ZCENE_SUPPORT_MAILTO} 
                className="text-zinc-300 hover:text-primary transition-colors underline underline-offset-4 font-mono"
              >
                {ZCENE_SUPPORT_EMAIL}
              </a>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <a 
                href={ZCENE_INSTAGRAM_URL} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-primary hover:border-zinc-700 transition-all cursor-pointer"
                aria-label="Instagram"
              >
                <InstagramIcon className="w-4 h-4" />
              </a>
              {showShare && (
                <div className="relative">
                  <button 
                    onClick={handleShareSite} 
                    disabled={isSharing}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-primary hover:border-zinc-700 transition-all cursor-pointer relative"
                    title="Share Zcene"
                    aria-label="Share Zcene"
                  >
                    <span className="material-symbols-outlined !text-[16px]">{isCopied ? 'check' : 'share'}</span>
                  </button>
                  {isCopied && (
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-brand-black text-[9px] font-bold py-0.5 px-1.5 rounded whitespace-nowrap shadow-md pointer-events-none">
                      Copied
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Base / Legal Divider */}
        <div className="mt-12 pt-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <p>© 2026 Zcene. All Rights Reserved.</p>
          <p className="font-mono text-[11px] text-zinc-600">v42.8 • Own Music Discovery</p>
        </div>
      </div>
    </footer>
  );
};

export default GlobalFooter;


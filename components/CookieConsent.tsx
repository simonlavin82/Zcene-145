import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { analyticsService } from '../services/analyticsService';

export const CookieConsent: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const status = localStorage.getItem('zcene_cookie_consent');
    if (!status) {
      // Small delay for a clean entry animation
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleChoice = (granted: boolean) => {
    analyticsService.updateConsent(granted);
    setShowBanner(false);
    
    if (granted) {
      analyticsService.track('Cookie Consent Accepted');
    }
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[380px] z-[9999] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 p-4 shadow-2xl flex flex-col gap-4 font-sans rounded-none"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-primary font-mono text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined !text-[14px]">security</span>
              <span>telemetry: pending_consent</span>
            </div>
            <p className="font-poppins text-xs text-zinc-300 leading-relaxed font-normal">
              Zcene uses privacy-friendly Google Analytics telemetry to measure how users interact with discovery web maps. No personal info is tracked. 
            </p>
          </div>
          
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={() => handleChoice(false)}
              className="text-zinc-500 hover:text-zinc-300 font-poppins text-xs transition-colors hover:underline cursor-pointer bg-transparent border-none py-1"
            >
              Decline
            </button>
            <button
              onClick={() => handleChoice(true)}
              className="rounded-xl bg-white hover:opacity-90 text-brand-black px-4 py-2 font-poppins font-medium text-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              Accept Telemetry
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;

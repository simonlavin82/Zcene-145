import React from 'react';
import { Lottie } from 'lottie-react';
import { motion } from 'motion/react';
import zceneAnimation from '../src/assets/animations/zcene-full-v5.json';

interface SplashScreenProps {
  className?: string;
}

/**
 * Premium Fullscreen Lottie Splash Screen
 * Masks Firebase Auth resolution and Firestore project synchronization.
 * Loops the 60fps Figma vector equalizer animation, fading out smoothly
 * when the application state is fully populated.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ className = '' }) => {
  return (
    <motion.div
      key="zcene-splash-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center select-none overflow-hidden ${className}`}
      style={{
        backgroundColor: '#111113',
        backgroundImage: 'radial-gradient(circle at center, rgba(30, 30, 35, 0.7) 0%, rgba(17, 17, 19, 1) 80%)'
      }}
      aria-label="Loading Zcene..."
      role="status"
    >
      <div className="relative w-[240px] sm:w-[304px] max-w-[70vw] aspect-[335/170] flex items-center justify-center">
        <Lottie
          src={zceneAnimation}
          loop={true}
          autoplay={true}
          style={{ width: '100%', height: '100%' }}
          rendererSettings={{
            preserveAspectRatio: 'xMidYMid meet'
          }}
        />
      </div>
    </motion.div>
  );
};

export default SplashScreen;

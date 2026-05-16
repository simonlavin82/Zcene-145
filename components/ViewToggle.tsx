import React from 'react';
import { motion } from 'motion/react';

type FocusMode = 'organic' | 'cluster';

interface ViewToggleProps {
  value: FocusMode;
  onChange: (value: FocusMode) => void;
  className?: string;
}

/**
 * ViewToggle Component
 * A 2-way toggle switch for switching between 'Organic' and 'Cluster' graph layouts.
 * Uses a sliding background pill for smooth transitions.
 */
const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange, className = "" }) => {
  return (
    <div className={`flex items-center bg-zinc-900/60 border border-zinc-700 rounded-xl p-0.5 backdrop-blur-sm relative ${className}`}>
      {/* Sliding Background Pill */}
      <motion.div
        className="absolute top-0.5 left-0.5 h-8 w-8 bg-zinc-800 rounded-[10px] shadow-inner ring-1 ring-zinc-700"
        initial={false}
        animate={{
          x: value === 'organic' ? 0 : 32, // 32px is the width of one button (w-8)
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 35
        }}
      />

      <button
        onClick={() => onChange('organic')}
        className={`flex items-center justify-center w-8 h-8 rounded-[10px] transition-colors relative z-10 active:scale-95 ${
          value === 'organic' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Organic View"
        aria-label="Organic View"
      >
        <span className="material-symbols-outlined !text-[18px]">hub</span>
      </button>

      <button
        onClick={() => onChange('cluster')}
        className={`flex items-center justify-center w-8 h-8 rounded-[10px] transition-colors relative z-10 active:scale-95 ${
          value === 'cluster' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Cluster View"
        aria-label="Cluster View"
      >
        <span className="material-symbols-outlined !text-[18px]">bubble_chart</span>
      </button>
    </div>
  );
};

export default ViewToggle;

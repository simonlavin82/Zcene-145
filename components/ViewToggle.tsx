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
 * A 2-way icon-only segmented toggle for switching between 'Organic' and 'Cluster' graph layouts.
 * Design spec: rounded-[6px] container — a soft pill distinct from 0px brutalist containers.
 * The active state is a tight square background badge that neatly wraps the single active icon.
 */
const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange, className = "" }) => {
  return (
    <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 rounded-[6px] p-0.5 relative ${className}`}>
      {/* Tight Square Sliding Badge */}
      <motion.div
        className="absolute top-0.5 left-0.5 w-8 h-8 bg-zinc-800 rounded-[4px] shadow-inner ring-1 ring-zinc-600/50"
        initial={false}
        animate={{
          x: value === 'organic' ? 0 : 32,
        }}
        transition={{
          type: 'spring',
          stiffness: 480,
          damping: 38,
        }}
      />

      <button
        onClick={() => onChange('organic')}
        className={`flex items-center justify-center w-8 h-8 rounded-[4px] transition-colors relative z-10 active:scale-95 ${
          value === 'organic' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Organic View"
        aria-label="Organic View"
      >
        <span className="material-symbols-outlined !text-[18px]">hub</span>
      </button>

      <button
        onClick={() => onChange('cluster')}
        className={`flex items-center justify-center w-8 h-8 rounded-[4px] transition-colors relative z-10 active:scale-95 ${
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

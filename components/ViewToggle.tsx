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
 * A 2-way segmented pill toggle for switching between 'Organic' and 'Cluster' graph layouts.
 * Uses a sliding background badge for smooth micro-interaction transitions.
 * Design spec: rounded-[6px] container + pill — distinct from 0px brutalist containers.
 */
const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange, className = "" }) => {
  return (
    <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 rounded-[6px] p-0.5 relative ${className}`}>
      {/* Sliding Background Badge */}
      <motion.div
        className="absolute top-0.5 bottom-0.5 bg-zinc-800 rounded-[4px] shadow-inner ring-1 ring-zinc-600/50"
        initial={false}
        animate={{
          left: value === 'organic' ? '2px' : '50%',
          right: value === 'organic' ? '50%' : '2px',
        }}
        transition={{
          type: "spring",
          stiffness: 480,
          damping: 38
        }}
      />

      <button
        onClick={() => onChange('organic')}
        className={`flex items-center justify-center gap-1.5 px-3 h-7 rounded-[4px] transition-colors relative z-10 active:scale-95 text-xs font-medium ${
          value === 'organic' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Organic View"
        aria-label="Organic View"
      >
        <span className="material-symbols-outlined !text-[14px]">hub</span>
        Organic
      </button>

      <button
        onClick={() => onChange('cluster')}
        className={`flex items-center justify-center gap-1.5 px-3 h-7 rounded-[4px] transition-colors relative z-10 active:scale-95 text-xs font-medium ${
          value === 'cluster' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Cluster View"
        aria-label="Cluster View"
      >
        <span className="material-symbols-outlined !text-[14px]">bubble_chart</span>
        Cluster
      </button>
    </div>
  );
};

export default ViewToggle;

import React from 'react';
import { motion } from 'motion/react';

type FocusMode = 'organic' | 'cluster';

export interface ToggleOption<T extends string> {
  id: T;
  icon: string;
  label: string;
}

interface ViewToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options?: [ToggleOption<T>, ToggleOption<T>];
  className?: string;
}

const defaultOptions: [ToggleOption<any>, ToggleOption<any>] = [
  { id: 'organic', icon: 'hub', label: 'Organic View' },
  { id: 'cluster', icon: 'bubble_chart', label: 'Cluster View' }
];

/**
 * ViewToggle Component
 * A 2-way icon-only segmented toggle for switching between 'Organic' and 'Cluster' graph layouts (or Grid/List).
 * Design spec: rounded-xl premium outer container with concentric rounded-lg button frames and rounded-[6px] sliding active badge.
 * Distinct from 0px brutalist layout containers — soft, tactile, intentional.
 */
const ViewToggle = <T extends string>({ 
  value, 
  onChange, 
  options = defaultOptions as any,
  className = "" 
}: ViewToggleProps<T>) => {
  const isFirst = value === options[0].id;
  
  return (
    <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 rounded-xl p-0.5 relative ${className}`}>
      {/* Square Sliding Active Badge */}
      <motion.div
        className="absolute top-0.5 left-0.5 w-8 h-8 bg-zinc-800 rounded-[6px] shadow-inner ring-1 ring-zinc-600/50"
        initial={false}
        animate={{
          x: isFirst ? 0 : 32,
        }}
        transition={{
          type: 'spring',
          stiffness: 480,
          damping: 38,
        }}
      />

      <button
        onClick={() => onChange(options[0].id)}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors relative z-10 active:scale-95 ${
          value === options[0].id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title={options[0].label}
        aria-label={options[0].label}
      >
        <span className="material-symbols-outlined !text-[18px]">{options[0].icon}</span>
      </button>

      <button
        onClick={() => onChange(options[1].id)}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors relative z-10 active:scale-95 ${
          value === options[1].id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title={options[1].label}
        aria-label={options[1].label}
      >
        <span className="material-symbols-outlined !text-[18px]">{options[1].icon}</span>
      </button>
    </div>
  );
};

export default ViewToggle;

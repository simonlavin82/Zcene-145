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
 * Concentric with our softened 16px structural layout containers — soft, tactile, intentional.
 */
const ViewToggle = <T extends string>({ 
  value, 
  onChange, 
  options = defaultOptions as any,
  className = "" 
}: ViewToggleProps<T>) => {
  const isFirst = value === options[0].id;
  
  return (
    <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 rounded-xl overflow-hidden relative h-[38px] shrink-0 ${className}`}>
      {/* Square Sliding Active Badge */}
      <motion.div
        className="absolute top-0 left-0 w-9 h-9 bg-zinc-800"
        initial={false}
        animate={{
          x: isFirst ? 0 : 36,
          borderRadius: isFirst ? "11px 0px 0px 11px" : "0px 11px 11px 0px"
        }}
        transition={{
          type: 'spring',
          stiffness: 480,
          damping: 38,
        }}
      />

      <button
        onClick={() => onChange(options[0].id)}
        className={`flex items-center justify-center w-9 h-9 transition-colors relative z-10 active:scale-95 ${
          value === options[0].id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title={options[0].label}
        aria-label={options[0].label}
      >
        <span className="material-symbols-outlined !text-[18px]">{options[0].icon}</span>
      </button>

      <button
        onClick={() => onChange(options[1].id)}
        className={`flex items-center justify-center w-9 h-9 transition-colors relative z-10 active:scale-95 ${
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

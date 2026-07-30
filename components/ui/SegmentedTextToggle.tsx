import React from 'react';
import { motion } from 'motion/react';
import { RADIUS_TOKENS } from '../../types';

export interface TextToggleOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedTextToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: [TextToggleOption<T>, TextToggleOption<T>];
  className?: string;
}

export const SegmentedTextToggle = <T extends string>({
  value,
  onChange,
  options,
  className = "",
}: SegmentedTextToggleProps<T>) => {
  const isFirst = value === options[0].id;
  
  return (
    <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 p-0.5 relative w-[200px] h-9 select-none ${RADIUS_TOKENS.toggle} ${className}`}>
      {/* Sliding Active Badge */}
      <motion.div
        className="absolute top-0.5 left-0.5 bottom-0.5 w-[96px] bg-zinc-800 rounded-[6px] shadow-inner ring-1 ring-zinc-700/50"
        initial={false}
        animate={{ x: isFirst ? 0 : 98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
      />
      <button
        onClick={() => onChange(options[0].id)}
        className={`w-[96px] h-8 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-[11px] uppercase tracking-wider font-semibold outline-none focus:outline-none ${RADIUS_TOKENS.button} ${
          isFirst ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {options[0].label}
      </button>
      <button
        onClick={() => onChange(options[1].id)}
        className={`w-[96px] h-8 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-[11px] uppercase tracking-wider font-semibold outline-none focus:outline-none ml-[2px] ${RADIUS_TOKENS.button} ${
          !isFirst ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {options[1].label}
      </button>
    </div>
  );
};

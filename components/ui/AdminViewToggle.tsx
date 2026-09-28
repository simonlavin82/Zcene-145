import React from 'react';
import { motion } from 'motion/react';
import { RADIUS_TOKENS } from '../../types';

interface AdminViewToggleProps {
    value: boolean;
    onChange: (v: boolean) => void;
}

export const AdminViewToggle = ({ value, onChange }: AdminViewToggleProps) => {
    const isFirst = !value; // Admin View active (simulateNormalUser = false)
    return (
        <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 p-0.5 relative w-[176px] h-9 select-none ${RADIUS_TOKENS.toggle}`}>
            {/* Sliding Active Badge */}
            <motion.div
                className="absolute top-0.5 left-0.5 bottom-0.5 w-[84px] bg-zinc-800 rounded-[10px] shadow-inner ring-1 ring-zinc-700/50"
                initial={false}
                animate={{ x: isFirst ? 0 : 84 }}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            />
            <button
                onClick={() => onChange(false)}
                className={`w-[84px] h-8 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-xs font-semibold outline-none focus:outline-none rounded-[10px] ${
                    !value ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                Admin
            </button>
            <button
                onClick={() => onChange(true)}
                className={`w-[84px] h-8 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-xs font-semibold outline-none focus:outline-none rounded-[10px] ${
                    value ? 'text-white' : 'text-zinc-550 hover:text-zinc-300'
                }`}
            >
                Preview
            </button>
        </div>
    );
};

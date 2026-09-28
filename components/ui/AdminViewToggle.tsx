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
        <div className={`flex items-center bg-zinc-950 border border-zinc-700/80 overflow-hidden relative w-[176px] h-[38px] select-none ${RADIUS_TOKENS.toggle}`}>
            {/* Sliding Active Badge */}
            <motion.div
                className="absolute top-0 left-0 w-[87px] h-9 bg-zinc-800"
                initial={false}
                animate={{ 
                    x: isFirst ? 0 : 87,
                    borderRadius: isFirst ? "11px 0px 0px 11px" : "0px 11px 11px 0px"
                }}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            />
            <button
                onClick={() => onChange(false)}
                className={`w-[87px] h-9 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-xs font-semibold outline-none focus:outline-none ${
                    !value ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                Admin
            </button>
            <button
                onClick={() => onChange(true)}
                className={`w-[87px] h-9 flex items-center justify-center transition-colors relative z-10 active:scale-95 text-xs font-semibold outline-none focus:outline-none ${
                    value ? 'text-white' : 'text-zinc-550 hover:text-zinc-300'
                }`}
            >
                Preview
            </button>
        </div>
    );
};

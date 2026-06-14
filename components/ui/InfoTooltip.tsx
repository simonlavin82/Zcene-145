import React from 'react';

interface InfoTooltipProps {
    content: string;
}

export const InfoTooltip = ({ content }: InfoTooltipProps) => {
    return (
        <div className="group relative inline-block ml-1.5 cursor-help select-none">
            <span className="material-symbols-outlined text-zinc-500 hover:text-zinc-300 text-xs leading-none">
                info
            </span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 leading-normal font-sans text-center normal-case tracking-normal">
                {content}
            </div>
        </div>
    );
};

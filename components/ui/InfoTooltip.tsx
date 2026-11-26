import React from 'react';

interface InfoTooltipProps {
    content: string;
    align?: 'center' | 'right' | 'left';
}

export const InfoTooltip = ({ content, align = 'center' }: InfoTooltipProps) => {
    const positionClass =
        align === 'right'
            ? 'right-0 text-left'
            : align === 'left'
                ? 'left-0 text-left'
                : 'left-1/2 -translate-x-1/2 text-center';

    return (
        <div className="group relative inline-flex items-center ml-1.5 select-none">
            <button
                type="button"
                aria-label={content}
                className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-300 focus:text-zinc-200 focus:outline-none cursor-help leading-none"
            >
                <span className="material-symbols-outlined text-xs leading-none">
                    info
                </span>
            </button>
            <div
                role="tooltip"
                data-align={align}
                className={`absolute bottom-full ${positionClass} mb-2 w-48 max-w-[calc(100vw-2rem)] bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200 pointer-events-none z-50 leading-normal font-sans normal-case tracking-normal`}
            >
                {content}
            </div>
        </div>
    );
};

import React, { useCallback, useRef, useState } from 'react';

interface InfoTooltipProps {
    content: string;
    align?: 'center' | 'right' | 'left';
    className?: string;
}

const VIEWPORT_EDGE_PADDING_PX = 16;

export const InfoTooltip = ({ content, align = 'center', className = '' }: InfoTooltipProps) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [shiftX, setShiftX] = useState(0);

    const clampToViewport = useCallback(() => {
        if (typeof window === 'undefined' || !tooltipRef.current) return;
        const el = tooltipRef.current;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return;

        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        if (!viewportWidth) return;

        // Read the committed shift directly from the DOM node so back-to-back
        // mouseEnter -> focus -> click events on touch taps never double-shift.
        const appliedShift = Number(el.dataset.appliedShift || 0);
        const naturalLeft = rect.left - appliedShift;
        const naturalRight = rect.right - appliedShift;

        let nextShift = 0;
        if (naturalLeft < VIEWPORT_EDGE_PADDING_PX) {
            nextShift = VIEWPORT_EDGE_PADDING_PX - naturalLeft;
        } else if (naturalRight > viewportWidth - VIEWPORT_EDGE_PADDING_PX) {
            nextShift = (viewportWidth - VIEWPORT_EDGE_PADDING_PX) - naturalRight;
        }

        if (naturalLeft + nextShift < VIEWPORT_EDGE_PADDING_PX) {
            nextShift = VIEWPORT_EDGE_PADDING_PX - naturalLeft;
        }

        const roundedShift = Math.round(nextShift);
        setShiftX((prev) => (prev === roundedShift ? prev : roundedShift));
    }, []);

    const positionClass =
        align === 'right'
            ? 'right-0 text-left'
            : align === 'left'
                ? 'left-0 text-left'
                : 'left-1/2 text-center';

    const tooltipTransform =
        align === 'center'
            ? shiftX !== 0
                ? `translateX(calc(-50% + ${shiftX}px))`
                : 'translateX(-50%)'
            : shiftX !== 0
                ? `translateX(${shiftX}px)`
                : undefined;

    return (
        <div
            className={`group relative inline-flex items-center ml-1.5 select-none ${className}`.trim()}
            onMouseEnter={clampToViewport}
        >
            <button
                type="button"
                aria-label={content}
                onFocus={clampToViewport}
                onClick={clampToViewport}
                className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-300 focus:text-zinc-200 focus:outline-none cursor-help leading-none"
            >
                <span className="material-symbols-outlined text-xs leading-none">
                    info
                </span>
            </button>
            <div
                ref={tooltipRef}
                role="tooltip"
                data-align={align}
                data-applied-shift={shiftX}
                style={tooltipTransform ? { transform: tooltipTransform } : undefined}
                className={`absolute bottom-full ${positionClass} mb-2 w-48 max-w-[calc(100vw-2rem)] bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity duration-200 pointer-events-none z-50 leading-normal font-sans normal-case tracking-normal`}
            >
                {content}
            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';

/**
 * Unified compact-table viewport hook.
 * Switches multi-column tables into connected solid-dark stacked rows below `breakpoint` (default 1024px)
 * so narrow tablets (768px–1023px, where Tailwind `container` caps at 720px usable width) never clip columns,
 * while leaving global `isSmallScreen` (< 768px) untouched for Header, ToolbarSearch, and GraphPage.
 */
export function useCompactTable(isSmallScreen: boolean, breakpoint = 1024): boolean {
  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsBelowBreakpoint(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isSmallScreen || isBelowBreakpoint;
}

export interface DesktopRowOptions {
  interactive?: boolean;
  isLast?: boolean;
}

export interface StackedRowOptions {
  hasTopHeader?: boolean;
  isFirstOverall?: boolean;
  isLastOverall?: boolean;
  interactive?: boolean;
  nested?: boolean;
  noTopBorder?: boolean;
}

export const DATA_TABLE_TOKENS = {
  frame: 'w-full rounded-2xl border border-zinc-800 bg-zinc-900',
  nestedFrame: 'w-full rounded-xl border border-zinc-800 bg-zinc-900',
  theadRow: 'border-b border-zinc-800 bg-zinc-950 text-[10px] text-zinc-400 uppercase tracking-widest font-semibold',
  th: 'py-3.5 px-3.5 font-semibold whitespace-nowrap',
  nestedTh: 'py-2.5 px-3 font-semibold whitespace-nowrap',
  tbody: 'bg-zinc-900',
  primaryTitle: 'text-sm font-medium text-white',
  subtitle: 'text-[11px] text-zinc-500',
  monoCell: 'text-xs font-mono tabular-nums',
  zebraBg: (index: number) => (index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40'),
  getDesktopRowClass: (index: number, options: DesktopRowOptions = {}) => {
    const { interactive = false, isLast = false } = options;
    return [
      index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40',
      isLast ? 'border-b-0' : 'border-b border-zinc-800/30 last:border-b-0',
      'transition-colors hover:bg-white/5',
      interactive ? 'cursor-pointer' : '',
    ]
      .filter(Boolean)
      .join(' ');
  },
  getStackedRowClass: (index: number, total: number, options: StackedRowOptions = {}) => {
    const {
      hasTopHeader = false,
      isFirstOverall,
      isLastOverall,
      interactive = false,
      nested = false,
      noTopBorder = false,
    } = options;
    const first = isFirstOverall !== undefined ? isFirstOverall : !hasTopHeader && index === 0;
    const last = isLastOverall !== undefined ? isLastOverall : index === total - 1;
    const topRadius = nested ? 'rounded-t-[11px]' : 'rounded-t-[15px]';
    const bottomRadius = nested ? 'rounded-b-[11px]' : 'rounded-b-[15px]';

    return [
      index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40',
      !noTopBorder && index > 0 ? 'border-t border-zinc-800/50' : '',
      first ? topRadius : '',
      last ? bottomRadius : '',
      'transition-colors',
      interactive ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : '',
    ]
      .filter(Boolean)
      .join(' ');
  },
} as const;

export interface ResponsiveTableFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  mode: 'desktop' | 'mobile';
  variant?: 'primary' | 'nested';
  children: React.ReactNode;
}

export const ResponsiveTableFrame: React.FC<ResponsiveTableFrameProps> = ({
  mode,
  variant = 'primary',
  className = '',
  children,
  ...rest
}) => {
  const baseFrame = variant === 'nested' ? DATA_TABLE_TOKENS.nestedFrame : DATA_TABLE_TOKENS.frame;
  const overflowClass = mode === 'desktop' ? 'overflow-x-auto' : '';
  return (
    <div className={`${baseFrame} ${overflowClass} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
};

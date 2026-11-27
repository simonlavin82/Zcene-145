import React from 'react';

export const PROJECT_TABLE_COLUMNS = [
  { key: 'title', label: 'Title', align: 'left' as const },
  { key: 'modifiedDate', label: 'Modified Date', align: 'left' as const },
  { key: 'roots', label: 'Roots', align: 'left' as const },
  { key: 'artists', label: 'Artists', align: 'left' as const },
  { key: 'labels', label: 'Labels', align: 'left' as const },
  { key: 'deepCuts', label: 'Deep Cuts', align: 'left' as const },
  { key: 'status', label: 'Status', align: 'left' as const },
  { key: 'actions', label: 'Actions', align: 'right' as const },
] as const;

export interface ProjectMetricPillProps {
  children: React.ReactNode;
  variant?: 'card' | 'table' | 'table-inline';
  muted?: boolean;
}

export const ProjectMetricPill: React.FC<ProjectMetricPillProps> = ({
  children,
  variant = 'table',
  muted = false,
}) => {
  if (variant === 'card') {
    return (
      <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-2 py-0.5 bg-zinc-900/50 rounded-full border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
        {children}
      </span>
    );
  }
  if (variant === 'table-inline') {
    return (
      <span className="text-[10px] uppercase tracking-widest text-zinc-300 font-bold px-2 py-0.5 bg-zinc-900/50 rounded-full border border-white/10 font-mono whitespace-nowrap">
        {children}
      </span>
    );
  }
  if (muted) {
    return (
      <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 py-0.5 bg-zinc-900 rounded-full border border-white/5 font-mono whitespace-nowrap">
        {children}
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
      {children}
    </span>
  );
};

export interface ProjectStatusBadgeProps {
  status?: string;
  isActiveCuration?: boolean;
  daysLeft?: number;
  variant?: 'card' | 'table';
}

export const ProjectStatusBadge: React.FC<ProjectStatusBadgeProps> = ({
  status,
  isActiveCuration = false,
  daysLeft = 30,
  variant = 'table',
}) => {
  if (status === 'trashed') {
    if (variant === 'card') {
      return (
        <span className="text-[9px] uppercase tracking-wide text-amber-300 font-bold px-1.5 py-0.5 bg-amber-950/60 rounded-md border border-amber-500/40 font-mono whitespace-nowrap backdrop-blur-sm w-fit mt-0.5">
          {daysLeft} {daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT
        </span>
      );
    }
    return (
      <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20 whitespace-nowrap font-mono">
        {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
      </span>
    );
  }

  if (status === 'curating' || status === 'pending' || isActiveCuration) {
    if (variant === 'card') {
      return (
        <span className="text-[9px] uppercase tracking-wider text-amber-500/80 font-bold px-1.5 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/10 whitespace-nowrap animate-pulse backdrop-blur-sm w-fit mt-0.5">
          Mapping...
        </span>
      );
    }
    return (
      <span className="text-[10px] uppercase tracking-wider text-amber-500/80 font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/10 whitespace-nowrap animate-pulse">
        Mapping...
      </span>
    );
  }

  if (status === 'failed') {
    if (variant === 'card') {
      return (
        <span className="text-[9px] uppercase tracking-wider text-red-500/80 font-bold px-1.5 py-0.5 bg-red-500/10 rounded-md border border-red-500/10 whitespace-nowrap backdrop-blur-sm w-fit mt-0.5">
          Failed
        </span>
      );
    }
    return (
      <span className="text-[10px] uppercase tracking-wider text-red-500/80 font-bold px-2 py-0.5 bg-red-500/10 rounded-md border border-red-500/10 whitespace-nowrap">
        Failed
      </span>
    );
  }

  if (status === 'completed') {
    if (variant === 'card') {
      return null;
    }
    return (
      <span className="text-[10px] uppercase tracking-widest text-primary/70 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20 whitespace-nowrap">
        Mapped
      </span>
    );
  }

  if (variant === 'card') {
    return (
      <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800/80 rounded-md border border-zinc-700/60 font-mono whitespace-nowrap backdrop-blur-sm w-fit mt-0.5">
        Unmapped
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-800 whitespace-nowrap">
      Unmapped
    </span>
  );
};

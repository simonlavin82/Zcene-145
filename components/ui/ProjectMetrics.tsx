import React from 'react';

export const PROJECT_TABLE_COLUMNS = [
  { key: 'title', label: 'Title', align: 'left' as const, headerClassName: 'pl-4 pr-3' },
  { key: 'modified', label: 'Modified', align: 'left' as const, headerClassName: 'px-3 whitespace-nowrap' },
  { key: 'scenes', label: 'Scenes', align: 'center' as const, headerClassName: 'px-2.5 whitespace-nowrap' },
  { key: 'roots', label: 'Roots', align: 'center' as const, headerClassName: 'px-2.5 whitespace-nowrap' },
  { key: 'artists', label: 'Artists', align: 'center' as const, headerClassName: 'px-2.5 whitespace-nowrap' },
  { key: 'labels', label: 'Labels', align: 'center' as const, headerClassName: 'px-2.5 whitespace-nowrap' },
  { key: 'deepCuts', label: 'Deep Cuts', align: 'center' as const, headerClassName: 'px-2.5 whitespace-nowrap' },
  { key: 'status', label: 'Status', align: 'center' as const, headerClassName: 'px-3 whitespace-nowrap' },
  { key: 'actions', label: 'Actions', align: 'right' as const, headerClassName: 'pl-2 pr-4 whitespace-nowrap' },
] as const;

export interface ProjectTableMetricValueProps {
  value: number | null | undefined;
  mutedWhenZero?: boolean;
}

export const ProjectTableMetricValue: React.FC<ProjectTableMetricValueProps> = ({
  value,
  mutedWhenZero = false,
}) => {
  const isMuted = value === null || value === undefined || (mutedWhenZero && value <= 0);
  if (isMuted) {
    return <span className="font-mono tabular-nums text-xs text-zinc-600">-</span>;
  }
  return <span className="font-mono tabular-nums text-xs font-medium text-zinc-300">{value}</span>;
};

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

export interface ProjectMobileListCardProps {
  title: string;
  formattedDate: string;
  icon: 'folder' | 'auto_delete';
  iconClassName?: string;
  sceneCount: number;
  rootArtistsCount: number;
  recommendedCount: number | null;
  labelCount: number | null;
  deepCutsCount: number | null;
  status?: string;
  isActiveCuration?: boolean;
  daysLeft?: number;
  isMenuOpen?: boolean;
  onClick?: () => void;
  actionMenuSlot?: React.ReactNode;
  'data-testid'?: string;
}

export const ProjectMobileListCard: React.FC<ProjectMobileListCardProps> = ({
  title,
  formattedDate,
  icon,
  iconClassName = 'text-zinc-500',
  sceneCount,
  rootArtistsCount,
  recommendedCount,
  labelCount,
  deepCutsCount,
  status,
  isActiveCuration = false,
  daysLeft,
  isMenuOpen = false,
  onClick,
  actionMenuSlot,
  'data-testid': testId,
}) => {
  const stats: { label: string; value: number | null }[] = [
    { label: 'Scenes', value: sceneCount || 1 },
    { label: 'Roots', value: rootArtistsCount },
    { label: 'Artists', value: recommendedCount },
    { label: 'Labels', value: labelCount && labelCount > 0 ? labelCount : null },
    { label: 'Deep Cuts', value: deepCutsCount },
  ];

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={`border border-zinc-800 bg-zinc-950/40 rounded-2xl p-3.5 space-y-2.5 transition-colors relative ${
        onClick ? 'cursor-pointer hover:bg-zinc-900/50 active:bg-zinc-900/70' : ''
      } ${isMenuOpen ? 'z-40' : 'z-0'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`material-symbols-outlined !text-[18px] shrink-0 ${iconClassName}`}>
            {icon}
          </span>
          <span className="font-medium text-white text-sm truncate leading-snug">
            {title}
          </span>
        </div>

        {actionMenuSlot && (
          <div
            className={`shrink-0 relative ${isMenuOpen ? 'z-50' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {actionMenuSlot}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-zinc-400 truncate">
          {formattedDate}
        </span>
        <ProjectStatusBadge
          status={status}
          isActiveCuration={isActiveCuration}
          daysLeft={daysLeft}
          variant="table"
        />
      </div>

      <div className="grid grid-cols-5 gap-1 pt-2.5 border-t border-zinc-800/60 text-center">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <span className="block text-[8px] uppercase tracking-wider text-zinc-500 font-sans truncate">
              {stat.label}
            </span>
            {stat.value === null ? (
              <span className="block text-xs font-mono tabular-nums text-zinc-600 mt-0.5">-</span>
            ) : (
              <span className="block text-xs font-mono tabular-nums font-semibold text-zinc-200 mt-0.5">
                {stat.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

import React from 'react';
import { Project } from '../types';

interface CreateProjectCardProps {
  onCreateProject: () => void;
  isCreatingProject?: boolean;
  activeCuratingProject?: Project | null;
  onViewActiveCuration?: (projectId: string) => void;
  className?: string;
}

export const CreateProjectCard: React.FC<CreateProjectCardProps> = ({
  onCreateProject,
  isCreatingProject = false,
  activeCuratingProject = null,
  onViewActiveCuration,
  className = '',
}) => {
  const isLockedByActiveCuration = Boolean(activeCuratingProject);

  const handleClick = () => {
    if (isLockedByActiveCuration && activeCuratingProject) {
      onViewActiveCuration?.(activeCuratingProject.id);
      return;
    }
    onCreateProject();
  };

  return (
    <div className={`w-full md:w-fit max-w-full relative flex-shrink-0 min-w-0 self-stretch flex items-stretch ${className}`}>
      <button 
        onClick={handleClick}
        disabled={isCreatingProject}
        data-testid={isLockedByActiveCuration ? 'create-project-card-curating-lock' : 'create-project-card'}
        className={`group relative bg-zinc-950/40 border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-3 transition-all h-[212px] w-full md:w-[382px] disabled:opacity-50 cursor-pointer overflow-hidden ${
          isLockedByActiveCuration
            ? 'border-primary/40 hover:border-primary/70'
            : 'border-zinc-800/80 hover:border-primary/50'
        }`}
        title={isLockedByActiveCuration ? 'Curation in Progress — View Active Zcene' : 'Create New Zcene'}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all relative z-10 ${
          isLockedByActiveCuration
            ? 'bg-primary/15 text-primary'
            : 'bg-zinc-900 group-hover:bg-white group-hover:text-brand-black text-zinc-550'
        }`}>
          {isCreatingProject || isLockedByActiveCuration ? (
            <span className="material-symbols-outlined animate-spin !text-2xl">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined !text-2xl">add</span>
          )}
        </div>
        <span className={`text-sm font-medium transition-colors relative z-10 font-sans text-center ${
          isLockedByActiveCuration
            ? 'text-zinc-200 group-hover:text-white'
            : 'text-zinc-550 group-hover:text-zinc-350'
        }`}>
          {isLockedByActiveCuration
            ? 'Curation in Progress — View Active Zcene'
            : isCreatingProject
              ? 'Creating Zcene...'
              : 'Create New Zcene'}
        </span>
        {isLockedByActiveCuration && (
          <span className="text-[11px] text-zinc-500 text-center max-w-[280px] relative z-10">
            1 Zcene can curate at a time. Wait for your active Zcene to finish.
          </span>
        )}
      </button>
    </div>
  );
};

export default CreateProjectCard;

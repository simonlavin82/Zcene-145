import React from 'react';

interface CreateProjectCardProps {
  onCreateProject: () => void;
  isCreatingProject?: boolean;
  className?: string;
}

export const CreateProjectCard: React.FC<CreateProjectCardProps> = ({
  onCreateProject,
  isCreatingProject = false,
  className = '',
}) => {
  return (
    <div className={`w-full md:w-fit max-w-full relative flex-shrink-0 min-w-0 self-stretch flex items-stretch ${className}`}>
      <button 
        onClick={onCreateProject}
        disabled={isCreatingProject}
        className="group relative bg-zinc-950/40 border-2 border-dashed border-zinc-800/80 rounded-xl p-5 flex flex-col items-center justify-center gap-3 transition-all h-[212px] w-full md:w-[382px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
        title="Create New Zcene"
      >
        <div className="w-10 h-10 rounded-full bg-zinc-900 group-hover:bg-white group-hover:text-brand-black flex items-center justify-center text-zinc-550 transition-all relative z-10">
          {isCreatingProject ? (
            <span className="material-symbols-outlined animate-spin !text-2xl">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined !text-2xl">add</span>
          )}
        </div>
        <span className="text-sm font-medium text-zinc-550 group-hover:text-zinc-350 transition-colors relative z-10 font-sans">
          {isCreatingProject ? 'Creating Zcene...' : 'Create New Zcene'}
        </span>
      </button>
    </div>
  );
};

export default CreateProjectCard;

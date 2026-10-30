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
    <div className={`w-full md:w-fit max-w-full bg-zinc-950/40 rounded-tr-xl rounded-b-xl rounded-tl-none border border-dashed border-zinc-800/80 p-4 relative flex-shrink-0 min-w-0 ${className}`}>
      {/* Folder Tab Header */}
      <div 
        onClick={!isCreatingProject ? onCreateProject : undefined}
        className="w-[160px] bg-zinc-950/60 border-t border-l border-r border-dashed border-zinc-800/80 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none cursor-pointer"
        title="Create New Zcene"
      >
        <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium flex items-center gap-1.5">
          <span className="material-symbols-outlined !text-[12px] text-primary">add</span>
          NEW ZCENE
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 w-full md:w-fit max-w-full">
        <button 
          onClick={onCreateProject}
          disabled={isCreatingProject}
          className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 transition-all h-[180px] w-full md:w-[350px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
        >
          <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-white group-hover:text-brand-black flex items-center justify-center text-zinc-550 transition-all relative z-10">
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
    </div>
  );
};

export default CreateProjectCard;


import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../types';
import { cleanArtistDisplayName, isNodeInSeedList } from '../services/artistCacheService';
import { formatSystemTimestamp, generateDeterministicGradient, extractInitials } from '../utils/formatters';
import { useSeedImages } from '../hooks/useSeedImages';
import { useDominantColor } from '../hooks/useDominantColor';

interface DashboardProjectCardProps {
  project: Project;
  onSelectProject: (id: string) => void;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  handleRenameClick: (project: Project) => void;
  setProjectToDelete: (id: string) => void;
  onShareProject?: (project: Project) => void;
  onDuplicateProject?: (project: Project) => void;
}

export const DashboardProjectCard: React.FC<DashboardProjectCardProps> = ({
  project,
  onSelectProject,
  activeMenuId,
  setActiveMenuId,
  handleRenameClick,
  setProjectToDelete,
  onShareProject,
  onDuplicateProject
}) => {
  const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
  const displayTitle = cleanArtistDisplayName(project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene"));
  const isUnmapped = project.status !== 'completed' && project.status !== 'curating' && project.status !== 'pending' && project.status !== 'failed' && !project.seedArtists;
  
  const imageUrls = useSeedImages(project.seedArtists, project.detailsCache, project.graphData, project.seedImageUrl);
  const dominantColor = useDominantColor(imageUrls[0] && imageUrls[0] !== 'not-found' ? imageUrls[0] : undefined, displayTitle);

  // Derive deep cuts count dynamically
  let deepCutsCount = 0;
  const rawActiveNodes = project.activeNodes || [];
  if (project.graphData) {
    try {
      const pg = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
      if (pg && Array.isArray(pg.nodes)) {
        deepCutsCount = pg.nodes.filter((n: any) => 
          rawActiveNodes.includes(n.id) && (n.type === 'artist' || n.type === 'label' || !n.type)
        ).length;
      } else {
        deepCutsCount = rawActiveNodes.length;
      }
    } catch (e) { deepCutsCount = rawActiveNodes.length; }
  } else {
    deepCutsCount = rawActiveNodes.length;
  }

  let recommendedCount = 0;
  let labelCount = 0;
  if (project.graphData) {
    try {
      const parsedGraph = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
      if (parsedGraph && Array.isArray(parsedGraph.nodes)) {
        const artistNodes = parsedGraph.nodes.filter((n: any) => n.type === 'artist' || !n.type);
        recommendedCount = artistNodes.filter((n: any) => !isNodeInSeedList(n.id || n.label || '', seedList)).length;
        labelCount = parsedGraph.nodes.filter((n: any) => n.type === 'label').length;
      }
    } catch (e) { /* ignore */ }
  }

  return (
    <motion.div
      onClick={() => onSelectProject(project.id)}
      className={`group relative border border-transparent hover:border-primary rounded-none p-5 transition-all cursor-pointer flex flex-col justify-between w-full md:w-[350px] h-[180px] shadow-[0_0_40px_rgba(0,0,0,0.7)] ${activeMenuId === project.id ? 'z-50' : 'overflow-hidden z-0'}`}
      style={{
        '--scene-accent': dominantColor,
        // Blend scene accent toward white for bright legible title color
        '--scene-accent-title': dominantColor
          ? `color-mix(in oklch, ${dominantColor} 25%, white)`
          : 'white',


      } as React.CSSProperties}
    >
      
      {/* Background Layer: Full-bleed image or deterministic gradient */}
      <div className="absolute inset-0 z-0 flex">
        {imageUrls.length > 1 ? (
          <>
            {/* Left artist: anchored left, cross-fades out across the right half */}
            <div
              className="absolute inset-0"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, black 30%, transparent 75%)',
                maskImage: 'linear-gradient(to right, black 30%, transparent 75%)',
              }}
            >
              {imageUrls[0] && imageUrls[0] !== 'not-found' ? (
                <img src={imageUrls[0]} alt={displayTitle} className="w-full h-full object-cover object-left" crossOrigin="anonymous" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800/40 to-zinc-900/80" />
              )}
            </div>
            {/* Right artist: anchored right, cross-fades out across the left half */}
            <div
              className="absolute inset-0"
              style={{
                WebkitMaskImage: 'linear-gradient(to left, black 30%, transparent 75%)',
                maskImage: 'linear-gradient(to left, black 30%, transparent 75%)',
              }}
            >
              {imageUrls[1] && imageUrls[1] !== 'not-found' ? (
                <img src={imageUrls[1]} alt={displayTitle} className="w-full h-full object-cover object-right" crossOrigin="anonymous" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800/40 to-zinc-900/80" />
              )}
            </div>
          </>
        ) : (
          <div className="w-full h-full">
            {imageUrls[0] && imageUrls[0] !== 'not-found' ? (
              <img src={imageUrls[0]} alt={displayTitle} className="w-full h-full object-cover" crossOrigin="anonymous" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800/40 to-zinc-900/80 relative overflow-hidden">
                 {/* Monogram for missing images */}
                 <div className="absolute bottom-0 right-0 translate-y-[10%] translate-x-[8%] text-white/5 font-black text-8xl uppercase select-none leading-none">
                   {extractInitials(displayTitle)}
                 </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Uniform scrim: even 55% dark backdrop — artwork shows through evenly with no directional patches */}
      <div className="absolute inset-0 z-10 bg-zinc-950/55" />

      {/* Content Container (z-20) */}
      <div className="relative z-20 flex flex-col h-full justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-row items-center gap-4 flex-1 min-w-0">
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <h3 className="text-base font-medium line-clamp-2 pr-2 transition-colors" style={{ color: 'var(--scene-accent-title, white)' }}>
                  {displayTitle}
                </h3>
                <p className="font-mono text-[10px] font-normal truncate uppercase tracking-widest" style={{ color: 'var(--scene-accent-title, white)' }}>
                  {project.updatedAt ? `Edited ${formatSystemTimestamp(project.updatedAt)}` : 'New Project'}
                </p>
                {project.status === 'curating' || project.status === 'pending' || (project.status !== 'failed' && project.status !== 'completed' && project.seedArtists) ? (
                  <span className="text-[9px] uppercase tracking-wider text-amber-500/80 font-bold px-1.5 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/10 whitespace-nowrap animate-pulse backdrop-blur-sm w-fit mt-0.5">
                    Mapping...
                  </span>
                ) : project.status === 'failed' ? (
                  <span className="text-[9px] uppercase tracking-wider text-red-500/80 font-bold px-1.5 py-0.5 bg-red-500/10 rounded-md border border-red-500/10 whitespace-nowrap backdrop-blur-sm w-fit mt-0.5">
                    Failed
                  </span>
                ) : project.status === 'completed' ? (
                  null
                ) : (
                  <span className="text-[9px] uppercase tracking-wide text-zinc-500 font-bold px-1.5 py-0.5 bg-zinc-800/80 rounded-md border border-zinc-800 font-mono whitespace-nowrap backdrop-blur-sm w-fit mt-0.5">
                    Unmapped
                  </span>
                )}
              </div>
            </div>
            
            <div
              className={`relative flex-shrink-0 transition-opacity duration-150 opacity-100`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                className="w-7 h-7 -mr-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all cursor-pointer flex items-center justify-center drop-shadow-md"
              >
                <span className="material-symbols-outlined !text-xl">more_vert</span>
              </button>
              
              {activeMenuId === project.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                  <div className="absolute right-0 mt-2 w-48 z-50 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black pointer-events-auto text-left animate-fade-in-down antialiased">
                    <button
                      onClick={() => {
                        setActiveMenuId(null);
                        handleRenameClick(project);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                    >
                      <span className="material-symbols-outlined !text-[16px] text-zinc-500">edit</span>
                      Rename
                    </button>
                    {onShareProject && (
                      <button
                        onClick={() => {
                          setActiveMenuId(null);
                          onShareProject(project);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                      >
                        <span className="material-symbols-outlined !text-[16px] text-zinc-500">share</span>
                        Share
                      </button>
                    )}
                    {onDuplicateProject && (
                      <button
                        onClick={() => {
                          setActiveMenuId(null);
                          onDuplicateProject(project);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2 group"
                      >
                        <span className="material-symbols-outlined !text-[16px] text-zinc-500">content_copy</span>
                        Duplicate
                      </button>
                    )}
                    <div className="border-t border-zinc-800/80 my-1" />
                    <button
                      onClick={() => {
                        setActiveMenuId(null);
                        setProjectToDelete(project.id);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/10 transition-all rounded-lg flex items-center gap-2 group"
                    >
                      <span className="material-symbols-outlined !text-[16px] text-[#ef4444]">delete</span>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {!isUnmapped && (
          <div className="mt-3 flex items-center">
            <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5">
              <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                SEED ARTISTS: {seedList.length}
              </span>
              {project.status === 'completed' && (
                <>
                  <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                    ARTISTS: {recommendedCount}
                  </span>
                  {labelCount > 0 && (
                    <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                      LABELS: {labelCount}
                    </span>
                  )}
                  <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                    DEEP CUTS: {deepCutsCount}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

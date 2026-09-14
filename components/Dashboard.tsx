import React from 'react';
import Header from './Header';
import ViewToggle from './ViewToggle';
import { Project, StackItem, UserTaste } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';
import { normalizeArtistId, cleanArtistDisplayName, isNodeInSeedList } from '../services/artistCacheService';


import { formatSystemTimestamp } from '../utils/formatters';
import { SeedArtistImages } from './SeedArtistImages';
import { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';
import { DashboardProjectCard } from './DashboardProjectCard';


interface DashboardProps {
  user: User | null;
  projects: Project[];
  stack: StackItem[];
  isStackNew: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  isCreatingProject?: boolean;
  onDeleteProject: (projectId: string) => void;
  onRenameProject?: (projectId: string, newName: string) => void;
  onLogoClick: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isSmallScreen: boolean;
  onOpenStack: () => void;
  onNavigate: (path: string) => void;
  isAdmin?: boolean;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onRestartWalkthrough?: () => void;
  onShareProject?: (project: Project) => void;
  userTaste?: UserTaste;
  onSaveTaste?: (taste: UserTaste) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  projects,
  stack,
  isStackNew,
  onSelectProject,
  onCreateProject,
  isCreatingProject,
  onDeleteProject,
  onRenameProject,
  onLogoClick,
  onLogout,
  onDeleteAccount,
  isProfileOpen,
  setIsProfileOpen,
  isDeleteAccountModalOpen,
  setIsDeleteAccountModalOpen,
  isSmallScreen,
  onOpenStack,
  onNavigate,
  isAdmin,
  isMenuOpen,
  setIsMenuOpen,
  onRestartWalkthrough,
  onShareProject,
  userTaste,
  onSaveTaste
}) => {
  const [projectToDelete, setProjectToDelete] = React.useState<string | null>(null);
  const [projectToRename, setProjectToRename] = React.useState<Project | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<'recent' | 'alphabetical'>('recent');

  const handleRenameClick = (project: Project) => {
    const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
    const displayTitle = cleanArtistDisplayName(project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene"));
    setRenameValue(displayTitle);
    setProjectToRename(project);
  };

  const groupedProjects = React.useMemo(() => {
    const groups: Record<string, Project[]> = {};

    projects.forEach((project) => {
      let genresList: string[] = [];
      if (project.graphData) {
        try {
          const parsed = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
          if (parsed && Array.isArray(parsed.nodes)) {
            const genreNodes = parsed.nodes.filter((n: any) => n.type === 'genre');
            genresList = genreNodes
              .map((n: any) => (n.label || n.id || '').trim())
              .filter(Boolean);
          }
        } catch (e) {
          console.warn("Failed to parse project graphData for genres:", e);
        }
      }

      let bucketKey = "UNASSIGNED";
      if (genresList.length > 0) {
        bucketKey = genresList[0].trim().toUpperCase();
      }

      if (!groups[bucketKey]) {
        groups[bucketKey] = [];
      }
      groups[bucketKey].push(project);
    });

    const getProjectDisplayTitle = (p: Project) => {
      const seedList = p.seedArtists ? p.seedArtists.split('::').filter(Boolean) : [];
      return cleanArtistDisplayName(p.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene")).toLowerCase();
    };

    const getProjectTimestamp = (p: Project): number => {
      const ts = p.updatedAt;
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      if (ts.seconds) return ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0);
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') {
        const parsed = Date.parse(ts);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        if (sortBy === 'recent') {
          const timeA = getProjectTimestamp(a);
          const timeB = getProjectTimestamp(b);
          if (timeB !== timeA) {
            return timeB - timeA;
          }
          return getProjectDisplayTitle(a).localeCompare(getProjectDisplayTitle(b));
        } else {
          const titleA = getProjectDisplayTitle(a);
          const titleB = getProjectDisplayTitle(b);
          if (titleA !== titleB) {
            return titleA.localeCompare(titleB);
          }
          return getProjectTimestamp(b) - getProjectTimestamp(a);
        }
      });
    });

    return groups;
  }, [projects, sortBy]);

  const sortedBucketKeys = React.useMemo(() => {
    const getProjectDisplayTitle = (p: Project) => {
      const seedList = p.seedArtists ? p.seedArtists.split('::').filter(Boolean) : [];
      return cleanArtistDisplayName(p.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene")).toLowerCase();
    };

    const getProjectTimestamp = (p: Project): number => {
      const ts = p.updatedAt;
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      if (ts.seconds) return ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0);
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') {
        const parsed = Date.parse(ts);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    return Object.keys(groupedProjects).sort((keyA, keyB) => {
      const projectsA = groupedProjects[keyA];
      const projectsB = groupedProjects[keyB];

      if (!projectsA || projectsA.length === 0) return 1;
      if (!projectsB || projectsB.length === 0) return -1;

      if (sortBy === 'recent') {
        const maxTimeA = getProjectTimestamp(projectsA[0]);
        const maxTimeB = getProjectTimestamp(projectsB[0]);
        if (maxTimeB !== maxTimeA) {
          return maxTimeB - maxTimeA;
        }
        return keyA.localeCompare(keyB);
      } else {
        const minTitleA = getProjectDisplayTitle(projectsA[0]);
        const minTitleB = getProjectDisplayTitle(projectsB[0]);
        if (minTitleA !== minTitleB) {
          return minTitleA.localeCompare(minTitleB);
        }
        return keyA.localeCompare(keyB);
      }
    });
  }, [groupedProjects, sortBy]);

  return (
    <div 
      className="h-full w-full overflow-hidden bg-background-dark text-zinc-200 font-display flex flex-col relative"
      style={{
        backgroundImage: 'linear-gradient(rgba(17, 17, 19, 0.8), rgba(17, 17, 19, 0.8)), url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      
      <Header
        user={user}
        onLogoClick={onLogoClick}
        view="dashboard"
        isSmallScreen={isSmallScreen}
        isMagazineViewOpen={false}
        stackCount={stack.length}
        isStackNew={isStackNew}
        onOpenStack={onOpenStack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        isAdmin={isAdmin}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        onRestartWalkthrough={onRestartWalkthrough}
        userTaste={userTaste}
        onSaveTaste={onSaveTaste}
      />

      
      <div className="flex-grow w-full overflow-y-auto relative">
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="w-full space-y-8">
          <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-row items-start sm:items-center justify-between w-full gap-4">
              <div className="flex flex-row items-center gap-2 h-[36px] flex-wrap sm:flex-nowrap">
                {/* Sort Selector Toggle */}
                <ViewToggle 
                  value={sortBy}
                  onChange={(s) => setSortBy(s as 'recent' | 'alphabetical')}
                  options={[
                    { id: 'recent', icon: 'schedule', label: 'Sort by Recent' },
                    { id: 'alphabetical', icon: 'sort_by_alpha', label: 'Sort Alphabetically' }
                  ]}
                  className="h-full"
                />

                {/* Grid/List View Toggle */}
                <ViewToggle 
                  value={view}
                  onChange={(v) => setView(v as 'grid' | 'list')}
                  options={[
                    { id: 'grid', icon: 'grid_view', label: 'Grid View' },
                    { id: 'list', icon: 'list', label: 'List View' }
                  ]}
                  className="h-full"
                />
              </div>

              {/* New Zcene Button */}
              <div className="flex items-center h-[36px] flex-shrink-0">
                <button 
                  onClick={onCreateProject}
                  disabled={isCreatingProject}
                  className="h-full rounded-xl bg-[#F2E572] text-black text-sm px-4 font-medium flex items-center gap-2 whitespace-nowrap"
                >
                  {isCreatingProject ? (
                    <>
                      <span className="material-symbols-outlined animate-spin !text-lg">progress_activity</span>
                      Creating...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined !text-lg font-bold">add</span>
                      Create
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <h1 className="text-base font-medium uppercase tracking-widest text-zinc-200">YOUR ZCENES</h1>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="w-full md:w-fit max-w-full bg-zinc-950/40 rounded-tr-xl rounded-b-xl rounded-tl-none border border-dashed border-zinc-800/80 p-4 relative flex-shrink-0 min-w-0">
              {/* Folder Tab Header */}
              <div className="w-[160px] bg-zinc-950/60 border-t border-l border-r border-dashed border-zinc-800/80 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none">
                <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[12px] text-primary">add</span>
                  NEW ZCENE
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 w-full md:w-fit max-w-full">
                <button 
                  onClick={onCreateProject}
                  disabled={isCreatingProject}
                  className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-none p-5 flex flex-col items-center justify-center gap-3 transition-all h-[180px] w-full md:w-[360px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-primary group-hover:text-brand-black flex items-center justify-center text-zinc-550 transition-all relative z-10">
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
          ) : view === 'grid' ? (
            <div className="w-full flex flex-wrap gap-x-8 gap-y-10 items-start">
              {sortedBucketKeys.map((bucketKey) => {
                const projectsInBucket = groupedProjects[bucketKey] || [];
                const count = projectsInBucket.length;
                let gridColsClass = "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
                if (count === 1) {
                  gridColsClass = "grid-cols-1";
                } else if (count === 2) {
                  gridColsClass = "grid-cols-1 md:grid-cols-2";
                }

                return (
                  <div 
                    key={bucketKey} 
                    className="w-full md:w-fit max-w-full bg-zinc-950 rounded-tr-xl rounded-b-xl rounded-tl-none border border-zinc-800 p-4 relative flex-shrink-0 min-w-0"
                  >
                    {/* Unified Folder Index Tab */}
                    <div className="w-[160px] bg-zinc-950 border-t border-l border-r border-zinc-800 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none">
                      <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium">
                        {bucketKey}
                      </div>
                    </div>

                    {/* Cards inside this parent record crate compartment */}
                    <div className={`grid ${gridColsClass} gap-5 w-full md:w-fit max-w-full`}>
                      {projectsInBucket.map((project, idx) => (
                        <DashboardProjectCard
                          key={project.id}
                          project={project}
                          onSelectProject={onSelectProject}
                          activeMenuId={activeMenuId}
                          setActiveMenuId={setActiveMenuId}
                          handleRenameClick={handleRenameClick}
                          setProjectToDelete={setProjectToDelete}
                          onShareProject={onShareProject}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
              
              {/* Standalone Add New Crate Folder */}
              <div 
                className="w-full md:w-fit max-w-full bg-zinc-950/40 rounded-tr-xl rounded-b-xl rounded-tl-none border border-dashed border-zinc-800/80 p-4 relative flex-shrink-0 min-w-0"
              >
                {/* Folder Tab Header */}
                <div className="w-[160px] bg-zinc-950/60 border-t border-l border-r border-dashed border-zinc-800/80 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none">
                  <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[12px] text-primary">add</span>
                    NEW ZCENE
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 w-full md:w-fit max-w-full">
                  <button 
                    onClick={onCreateProject}
                    disabled={isCreatingProject}
                    className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-none p-5 flex flex-col items-center justify-center gap-3 transition-all h-[180px] w-full md:w-[360px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-primary group-hover:text-brand-black flex items-center justify-center text-zinc-550 transition-all relative z-10">
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
            </div>
          ) : (
            /* High-Contrast Tabular List View */
            <div className="w-full overflow-x-auto border border-zinc-800 bg-zinc-900 rounded-none">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-widest font-bold bg-zinc-950">
                    <th className="py-4 px-6 font-semibold">Title</th>
                    <th className="py-4 px-6 font-semibold">Modified Date</th>
                    <th className="py-4 px-6 font-semibold">Seeds</th>
                    <th className="py-4 px-6 font-semibold">AI Artists</th>
                    <th className="py-4 px-6 font-semibold">Labels</th>
                    <th className="py-4 px-6 font-semibold">Deep Cuts</th>
                    <th className="py-4 px-6 font-semibold">Status</th>
                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-zinc-900">
                  {sortedBucketKeys.map((bucketKey) => (
                    <React.Fragment key={bucketKey}>
                      {/* Unified Folder Tab Divider Row */}
                      <tr className="select-none pointer-events-none bg-zinc-900">
                        <td colSpan={7} className="pt-6 pb-0 px-6 align-bottom bg-zinc-900 border-none">
                          {/* The Folder Tab */}
                          <div className="w-[140px] sm:w-[160px] bg-zinc-950 border-t border-l border-r border-zinc-800 rounded-t-lg px-3 py-1.5 font-mono tracking-widest text-[9px] sm:text-[10px] text-zinc-400 uppercase font-medium relative -mb-[1px] z-0">
                            <div className="truncate text-ellipsis whitespace-nowrap">
                              {bucketKey}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {groupedProjects[bucketKey].map((project, index) => {
                        const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                        const displayTitle = cleanArtistDisplayName(project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene"));
                        const formattedDate = formatSystemTimestamp(project.updatedAt);
                        const hasGraphNodes = !!project.graphData && !project.graphData.includes('"nodes":[]');
                        const isMapped = project.status === 'completed';
                        
                        // ARCHITECTURE: Dynamic Dashboard Integrity
                        // Derive deep cuts count dynamically from actual rendered nodes, prohibiting static placeholders.
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
                          } catch (e) {
                            console.warn(`Failed to parse graphData for project ${project.id}:`, e);
                          }
                        }
                        
                        const rowBg = index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40';
                        const tdClass = `transition-colors ${rowBg} group-hover:bg-primary/5 ${index === 0 ? 'relative z-10' : ''}`;
                        
                        return (
                          <tr 
                            key={project.id}
                            onClick={() => onSelectProject(project.id)}
                            className="group cursor-pointer border-b border-zinc-800/30"
                          >
                            <td className={`py-4 px-6 font-medium text-white group-hover:text-primary transition-colors ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-zinc-555 !text-lg group-hover:text-primary transition-colors">folder</span>
                                <span className="truncate max-w-[240px]">{displayTitle}</span>
                              </div>
                            </td>
                            <td className={`py-4 px-6 text-zinc-400 text-sm font-mono font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {formattedDate}
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                SEED: {seedList.length}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                AI ARTISTS: {recommendedCount}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {labelCount > 0 ? (
                                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                  LABELS: {labelCount}
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 py-0.5 bg-zinc-900 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                  -
                                </span>
                              )}
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                DEEP CUTS: {deepCutsCount}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {(project.status === 'curating' || project.status === 'pending' || (project.status !== 'failed' && !hasGraphNodes && project.seedArtists)) ? (
                                <span className="text-[10px] uppercase tracking-wider text-amber-500/80 font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/10 whitespace-nowrap animate-pulse">
                                  Mapping...
                                </span>
                              ) : project.status === 'failed' ? (
                                <span className="text-[10px] uppercase tracking-wider text-red-500/80 font-bold px-2 py-0.5 bg-red-500/10 rounded-md border border-red-500/10 whitespace-nowrap">
                                  Failed
                                </span>
                              ) : project.status === 'completed' ? (
                                <span className="text-[10px] uppercase tracking-widest text-primary/70 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20 whitespace-nowrap">
                                  Mapped
                                  </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-800 whitespace-nowrap">
                                  Unmapped
                                </span>
                              )}
                            </td>
                            <td className={`py-4 px-6 text-right ${tdClass}`} onClick={(e) => e.stopPropagation()}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <div className="flex items-center justify-end relative">
                                <button
                                  onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                                  className="w-7 h-7 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined !text-xl">more_vert</span>
                                </button>
                                
                                {activeMenuId === project.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                    <div className="absolute right-0 top-8 w-48 z-50 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black pointer-events-auto text-left animate-fade-in-down antialiased">
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
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </main>
      </div>

      {/* Custom Rename Confirmation Modal */}
      {projectToRename && (
        <ModalBackdrop className="z-[110]" onClick={() => setProjectToRename(null)}>
          <ModalContainer className="text-left">
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary !text-[18px]">edit</span>
                <h3 className="text-base font-medium text-white">Rename Zcene</h3>
              </div>
              <button 
                onClick={() => setProjectToRename(null)} 
                className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
              >
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

            <ModalBody>
              <input 
                type="text" 
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = renameValue.trim();
                    if (trimmed && onRenameProject) {
                      onRenameProject(projectToRename.id, trimmed);
                      setProjectToRename(null);
                    }
                  }
                }}
                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
              />
            </ModalBody>

            <ModalFooter>
              <button 
                onClick={() => setProjectToRename(null)} 
                className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const trimmed = renameValue.trim();
                  if (trimmed && onRenameProject) {
                    onRenameProject(projectToRename.id, trimmed);
                    setProjectToRename(null);
                  }
                }} 
                disabled={!renameValue.trim()}
                className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Save
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}

      {/* Custom Delete Confirmation Modal */}
      {projectToDelete && (
        <ModalBackdrop className="z-[110]" onClick={() => setProjectToDelete(null)}>
          <ModalContainer className="text-left">
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 !text-[18px]">warning</span>
                <h3 className="text-base font-medium text-white">
                  Confirm Deletion
                </h3>
              </div>
              <button 
                onClick={() => setProjectToDelete(null)} 
                className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
              >
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

            <ModalBody className="space-y-4">
              <p className="leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-white">{projects.find(p => p.id === projectToDelete)?.name || 'this Zcene'}</span>? This action cannot be undone. All mapping and chat history for this Zcene will be permanently removed.
              </p>
            </ModalBody>

            <ModalFooter>
              <button 
                onClick={() => setProjectToDelete(null)} 
                className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onDeleteProject(projectToDelete);
                  setProjectToDelete(null);
                }} 
                className="px-4 py-1.5 bg-red-500 text-white rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
              >
                Confirm
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}
    </div>
  );
};

export default Dashboard;

import React from 'react';
import Header from './Header';
import ViewToggle from './ViewToggle';
import { Project, StackItem } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';
import { normalizeArtistId } from '../services/artistCacheService';


const formatProjectTimestamp = (updatedAt: any): string => {
  if (!updatedAt) return 'New Project';
  let date: Date;
  if (typeof updatedAt.toDate === 'function') {
    date = updatedAt.toDate();
  } else if (updatedAt instanceof Date) {
    date = updatedAt;
  } else if (updatedAt.seconds) {
    date = new Date(updatedAt.seconds * 1000);
  } else if (typeof updatedAt === 'number' || typeof updatedAt === 'string') {
    date = new Date(updatedAt);
  } else {
    return 'New Project';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  return `${dateStr} • ${timeStr}`;
};

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
  onRestartWalkthrough
}) => {
  const [projectToDelete, setProjectToDelete] = React.useState<string | null>(null);
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<'recent' | 'alphabetical'>('recent');

  const handleRenameClick = (project: Project) => {
    const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
    const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
    const newName = window.prompt("Rename Zcene", displayTitle);
    if (newName !== null) {
      const trimmed = newName.trim();
      if (trimmed && onRenameProject) {
        onRenameProject(project.id, trimmed);
      }
    }
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
      return (p.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene")).toLowerCase();
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
      return (p.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene")).toLowerCase();
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
      className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative"
      style={{
        backgroundImage: 'url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
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
      />

      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
          <div className="w-full space-y-8">
          <div className="flex flex-col items-center justify-center text-center md:flex-row md:justify-between md:items-center gap-4">
            <h1 className="text-lg font-medium uppercase tracking-widest text-zinc-200">YOUR ZCENES</h1>
            
            <div className="flex items-center gap-2 h-[36px] w-full justify-center md:w-auto md:justify-end">
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

              {/* New Zcene Button */}
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

          {projects.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-fit">
              {/* Standalone Add New Card */}
              <button 
                onClick={onCreateProject}
                disabled={isCreatingProject}
                className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-none p-5 flex flex-col items-center justify-center gap-3 transition-all h-[180px] w-full sm:w-[320px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-primary group-hover:text-brand-black flex items-center justify-center text-zinc-550 transition-all relative z-10">
                  {isCreatingProject ? (
                    <span className="material-symbols-outlined animate-spin !text-2xl">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined !text-2xl">add</span>
                  )}
                </div>
                <span className="text-sm font-medium text-zinc-550 group-hover:text-zinc-350 transition-colors relative z-10">
                  {isCreatingProject ? 'Creating Zcene...' : 'Create New Zcene'}
                </span>
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="w-full flex flex-wrap gap-x-8 gap-y-10 items-start">
              {sortedBucketKeys.map((bucketKey) => {
                const projectsInBucket = groupedProjects[bucketKey] || [];
                const count = projectsInBucket.length;
                let gridColsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
                if (count === 1) {
                  gridColsClass = "grid-cols-1";
                } else if (count === 2) {
                  gridColsClass = "grid-cols-1 sm:grid-cols-2";
                } else if (count === 3) {
                  gridColsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
                }

                return (
                  <div 
                    key={bucketKey} 
                    className="w-fit max-w-full bg-zinc-950 rounded-tr-xl rounded-b-xl rounded-tl-none border border-zinc-800 p-4 relative flex-shrink-0"
                  >
                    {/* Unified Folder Index Tab */}
                    <div className="w-[160px] bg-zinc-950 border-t border-l border-r border-zinc-800 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none">
                      <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium">
                        {bucketKey}
                      </div>
                    </div>

                    {/* Cards inside this parent record crate compartment */}
                    <div className={`grid ${gridColsClass} gap-4 w-fit`}>
                      {projectsInBucket.map((project) => {
                      const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                      const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
                      
                      // Derive deep cuts count: prefer the persisted activeNodes queue.
                      // For stale documents where activeNodes was never written by the backend
                      // (legacy projects always have activeNodes: []), fall back to counting
                      // how many seed artists are present in the graphData — which is always
                      // at least 1 for a mapped project.
                      let deepCutsCount = (project.activeNodes || []).length;
                      if (deepCutsCount === 0 && project.graphData) {
                        try {
                          const pg = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
                          if (pg && Array.isArray(pg.nodes)) {
                            const seedSet = new Set(seedList.map((s: string) => normalizeArtistId(s)));
                            deepCutsCount = pg.nodes.filter((n: any) => (n.type === 'artist' || !n.type) && seedSet.has(normalizeArtistId(n.id))).length;
                          }
                        } catch (e) { /* ignore */ }
                      }

                      let recommendedCount = 0;
                      if (project.graphData) {
                        try {
                          const parsedGraph = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
                          if (parsedGraph && Array.isArray(parsedGraph.nodes)) {
                            const seedSet = new Set(seedList.map(s => normalizeArtistId(s)));
                            const artistNodes = parsedGraph.nodes.filter((n: any) => n.type === 'artist' || !n.type);
                            recommendedCount = artistNodes.filter((n: any) => !seedSet.has(normalizeArtistId(n.id))).length;
                          }
                        } catch (e) {
                          console.warn(`Failed to parse graphData for project ${project.id}:`, e);
                        }
                      }
                      
                      return (
                        <motion.div
                          key={project.id}
                          onClick={() => onSelectProject(project.id)}
                          className="group relative bg-zinc-900 border border-zinc-700/50 rounded-none p-5 hover:border-primary/50 transition-all cursor-pointer flex flex-col justify-between w-full sm:w-[320px] h-[180px] shadow-xl"
                        >
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-medium text-white group-hover:text-primary transition-colors truncate">
                                {displayTitle}
                              </h3>
                              <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/80 transition-all cursor-pointer flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined !text-xl">more_vert</span>
                                </button>
                                
                                {activeMenuId === project.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                    <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 text-left animate-fade-in-down">
                                      <button
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleRenameClick(project);
                                        }}
                                        className="w-full px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition-all flex items-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-sm">edit</span>
                                        Edit Title
                                      </button>
                                      <button
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          setProjectToDelete(project.id);
                                        }}
                                        className="w-full px-4 py-2.5 text-xs font-medium text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-sm">delete</span>
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <p className="font-mono text-xs text-zinc-300 font-normal">
                              {project.updatedAt ? `Edited ${formatProjectTimestamp(project.updatedAt)}` : 'New Project'}
                            </p>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-white/5 flex items-center">
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1.5">
                              <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                SEED: {seedList.length}
                              </span>
                              {(project.status === 'curating' || (!project.graphData && project.seedArtists)) ? (
                                <span className="text-[9px] uppercase tracking-wider text-amber-500/80 font-bold px-1.5 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/10 whitespace-nowrap animate-pulse">
                                  Mapping...
                                </span>
                              ) : project.graphData ? (
                                <>
                                  <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                    AI ARTISTS: {recommendedCount}
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                    DEEP CUTS: {deepCutsCount}
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wide text-primary/60 font-bold px-1.5 py-0.5 bg-primary/10 rounded-md border border-primary/10 whitespace-nowrap">
                                    Mapped
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
              
              {/* Standalone Add New Card Container */}
              <div 
                className="w-full bg-zinc-950/20 rounded-xl border border-dashed border-zinc-800/60 p-4 flex items-center justify-center h-[192px] flex-shrink-0"
                style={{ maxWidth: '100%' }}
              >
                <button 
                  onClick={onCreateProject}
                  disabled={isCreatingProject}
                  className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-none p-5 flex flex-col items-center justify-center gap-3 transition-all h-[160px] w-full hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
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
                        const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
                        const formattedDate = formatProjectTimestamp(project.updatedAt);
                        const isMapped = !!project.graphData;
                        
                        // Derive deep cuts count: prefer the persisted activeNodes queue.
                        // Fallback for stale documents: count seed artists present in graphData.
                        let deepCutsCount = (project.activeNodes || []).length;
                        if (deepCutsCount === 0 && project.graphData) {
                          try {
                            const pg = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
                            if (pg && Array.isArray(pg.nodes)) {
                              const seedSet = new Set(seedList.map((s: string) => normalizeArtistId(s)));
                              deepCutsCount = pg.nodes.filter((n: any) => (n.type === 'artist' || !n.type) && seedSet.has(normalizeArtistId(n.id))).length;
                            }
                          } catch (e) { /* ignore */ }
                        }
                        
                        let recommendedCount = 0;
                        if (project.graphData) {
                          try {
                            const parsedGraph = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
                            if (parsedGraph && Array.isArray(parsedGraph.nodes)) {
                              const seedSet = new Set(seedList.map(s => normalizeArtistId(s)));
                              const artistNodes = parsedGraph.nodes.filter((n: any) => n.type === 'artist' || !n.type);
                              recommendedCount = artistNodes.filter((n: any) => !seedSet.has(normalizeArtistId(n.id))).length;
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
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                DEEP CUTS: {deepCutsCount}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {isMapped ? (
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
                                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined !text-xl">more_vert</span>
                                </button>
                                
                                {activeMenuId === project.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                    <div className="absolute right-0 top-8 w-36 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 text-left animate-fade-in-down">
                                      <button
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleRenameClick(project);
                                        }}
                                        className="w-full px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition-all flex items-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-sm">edit</span>
                                        Edit Title
                                      </button>
                                      <button
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          setProjectToDelete(project.id);
                                        }}
                                        className="w-full px-4 py-2.5 text-xs font-medium text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-sm">delete</span>
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

      {/* Custom Delete Confirmation Modal */}
      {projectToDelete && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down"
          style={{ animationDuration: '200ms' }}
          onClick={() => setProjectToDelete(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden text-left"
            onClick={e => e.stopPropagation()}
          >
            <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
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
            </header>

            <div className="p-5 space-y-4 text-sm text-zinc-400">
              <p className="leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-white">{projects.find(p => p.id === projectToDelete)?.name || 'this Zcene'}</span>? This action cannot be undone. All mapping and chat history for this Zcene will be permanently removed.
              </p>
            </div>

            <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
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
            </footer>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

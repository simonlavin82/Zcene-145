import React from 'react';
import Header from './Header';
import ViewToggle from './ViewToggle';
import { Project, StackItem, UserTaste } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';
import { normalizeArtistId, cleanArtistDisplayName, isNodeInSeedList, getProjectDisplayTitle } from '../services/artistCacheService';


import { formatSystemTimestamp, zceneCategoricalPalette, zceneFallbackColor, getContrastTextColor } from '../utils/formatters';
import { SeedArtistImages } from './SeedArtistImages';
import { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';
import { DashboardProjectCard } from './DashboardProjectCard';
import { CreateProjectCard } from './CreateProjectCard';
import { PROFILE_COLORS } from './SharedModals';
import { computeProjectCardMetrics, parseProjectScenes } from '../shared/multiSceneUtils';


interface DashboardProps {
  user: User | null;
  projects: Project[];
  stack: StackItem[];
  isStackNew: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  isCreatingProject?: boolean;
  onDeleteProject: (projectId: string) => void;
  onTrashProject?: (projectId: string) => void;
  onRestoreProject?: (projectId: string) => void;
  onPermanentDeleteProject?: (projectId: string) => void;
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
  crateColors?: Record<string, string>;
  onUpdateCrateColor?: (crate: string, color: string) => void;
  onDuplicateProject?: (project: Project) => void;
  tokenBalance?: number;
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
  onTrashProject,
  onRestoreProject,
  onPermanentDeleteProject,
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
  onSaveTaste,
  crateColors,
  onUpdateCrateColor,
  onDuplicateProject,
  tokenBalance = 0
}) => {
  const [projectToDelete, setProjectToDelete] = React.useState<string | null>(null);
  const [projectToRename, setProjectToRename] = React.useState<Project | null>(null);

  const handleTrash = onTrashProject || onDeleteProject;
  const [renameValue, setRenameValue] = React.useState('');
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);
  const [openColorPopover, setOpenColorPopover] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleGlobalClick = () => setOpenColorPopover(null);
    if (openColorPopover) {
      window.addEventListener('click', handleGlobalClick);
    }
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [openColorPopover]);

  const colorHexMap: Record<string, string> = {
    purple: '#a855f7',
    teal: '#2dd4bf',
    sky: '#38bdf8',
    indigo: '#6366f1',
    pink: '#ec4899',
    orange: '#f97316',
    black: '#18181b',
    white: '#f4f4f5',
  };
  const [sortBy, setSortBy] = React.useState<'recent' | 'alphabetical'>('recent');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleRenameClick = (project: Project) => {
    const displayTitle = getProjectDisplayTitle(project);
    setRenameValue(displayTitle);
    setProjectToRename(project);
  };

  const normalizeCategory = (category: string): string => {
    if (!category) return "UNASSIGNED";
    return category
      .trim()
      .replace(/-/g, ' ')
      .toUpperCase();
  };

  const activeProjects = React.useMemo(() => projects.filter(p => p.status !== 'trashed' && p.status !== 'deleted'), [projects]);

  const filteredProjects = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeProjects;

    return activeProjects.filter((project) => {
      // 1. Check Project Name and Clean Display Title
      const rawName = (project.name || '').toLowerCase();
      if (rawName.includes(query)) return true;

      const displayTitle = getProjectDisplayTitle(project).toLowerCase();
      if (displayTitle.includes(query)) return true;

      // 2. Check Seed Artists string
      if (project.seedArtists && project.seedArtists.toLowerCase().includes(query)) return true;

      // 3. Check Phase 1+ artistIds array if populated
      if (Array.isArray(project.artistIds) && project.artistIds.some(id => id.toLowerCase().includes(query))) {
        return true;
      }

      // 4. Check scenes or graphData.nodes for any artist node (node.label or node.id)
      let artistNodes: any[] = [];
      if (project.scenes) {
        try {
          const parsedScenes = parseProjectScenes(project.scenes);
          for (const s of parsedScenes) {
            if (s.graphData && Array.isArray(s.graphData.nodes)) {
              artistNodes.push(...s.graphData.nodes);
            }
          }
        } catch (e) {}
      }
      if (artistNodes.length === 0 && project.graphData) {
        try {
          const parsed = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
          if (parsed && Array.isArray(parsed.nodes)) {
            artistNodes = parsed.nodes;
          }
        } catch (e) {
          // Ignore parsing error
        }
      }
      if (artistNodes.length > 0) {
        const hasArtistMatch = artistNodes.some((node: any) => {
          if (node.type && node.type !== 'artist') return false;
          const label = (node.label || '').toLowerCase();
          const id = (node.id || '').toLowerCase();
          return label.includes(query) || id.includes(query);
        });
        if (hasArtistMatch) return true;
      }

      return false;
    });
  }, [activeProjects, searchQuery]);

  const groupedProjects = React.useMemo(() => {
    const groups: Record<string, Project[]> = {};

    filteredProjects.forEach((project) => {
      const genresList: string[] = [];

      // Tier 1: Multi-Scene Check (project.scenes)
      if (project.scenes) {
        try {
          const parsedScenes = parseProjectScenes(project.scenes);
          for (const s of parsedScenes) {
            if (s.graphData && Array.isArray(s.graphData.nodes)) {
              const genreNodes = s.graphData.nodes.filter((n: any) => n.type === 'genre');
              for (const gn of genreNodes) {
                const gName = (gn.label || gn.id || '').trim();
                if (gName && !genresList.includes(gName)) {
                  genresList.push(gName);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[Dashboard] Failed to parse project scenes for genres:", e);
        }
      }

      // Tier 2: Root GraphData (project.graphData, string or object)
      if (genresList.length === 0 && project.graphData) {
        try {
          const parsed = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
          if (parsed && Array.isArray(parsed.nodes)) {
            const genreNodes = parsed.nodes.filter((n: any) => n.type === 'genre');
            for (const gn of genreNodes) {
              const gName = (gn.label || gn.id || '').trim();
              if (gName && !genresList.includes(gName)) {
                genresList.push(gName);
              }
            }
          }
        } catch (e) {
          console.warn("[Dashboard] Failed to parse project graphData for genres:", e);
        }
      }

      // Tier 3: detailsCache (authoritative entity metadata)
      if (genresList.length === 0 && project.detailsCache) {
        try {
          let cacheObj: any = project.detailsCache;
          if (typeof cacheObj === 'string') {
            cacheObj = JSON.parse(cacheObj);
          }
          if (cacheObj) {
            const entries = Array.isArray(cacheObj) ? cacheObj : (typeof cacheObj === 'object' ? Object.entries(cacheObj) : []);
            for (const item of entries) {
              const val = Array.isArray(item) ? item[1] : item;
              if (val?.details?.genre && typeof val.details.genre === 'string' && val.details.genre.trim()) {
                const gName = val.details.genre.trim();
                if (!genresList.includes(gName)) {
                  genresList.push(gName);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[Dashboard] Failed to parse project detailsCache for genres:", e);
        }
      }

      // Tier 4: discoveryFilters (fallback filter criteria)
      if (genresList.length === 0 && project.discoveryFilters) {
        try {
          let filters: any = project.discoveryFilters;
          if (typeof filters === 'string') {
            filters = JSON.parse(filters);
          }
          if (filters?.genre && typeof filters.genre === 'string' && filters.genre.trim()) {
            genresList.push(filters.genre.trim());
          } else if (Array.isArray(filters?.includeGenres) && filters.includeGenres.length > 0) {
            const firstG = String(filters.includeGenres[0]).trim();
            if (firstG && !genresList.includes(firstG)) {
              genresList.push(firstG);
            }
          }
        } catch (e) {
          console.warn("[Dashboard] Failed to parse project discoveryFilters for genres:", e);
        }
      }

      let bucketKey = "UNASSIGNED";
      if (genresList.length > 0) {
        bucketKey = normalizeCategory(genresList[0]);
      }

      if (!groups[bucketKey]) {
        groups[bucketKey] = [];
      }
      groups[bucketKey].push(project);
    });

    const getProjectTitle = (p: Project) => {
      return getProjectDisplayTitle(p).toLowerCase();
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
          return getProjectTitle(a).localeCompare(getProjectTitle(b));
        } else {
          const titleA = getProjectTitle(a);
          const titleB = getProjectTitle(b);
          if (titleA !== titleB) {
            return titleA.localeCompare(titleB);
          }
          return getProjectTimestamp(b) - getProjectTimestamp(a);
        }
      });
    });

    return groups;
  }, [filteredProjects, sortBy]);

  const sortedBucketKeys = React.useMemo(() => {
    const getProjectTitle = (p: Project) => {
      return getProjectDisplayTitle(p).toLowerCase();
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
        tokenBalance={tokenBalance}
      />

      
      <div className="flex-grow w-full overflow-y-auto relative">
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="w-full space-y-8">
          <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-row items-start sm:items-center justify-between w-full gap-4">
              <div className="flex flex-row items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Sort Selector Toggle */}
                <ViewToggle 
                  value={sortBy}
                  onChange={(s) => setSortBy(s as 'recent' | 'alphabetical')}
                  options={[
                    { id: 'recent', icon: 'schedule', label: 'Sort by Recent' },
                    { id: 'alphabetical', icon: 'sort_by_alpha', label: 'Sort Alphabetically' }
                  ]}
                />

                {/* Grid/List View Toggle */}
                <ViewToggle 
                  value={view}
                  onChange={(v) => setView(v as 'grid' | 'list')}
                  options={[
                    { id: 'grid', icon: 'grid_view', label: 'Grid View' },
                    { id: 'list', icon: 'list', label: 'List View' }
                  ]}
                />

                {/* Deep Search Input */}
                <div 
                  className={`group relative h-[38px] flex items-center transition-all duration-300 ease-in-out overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80 backdrop-blur-md shadow-xl origin-left ${isSearchExpanded ? 'w-56 sm:w-64 focus-within:ring-1 focus-within:ring-primary' : 'w-[38px] cursor-pointer'}`}
                  onClick={(e) => { 
                    if (!isSearchExpanded) {
                      e.stopPropagation(); 
                      setIsSearchExpanded(true); 
                      setTimeout(() => searchInputRef.current?.focus(), 50); 
                    }
                  }}
                  title={!isSearchExpanded ? "Find in zcenes..." : undefined}
                >
                  <span className={`material-symbols-outlined absolute left-[9px] top-1/2 -translate-y-1/2 transition-colors duration-300 z-10 pointer-events-none ${isSearchExpanded ? 'text-zinc-500 !text-[20px]' : 'text-zinc-400 group-hover:text-white !text-[20px]'}`}>
                    search
                  </span>
                  
                  <input 
                    autoComplete="off" 
                    data-1p-ignore="true" 
                    data-lpignore="true" 
                    ref={searchInputRef}
                    type="search" 
                    placeholder="Find in zcenes..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    onBlur={() => { if (!searchQuery.trim()) setIsSearchExpanded(false); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setIsSearchExpanded(false);
                        searchInputRef.current?.blur();
                      }
                    }}
                    className={`w-full h-full appearance-none bg-transparent text-white placeholder:text-zinc-500 focus:outline-none transition-opacity duration-300 pl-10 pr-[38px] text-sm ${isSearchExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
                  />
                  
                  <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 flex items-center z-10 transition-opacity duration-300 ${isSearchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {searchQuery && (
                      <button 
                        onMouseDown={(e) => { 
                          e.preventDefault(); 
                          setSearchQuery(''); 
                          searchInputRef.current?.focus(); 
                        }} 
                        className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors leading-none cursor-pointer" 
                        aria-label="Clear search"
                      >
                        <span className="material-symbols-outlined !text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* New Zcene Button */}
              <div className="flex items-center flex-shrink-0">
                <button 
                  onClick={onCreateProject}
                  disabled={isCreatingProject}
                  className="h-[38px] rounded-xl bg-white text-brand-black text-sm px-4 font-medium flex items-center gap-2 whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
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
              <h1 className="text-base font-medium uppercase tracking-widest text-zinc-200">
                YOUR ZCENES
              </h1>
            </div>
          </div>

          {activeProjects.length === 0 ? (
            <CreateProjectCard 
              onCreateProject={onCreateProject} 
              isCreatingProject={isCreatingProject} 
            />
          ) : filteredProjects.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-950/40 border border-dashed border-zinc-800/80 rounded-xl">
              <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
                <span className="material-symbols-outlined !text-2xl">search_off</span>
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                No Zcenes found matching &ldquo;{searchQuery}&rdquo;
              </h3>
              <p className="text-sm text-zinc-400 max-w-md mb-6">
                Try searching for a different project title, root artist, or node name.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchExpanded(false);
                }}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-white transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">close</span>
                Clear Search
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="w-full flex flex-wrap gap-x-8 gap-y-10 items-start">
              {sortedBucketKeys.map((bucketKey, bucketIndex) => {
                const projectsInBucket = groupedProjects[bucketKey] || [];
                const count = projectsInBucket.length;
                let gridColsClass = "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
                if (count === 1) {
                  gridColsClass = "grid-cols-1";
                } else if (count === 2) {
                  gridColsClass = "grid-cols-1 md:grid-cols-2";
                }

                const isUnassigned = bucketKey === 'UNASSIGNED';
                const defaultColor = zceneCategoricalPalette[bucketIndex % zceneCategoricalPalette.length];
                const crateColor = isUnassigned ? zceneFallbackColor : (crateColors?.[bucketKey] || defaultColor);
                const crateTextColor = getContrastTextColor(crateColor);
                const isBucketActive = openColorPopover === bucketKey || projectsInBucket.some(p => p.id === activeMenuId);

                return (
                  <div 
                    key={bucketKey} 
                    className={`w-full md:w-fit max-w-full rounded-tr-xl rounded-b-xl rounded-tl-none border border-zinc-800 p-4 relative flex-shrink-0 min-w-0 ${isBucketActive ? 'z-50' : 'z-0'}`}
                    style={{
                      backgroundColor: crateColor.toLowerCase() === '#18181b' ? `${crateColor}26` : `${crateColor}33`
                    }}
                  >
                    {/* Unified Folder Index Tab */}
                    <div 
                      className={`group w-[160px] border-t border-l border-r border-zinc-800 rounded-t-lg text-[9px] font-mono absolute -top-[24.5px] left-[-1px] pl-3 pr-1.5 py-1 flex items-center justify-between h-[25px] select-none ${openColorPopover === bucketKey ? 'z-[70]' : 'z-10'} ${!isUnassigned && isSmallScreen ? 'cursor-pointer active:brightness-95 before:absolute before:inset-[-6px] before:content-[\'\']' : ''}`}
                      style={{
                        backgroundColor: crateColor
                      }}
                      onClick={(e) => {
                        if (!isUnassigned && isSmallScreen) {
                          e.stopPropagation();
                          setOpenColorPopover(openColorPopover === bucketKey ? null : bucketKey);
                        }
                      }}
                    >
                      <div 
                        className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest font-bold"
                        style={{ color: crateTextColor }}
                      >
                        {bucketKey}
                      </div>

                      {/* Trigger Icon */}
                      {!isUnassigned && (
                        <div className="hidden md:group-hover:flex items-center">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOpenColorPopover(openColorPopover === bucketKey ? null : bucketKey); }} 
                            className="flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity cursor-pointer" 
                            style={{ color: crateTextColor }}
                            aria-label="Change crate color"
                          >
                            <span className="material-symbols-outlined !text-[16px]">more_horiz</span>
                          </button>
                        </div>
                      )}

                      {/* Popover UI */}
                      {openColorPopover === bucketKey && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenColorPopover(null)} />
                          <div 
                            className="absolute top-full left-0 mt-1.5 p-2.5 bg-brand-black border border-white/10 rounded-xl shadow-2xl shadow-black z-[70] flex items-center gap-2.5 max-w-[calc(100vw-2rem)] animate-fade-in-down antialiased pointer-events-auto" 
                            onClick={(e) => e.stopPropagation()}
                          >
                            {PROFILE_COLORS.map(color => {
                              const isSelected = crateColor.toLowerCase() === colorHexMap[color.name]?.toLowerCase();
                              const contrastColor = getContrastTextColor(colorHexMap[color.name]);
                              return (
                                <button
                                  key={color.name}
                                  aria-label={`Set crate color to ${color.name}`}
                                  onClick={() => {
                                     onUpdateCrateColor?.(bucketKey, colorHexMap[color.name]);
                                     setOpenColorPopover(null);
                                  }}
                                  className={`w-6 h-6 rounded-full transition-all shrink-0 flex items-center justify-center relative cursor-pointer ${color.class} hover:scale-110 active:scale-95 before:absolute before:inset-[-4px] before:content-[''] ${
                                    isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-105' : 'opacity-85 hover:opacity-100'
                                  }`}
                                >
                                  {isSelected && (
                                    <span className="material-symbols-outlined !text-[13px] font-bold" style={{ color: contrastColor }}>
                                      check
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
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
                          onDuplicateProject={onDuplicateProject}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              
              {/* Standalone Add New Crate Folder */}
              <CreateProjectCard 
                onCreateProject={onCreateProject} 
                isCreatingProject={isCreatingProject} 
              />
            </div>
          ) : (
            /* High-Contrast Tabular List View */
            <div className="w-full overflow-x-auto border border-zinc-800 bg-zinc-900 rounded-2xl">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-widest font-bold bg-zinc-950">
                    <th className="py-4 px-6 font-semibold">Title</th>
                    <th className="py-4 px-6 font-semibold">Modified Date</th>
                    <th className="py-4 px-6 font-semibold">Roots</th>
                    <th className="py-4 px-6 font-semibold">Artists</th>
                    <th className="py-4 px-6 font-semibold">Labels</th>
                    <th className="py-4 px-6 font-semibold">Deep Cuts</th>
                    <th className="py-4 px-6 font-semibold">Status</th>
                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-zinc-900">
                  {sortedBucketKeys.map((bucketKey, bucketIndex) => {
                    const isUnassigned = bucketKey === 'UNASSIGNED';
                    const defaultColor = zceneCategoricalPalette[bucketIndex % zceneCategoricalPalette.length];
                    const crateColor = isUnassigned ? zceneFallbackColor : (crateColors?.[bucketKey] || defaultColor);
                    const crateTextColor = getContrastTextColor(crateColor);
                    
                    return (
                      <React.Fragment key={bucketKey}>
                        {/* Unified Folder Tab Divider Row */}
                        <tr className="select-none pointer-events-none bg-zinc-900">
                          <td colSpan={8} className="pt-6 pb-0 px-6 align-bottom bg-zinc-900 border-none">
                            {/* The Folder Tab */}
                            <div 
                              className={`group w-[140px] sm:w-[160px] border-t border-l border-r border-zinc-800 rounded-t-lg pl-3 pr-1.5 py-1.5 font-mono tracking-widest text-[9px] sm:text-[10px] uppercase font-bold relative -mb-[1px] flex items-center justify-between pointer-events-auto ${openColorPopover === bucketKey ? 'z-[70]' : 'z-0'} ${!isUnassigned && isSmallScreen ? 'cursor-pointer active:brightness-95 before:absolute before:inset-[-6px] before:content-[\'\']' : ''}`}
                              style={{
                                backgroundColor: crateColor
                              }}
                              onClick={(e) => {
                                if (!isUnassigned && isSmallScreen) {
                                  e.stopPropagation();
                                  setOpenColorPopover(openColorPopover === bucketKey ? null : bucketKey);
                                }
                              }}
                            >
                              <div 
                                className="truncate text-ellipsis whitespace-nowrap"
                                style={{ color: crateTextColor }}
                              >
                                {bucketKey}
                              </div>
                              
                              {/* Trigger Icon */}
                              {!isUnassigned && (
                                <div className="hidden md:group-hover:flex items-center pointer-events-auto">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setOpenColorPopover(openColorPopover === bucketKey ? null : bucketKey); }} 
                                    className="flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity cursor-pointer -my-1" 
                                    style={{ color: crateTextColor }}
                                    aria-label="Change crate color"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">more_horiz</span>
                                  </button>
                                </div>
                              )}

                              {/* Popover UI */}
                              {openColorPopover === bucketKey && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenColorPopover(null)} />
                                  <div 
                                    className="absolute top-full left-0 mt-1.5 p-2.5 bg-brand-black border border-white/10 rounded-xl shadow-2xl shadow-black z-[70] flex items-center gap-2.5 max-w-[calc(100vw-2rem)] animate-fade-in-down antialiased pointer-events-auto" 
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {PROFILE_COLORS.map(color => {
                                      const isSelected = crateColor.toLowerCase() === colorHexMap[color.name]?.toLowerCase();
                                      const contrastColor = getContrastTextColor(colorHexMap[color.name]);
                                      return (
                                        <button
                                          key={color.name}
                                          aria-label={`Set crate color to ${color.name}`}
                                          onClick={() => {
                                             onUpdateCrateColor?.(bucketKey, colorHexMap[color.name]);
                                             setOpenColorPopover(null);
                                          }}
                                          className={`w-6 h-6 rounded-full transition-all shrink-0 flex items-center justify-center relative cursor-pointer ${color.class} hover:scale-110 active:scale-95 before:absolute before:inset-[-4px] before:content-[''] ${
                                            isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-105' : 'opacity-85 hover:opacity-100'
                                          }`}
                                        >
                                          {isSelected && (
                                            <span className="material-symbols-outlined !text-[13px] font-bold" style={{ color: contrastColor }}>
                                              check
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                      {groupedProjects[bucketKey].map((project, index) => {
                        const {
                          sceneCount,
                          seedList,
                          rootArtistsCount,
                          recommendedCount,
                          labelCount,
                          deepCutsCount,
                        } = computeProjectCardMetrics(project);
                        const displayTitle = getProjectDisplayTitle(project);
                        const formattedDate = formatSystemTimestamp(project.updatedAt);
                        const hasGraphNodes = !!project.graphData && !project.graphData.includes('"nodes":[]');
                        const isMapped = project.status === 'completed';
                        
                        const rowBg = index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40';
                        const tdClass = `transition-colors ${rowBg} group-hover:bg-white/5 ${index === 0 ? 'relative z-10' : ''}`;
                        
                        return (
                          <tr 
                            key={project.id}
                            onClick={() => onSelectProject(project.id)}
                            className={`group border-b border-zinc-800/30 cursor-pointer ${activeMenuId === project.id ? 'relative z-40' : ''}`}
                          >
                            <td className={`py-4 px-6 font-medium text-white group-hover:text-primary transition-colors ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined !text-lg transition-colors text-zinc-555 group-hover:text-primary">
                                  folder
                                </span>
                                <span className="truncate max-w-[240px]">{displayTitle}</span>
                                <span className="text-[10px] uppercase tracking-widest text-zinc-300 font-bold px-2 py-0.5 bg-zinc-900/50 rounded-full border border-white/10 font-mono whitespace-nowrap">
                                  SCENES: {sceneCount || 1}
                                </span>
                              </div>
                            </td>
                            <td className={`py-4 px-6 text-zinc-400 text-sm font-mono font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {formattedDate}
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                ROOT ARTISTS: {rootArtistsCount}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                ARTISTS: {recommendedCount}
                              </span>
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              {labelCount > 0 ? (
                                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                  LABELS: {labelCount}
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 py-0.5 bg-zinc-900 rounded-full border border-white/5 font-mono whitespace-nowrap">
                                  -
                                </span>
                              )}
                            </td>
                            <td className={`py-4 px-6 font-normal ${tdClass}`}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
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
                            <td className={`py-4 px-6 text-right ${tdClass} ${activeMenuId === project.id ? 'relative z-50' : ''}`} onClick={(e) => e.stopPropagation()}>
                              {index === 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-800/80 z-20 pointer-events-none" />}
                              <div className="flex items-center justify-end relative">
                                <button
                                  onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                                  className="w-9 h-9 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer flex items-center justify-center shrink-0 relative before:absolute before:inset-[-4px] before:content-['']"
                                >
                                  <span className="material-symbols-outlined !text-xl">more_vert</span>
                                </button>
                                
                                {activeMenuId === project.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                    <div className="absolute right-0 top-10 w-56 z-[70] overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1.5 shadow-2xl shadow-black pointer-events-auto text-left animate-fade-in-down antialiased space-y-0.5">
                                      <button
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleRenameClick(project);
                                        }}
                                        className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2.5 group"
                                      >
                                        <span className="material-symbols-outlined !text-[18px] text-zinc-500">edit</span>
                                        Rename
                                      </button>
                                          {onShareProject && (
                                            <button
                                              onClick={() => {
                                                setActiveMenuId(null);
                                                onShareProject(project);
                                              }}
                                              className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2.5 group"
                                            >
                                              <span className="material-symbols-outlined !text-[18px] text-zinc-500">share</span>
                                              Share
                                            </button>
                                          )}
                                          {onDuplicateProject && (
                                            <button
                                              onClick={() => {
                                                setActiveMenuId(null);
                                                onDuplicateProject(project);
                                              }}
                                              className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all rounded-lg flex items-center gap-2.5 group"
                                            >
                                              <span className="material-symbols-outlined !text-[18px] text-zinc-500">content_copy</span>
                                              Duplicate
                                            </button>
                                          )}
                                          <div className="border-t border-zinc-800/80 my-2" />
                                          <button
                                            onClick={() => {
                                              setActiveMenuId(null);
                                              setProjectToDelete(project.id);
                                            }}
                                            className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-[#ef4444] hover:bg-[#ef4444]/10 transition-all rounded-lg flex items-center gap-2.5 group cursor-pointer"
                                          >
                                            <span className="material-symbols-outlined !text-[18px] text-[#ef4444]">delete</span>
                                            Move to Trash
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
                    );
                  })}
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
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = renameValue.trim();
                    if (trimmed && onRenameProject) {
                      onRenameProject(projectToRename.id, trimmed);
                      setProjectToRename(null);
                    }
                  }
                }}
                className="w-full h-10 appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
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
                className="px-4 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              >
                Save
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}

      {/* Custom Move to Trash Confirmation Modal */}
      {projectToDelete && (
        <ModalBackdrop className="z-[110]" onClick={() => setProjectToDelete(null)}>
          <ModalContainer className="text-left">
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 !text-[18px]">delete</span>
                <h3 className="text-base font-medium text-white">
                  Move to 30-Day Trash
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
              <p className="leading-relaxed text-zinc-300">
                Are you sure you want to move <span className="font-semibold text-white">{projects.find(p => p.id === projectToDelete)?.name || 'this Zcene'}</span> to Trash? Your canvas mapping, node coordinates, and audio details will be safely preserved for 30 days and can be restored at zero token cost (0T). After 30 days, mapping data will be permanently purged to conserve storage, while historical curation telemetry remains preserved in your lifetime Discovery Ledger.
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
                  handleTrash(projectToDelete);
                  setProjectToDelete(null);
                }} 
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl text-sm transition-opacity"
              >
                Move to Trash
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}
    </div>
  );
};

export default Dashboard;

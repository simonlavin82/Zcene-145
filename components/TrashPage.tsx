import React, { useState, useMemo, useRef } from 'react';
import Header from './Header';
import ViewToggle from './ViewToggle';
import { DashboardProjectCard } from './DashboardProjectCard';
import { Project, View } from '../types';
import { User } from 'firebase/auth';
import { getProjectDisplayTitle, isNodeInSeedList } from '../services/artistCacheService';
import { formatSystemTimestamp } from '../utils/formatters';
import { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';

export interface TrashPageProps {
  user: User | null;
  projects: Project[];
  onSelectProject?: (projectId: string) => void;
  onRestoreProject?: (projectId: string) => void;
  onPermanentDeleteProject?: (projectId: string) => void;
  onNavigate: (view: any) => void;
  onNavigateMenu?: (path: string) => void;
  isActive: boolean;
  onClose?: () => void;
  onLogoClick?: () => void;
  isSmallScreen?: boolean;
  stackCount?: number;
  isStackNew?: boolean;
  onOpenStack?: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  isAdmin?: boolean;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onRestartWalkthrough?: () => void;
  tokenBalance?: number;
}

export const TrashPage: React.FC<TrashPageProps> = ({
  user,
  projects,
  onSelectProject,
  onRestoreProject,
  onPermanentDeleteProject,
  onNavigate,
  onNavigateMenu,
  isActive,
  onClose,
  onLogoClick,
  isSmallScreen = false,
  stackCount = 0,
  isStackNew = false,
  onOpenStack,
  onLogout,
  onDeleteAccount,
  isAdmin = false,
  isProfileOpen,
  setIsProfileOpen,
  isDeleteAccountModalOpen,
  setIsDeleteAccountModalOpen,
  isMenuOpen,
  setIsMenuOpen,
  onRestartWalkthrough,
  tokenBalance = 0,
}) => {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'alphabetical'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [projectToPurge, setProjectToPurge] = useState<string | null>(null);

  const trashedProjects = useMemo(() => {
    return projects.filter(p => p.status === 'trashed');
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let result = [...trashedProjects];

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((p) => {
        const rawName = (p.name || '').toLowerCase();
        if (rawName.includes(query)) return true;
        const displayTitle = getProjectDisplayTitle(p).toLowerCase();
        if (displayTitle.includes(query)) return true;
        if (p.seedArtists && p.seedArtists.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'alphabetical') {
        const titleA = getProjectDisplayTitle(a).toLowerCase();
        const titleB = getProjectDisplayTitle(b).toLowerCase();
        return titleA.localeCompare(titleB);
      }
      // Recent (by trashedAt or updatedAt)
      const getTime = (p: Project) => {
        if (p.trashedAt?.toMillis) return p.trashedAt.toMillis();
        if (p.trashedAt?.toDate) return p.trashedAt.toDate().getTime();
        if (p.trashedAt?.seconds) return p.trashedAt.seconds * 1000;
        if (p.updatedAt?.toMillis) return p.updatedAt.toMillis();
        if (p.updatedAt?.toDate) return p.updatedAt.toDate().getTime();
        if (p.updatedAt?.seconds) return p.updatedAt.seconds * 1000;
        return 0;
      };
      return getTime(b) - getTime(a);
    });

    return result;
  }, [trashedProjects, searchQuery, sortBy]);

  const projectToPurgeObj = useMemo(() => {
    if (!projectToPurge) return null;
    return trashedProjects.find(p => p.id === projectToPurge) || null;
  }, [projectToPurge, trashedProjects]);

  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white selection:bg-primary selection:text-black">
      <Header
        user={user}
        view="dashboard"
        isSmallScreen={isSmallScreen}
        isMagazineViewOpen={false}
        stackCount={stackCount}
        isStackNew={isStackNew}
        onOpenStack={onOpenStack}
        onNavigate={onNavigateMenu || onNavigate}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        isAdmin={isAdmin}
        tokenBalance={tokenBalance}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        onRestartWalkthrough={onRestartWalkthrough}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Back Button */}
          <div className="pt-6 pb-2">
            <button
              onClick={() => {
                if (onClose) {
                  onClose();
                } else if (window.history.length > 1) {
                  window.history.back();
                } else {
                  onNavigate(View.Dashboard);
                }
              }}
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back
            </button>
          </div>

          {/* Header Info & Controls */}
          <div className="border-b border-zinc-800 pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-3xl font-medium text-white mb-2">Trash</h2>
              <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
                Trashed Zcenes are preserved for 30 days and can be restored at <strong>0T</strong> before workspace mapping is permanently purged. Historical curation telemetry and token receipts remain immutable in your Discovery Ledger.
              </p>
            </div>

            {/* Toolbar Controls */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
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
                title={!isSearchExpanded ? "Find in trash..." : undefined}
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
                  placeholder="Find in trash..."
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
          </div>

          {/* Content Area */}
          {trashedProjects.length === 0 ? (
            /* Trash is Empty State */
            <div className="w-full flex flex-col items-center justify-center py-20 px-4 text-center bg-zinc-950/40 border border-dashed border-zinc-800/80 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
                <span className="material-symbols-outlined !text-3xl">auto_delete</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1.5">
                Trash is empty
              </h3>
              <p className="text-sm text-zinc-400 max-w-md">
                Trashed Zcenes will appear here for 30 days with 0T restore capability before being automatically compacted.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            /* Filter produced 0 results */
            <div className="w-full flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-950/40 border border-dashed border-zinc-800/80 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
                <span className="material-symbols-outlined !text-2xl">search_off</span>
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                No Zcenes found matching &ldquo;{searchQuery}&rdquo;
              </h3>
              <p className="text-sm text-zinc-400 max-w-md mb-6">
                Try searching for a different project title or seed artist.
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
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <DashboardProjectCard
                  key={project.id}
                  project={project}
                  onSelectProject={onSelectProject || (() => {})}
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  handleRenameClick={() => {}}
                  setProjectToDelete={() => {}}
                  onRestoreProject={onRestoreProject}
                  setProjectToPurge={setProjectToPurge}
                />
              ))}
            </div>
          ) : (
            /* Tabular List View */
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
                  {filteredProjects.map((project, index) => {
                    const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                    const displayTitle = getProjectDisplayTitle(project);
                    const formattedDate = formatSystemTimestamp(project.updatedAt);
                    let deepCutsCount = project.activeNodesCount ?? 0;
                    let recommendedCount = 0;
                    let labelCount = 0;

                    if (project.graphData) {
                      try {
                        const pg = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
                        if (pg && Array.isArray(pg.nodes)) {
                          const rawActive = project.activeNodes || [];
                          deepCutsCount = pg.nodes.filter((n: any) =>
                            rawActive.includes(n.id) && (n.type === 'artist' || n.type === 'label' || !n.type)
                          ).length;
                          const artistNodes = pg.nodes.filter((n: any) => n.type === 'artist' || !n.type);
                          recommendedCount = artistNodes.filter((n: any) => !isNodeInSeedList(n.id || n.label || '', seedList)).length;
                          labelCount = pg.nodes.filter((n: any) => n.type === 'label').length;
                        }
                      } catch (e) { /* ignore */ }
                    }

                    const purgeMs = project.purgeAt?.toMillis
                      ? project.purgeAt.toMillis()
                      : project.purgeAt?.toDate
                      ? project.purgeAt.toDate().getTime()
                      : project.purgeAt?.seconds
                      ? project.purgeAt.seconds * 1000
                      : typeof project.purgeAt === 'string' || typeof project.purgeAt === 'number'
                      ? new Date(project.purgeAt).getTime()
                      : project.trashedAt
                      ? (project.trashedAt?.toMillis ? project.trashedAt.toMillis() : new Date(project.trashedAt).getTime()) + 30 * 24 * 3600 * 1000
                      : Date.now();
                    const daysLeft = Math.max(0, Math.ceil((purgeMs - Date.now()) / (1000 * 60 * 60 * 24)));

                    const rowBg = index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40';
                    const tdClass = `transition-colors ${rowBg} group-hover:bg-white/5`;

                    return (
                      <tr key={project.id} className="group border-b border-zinc-800/30">
                        <td className={`py-4 px-6 font-medium text-white ${tdClass}`}>
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined !text-lg text-amber-400">
                              auto_delete
                            </span>
                            <span className="truncate max-w-[240px]">{displayTitle}</span>
                          </div>
                        </td>
                        <td className={`py-4 px-6 text-zinc-400 text-sm font-mono font-normal ${tdClass}`}>
                          {formattedDate}
                        </td>
                        <td className={`py-4 px-6 font-normal ${tdClass}`}>
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                            ROOT ARTISTS: {seedList.length}
                          </span>
                        </td>
                        <td className={`py-4 px-6 font-normal ${tdClass}`}>
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                            ARTISTS: {recommendedCount}
                          </span>
                        </td>
                        <td className={`py-4 px-6 font-normal ${tdClass}`}>
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
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-full border border-white/5 font-mono whitespace-nowrap">
                            DEEP CUTS: {deepCutsCount}
                          </span>
                        </td>
                        <td className={`py-4 px-6 font-normal ${tdClass}`}>
                          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20 whitespace-nowrap font-mono">
                            {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                          </span>
                        </td>
                        <td className={`py-4 px-6 text-right ${tdClass}`} onClick={(e) => e.stopPropagation()}>
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
                                <div className="absolute right-0 mt-8 w-44 z-50 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1 shadow-2xl shadow-black pointer-events-auto text-left antialiased">
                                  {onRestoreProject && (
                                    <button
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        onRestoreProject(project.id);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-all rounded-lg flex items-center gap-2 group cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined !text-[16px] text-emerald-400">restore</span>
                                      Restore (0T)
                                    </button>
                                  )}
                                  <div className="border-t border-zinc-800/80 my-1" />
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setProjectToPurge(project.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/10 transition-all rounded-lg flex items-center gap-2 group cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined !text-[16px] text-[#ef4444]">delete_forever</span>
                                    Delete Forever
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Custom Permanent Purge Confirmation Modal */}
      {projectToPurge && (
        <ModalBackdrop className="z-[110]" onClick={() => setProjectToPurge(null)}>
          <ModalContainer className="text-left">
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 !text-[18px]">delete_forever</span>
                <h3 className="text-base font-medium text-white">
                  Permanently Purge Canvas?
                </h3>
              </div>
              <button
                onClick={() => setProjectToPurge(null)}
                className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
              >
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

            <ModalBody className="space-y-4">
              <p className="leading-relaxed text-zinc-300">
                Are you sure you want to permanently delete <span className="font-semibold text-white">{projectToPurgeObj?.name || 'this Zcene'}</span>? Workspace mapping, node coordinates, and audio details will be immediately compacted to null and cannot be recovered. Lifetime curation telemetry and token receipts remain preserved in your Discovery Ledger.
              </p>
            </ModalBody>

            <ModalFooter>
              <button
                onClick={() => setProjectToPurge(null)}
                className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onPermanentDeleteProject?.(projectToPurge);
                  setProjectToPurge(null);
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm transition-opacity"
              >
                Delete Forever
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}
    </div>
  );
};

export default TrashPage;


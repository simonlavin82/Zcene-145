import React from 'react';
import Header from './Header';
import ViewToggle from './ViewToggle';
import { Project, StackItem } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';

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
  const [sortBy, setSortBy] = React.useState<'recent' | 'title'>('recent');
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);

  const sortDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  const sortedProjects = React.useMemo(() => {
    const list = [...projects];
    if (sortBy === 'recent') {
      list.sort((a, b) => {
        const timeA = a.updatedAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'title') {
      list.sort((a, b) => {
        const seedListA = a.seedArtists ? a.seedArtists.split('::').filter(Boolean) : [];
        const titleA = (a.name || (seedListA.length > 0 ? seedListA[0] : "Untitled Zcene")).toLowerCase();
        
        const seedListB = b.seedArtists ? b.seedArtists.split('::').filter(Boolean) : [];
        const titleB = (b.name || (seedListB.length > 0 ? seedListB[0] : "Untitled Zcene")).toLowerCase();
        
        return titleA.localeCompare(titleB);
      });
    }
    return list;
  }, [projects, sortBy]);

  return (
    <div 
      className="absolute inset-0 flex flex-col overflow-hidden bg-background-dark text-zinc-200 font-display"
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

      
      <main className={`flex-1 overflow-y-auto ${isSmallScreen ? 'px-4' : 'px-6 lg:px-8'} py-8 relative z-10`}>
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col items-center justify-center text-center md:flex-row md:justify-between md:items-center gap-4">
            <h1 className="text-lg font-bold uppercase tracking-normal text-zinc-200">YOUR ZCENES</h1>
            
            <div className="flex items-center gap-2 h-[36px] w-full justify-center md:w-auto md:justify-end">
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

              {/* Sorting Dropdown */}
              <div className="relative flex items-center h-full" ref={sortDropdownRef}>
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className={`h-full flex flex-shrink-0 items-center justify-center rounded-xl border border-zinc-700/50 shadow-lg transition-colors leading-none relative pl-2 pr-3 gap-2 cursor-pointer text-xs font-medium ${
                    isSortOpen 
                      ? 'bg-zinc-800 text-white' 
                      : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800'
                  }`}
                >
                  <span className="material-symbols-outlined !text-[18px]">sort</span>
                  <span>{sortBy === 'recent' ? 'Recent' : 'Title (A-Z)'}</span>
                  <span className="material-symbols-outlined !text-[18px] transition-transform duration-200" style={{ transform: isSortOpen ? 'rotate(180deg)' : 'none' }}>keyboard_arrow_down</span>
                </button>
                
                {isSortOpen && (
                  <div className="absolute right-0 top-full mt-2 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1 z-50">
                    <button
                      onClick={() => {
                        setSortBy('recent');
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 text-xs font-normal rounded-lg flex items-center justify-between transition-colors ${sortBy === 'recent' ? 'bg-primary/10 text-primary' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                    >
                      <span>Recent</span>
                      {sortBy === 'recent' && <span className="material-symbols-outlined !text-[14px] text-primary">check</span>}
                    </button>
                    <button
                      onClick={() => {
                        setSortBy('title');
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 text-xs font-normal rounded-lg flex items-center justify-between transition-colors ${sortBy === 'title' ? 'bg-primary/10 text-primary' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                    >
                      <span>Title (A-Z)</span>
                      {sortBy === 'title' && <span className="material-symbols-outlined !text-[14px] text-primary">check</span>}
                    </button>
                  </div>
                )}
              </div>

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
            <div className="bg-zinc-900 border border-zinc-700/50 rounded-none p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-800 rounded-none flex items-center justify-center text-zinc-550 mx-auto">
                <span className="material-symbols-outlined !text-3xl">folder_open</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-medium text-white">No Zcenes yet</h3>
                <p className="text-zinc-550 text-sm">Create your first music discovery project to get started.</p>
              </div>
              <button 
                onClick={onCreateProject}
                className="text-primary font-medium hover:underline text-sm"
              >
                Create a New Zcene
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedProjects.map((project) => {
                const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
                
                return (
                  <motion.div
                    key={project.id}
                    whileHover={{ y: -4 }}
                    onClick={() => onSelectProject(project.id)}
                    className="group relative bg-zinc-900 border border-zinc-700/50 rounded-none p-5 hover:border-primary/50 transition-all cursor-pointer flex flex-col justify-between min-h-[160px] shadow-xl"
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
                                  className="w-full px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all flex items-center gap-2"
                                >
                                  <span className="material-symbols-outlined !text-sm">delete</span>
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 tracking-wider font-bold">
                        {project.updatedAt ? `Edited ${formatProjectTimestamp(project.updatedAt)}` : 'New Project'}
                      </p>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold px-2 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono">
                          {seedList.length} Seeds
                        </span>
                        {project.graphData && (
                          <span className="text-[9px] uppercase tracking-widest text-primary/60 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/10">
                            Mapped
                          </span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-zinc-750 group-hover:text-primary transition-all !text-xl transform group-hover:translate-x-1 duration-300">
                        arrow_forward
                      </span>
                    </div>
                  </motion.div>
                );
              })}
              
              {/* Add New Card */}
              <button 
                onClick={onCreateProject}
                disabled={isCreatingProject}
                className="group relative bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-none p-5 flex flex-col items-center justify-center gap-3 transition-all min-h-[160px] hover:border-primary/50 disabled:opacity-50 cursor-pointer overflow-hidden"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-primary group-hover:text-brand-black flex items-center justify-center text-zinc-500 transition-all relative z-10">
                  {isCreatingProject ? (
                    <span className="material-symbols-outlined animate-spin !text-2xl">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined !text-2xl">add</span>
                  )}
                </div>
                <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-350 transition-colors relative z-10">
                  {isCreatingProject ? 'Creating Zcene...' : 'Create New Zcene'}
                </span>
              </button>
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
                    <th className="py-4 px-6 font-semibold">Status</th>
                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 bg-zinc-900">
                  {sortedProjects.map((project) => {
                    const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                    const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
                    const formattedDate = formatProjectTimestamp(project.updatedAt);
                    const isMapped = !!project.graphData;
                    
                    return (
                      <tr 
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        className="group hover:bg-zinc-800 cursor-pointer transition-colors bg-zinc-900"
                      >
                        <td className="py-4 px-6 font-medium text-white group-hover:text-primary transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-zinc-500 !text-lg group-hover:text-primary transition-colors">folder</span>
                            <span className="truncate max-w-[240px]">{displayTitle}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-zinc-400 text-sm font-mono font-normal">
                          {formattedDate}
                        </td>
                        <td className="py-4 px-6 font-normal">
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono">
                            {seedList.length} Seeds
                          </span>
                        </td>
                        <td className="py-4 px-6 font-normal">
                          {isMapped ? (
                            <span className="text-[10px] uppercase tracking-widest text-primary/70 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20">
                              Mapped
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-800">
                              Unmapped
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
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
                                    className="w-full px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all flex items-center gap-2"
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Custom Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-none p-8 max-w-sm w-full space-y-6 shadow-2xl"
          >
            <div className="space-y-2 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-none flex items-center justify-center text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined !text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-medium text-white">Delete Zcene?</h3>
              <p className="text-zinc-400 text-sm">This action cannot be undone. All mapping and chat history for this Zcene will be permanently removed.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setProjectToDelete(null)}
                className="flex-1 px-6 py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onDeleteProject(projectToDelete);
                  setProjectToDelete(null);
                }}
                className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

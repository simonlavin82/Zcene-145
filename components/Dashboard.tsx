import React from 'react';
import Header from './Header';
import { Project, StackItem } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';

interface DashboardProps {
  user: User | null;
  projects: Project[];
  stack: StackItem[];
  isStackNew: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  isCreatingProject?: boolean;
  onDeleteProject: (projectId: string) => void;
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
  setIsMenuOpen
}) => {
  const [projectToDelete, setProjectToDelete] = React.useState<string | null>(null);

  return (
    <div 
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
            backgroundImage: 'url("https://storage.googleapis.com/zcene/Zcene%20general%20background.jpeg")',
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
      />

      
      <main className={`flex-1 overflow-y-auto ${isSmallScreen ? 'px-4' : 'px-6 lg:px-8'} py-8 relative z-10`}>
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium text-white">Your Zcenes</h1>
            <button 
              onClick={onCreateProject}
              disabled={isCreatingProject}
              className="px-6 py-2 bg-primary text-brand-black rounded-xl font-medium hover:opacity-90 active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreatingProject ? (
                <>
                  <span className="material-symbols-outlined animate-spin !text-lg">progress_activity</span>
                  Creating...
                </>
              ) : (
                'New Zcene'
              )}
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-700/50 rounded-[32px] p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center text-zinc-500 mx-auto">
                <span className="material-symbols-outlined !text-3xl">folder_open</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-medium text-white">No Zcenes yet</h3>
                <p className="text-zinc-500 text-sm">Create your first music discovery project to get started.</p>
              </div>
              <button 
                onClick={onCreateProject}
                className="text-primary font-medium hover:underline text-sm"
              >
                Create a New Zcene
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => {
                const seedList = project.seedArtists ? project.seedArtists.split('::').filter(Boolean) : [];
                const displayTitle = project.name || (seedList.length > 0 ? seedList[0] : "Untitled Zcene");
                
                return (
                  <motion.div
                    key={project.id}
                    whileHover={{ y: -4 }}
                    onClick={() => onSelectProject(project.id)}
                    className="group relative bg-zinc-900/60 backdrop-blur-md border border-zinc-700/50 rounded-[24px] p-5 hover:border-primary/30 transition-all cursor-pointer flex flex-col justify-between min-h-[160px] shadow-xl"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="p-2.5 bg-zinc-800/80 rounded-xl text-primary/80 group-hover:bg-primary group-hover:text-brand-black transition-all duration-300">
                          <span className="material-symbols-outlined !text-xl">hub</span>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(project.id);
                          }}
                          className={`p-2 text-zinc-600 hover:text-red-500 transition-colors ${isSmallScreen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          title="Delete Project"
                        >
                          <span className="material-symbols-outlined !text-xl">delete</span>
                        </button>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-medium text-white group-hover:text-primary transition-colors truncate">
                          {displayTitle}
                        </h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                          {project.updatedAt ? `Edited ${new Date(project.updatedAt.seconds * 1000).toLocaleDateString()}` : 'New Project'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold px-2 py-0.5 bg-zinc-800/50 rounded-md border border-white/5">
                          {seedList.length} Seeds
                        </span>
                        {project.graphData && (
                          <span className="text-[9px] uppercase tracking-widest text-primary/60 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/10">
                            Mapped
                          </span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-zinc-700 group-hover:text-primary transition-all !text-xl transform group-hover:translate-x-1 duration-300">
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
                className="group border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-[24px] p-5 flex flex-col items-center justify-center gap-3 transition-all min-h-[160px] bg-zinc-900/20 hover:bg-zinc-900/40 disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-primary group-hover:bg-zinc-700 transition-all">
                  {isCreatingProject ? (
                    <span className="material-symbols-outlined animate-spin !text-2xl">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined !text-2xl">add</span>
                  )}
                </div>
                <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300">
                  {isCreatingProject ? 'Creating Zcene...' : 'Create New Zcene'}
                </span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Custom Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 max-w-sm w-full space-y-6 shadow-2xl"
          >
            <div className="space-y-2 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined !text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-medium text-white">Delete Zcene?</h3>
              <p className="text-zinc-400 text-sm">This action cannot be undone. All mapping and chat history for this Zcene will be permanently removed.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setProjectToDelete(null)}
                className="flex-1 px-6 py-3 bg-zinc-800 text-white rounded-2xl font-medium hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onDeleteProject(projectToDelete);
                  setProjectToDelete(null);
                }}
                className="flex-1 px-6 py-3 bg-red-500 text-white rounded-2xl font-medium hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
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

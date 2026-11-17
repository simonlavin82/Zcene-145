import React from 'react';

export const ModalBackdrop: React.FC<{ children: React.ReactNode; onClick?: () => void; className?: string }> = ({ children, onClick, className = '' }) => {
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zcene:stop-audio'));
    }
  }, []);

  return (
    <div 
      className={`fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-auto ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export const ModalContainer: React.FC<{ children: React.ReactNode; className?: string; [key: string]: any }> = ({ children, className = '', ...rest }) => (
  <div 
    className={`bg-background-dark border-t border-x-0 sm:border border-zinc-600 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] sm:max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-slide-up-sheet sm:animate-fade-in-down ${className}`}
    style={{ animationDuration: '200ms' }}
    onClick={e => e.stopPropagation()}
    {...rest}
  >
    {children}
  </div>
);

export const ModalHeader: React.FC<{ children: React.ReactNode; className?: string; [key: string]: any }> = ({ children, className = '', ...rest }) => (
  <header className={`p-3 bg-zinc-900 border-b border-zinc-700 flex justify-between items-center rounded-t-2xl sm:rounded-t-2xl ${className}`} {...rest}>
    {children}
  </header>
);

export const ModalBody: React.FC<{ children: React.ReactNode; className?: string; [key: string]: any }> = ({ children, className = '', ...rest }) => (
  <div className={`p-4 text-sm text-zinc-400 overflow-y-auto ${className}`} {...rest}>
    {children}
  </div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string; [key: string]: any }> = ({ children, className = '', ...rest }) => (
  <footer className={`p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2 sm:rounded-b-2xl ${className}`} {...rest}>
    {children}
  </footer>
);

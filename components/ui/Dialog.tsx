import React from 'react';

export const ModalBackdrop: React.FC<{ children: React.ReactNode; onClick?: () => void; className?: string }> = ({ children, onClick, className = '' }) => (
  <div 
    className={`fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto ${className}`}
    style={{ animationDuration: '200ms' }}
    onClick={onClick}
  >
    {children}
  </div>
);

export const ModalContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div 
    className={`bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in-down ${className}`}
    style={{ animationDuration: '200ms' }}
    onClick={e => e.stopPropagation()}
  >
    {children}
  </div>
);

export const ModalHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <header className={`p-3 bg-zinc-900 border-b border-zinc-700 flex justify-between items-center ${className}`}>
    {children}
  </header>
);

export const ModalBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`p-4 text-sm text-zinc-400 ${className}`}>
    {children}
  </div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <footer className={`p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2 ${className}`}>
    {children}
  </footer>
);

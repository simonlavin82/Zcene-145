// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<any, any> {
  public state = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Auto-heal chunk load errors (React lazy loading mismatch)
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed');

    if (isChunkLoadError) {
      const lastReload = sessionStorage.getItem('chunk_error_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload) > 10000) {
        sessionStorage.setItem('chunk_error_reload', now.toString());
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.history.pushState(null, '', '/');
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-brand-black flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-6 animate-fade-in-down">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center border border-red-500/20">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">Curation Pipeline Disrupted</h1>
              <p className="text-zinc-400 text-sm leading-relaxed">
                The visual canvas encountered a structural anomaly. 
                Re-initialise the session or return to the main dashboard.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl text-left overflow-hidden">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Error Details</p>
                <p className="text-xs font-mono text-red-400/80 break-words line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
              >
                <Home className="w-4 h-4" />
                Exit Curation
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-white hover:opacity-90 text-brand-black px-4 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Re-initialise
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

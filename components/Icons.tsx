import React, { useState, useEffect } from 'react';
import * as d3 from 'd3';

export const ZceneLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="255" height="90" viewBox="0 0 255 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M93 13V23.9714H55V66.0286H93V77H54.75C51.2286 77 48.1929 75.781 45.6429 73.3429C43.2143 70.7829 42 67.7352 42 64.2V25.8C42 22.2648 43.2143 19.2781 45.6429 16.84C48.1929 14.28 51.2286 13 54.75 13H93Z" fill="currentColor"/>
    <path d="M152 77H108C104.962 77 102.343 75.781 100.143 73.3429C98.0476 70.7829 97 67.7352 97 64.2V25.8C97 22.2648 98.0476 19.2781 100.143 16.84C102.343 14.28 104.962 13 108 13H141C144.038 13 146.605 14.28 148.7 16.84C150.9 19.2781 152 22.2648 152 25.8V38.6L141 51H112V40H141V23.9714H108V66.0286H152V77Z" fill="currentColor"/>
    <path d="M255 90H211C207.962 90 205.343 88.781 203.143 86.3429C201.048 83.7829 200 80.7352 200 77.2V38.8C200 35.2648 201.048 32.2781 203.143 29.84C205.343 27.28 207.962 26 211 26H244C247.038 26 249.605 27.28 251.7 29.84C253.9 32.2781 255 35.2648 255 38.8V51.6L244 64H215V53H244V36.9714H211V79.0286H255V90Z" fill="currentColor"/>
    <path d="M211 77H200V23.9714H167V77H156V13H167H200C203.038 13 205.605 14.28 207.7 16.84C209.9 19.2781 211 22.2648 211 25.8V77Z" fill="currentColor"/>
    <path d="M55 64H0V51L40 12V10.9714H0V0H55V13L14.6667 52V53.0286H55V64Z" fill="currentColor"/>
  </svg>
);

export const ZceneAbbreviatedLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="93" height="80" viewBox="0 0 93 80" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
    <path d="M93 13V23.9714H55V66.0286H93V77H54.75C51.2286 77 48.1929 75.781 45.6429 73.3429C43.2143 70.7829 42 67.7352 42 64.2V25.8C42 22.2648 43.2143 19.2781 45.6429 16.84C48.1929 14.28 51.2286 13 54.75 13H93Z" fill="currentColor"/>
    <path d="M55 64H0V51L40 12V10.9714H0V0H55V13L14.6667 52V53.0286H55V64Z" fill="currentColor"/>
  </svg>
);

export const FaviconLogo: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 182 182" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="91" cy="90" r="90" fill="#F6E468"/>
        <path d="M146 59.3765V72.3534H101.054V122.098H146V135.075H100.758C96.593 135.075 93.0024 133.634 89.9862 130.75C87.1137 127.722 85.6775 124.117 85.6775 119.936V74.5163C85.6775 70.3348 87.1137 66.8022 89.9862 63.9184C93.0024 60.8904 96.593 59.3765 100.758 59.3765H146Z" fill="#111113"/>
        <path d="M101.054 119.699H36V104.323L83.3118 58.1935V56.977H36V44H101.054V59.3763L53.3477 105.505V106.722H101.054V119.699Z" fill="#111113"/>
    </svg>
);

export const HelpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 'inherit' }}>help_outline</span>
);

export const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 'inherit' }}>mic</span>
);

export const StackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 'inherit' }}>layers</span>
);

export const LibraryIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 'inherit' }}>queue_music</span>
);

export const VisibilityIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const VisibilityOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const GRAPH_THINKING_STEPS = [
    "Analysing seed artists...",
    "Identifying core genres and influences...",
    "Searching for related artists...",
    "Mapping connections to record labels...",
    "Discovering influential albums...",
    "Plotting countries of origin...",
    "Cross-referencing musical relationships...",
    "Building the node structure...",
    "Establishing relational links...",
    "Finalising graph data...",
    "Sanitising connections...",
    "Rendering your Zcene...",
];

export const DETAIL_THINKING_STEPS = [
    "Contacting live model orchestration...",
    "Scanning live cultural archives...",
    "Synthesising musical profile and discography...",
    "Indexing audio-visual fragments...",
    "Validating media player synchronisation...",
    "Archiving node relationships...",
    "Finalising deep insights...",
];

interface LoadingSpinnerProps {
    steps?: string[];
    subtext?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
    steps = GRAPH_THINKING_STEPS, 
    subtext = "Mapping your Zcene connections... This usually takes a minute or two to find the best musical paths."
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsVisible(false);
            setTimeout(() => {
                setCurrentStep(prevStep => (prevStep + 1) % steps.length);
                setIsVisible(true);
            }, 500); // Wait for fade out before switching text
        }, 3000);
        return () => clearInterval(interval);
    }, [steps]);

    return (
        <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-12 h-12 border-4 border-zinc-500 border-t-primary animate-spin rounded-full"></div>
            <div className="flex flex-col items-center gap-1.5">
                <div className="h-6 flex items-center justify-center">
                    <p className={`text-sm text-zinc-300 font-medium transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                        {steps[currentStep]}
                    </p>
                </div>
                {subtext && (
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium opacity-80">
                        {subtext}
                    </p>
                )}
            </div>
        </div>
    );
};

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ size = 'md', className = '' }) => {
    const sizeClasses = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-2',
        lg: 'w-12 h-12 border-4',
    };

    return (
        <div className={`animate-spin rounded-full border-zinc-600 border-t-zinc-200 ${sizeClasses[size]} ${className}`} role="status">
            <span className="sr-only">Loading...</span>
        </div>
    );
};

export const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="4" ry="4"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
  </svg>
);

export const LegendSymbol: React.FC<{ symbol: d3.SymbolType; size?: number; className?: string; style?: React.CSSProperties; }> = ({ symbol, size = 64, className, style }) => {
    const path = d3.symbol().type(symbol).size(size)();
    
    let transform = "";
    if (symbol === d3.symbolTriangle) transform = "translate(0, 2)";
    else if (symbol === d3.symbolStar) transform = "translate(0, 1)";
    else if (symbol === d3.symbolSquare) transform = "translate(0, 0)";

    return (
        <svg width="14" height="14" viewBox="-15 -15 30 30" className={className} style={style} preserveAspectRatio="xMidYMid meet">
            <path d={path || ''} fill="currentColor" transform={transform} />
        </svg>
    );
};

type SortKey = 'name' | 'dateAdded' | 'selected';

interface SortControlsProps {
  sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
  onSortChange: (key: SortKey) => void;
}

export const SortControls: React.FC<SortControlsProps> = ({ sortConfig, onSortChange }) => {
  const sortButtons: { label: string; key: SortKey; icon: string }[] = [
    { label: 'Sort by Recent', key: 'dateAdded', icon: 'schedule' },
    { label: 'Sort Alphabetically', key: 'name', icon: 'sort_by_alpha' },
    { label: 'Sort by Selected', key: 'selected', icon: 'task_alt' },
  ];
  
  return (
    <div className="flex items-center bg-zinc-950 border border-zinc-700/80 rounded-xl p-0.5 relative">
        {sortButtons.map(btn => {
            const isActive = sortConfig.key === btn.key;
            
            return (
                <button
                    key={btn.key}
                    onClick={() => onSortChange(btn.key)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors relative z-10 active:scale-95 ${
                        isActive ? 'bg-zinc-800 text-white shadow-inner ring-1 ring-zinc-600/50' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={btn.label}
                    aria-label={btn.label}
                >
                    <span className="material-symbols-outlined !text-[18px]">{btn.icon}</span>
                </button>
            );
        })}
    </div>
  );
};

export const BandcampIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M708.375 214.2L537.079 586.554L91.6621 584.804L262.462 213.458L708.375 214.2Z" stroke="currentColor" strokeWidth="50" strokeMiterlimit="15" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
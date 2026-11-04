import React from 'react';
import { ChevronLeft, ChevronRight, Flame, Pin, Layers } from 'lucide-react';

const CollectionIntelligenceVisual: React.FC<{ className?: string }> = ({ className }) => {
    return (
        <div className={`w-full min-h-[760px] sm:min-h-[820px] md:min-h-[860px] bg-zinc-950 border border-zinc-800/50 flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden relative pointer-events-none select-none rounded-2xl ${className || ''}`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Deep%20Cut%20background.png" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-20"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0"></div>

             {/* Panel (Deep Cut Expanded View) */}
            <div className="w-full max-w-xl bg-zinc-900 border border-zinc-600/50 flex flex-col overflow-hidden text-left relative z-10 rounded-2xl font-sans shadow-2xl">
                {/* Header (Matching DetailsPanel Header) */}
                <div className="h-12 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between px-4 bg-zinc-900 relative z-20">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Deep Cuts</h2>
                        <span className="h-5 w-5 rounded-lg flex flex-shrink-0 items-center justify-center text-[9px] font-semibold border bg-zinc-900 text-white border-white/20">
                            23
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-0.5 w-8 justify-center">
                        <button className="relative z-[70] w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors leading-none">
                            <span className="material-symbols-outlined !text-[18px]">right_panel_close</span>
                        </button>
                    </div>
                </div>

                {/* Top Pagination Bar with < on far left and > on far right */}
                <div className="flex justify-between items-center w-full px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 flex-shrink-0">
                    <button className="w-7 h-7 flex flex-shrink-0 items-center justify-center text-zinc-500 hover:text-white rounded-lg transition-colors leading-none select-none">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <div className="flex items-center justify-center gap-1 flex-1 px-4 overflow-hidden">
                        <div className="h-1 w-6 bg-primary transition-all flex-shrink-0 rounded-full" />
                        {Array.from({ length: 22 }).map((_, i) => (
                            <div key={i} className="h-1 w-1 bg-zinc-600 transition-all flex-shrink-0 rounded-full" />
                        ))}
                    </div>

                    <button className="w-7 h-7 flex flex-shrink-0 items-center justify-center text-zinc-500 hover:text-white rounded-lg transition-colors leading-none select-none">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Main Content Area (Un-Cropped Full View) */}
                <div className="p-5 sm:p-6 space-y-6">
                    {/* Header Row: Title & Entity Badges on Left, 3 Circular Action Icons on Right */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                            <h3 className="text-2xl sm:text-3xl font-medium text-white tracking-tight leading-tight">
                                The Get Up Kids
                            </h3>
                            {/* Entity Badges: ARTIST, ROOT, LIBRARY */}
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-md">
                                    ARTIST
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-yellow-300 bg-yellow-500/20 border border-yellow-500/40 px-2 py-0.5 rounded-md">
                                    ROOT
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-md">
                                    LIBRARY
                                </span>
                            </div>
                        </div>

                        {/* Top-Right 3 Circular Action Icons: Stack, Style, Pin */}
                        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                            <button className="w-8 h-8 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" title="Stack">
                                <Layers className="w-4 h-4" />
                            </button>
                            <button className="w-8 h-8 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" title="Style">
                                <Flame className="w-4 h-4" />
                            </button>
                            <button className="relative w-8 h-8 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-primary transition-colors" title="Pin">
                                <Pin className="w-4 h-4" />
                                <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 bg-primary text-[8px] font-bold text-zinc-950 rounded-full">
                                    2
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Flush Multi-Bar Core Taste Resonance (No Enclosing Box Border) */}
                    <div className="space-y-2.5 pt-1">
                        {/* Bar 1: The Get Up Kids (5/5 Hits) */}
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-zinc-300 font-medium">The Get Up Kids</span>
                                <span className="font-mono font-bold text-[#a855f7]">5/5 Hits</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 w-full">
                                <div className="h-1.5 bg-[#a855f7] border border-[#a855f7] rounded-[1px]" />
                                <div className="h-1.5 bg-[#a855f7] border border-[#a855f7] rounded-[1px]" />
                                <div className="h-1.5 bg-[#a855f7] border border-[#a855f7] rounded-[1px]" />
                                <div className="h-1.5 bg-[#a855f7] border border-[#a855f7] rounded-[1px]" />
                                <div className="h-1.5 bg-[#a855f7] border border-[#a855f7] rounded-[1px]" />
                            </div>
                        </div>

                        {/* Bar 2: Jimmy Eat World (2/5 Hits) */}
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-zinc-300 font-medium">Jimmy Eat World</span>
                                <span className="font-mono font-bold text-[#2dd4bf]">2/5 Hits</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 w-full">
                                <div className="h-1.5 bg-[#2dd4bf] border border-[#2dd4bf] rounded-[1px]" />
                                <div className="h-1.5 bg-[#2dd4bf] border border-[#2dd4bf] rounded-[1px]" />
                                <div className="h-1.5 bg-transparent border border-zinc-700 rounded-[1px]" />
                                <div className="h-1.5 bg-transparent border border-zinc-700 rounded-[1px]" />
                                <div className="h-1.5 bg-transparent border border-zinc-700 rounded-[1px]" />
                            </div>
                        </div>

                        {/* Sub-Tabs / Metric Labels */}
                        <div className="grid grid-cols-5 text-center text-[8px] sm:text-[9px] font-mono tracking-widest text-zinc-500 uppercase select-none pt-0.5">
                            <span>LABEL</span>
                            <span>GENRE</span>
                            <span>STYLE</span>
                            <span>ORIGIN</span>
                            <span>FOUNDED</span>
                        </div>
                    </div>

                    {/* Full Square Simple Science Release Artwork with Centered Audio Play Overlay */}
                    <div className="relative mx-auto w-fit pt-2">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 flex-shrink-0 mx-auto bg-zinc-900 overflow-hidden relative ring-1 ring-white/10 ring-inset rounded-2xl shadow-2xl group">
                            <img 
                                src="https://is1-ssl.mzstatic.com/image/thumb/Music/54/81/df/mzi.hvbwtrse.jpg/600x600bb.jpg" 
                                alt="The Get Up Kids - Simple Science" 
                                className="w-full h-full object-cover block"
                            />
                            {/* Frosted Play Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                                <div className="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/95 shadow-xl">
                                    <span className="material-symbols-outlined !text-[26px] ml-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        play_arrow
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Curated Editorial Quote */}
                    <div className="pt-2 text-center px-2">
                        <p className="italic text-zinc-100 font-serif leading-snug tracking-tight text-base sm:text-lg">
                            "Essential listening for understanding how second-wave emo bridged underground punk intensity with wide open pop melodicism."
                        </p>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-3 gap-y-4 gap-x-4 pt-4 pb-2 border-t border-zinc-800/80 text-left">
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">LABEL</h4>
                            <p className="text-xs sm:text-sm font-normal text-zinc-200">Vagrant, Doghouse</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">GENRE</h4>
                            <p className="text-xs sm:text-sm font-normal text-zinc-200">Emo / Indie Rock</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">STYLE</h4>
                            <p className="text-xs sm:text-sm font-normal text-zinc-200">Midwest</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">ORIGIN</h4>
                            <p className="text-xs sm:text-sm font-normal text-zinc-200">Kansas City, USA</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">FOUNDED</h4>
                            <p className="text-xs sm:text-sm font-normal text-zinc-200">1995</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-zinc-500 mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">STATUS</h4>
                            <span className="text-xs sm:text-sm text-primary font-normal">Active</span>
                        </div>
                    </div>

                    {/* Floating Magazine Pill Badge */}
                    <div className="pt-2 pb-1 flex justify-center">
                        <button className="px-5 py-2.5 bg-white text-zinc-950 font-medium rounded-full shadow-2xl hover:bg-zinc-100 transition-all flex items-center gap-2 text-xs sm:text-sm tracking-wide">
                            <span className="material-symbols-outlined !text-[18px]">auto_stories</span>
                            <span>Magazine</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectionIntelligenceVisual;

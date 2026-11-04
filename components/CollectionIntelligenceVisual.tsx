import React from 'react';
import { ChevronLeft, ChevronRight, Flame, Pin } from 'lucide-react';
import { StackIcon } from './Icons';

const CollectionIntelligenceVisual: React.FC<{ className?: string }> = ({ className }) => {
    return (
        <div className={`w-full aspect-[3/4] md:aspect-video bg-zinc-950 border border-zinc-800/50 flex items-center justify-center p-4 md:p-8 overflow-hidden relative pointer-events-none ${className || ''}`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Deep%20Cut%20background.png" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-20"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0"></div>

             {/* Panel (Deep Cut) */}
            <div className="w-full h-full md:max-w-xl bg-zinc-900 border border-zinc-600/50 flex flex-col overflow-hidden text-left relative z-10 rounded-2xl font-sans">
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

                {/* Top Pagination Bar */}
                <div className="flex justify-between items-center w-full px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 flex-shrink-0 gap-3">
                    <div className="flex items-center space-x-3 overflow-hidden flex-1 pr-2">
                        <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors leading-none select-none outline-none focus:outline-none">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:text-white active:bg-zinc-800 rounded-xl transition-colors leading-none select-none outline-none focus:outline-none">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        
                        <div className="relative flex items-center overflow-hidden flex-1 h-6 min-w-[40px] md:max-w-[240px] lg:max-w-[280px]">
                            <div className="flex items-center gap-1 flex-nowrap pr-4 overflow-x-auto scrollbar-hide w-full h-full px-1">
                                <div className="h-1 w-4 bg-primary transition-all flex-shrink-0 rounded-full" />
                                {Array.from({ length: 22 }).map((_, i) => (
                                    <div key={i} className="h-1 w-1 bg-zinc-600 transition-all flex-shrink-0 rounded-full" />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 pb-20">
                    {/* Action Bar */}
                    <div className="px-4 pt-3 pb-3 border-b border-zinc-800/50 bg-zinc-900 z-20 flex-shrink-0">
                        <div className="flex flex-col gap-2 mb-2">
                            <div className="flex items-center justify-end gap-1 flex-shrink-0">
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 active:scale-95 leading-none cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800" title="Save to My Stack">
                                    <StackIcon className="!text-[18px]" />
                                </button>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800 active:scale-95 leading-none text-zinc-400 hover:text-white hover:bg-zinc-800" title="Add to Style">
                                    <Flame size={18} />
                                </button>
                                <button className="relative w-8 h-8 flex flex-shrink-0 items-center justify-center border rounded-xl active:scale-95 transition-all duration-200 leading-none border-zinc-700/50 text-primary bg-zinc-900 hover:text-primary hover:border-zinc-500 hover:bg-zinc-800" title="Unpin Card">
                                    <Pin className="w-[18px] h-[18px]" />
                                    <div className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-zinc-900 border border-zinc-700 text-[9px] font-bold text-white rounded-full">
                                        2
                                    </div>
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-1 min-w-0 flex-grow">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-medium text-white leading-tight py-1 break-normal">
                                        The Get Up Kids
                                    </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 transition-all duration-300 overflow-hidden max-h-10 opacity-100">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded-xl">artist</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-6 space-y-6">
                        {/* Dual-Bar Core Taste Resonance */}
                        <div className="space-y-2.5 bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-800/70">
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
                            <div className="grid grid-cols-5 text-center text-[8px] font-mono tracking-widest text-zinc-500 uppercase select-none pt-0.5">
                                <span>LABEL</span>
                                <span>GENRE</span>
                                <span>STYLE</span>
                                <span>ORIGIN</span>
                                <span>FOUNDED</span>
                            </div>
                        </div>

                        {/* Release Artwork with Frosted Circular Play Button */}
                        <div className="relative mx-auto w-fit pt-1">
                            <div className="w-40 h-40 sm:w-44 sm:h-44 flex-shrink-0 mx-auto bg-zinc-900 overflow-hidden relative ring-1 ring-white/10 ring-inset rounded-xl shadow-2xl group">
                                <img 
                                    src="https://is1-ssl.mzstatic.com/image/thumb/Music/54/81/df/mzi.hvbwtrse.jpg/600x600bb.jpg" 
                                    alt="The Get Up Kids - Simple Science" 
                                    className="w-full h-full object-cover block"
                                />
                                {/* Ambient Play Button Overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                                    <div className="w-11 h-11 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/90 shadow-lg">
                                        <span className="material-symbols-outlined !text-[24px] ml-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                                            play_arrow
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Curated Editorial Quote */}
                        <div className="pt-1">
                            <p className="italic text-zinc-100 leading-snug font-serif tracking-tight text-[clamp(1.05rem,1.35vw,1.2rem)]">
                                "Essential listening for understanding how second-wave emo bridged underground punk intensity with wide open pop melodicism."
                            </p>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 py-4 border-y border-zinc-800/60">
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">LABEL</h4>
                                <p className="text-sm font-normal text-zinc-200">Vagrant, Doghouse</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">GENRE</h4>
                                <p className="text-sm font-normal text-zinc-200">Emo / Indie Rock</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">STYLE</h4>
                                <p className="text-sm font-normal text-zinc-200">Midwest</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">ORIGIN</h4>
                                <p className="text-sm font-normal text-zinc-200">Kansas City, USA</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">FOUNDED</h4>
                                <p className="text-sm font-normal text-zinc-200">1995</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-1 text-[10px] uppercase tracking-[0.2em]">STATUS</h4>
                                <span className="text-sm text-primary font-normal">Active</span>
                            </div>
                        </div>

                        {/* Bio */}
                        <div className="space-y-2">
                            <h4 className="font-bold text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Bio</h4>
                            <div className="leading-relaxed text-zinc-300 text-sm">
                                <p>Formed in Kansas City, Missouri in 1995, The Get Up Kids became one of the defining acts of the second-wave Midwest emo movement. Their seminal 1999 album 'Something to Write Home About' bridged underground punk intensity with infectious melodic power-pop, creating a sonic blueprint that influenced an entire generation of alternative rock bands.</p>
                            </div>
                        </div>

                        {/* Personnel */}
                        <div className="space-y-1.5">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Personnel</h4>
                            <p className="text-sm text-zinc-400">Matt Pryor • Jim Suptic • Rob Pope • Ryan Pope • James Dewees</p>
                        </div>

                        {/* Scene Circle */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Scene Circle</h4>
                            <div className="flex flex-wrap gap-2">
                                {['The Promise Ring', 'Braid', 'Saves The Day', 'The Anniversary'].map(artist => (
                                    <div key={artist} className="border border-zinc-800 bg-zinc-900/50 py-1.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-tighter text-zinc-400 flex items-center gap-1.5">
                                        {artist}
                                        <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Essential Listening */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Essential Listening</h4>
                            <div className="space-y-2">
                                {[
                                    { album: 'Something to Write Home About', year: '1999' },
                                    { album: 'Four Minute Mile', year: '1997' },
                                    { album: 'On a Wire', year: '2002' },
                                    { album: 'Guilt Show', year: '2004' }
                                ].map((album, i) => (
                                    <div key={i} className="flex justify-between items-baseline border-b border-zinc-800/50 pb-1">
                                        <span className="font-semibold text-zinc-200 uppercase tracking-tighter text-xs">{album.album}</span>
                                        <span className="text-zinc-500 font-mono text-[10px]">{album.year}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Magazine Pill Badge */}
                <div className="absolute bottom-5 left-0 right-0 flex justify-center pointer-events-none z-50">
                    <button className="pointer-events-auto px-5 py-2 bg-white text-zinc-950 font-medium rounded-full shadow-2xl hover:bg-zinc-100 transition-all flex items-center gap-2 text-xs sm:text-sm tracking-wide">
                        <span className="material-symbols-outlined !text-[18px]">auto_stories</span>
                        <span>Magazine</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollectionIntelligenceVisual;

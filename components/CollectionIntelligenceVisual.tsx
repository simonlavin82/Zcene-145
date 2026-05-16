import React from 'react';
import { BookOpen, ChevronLast, ChevronLeft, ChevronRight, Star, ShoppingBag, ArrowUp } from 'lucide-react';

const CollectionIntelligenceVisual: React.FC<{ className?: string }> = ({ className }) => {
    return (
        <div className={`w-full aspect-[3/4] md:aspect-video bg-zinc-950 border border-zinc-800/50 shadow-2xl flex items-center justify-center p-4 md:p-8 overflow-hidden relative pointer-events-none ${className}`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene/Deep%20Cut%20background.png" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-20"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0"></div>

             {/* Panel (Deep Cut) */}
            <div className="w-full h-full md:max-w-xl bg-zinc-900 border border-zinc-600/50 shadow-2xl flex flex-col overflow-hidden text-left relative z-10 rounded-none">
                {/* Header (Matching DetailsPanel Header) */}
                <div className="h-12 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between px-4 bg-zinc-900 relative z-20">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base text-white font-bold uppercase tracking-widest whitespace-nowrap">Deep Cut</h2>
                        <span className="h-5 w-5 flex flex-shrink-0 items-center justify-center text-[9px] font-bold border rounded-md transition-all duration-500 bg-brand-black text-primary border-primary/50">
                            4
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-0.5 w-8 justify-center">
                        <button className="relative z-[70] w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors leading-none">
                            <span className="material-symbols-outlined !text-[18px]">last_page</span>
                        </button>
                    </div>
                </div>

                {/* Pagination Bar (Matching DetailsPanel Pagination) */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 flex-shrink-0 gap-3">
                    <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors leading-none">
                        <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
                    </button>
                    
                    <div className="flex items-center justify-center gap-1 flex-wrap px-1">
                        <div className="h-1 w-4 bg-primary transition-all cursor-pointer" />
                        <div className="h-1 w-1 bg-zinc-600 transition-all cursor-pointer" />
                        <div className="h-1 w-1 bg-zinc-600 transition-all cursor-pointer" />
                        <div className="h-1 w-1 bg-zinc-600 transition-all cursor-pointer" />
                    </div>

                    <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors leading-none">
                        <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                    {/* Action Icons (Matching DetailsPanel Action Bar) */}
                    <div className="px-4 pt-3 pb-3 border-b border-zinc-800/50 bg-zinc-900 z-20 flex-shrink-0">
                        <div className="flex items-center justify-between gap-1 flex-shrink-0">
                            <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                <span className="material-symbols-outlined !text-[18px]">auto_stories</span>
                            </button>
                            <div className="flex items-center justify-end gap-1 flex-shrink-0">
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                    <span className="material-symbols-outlined !text-[18px]">bookmark_add</span>
                                </button>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                    <span className="material-symbols-outlined !text-[18px]">add_circle</span>
                                </button>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                    <span className="material-symbols-outlined !text-[18px]">share</span>
                                </button>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                    <span className="material-symbols-outlined !text-[18px]">refresh</span>
                                </button>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-200">
                                    <span className="material-symbols-outlined !text-[18px]">close</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-grow mt-2">
                            <h3 className="text-xl font-medium text-white leading-[0.9] py-1 break-normal">
                                The Get Up Kids
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 border border-zinc-700/50 rounded-md">ARTIST</span>
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] bg-purple-500/20 text-purple-400 px-2 py-0.5 border border-purple-500/30 flex items-center gap-1 rounded-md">
                                    <span className="material-symbols-outlined !text-[12px]">star</span>AI
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-8 space-y-10">
                        {/* Curator Insight (Matching DetailsPanel Curator Insight) */}
                        <div className="py-8 border-y border-zinc-800/80 relative">
                            <div className="absolute -top-3 left-0 bg-zinc-900 pr-4 text-[11px] font-bold uppercase tracking-[0.3em] text-purple-400 flex items-center gap-2">
                                <span className="material-symbols-outlined !text-sm">star</span> Curator Insight
                            </div>
                            <p className="italic text-zinc-100 leading-tight font-serif tracking-tight text-[clamp(1.125rem,1.5vw,1.25rem)]">
                                "The Get Up Kids are essential architects of the second-wave emo sound. Their ability to blend raw emotional vulnerability with infectious power-pop hooks created a blueprint that defined a generation of alternative music."
                            </p>
                        </div>

                        {/* Details Grid (Matching DetailsPanel Grid) */}
                        <div className="grid grid-cols-2 gap-8 py-4 border-b border-zinc-800/50">
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">GENRE</h4>
                                <p className="text-base font-medium text-zinc-200">Emo / Indie Rock</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">ORIGIN</h4>
                                <p className="text-base font-medium text-zinc-200">Kansas City, US</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">FOUNDED</h4>
                                <p className="text-base font-medium text-zinc-200">1995</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-zinc-500 mb-2 text-[10px] uppercase tracking-[0.2em]">STATUS</h4>
                                <button className="text-base text-primary font-semibold underline underline-offset-8 decoration-primary/30 hover:decoration-primary transition-all text-left w-fit rounded-xl">
                                    Active events
                                </button>
                            </div>
                        </div>

                        {/* Bio (Matching DetailsPanel Bio) */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Bio</h4>
                            <div className="leading-relaxed text-zinc-300 text-base">
                                <p>Formed in 1995, The Get Up Kids became a cornerstone of the mid-to-late '90s emo scene. Their seminal album 'Something to Write Home About' is widely considered one of the most influential records in the genre, bridging the gap between underground punk and mainstream alternative rock.</p>
                            </div>
                        </div>

                        {/* Catalog Links */}
                        <div className="p-5 bg-primary/5 border-2 border-primary/20 relative">
                            <div className="absolute -top-3 left-4 bg-zinc-900 px-2 text-[10px] font-semibold uppercase tracking-widest text-primary">
                                Artist Catalog
                            </div>
                            <div className="flex flex-col gap-3">
                                <button className="flex items-center justify-center px-4 py-2 bg-primary text-brand-black rounded-xl shadow-[4px_4px_0px_#000] transition-all font-bold uppercase tracking-tighter text-sm gap-3">
                                    <span className="material-symbols-outlined !text-[18px]">shopping_bag</span>
                                    <span>Shop on Bandcamp</span>
                                </button>
                            </div>
                        </div>

                        {/* Personnel */}
                        <div className="space-y-2">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Personnel</h4>
                            <p className="text-base text-zinc-400">Bryanna Bennett • Peyton • Brock • Brandon</p>
                        </div>

                        {/* Scene Circle */}
                        <div className="space-y-4">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Scene Circle</h4>
                            <div className="flex flex-wrap gap-2">
                                {['Sunami', 'Spy', 'Scowl'].map(artist => (
                                    <button key={artist} className="border border-zinc-800 bg-zinc-900/50 py-1.5 px-3 rounded-xl text-sm font-semibold uppercase tracking-tighter text-zinc-400 flex items-center gap-1.5 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all">
                                        {artist}
                                        <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Essential Listening */}
                        <div className="space-y-4">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest">Essential Listening</h4>
                            <div className="space-y-2">
                                {[
                                    { album: 'Concrete Cowboy', year: '2023' },
                                    { album: 'Buggin Out', year: '2020' }
                                ].map((album, i) => (
                                    <div key={i} className="flex justify-between items-baseline border-b border-zinc-800/50 pb-1">
                                        <span className="font-semibold text-zinc-200 uppercase tracking-tighter text-sm">{album.album}</span>
                                        <span className="text-zinc-500 font-mono text-[10px]">{album.year}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Deep Connections */}
                        <div className="pt-6 border-t border-zinc-800 pb-10">
                            <h4 className="font-semibold text-zinc-500 text-[10px] uppercase tracking-widest mb-4">
                                Deep Connections
                            </h4>
                            
                            <div className="space-y-4 bg-zinc-950/20 border border-zinc-800/50 p-4">
                                <div className="space-y-4">
                                    <div className="flex flex-col items-start">
                                        <div className="bg-zinc-900/50 text-zinc-300 border-l-4 border-zinc-600 px-4 py-2 text-base shadow-sm max-w-[90%] leading-relaxed">
                                            They are a defining part of the modern hardcore scene, often praised for their high-energy live shows.
                                        </div>
                                    </div>
                                </div>
                                <div className="relative pt-2">
                                    <div className="w-full bg-zinc-900 border border-zinc-800 py-2 pl-4 pr-14 text-sm text-zinc-600 font-medium italic rounded-xl">
                                        Consult Zcene AI...
                                    </div>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary text-brand-black shadow-[0_0_12px_rgba(246,228,104,0.3)]">
                                            <span className="material-symbols-outlined !text-[22px]">arrow_upward</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectionIntelligenceVisual;

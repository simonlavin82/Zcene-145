import React from 'react';
import { Mic, Music, Plus, ChevronLeft, CheckCircle2, MinusCircle } from 'lucide-react';

const ArtistFeatureVisual: React.FC<{ className?: string }> = ({ className }) => {
    return (
        <div className={`w-full aspect-[3/4] md:aspect-video bg-zinc-950 border border-zinc-800/50 shadow-2xl flex items-center justify-center p-4 md:p-8 overflow-hidden relative pointer-events-none ${className}`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Artist%20background.png" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-20"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0"></div>

             <div className="w-full h-full md:max-w-xl bg-zinc-900 border border-zinc-600/50 shadow-2xl flex flex-col overflow-hidden text-left relative z-10 rounded-none">
                {/* Header (Matching App's Panel Header) */}
                <div className="h-12 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between px-4 bg-zinc-900 relative z-[60]">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <h2 className="text-base text-white font-bold uppercase tracking-widest whitespace-nowrap">Artists</h2>
                        <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all duration-500 shadow-sm bg-brand-black text-primary border-primary/50">
                            2
                        </span>
                    </div>
                    <button className="relative z-[70] w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none pointer-events-auto">
                        <span className="material-symbols-outlined !text-[18px]">first_page</span>
                    </button>
                </div>
                
                <div className="flex-grow flex flex-col min-h-0 bg-zinc-900 overflow-hidden">
                    <div className="flex-grow overflow-y-auto scrollbar-none">
                        <div className="px-4 pt-4 pb-2">
                            <div className="mb-3">
                                <button className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800">
                                    <span className="material-symbols-outlined !text-[18px]">library_music</span>
                                    Select from Library (142)
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type="search"
                                    value="The Get Up Kids"
                                    readOnly
                                    placeholder="Add artists"
                                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-3.5 lg:py-2 pl-4 pr-12 text-base lg:text-sm font-normal text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors leading-none">
                                        <span className="material-symbols-outlined !text-[18px]">mic</span>
                                    </button>
                                    <button
                                        className="flex items-center justify-center rounded-xl bg-primary text-brand-black w-7 h-7 flex-shrink-0 shadow-[0_0_12px_rgba(246,228,104,0.3)] hover:scale-110 transition-all"
                                    >
                                        <span className="material-symbols-outlined !text-lg">add</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-4 pt-2 pb-4">
                            <h3 className="text-[10px] font-bold mb-2 uppercase tracking-widest text-zinc-500">Your seed artists</h3>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 group">
                                    <div className="flex items-center gap-3 flex-grow overflow-hidden text-left p-2 rounded-xl bg-zinc-700/60 text-white backdrop-blur-sm transition-all border border-transparent">
                                        <span className="material-symbols-outlined !text-[18px] text-primary">check_circle</span>
                                        <span className="text-sm font-medium select-none truncate">The Get Up Kids</span>
                                    </div>
                                    <button className="flex-shrink-0 text-zinc-500 w-8 h-8 flex items-center justify-center rounded-xl hover:text-red-400 transition-colors leading-none">
                                        <span className="material-symbols-outlined !text-[18px]">remove_circle</span>
                                    </button>
                                </div>
                                <div className="flex items-center gap-1 group">
                                    <div className="flex items-center gap-3 flex-grow overflow-hidden text-left p-2 rounded-xl bg-zinc-700/60 text-white backdrop-blur-sm transition-all border border-transparent">
                                        <span className="material-symbols-outlined !text-[18px] text-primary">check_circle</span>
                                        <span className="text-sm font-medium select-none truncate">Jimmy Eat World</span>
                                    </div>
                                    <button className="flex-shrink-0 text-zinc-500 w-8 h-8 flex items-center justify-center rounded-xl hover:text-red-400 transition-colors leading-none">
                                        <span className="material-symbols-outlined !text-[18px]">remove_circle</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="px-4 mb-2">
                             <button className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest">
                                <span className="material-symbols-outlined !text-sm">expand_more</span>
                                Advanced Discovery Filters
                             </button>
                        </div>

                        <div className="px-4 pt-4 pb-12">
                            <button className="w-full flex items-center justify-center gap-2 bg-primary px-6 py-2 text-sm rounded-xl font-medium text-brand-black transition-all duration-500 hover:opacity-90 shadow-lg">
                                <span>Update Zcene</span>
                                <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all duration-500 bg-brand-black text-primary border-primary/50">
                                    2
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default ArtistFeatureVisual;

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';

interface UserTelemetry {
    email: string;
    projectsCount: number;
    actionTriggers: {
        createCount: number;
        updateCount: number;
    };
    artistSearches: {
        globalCount: number;
        topSearches: { artistName: string; count: number }[];
    };
    cacheEfficiency: {
        liveQueries: number;
        cacheHits: number;
    };
}

interface UsageAnalyticsPageProps {
    onNavigate: (view: View) => void;
    isActive: boolean;
    user: any;
    onLogoClick: () => void;
    isSmallScreen: boolean;
    stackCount: number;
    isStackNew: boolean;
    onOpenStack: () => void;
    onLogout: () => void;
    onDeleteAccount: () => void;
    isAdmin?: boolean;
    isProfileOpen: boolean;
    setIsProfileOpen: (open: boolean) => void;
    isDeleteAccountModalOpen: boolean;
    setIsDeleteAccountModalOpen: (open: boolean) => void;
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    onRestartWalkthrough?: () => void;
    onClose?: () => void;
    onNavigateMenu?: (path: string) => void;
}

// Fixed unit cost constant for calculations (e.g. $0.0015 per live API request)
export const COST_PER_AI_CALL = 0.0015;

// Mock ledger data representing platform usage database logs
const mockLedgerData: UserTelemetry[] = [
    {
        email: "simon.lavin1@gmail.com",
        projectsCount: 14,
        actionTriggers: { createCount: 12, updateCount: 45 },
        artistSearches: {
            globalCount: 57,
            topSearches: [
                { artistName: "Radiohead", count: 8 },
                { artistName: "Neutral Milk Hotel", count: 6 },
                { artistName: "Pavement", count: 5 },
                { artistName: "Slowdive", count: 4 }
            ]
        },
        cacheEfficiency: { liveQueries: 23, cacheHits: 34 }
    },
    {
        email: "sandbox@zcene.online",
        projectsCount: 3,
        actionTriggers: { createCount: 3, updateCount: 8 },
        artistSearches: {
            globalCount: 11,
            topSearches: [
                { artistName: "Orange 9mm", count: 4 },
                { artistName: "Madball", count: 3 },
                { artistName: "H2O", count: 2 }
            ]
        },
        cacheEfficiency: { liveQueries: 4, cacheHits: 7 }
    },
    {
        email: "music.critic@pitchfork.com",
        projectsCount: 22,
        actionTriggers: { createCount: 18, updateCount: 92 },
        artistSearches: {
            globalCount: 110,
            topSearches: [
                { artistName: "Sonic Youth", count: 15 },
                { artistName: "My Bloody Valentine", count: 12 },
                { artistName: "Pixies", count: 10 },
                { artistName: "Stereolab", count: 8 }
            ]
        },
        cacheEfficiency: { liveQueries: 35, cacheHits: 75 }
    },
    {
        email: "indie.digger@gmail.com",
        projectsCount: 8,
        actionTriggers: { createCount: 7, updateCount: 24 },
        artistSearches: {
            globalCount: 31,
            topSearches: [
                { artistName: "Idles", count: 5 },
                { artistName: "Fontaines D.C.", count: 4 },
                { artistName: "Shame", count: 3 }
            ]
        },
        cacheEfficiency: { liveQueries: 12, cacheHits: 19 }
    }
];

export const UsageAnalyticsPage: React.FC<UsageAnalyticsPageProps> = ({ 
    onNavigate, 
    isActive, 
    user,
    onLogoClick,
    isSmallScreen,
    stackCount,
    isStackNew,
    onOpenStack,
    onLogout,
    onDeleteAccount,
    isAdmin,
    isProfileOpen,
    setIsProfileOpen,
    isDeleteAccountModalOpen,
    setIsDeleteAccountModalOpen,
    isMenuOpen,
    setIsMenuOpen,
    onRestartWalkthrough,
    onClose,
    onNavigateMenu
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [simulateNormalUser, setSimulateNormalUser] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeUserEmail = user?.email || 'sandbox@zcene.online';

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    // ── DATABASE INTEGRATION NOTE ─────────────────────────────────────────────
    // To connect to the live production database in the future, replace the mockLedgerData
    // with a Firestore query aggregator:
    //
    // useEffect(() => {
    //     const fetchLedger = async () => {
    //         const usersSnap = await getDocs(collection(db, 'users'));
    //         const ledgerPromises = usersSnap.docs.map(async (uDoc) => {
    //             const uData = uDoc.data();
    //             const projectsSnap = await getDocs(collection(db, 'users', uDoc.id, 'projects'));
    //             // Aggregate action triggers and cache hits from analytics/artist caches...
    //         });
    //         const results = await Promise.all(ledgerPromises);
    //         setLedgerData(results);
    //     };
    //     if (isActive) fetchLedger();
    // }, [isActive]);
    // ──────────────────────────────────────────────────────────────────────────

    // Calculations based on the ledger state
    const filteredLedger = useMemo(() => {
        if (simulateNormalUser) {
            return mockLedgerData.filter(u => u.email.toLowerCase() === activeUserEmail.toLowerCase());
        }
        return mockLedgerData.filter(user => 
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, simulateNormalUser, activeUserEmail]);

    const aggregateMetrics = useMemo(() => {
        let totalProjects = 0;
        let totalCreates = 0;
        let totalUpdates = 0;
        let totalLiveQueries = 0;
        let totalCacheHits = 0;

        mockLedgerData.forEach(user => {
            totalProjects += user.projectsCount;
            totalCreates += user.actionTriggers.createCount;
            totalUpdates += user.actionTriggers.updateCount;
            totalLiveQueries += user.cacheEfficiency.liveQueries;
            totalCacheHits += user.cacheEfficiency.cacheHits;
        });

        const totalQueries = totalLiveQueries + totalCacheHits;
        const overallEfficiency = totalQueries > 0 ? (totalCacheHits / totalQueries) * 100 : 0;
        const totalCosts = totalLiveQueries * COST_PER_AI_CALL;
        const totalSavings = totalCacheHits * COST_PER_AI_CALL;

        return {
            totalProjects,
            totalActions: totalCreates + totalUpdates,
            totalLiveQueries,
            totalCacheHits,
            overallEfficiency,
            totalCosts,
            totalSavings
        };
    }, []);

    const toggleRow = (email: string) => {
        setExpandedRow(prev => prev === email ? null : email);
    };

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-[#000000] text-zinc-200 font-display flex flex-col relative select-none">
            <Header
                user={user}
                onLogoClick={onLogoClick}
                view="dashboard"
                isSmallScreen={isSmallScreen}
                isMagazineViewOpen={false}
                stackCount={stackCount}
                isStackNew={isStackNew}
                onOpenStack={onOpenStack}
                onNavigate={onNavigateMenu || onNavigate}
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

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow">
                <div className="max-w-6xl mx-auto space-y-10">
                    <div className="pt-6 pb-2">
                        <button 
                            onClick={() => {
                                if (onClose) {
                                    onClose();
                                } else if (window.history.length > 1) {
                                    window.history.back();
                                } else {
                                    onNavigate(View.Home);
                                }
                            }} 
                            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back
                        </button>
                    </div>
                    
                    {/* Header Info */}
                    <div className="border-b border-zinc-800 pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-medium text-white mb-2">The Discovery Ledger</h2>
                            <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
                                {simulateNormalUser 
                                    ? "Personal discovery ledger tracking your curation volume, seed-artist expansions, AI synthesis requests, and local memory conservation."
                                    : "Platform-wide ledger tracking curation volume, seed-artist expansions, AI synthesis requests, and local memory conservation across all Authors."
                                }
                            </p>
                        </div>
                        <div className="flex-shrink-0">
                            <button
                                onClick={() => setSimulateNormalUser(prev => !prev)}
                                className={`flex items-center gap-2 px-4 py-2 border transition-all cursor-pointer ${
                                    simulateNormalUser 
                                        ? 'bg-primary border-primary text-black font-semibold' 
                                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm">
                                    {simulateNormalUser ? 'person' : 'admin_panel_settings'}
                                </span>
                                {simulateNormalUser ? 'Viewing: Normal User' : 'Preview Normal User'}
                            </button>
                        </div>
                    </div>

                    {/* Overview Cards (Calculations block) */}
                    {!simulateNormalUser && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-none flex flex-col justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2">Recall Resonance</span>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-3xl font-bold font-mono text-primary">{aggregateMetrics.overallEfficiency.toFixed(1)}%</span>
                                </div>
                                <span className="text-xs text-zinc-600 mt-2 font-mono">{aggregateMetrics.totalCacheHits} / {aggregateMetrics.totalLiveQueries + aggregateMetrics.totalCacheHits} curation queries recalled from local memory</span>
                            </div>

                            <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-none flex flex-col justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2">Curated Soundscapes</span>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-3xl font-bold font-mono text-white">{aggregateMetrics.totalProjects}</span>
                                </div>
                                <span className="text-xs text-zinc-600 mt-2 font-mono">Active project canvases mapped by Authors</span>
                            </div>

                            <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-none flex flex-col justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2">Synthesis Overhead</span>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-3xl font-bold font-mono text-red-400">${aggregateMetrics.totalCosts.toFixed(4)}</span>
                                </div>
                                <span className="text-xs text-zinc-600 mt-2 font-mono">Direct synthesis requests @ ${COST_PER_AI_CALL.toFixed(4)} / query</span>
                            </div>

                            <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-none flex flex-col justify-between border-l-2 border-l-primary">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Retained Curation Value</span>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-3xl font-bold font-mono text-primary">${aggregateMetrics.totalSavings.toFixed(4)}</span>
                                </div>
                                <span className="text-xs text-zinc-600 mt-2 font-mono">Value preserved through memory caching</span>
                            </div>
                        </div>
                    )}

                    {/* Filter controls */}
                    {!simulateNormalUser && (
                        <div className="flex items-center gap-4 bg-zinc-950 p-4 border border-zinc-800 rounded-none">
                            <span className="material-symbols-outlined text-zinc-500">search</span>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by Author identity..."
                                className="bg-transparent text-white w-full border-none outline-none focus:ring-0 text-sm placeholder:text-zinc-600"
                            />
                        </div>
                    )}

                    {/* Master Ledger List */}
                    <div className="border border-zinc-800 bg-zinc-950/20 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Author</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Soundscapes</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Intentions</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Recall / Synthesis</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Synthesis Toll</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Conservation</th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLedger.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-zinc-500 text-sm italic">
                                            No Author records found in the discovery archive.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLedger.map((user) => {
                                        const totalActions = user.actionTriggers.createCount + user.actionTriggers.updateCount;
                                        const queryTotal = user.cacheEfficiency.liveQueries + user.cacheEfficiency.cacheHits;
                                        const efficiency = queryTotal > 0 ? (user.cacheEfficiency.cacheHits / queryTotal) * 100 : 0;
                                        const cost = user.cacheEfficiency.liveQueries * COST_PER_AI_CALL;
                                        const savings = user.cacheEfficiency.cacheHits * COST_PER_AI_CALL;
                                        const isExpanded = expandedRow === user.email;

                                        return (
                                            <React.Fragment key={user.email}>
                                                <tr 
                                                    onClick={() => toggleRow(user.email)} 
                                                    className="border-b border-zinc-900 hover:bg-zinc-900/20 cursor-pointer transition-colors"
                                                >
                                                    <td className="p-4">
                                                        <span className="font-medium text-white">{user.email}</span>
                                                    </td>
                                                    <td className="p-4 text-center font-mono">{user.projectsCount}</td>
                                                    <td className="p-4 text-center font-mono" title={`Create: ${user.actionTriggers.createCount} | Update: ${user.actionTriggers.updateCount}`}>
                                                        {totalActions}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-mono text-zinc-300">
                                                                {user.cacheEfficiency.cacheHits}/{user.cacheEfficiency.liveQueries}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-primary font-bold">
                                                                {efficiency.toFixed(0)}% Eff
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-red-400/80">${cost.toFixed(4)}</td>
                                                    <td className="p-4 text-right font-mono text-primary">${savings.toFixed(4)}</td>
                                                    <td className="p-4 text-center">
                                                        <span className="material-symbols-outlined text-zinc-500">
                                                            {isExpanded ? 'expand_less' : 'expand_more'}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-zinc-900/10 border-b border-zinc-900">
                                                        <td colSpan={7} className="p-6">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                                                                
                                                                {/* Left Column: Action Details */}
                                                                <div className="space-y-4">
                                                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curatorial Intentions</h4>
                                                                    <div className="space-y-2 font-mono">
                                                                        <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                            <span className="text-zinc-400">Soundscape Creations:</span>
                                                                            <span className="text-white">{user.actionTriggers.createCount}</span>
                                                                        </div>
                                                                        <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                            <span className="text-zinc-400">Curation Expansions:</span>
                                                                            <span className="text-white">{user.actionTriggers.updateCount}</span>
                                                                        </div>
                                                                        <div className="flex justify-between">
                                                                            <span className="text-zinc-400">Total Intentions:</span>
                                                                            <span className="text-white font-bold">{totalActions}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Right Column: Search Details */}
                                                                <div className="space-y-4">
                                                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Top Artist Discoveries ({user.artistSearches.globalCount} Total)</h4>
                                                                    <div className="space-y-2 font-mono">
                                                                        {user.artistSearches.topSearches.map((search, i) => (
                                                                            <div key={i} className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                                <span className="text-zinc-300">{search.artistName}</span>
                                                                                <span className="text-zinc-400">{search.count} digs</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                </div>
            </main>

            <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800 mt-10">
                <div className="container mx-auto text-center">
                    <ZceneLogo className="h-8 w-auto text-primary mx-auto mb-4" />
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. Restricted access authorisation archives.</p>
                </div>
            </footer>
        </div>
    );
};

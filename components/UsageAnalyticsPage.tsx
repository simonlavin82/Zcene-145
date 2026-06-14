import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, COST_PER_AI_CALL } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

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
    onboardingProgress?: {
        step1?: boolean;
        step2?: boolean;
        step3?: boolean;
        step4?: boolean;
        step5?: boolean;
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

const calculateTelemetryForUser = (
    email: string,
    onboardingProgress: any,
    projectDocs: any[]
): UserTelemetry => {
    let totalUpdates = 0;
    let totalLiveQueries = 0;
    let totalCacheHits = 0;
    const artistFrequencyMap: Record<string, number> = {};

    projectDocs.forEach((pDoc) => {
        const pData = pDoc.data();
        
        // 1. Calculate seedArtists
        const seedStr = pData.seedArtists || '';
        const seeds = seedStr.split('::').map((s: string) => s.trim()).filter(Boolean);
        
        seeds.forEach((seed: string) => {
            artistFrequencyMap[seed] = (artistFrequencyMap[seed] || 0) + 1;
        });

        const projectLiveQueries = seeds.length;
        
        // 2. Parse activeNodes or graphData nodes to count active nodes
        let activeCount = 0;
        if (pData.activeNodes && Array.isArray(pData.activeNodes)) {
            activeCount = pData.activeNodes.length;
        } else if (pData.graphData) {
            try {
                const parsed = JSON.parse(pData.graphData);
                if (parsed && Array.isArray(parsed.nodes)) {
                    activeCount = parsed.nodes.length;
                }
            } catch (e) {
                console.warn("Error parsing graphData for project:", pDoc.id, e);
            }
        }
        
        const projectCacheHits = Math.max(0, activeCount - projectLiveQueries);
        
        totalLiveQueries += projectLiveQueries;
        totalCacheHits += projectCacheHits;
        totalUpdates += activeCount;
    });

    // Sort frequency map to get top searches
    const sortedSearches = Object.entries(artistFrequencyMap)
        .map(([artistName, count]) => ({ artistName, count }))
        .sort((a, b) => b.count - a.count);

    // Get total unique artist seeds count
    const globalCount = Object.values(artistFrequencyMap).reduce((sum, count) => sum + count, 0);

    return {
        email,
        projectsCount: projectDocs.length,
        actionTriggers: {
            createCount: projectDocs.length,
            updateCount: totalUpdates
        },
        artistSearches: {
            globalCount,
            topSearches: sortedSearches.slice(0, 4) // Show top 4 like mock data
        },
        cacheEfficiency: {
            liveQueries: totalLiveQueries,
            cacheHits: totalCacheHits
        },
        onboardingProgress: onboardingProgress || {}
    };
};

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
    const [ledgerData, setLedgerData] = useState<UserTelemetry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeUserEmail = user?.email || 'sandbox@zcene.online';

    // Compute if we are displaying in restricted Normal User Mode
    const isNormalUserView = !isAdmin || simulateNormalUser;

    const fetchLedger = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setError(null);
        try {
            let telemetryList: UserTelemetry[] = [];
            
            if (isAdmin && !simulateNormalUser) {
                // Fetch all users
                const usersSnap = await getDocs(collection(db, 'users'));
                const userPromises = usersSnap.docs.map(async (uDoc) => {
                    const uData = uDoc.data();
                    const email = uData.email || uDoc.id; // fallback
                    
                    // Fetch projects subcollection for this user
                    const projectsSnap = await getDocs(collection(db, 'users', uDoc.id, 'projects'));
                    
                    // Parse projects to calculate telemetry
                    return calculateTelemetryForUser(email, uData.onboardingProgress, projectsSnap.docs);
                });
                telemetryList = await Promise.all(userPromises);
            } else {
                // Fetch only active user
                const userDocRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userDocRef);
                const uData = userDocSnap.exists() ? userDocSnap.data() : {
                    email: user.email || '',
                    displayName: user.displayName || '',
                    onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true }
                };
                
                // Fetch projects subcollection for this user
                const projectsSnap = await getDocs(collection(db, 'users', user.uid, 'projects'));
                
                const singleTelemetry = calculateTelemetryForUser(
                    uData.email || user.email || 'sandbox@zcene.online',
                    uData.onboardingProgress,
                    projectsSnap.docs
                );
                telemetryList = [singleTelemetry];
            }
            
            setLedgerData(telemetryList);
        } catch (err: any) {
            console.error("Error fetching ledger data:", err);
            setError("Failed to query discovery archive: " + (err.message || String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [user, isAdmin, simulateNormalUser]);

    useEffect(() => {
        if (isActive) {
            fetchLedger();
        }
    }, [isActive, fetchLedger]);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);



    // Calculations based on the ledger state
    const filteredLedger = useMemo(() => {
        if (isNormalUserView) {
            return ledgerData.filter(u => u.email.toLowerCase() === activeUserEmail.toLowerCase());
        }
        return ledgerData.filter(user => 
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, isNormalUserView, activeUserEmail, ledgerData]);

    const aggregateMetrics = useMemo(() => {
        let totalProjects = 0;
        let totalCreates = 0;
        let totalUpdates = 0;
        let totalLiveQueries = 0;
        let totalCacheHits = 0;

        ledgerData.forEach(user => {
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
    }, [ledgerData]);

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
                                {isNormalUserView 
                                    ? "Personal discovery ledger tracking your curation volume, seed-artist expansions, AI synthesis requests, and local memory conservation."
                                    : "Platform-wide ledger tracking curation volume, seed-artist expansions, AI synthesis requests, and local memory conservation across all Authors."
                                }
                            </p>
                        </div>
                        {isAdmin && (
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
                        )}
                    </div>

                    {/* Overview Cards (Calculations block) */}
                    {!isNormalUserView && (
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

                    {/* Filter controls & Refresh */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        {!isNormalUserView && (
                            <div className="flex-grow flex items-center gap-4 bg-zinc-950 p-4 border border-zinc-800 rounded-none">
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
                        <button
                            onClick={fetchLedger}
                            disabled={isLoading}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all cursor-pointer font-medium text-sm disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>
                                refresh
                            </span>
                            Sync Archives
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-950/20 border border-red-500/30 text-red-200 p-4 font-mono text-xs flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-400 text-sm">warning</span>
                            <span>{error}</span>
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
                                {isLoading && filteredLedger.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-zinc-500 text-sm italic">
                                            <div className="flex items-center justify-center gap-3">
                                                <span className="material-symbols-outlined animate-spin text-primary text-sm">progress_activity</span>
                                                Querying discovery archive...
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLedger.length === 0 ? (
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
                                                                 
                                                                 {/* Left Column: Action & Onboarding Details */}
                                                                 <div className="space-y-6">
                                                                     <div className="space-y-4">
                                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curatorial Intentions</h4>
                                                                         <div className="space-y-2 font-mono">
                                                                             <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                                 <span className="text-zinc-400">Soundscape Creations:</span>
                                                                                 <span className="text-white">{user.projectsCount}</span>
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

                                                                     <div className="space-y-4 pt-4 border-t border-zinc-900">
                                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Onboarding Progress</h4>
                                                                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                                                                             <div className="flex items-center gap-2">
                                                                                 <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${user.onboardingProgress?.step1 ? 'bg-primary text-black' : 'bg-zinc-900 text-zinc-650 border border-zinc-800'}`}>
                                                                                     {user.onboardingProgress?.step1 ? '✓' : '•'}
                                                                                 </span>
                                                                                 <span className={user.onboardingProgress?.step1 ? 'text-zinc-300' : 'text-zinc-600'}>1. Library Upload</span>
                                                                             </div>
                                                                             <div className="flex items-center gap-2">
                                                                                 <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${user.onboardingProgress?.step2 ? 'bg-primary text-black' : 'bg-zinc-900 text-zinc-655 border border-zinc-800'}`}>
                                                                                     {user.onboardingProgress?.step2 ? '✓' : '•'}
                                                                                 </span>
                                                                                 <span className={user.onboardingProgress?.step2 ? 'text-zinc-300' : 'text-zinc-600'}>2. Add Artist Seed</span>
                                                                             </div>
                                                                             <div className="flex items-center gap-2">
                                                                                 <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${user.onboardingProgress?.step3 ? 'bg-primary text-black' : 'bg-zinc-900 text-zinc-655 border border-zinc-800'}`}>
                                                                                     {user.onboardingProgress?.step3 ? '✓' : '•'}
                                                                                 </span>
                                                                                 <span className={user.onboardingProgress?.step3 ? 'text-zinc-300' : 'text-zinc-600'}>3. Graph Interaction</span>
                                                                             </div>
                                                                             <div className="flex items-center gap-2">
                                                                                 <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${user.onboardingProgress?.step4 ? 'bg-primary text-black' : 'bg-zinc-900 text-zinc-655 border border-zinc-800'}`}>
                                                                                     {user.onboardingProgress?.step4 ? '✓' : '•'}
                                                                                 </span>
                                                                                 <span className={user.onboardingProgress?.step4 ? 'text-zinc-300' : 'text-zinc-600'}>4. Detail Navigation</span>
                                                                             </div>
                                                                             <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                                                                                 <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${user.onboardingProgress?.step5 ? 'bg-primary text-black' : 'bg-zinc-900 text-zinc-655 border border-zinc-800'}`}>
                                                                                     {user.onboardingProgress?.step5 ? '✓' : '•'}
                                                                                 </span>
                                                                                 <span className={user.onboardingProgress?.step5 ? 'text-zinc-300' : 'text-zinc-600'}>5. Deep Cut Summary</span>
                                                                             </div>
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

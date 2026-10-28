import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, COST_PER_AI_CALL, RADIUS_TOKENS } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { motion } from 'motion/react';
import { InfoTooltip } from './ui/InfoTooltip';
import { AdminViewToggle } from './ui/AdminViewToggle';
import { cleanArtistDisplayName } from '../services/artistCacheService';
import { TOP_UP_TIER_LIST, TokenTopUpTierId } from '../shared/tokenEconomy';
import { TokenTransaction } from '../types';

export interface JitHealRecord {
    id: string;
    entityId: string;
    rawEntityId: string;
    entityType: 'label' | 'artist';
    displayName: string;
    callerUid: string;
    callerEmail: string;
    projectId?: string | null;
    projectName?: string | null;
    totalTokens: number;
    promptTokens: number;
    candidatesTokens: number;
    costUsd: number;
    timestamp: number;
}

export interface UserTelemetry {
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
    deepCutsOpened: number;
    onboardingProgress?: {
        step1?: boolean;
        step2?: boolean;
        step3?: boolean;
        step4?: boolean;
        step5?: boolean;
    };
    exactCost: number;
    hasExactCost: boolean;
    preflightLookups?: {
        calls: number;
        costUsd: number;
    };
    deepWebConsults?: {
        calls: number;
        costUsd: number;
    };
    tokenBalance: number;
    lifetimeTokensPurchased: number;
    lifetimeTokensSpent: number;
    projects: ProjectTelemetry[];
}

export interface ProjectTelemetry {
    id: string;
    seedArtist: string;
    generationType: string;
    userFacingScope: string;
    tokensSpent: number;
    hasRecordedTokens: boolean;
    cost: number;
    isEstimate: boolean;
    createdAt: number;
}

export interface TelemetryOverviewCardsProps {
    aggregateMetrics: {
        overallEfficiency: number;
        totalCacheHits: number;
        totalLiveQueries: number;
        totalProjects: number;
        totalCosts: number;
        totalSavings: number;
    };
    isNormalUserView: boolean;
}

export const TelemetryOverviewCards: React.FC<TelemetryOverviewCardsProps> = ({
    aggregateMetrics,
    isNormalUserView,
}) => {
    if (isNormalUserView) return null;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cache Recall Rate</span>
                    <InfoTooltip content="The percentage of music discovery queries resolved from your local browser cache instead of querying the AI, reducing response time." />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold font-mono text-primary">{aggregateMetrics.overallEfficiency.toFixed(1)}%</span>
                </div>
                <span className="text-xs text-zinc-600 mt-2"><span className="font-mono">{aggregateMetrics.totalCacheHits} / {aggregateMetrics.totalLiveQueries + aggregateMetrics.totalCacheHits}</span> recalled from cache</span>
            </div>

            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curation Projects</span>
                    <InfoTooltip content="Total active music canvases and discovery paths created by users." />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold font-mono text-white">{aggregateMetrics.totalProjects}</span>
                </div>
                <span className="text-xs text-zinc-650 mt-2">active workspace canvases</span>
            </div>

            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">AI Discovery Cost</span>
                    <InfoTooltip content="Total accumulated costs for calling the AI recommendation engine." />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold font-mono text-red-400">${aggregateMetrics.totalCosts.toFixed(4)}</span>
                </div>
                <span className="text-xs text-zinc-650 mt-2">@ <span className="font-mono">$0.0015</span> per recommendation</span>
            </div>

            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between border-l-2 border-l-primary relative ${RADIUS_TOKENS.frame}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Preserved Budget</span>
                    <InfoTooltip content="Estimated money saved by reusing cached artist nodes instead of requesting new AI generations." />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold font-mono text-primary">${aggregateMetrics.totalSavings.toFixed(4)}</span>
                </div>
                <span className="text-xs text-zinc-650 mt-2">saved via local recall</span>
            </div>
        </div>
    );
};

export interface DiscoveryLedgerTableProps {
    isLoading: boolean;
    filteredLedger: UserTelemetry[];
    expandedRow: string | null;
    toggleRow: (email: string) => void;
}

export const DiscoveryLedgerTable: React.FC<DiscoveryLedgerTableProps> = ({
    isLoading,
    filteredLedger,
    expandedRow,
    toggleRow,
}) => {
    return (
        <div className="border border-zinc-800 bg-zinc-950/20 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Author</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Wallet</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Projects</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Actions</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Cache Recall</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">AI Cost</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Savings</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 w-16"></th>
                    </tr>
                </thead>
                <tbody>
                    {isLoading && filteredLedger.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="p-8 text-center text-zinc-500 text-sm italic">
                                <div className="flex items-center justify-center gap-3">
                                    <span className="material-symbols-outlined animate-spin text-primary text-sm">progress_activity</span>
                                    Querying discovery archive...
                                </div>
                            </td>
                        </tr>
                    ) : filteredLedger.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="p-8 text-center text-zinc-500 text-sm italic">
                                No Author records found in the discovery archive.
                            </td>
                        </tr>
                    ) : (
                        filteredLedger.map((user) => {
                            const totalActions = user.actionTriggers.createCount + user.actionTriggers.updateCount + (user.preflightLookups?.calls || 0) + (user.deepWebConsults?.calls || 0);
                            const queryTotal = user.cacheEfficiency.liveQueries + user.cacheEfficiency.cacheHits;
                            const efficiency = queryTotal > 0 ? (user.cacheEfficiency.cacheHits / queryTotal) * 100 : 0;
                            const cost = user.hasExactCost ? user.exactCost : (user.cacheEfficiency.liveQueries * COST_PER_AI_CALL);
                            const savings = user.cacheEfficiency.cacheHits * COST_PER_AI_CALL;
                            const costPrefix = user.hasExactCost ? '' : '~';
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
                                        <td className="p-4 text-center font-mono text-primary font-semibold">
                                            {user.tokenBalance}T
                                        </td>
                                        <td className="p-4 text-center font-mono">{user.projectsCount}</td>
                                        <td className="p-4 text-center font-mono" title={`Create: ${user.actionTriggers.createCount} | Update: ${user.actionTriggers.updateCount} | Pre-Flight: ${user.preflightLookups?.calls || 0} | Deep Web: ${user.deepWebConsults?.calls || 0}`}>
                                            {totalActions}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-mono text-zinc-300">
                                                    {user.cacheEfficiency.cacheHits}/{user.cacheEfficiency.liveQueries}
                                                </span>
                                                <span className="text-[10px] text-primary font-bold">
                                                    <span className="font-mono">{efficiency.toFixed(0)}%</span> Eff
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono text-red-400/80">{costPrefix}${cost.toFixed(4)}</td>
                                        <td className="p-4 text-right font-mono text-primary">${savings.toFixed(4)}</td>
                                        <td className="p-4 text-center">
                                            <span className="material-symbols-outlined text-zinc-500">
                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                            </span>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                         <tr className="bg-zinc-900/10 border-b border-zinc-900">
                                             <td colSpan={8} className="p-6">
                                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                                                     
                                                     {/* Left Column: Action & Onboarding Details */}
                                                     <div className="space-y-6">
                                                         <div className="space-y-4">
                                                             <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curation Actions</h4>
                                                             <div className="space-y-2">
                                                                 <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                     <span className="text-zinc-400">Projects Created:</span>
                                                                     <span className="text-white font-mono">{user.projectsCount}</span>
                                                                 </div>
                                                                 <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                     <span className="text-zinc-400">Actions Executed:</span>
                                                                     <span className="text-white font-mono">{user.actionTriggers.updateCount}</span>
                                                                 </div>
                                                                 <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                     <span className="text-zinc-400">Deep Cuts Opened:</span>
                                                                     <span className="text-white font-mono">{user.deepCutsOpened}</span>
                                                                 </div>
                                                                 {(user.preflightLookups?.calls ?? 0) > 0 && (
                                                                     <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                         <span className="text-zinc-400">Pre-Flight Lookups:</span>
                                                                         <span className="text-white font-mono">
                                                                             {user.preflightLookups!.calls}{' '}
                                                                             <span className="text-red-400/80 text-xs">
                                                                                 (${user.preflightLookups!.costUsd.toFixed(4)})
                                                                             </span>
                                                                         </span>
                                                                     </div>
                                                                 )}
                                                                 {(user.deepWebConsults?.calls ?? 0) > 0 && (
                                                                     <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                         <span className="text-zinc-400">Deep Web Consults:</span>
                                                                         <span className="text-white font-mono">
                                                                             {user.deepWebConsults!.calls}{' '}
                                                                             <span className="text-red-400/80 text-xs">
                                                                                 (${user.deepWebConsults!.costUsd.toFixed(4)})
                                                                             </span>
                                                                         </span>
                                                                     </div>
                                                                 )}
                                                                 <div className="flex justify-between">
                                                                     <span className="text-zinc-400">Total Actions:</span>
                                                                     <span className="text-white font-mono font-bold">{totalActions}</span>
                                                                 </div>
                                                             </div>
                                                         </div>

                                                         <div className="space-y-4 pt-4 border-t border-zinc-900">
                                                             <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Onboarding Progress</h4>
                                                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Top Artist Discoveries (<span className="font-mono">{user.artistSearches.globalCount}</span> Total)</h4>
                                                         <div className="space-y-2">
                                                             {user.artistSearches.topSearches.map((search, i) => (
                                                                 <div key={i} className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                     <span className="text-zinc-300">{search.artistName}</span>
                                                                     <span className="text-zinc-405"><span className="font-mono">{search.count}</span> digs</span>
                                                                 </div>
                                                             ))}
                                                         </div>
                                                     </div>

                                                     {/* Full Width: Projects Ledger */}
                                                     <div className="col-span-1 md:col-span-2 pt-4 border-t border-zinc-900 mt-4">
                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Projects Ledger</h4>
                                                         <div className="bg-black/50 border border-zinc-800 rounded-md overflow-hidden">
                                                             <table className="w-full text-left border-collapse">
                                                                 <thead>
                                                                     <tr className="border-b border-zinc-800 bg-zinc-900/30">
                                                                         <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Project / Seed</th>
                                                                         <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                                                                         <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Generation Type</th>
                                                                         <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Tokens</th>
                                                                         <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Cost</th>
                                                                     </tr>
                                                                 </thead>
                                                                 <tbody>
                                                                     {user.projects.map((proj, idx) => {
                                                                         const isZeroCost = (proj.generationType === "Direct Hit" || proj.generationType === "Clone") && proj.cost === 0;
                                                                         const dateStr = proj.createdAt ? new Date(proj.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ',') : '';
                                                                         return (
                                                                             <tr key={idx} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/20">
                                                                                 <td className="p-3 text-xs text-zinc-300 font-medium">{proj.seedArtist}</td>
                                                                                 <td className="p-3 text-xs text-zinc-400 whitespace-nowrap">{dateStr}</td>
                                                                                 <td className="p-3 text-xs text-zinc-400">{proj.generationType}</td>
                                                                                 <td className="p-3 text-xs text-right font-mono text-zinc-300">
                                                                                     {proj.hasRecordedTokens ? `${proj.tokensSpent}T` : '—'}
                                                                                 </td>
                                                                                 <td className={`p-3 text-xs text-right font-mono ${isZeroCost ? 'text-primary/80' : 'text-red-400/80'}`}>
                                                                                     {proj.isEstimate ? '~' : ''}${proj.cost.toFixed(4)}
                                                                                 </td>
                                                                             </tr>
                                                                         );
                                                                     })}
                                                                 </tbody>
                                                             </table>
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
    );
};


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
    profile?: any;
}

const formatTxTypeBadge = (type: string): { label: string; style: string } => {
    switch (type) {
        case 'topup_simulated':
        case 'top_up_simulated':
            return { label: 'Top-Up', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'refund_pipeline_error':
        case 'refund_error':
            return { label: 'Auto-Refund', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'spend_preflight_lookup':
        case 'spend_preflight':
        case 'spend_escape_hatch':
            return { label: 'Artist Lookup', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
        case 'spend_deep_web':
            return { label: 'Deep Connections', style: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
        case 'spend_direct_hit':
        case 'spend_live_synthesis':
        default:
            return { label: 'Zcene Curation', style: 'bg-primary/15 text-primary border-primary/30' };
    }
};

// Fixed unit cost constant for calculations (e.g. $0.0015 per live API request)

export const calculateTelemetryForUser = (
    email: string,
    onboardingProgress: any,
    projectDocs: any[],
    deepCutsOpened?: number,
    walletData?: {
        tokenBalance?: number;
        lifetimeTokensPurchased?: number;
        lifetimeTokensSpent?: number;
        preflightApiUsage?: Record<string, any>;
        deepWebApiUsage?: Record<string, any>;
    }
): UserTelemetry => {
    let totalUpdates = 0;
    let totalLiveQueries = 0;
    let totalCacheHits = 0;
    let exactCost = 0;
    let uninstrumentedEstimatedCost = 0;
    let hasExactCost = false;
    const artistFrequencyMap: Record<string, number> = {};
    const projects: ProjectTelemetry[] = [];

    projectDocs.forEach((pDoc) => {
        const pData = pDoc.data();

        // Parse structural node/entity counts first to filter out unmapped "Untitled Zcene" draft shells
        let graphNodesCount = 0;
        if (pData.graphData) {
            try {
                const parsed = typeof pData.graphData === 'string' ? JSON.parse(pData.graphData) : pData.graphData;
                if (parsed && Array.isArray(parsed.nodes)) {
                    graphNodesCount = parsed.nodes.length;
                }
            } catch (e) {
                console.warn("Error parsing graphData for project:", pDoc.id, e);
            }
        }
        const activeNodesCount = Array.isArray(pData.activeNodes) ? pData.activeNodes.length : 0;
        const artistIdsCount = Array.isArray(pData.artistIds) ? pData.artistIds.length : 0;
        const labelIdsCount = Array.isArray(pData.labelIds) ? pData.labelIds.length : 0;
        const hasCacheKey = Boolean(pData.cacheKey && String(pData.cacheKey).trim());

        const isUnmappedEmptyDraft =
            graphNodesCount === 0 &&
            activeNodesCount === 0 &&
            artistIdsCount === 0 &&
            labelIdsCount === 0 &&
            !hasCacheKey &&
            pData.status !== 'curating';

        if (isUnmappedEmptyDraft) {
            return;
        }
        
        // 1. Calculate project name / seed fallback
        const projectName = typeof pData.name === 'string' ? pData.name.trim() : '';
        const seedStr = pData.seedArtists || '';
        const seeds = seedStr.split('::').map((s: string) => s.trim()).filter(Boolean);
        
        let displayTitle = "Unknown";
        if (projectName && projectName !== 'Untitled Zcene' && projectName !== seeds[0]) {
             displayTitle = projectName;
        } else if (seeds.length > 0) {
             displayTitle = cleanArtistDisplayName(seeds[0]);
        } else if (projectName) {
             displayTitle = projectName;
        }
        
        seeds.forEach((seed: string) => {
            artistFrequencyMap[seed] = (artistFrequencyMap[seed] || 0) + 1;
        });

        const projectLiveQueries = seeds.length;
        
        // 2. Active node count from activeNodes or parsed graphData nodes
        const activeCount = activeNodesCount > 0 ? activeNodesCount : graphNodesCount;
        
        const projectCacheHits = Math.max(0, activeCount - projectLiveQueries);
        
        totalLiveQueries += projectLiveQueries;
        totalCacheHits += projectCacheHits;
        totalUpdates += activeCount;
        let projectExactCost = 0;
        let projectHasExactCost = false;
        let hasProCall = false;

        if (pData.apiUsage) {
            projectHasExactCost = true;
            for (const [model, usage] of Object.entries(pData.apiUsage)) {
                const u = usage as any;
                
                // Calculate hidden reasoning/cached tokens
                const reportedSum = (u.prompt || 0) + (u.candidates || 0);
                const total = u.total || reportedSum;
                const reasoningTokens = Math.max(0, total - reportedSum);

                if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
                    hasProCall = true;
                    if (u.prompt > 128000) {
                        projectExactCost += (u.prompt / 1000000) * 7.00;
                        projectExactCost += ((u.candidates + reasoningTokens) / 1000000) * 21.00;
                    } else {
                        projectExactCost += (u.prompt / 1000000) * 3.50;
                        projectExactCost += ((u.candidates + reasoningTokens) / 1000000) * 10.50;
                    }
                } else if (model.includes('gemini-3.6-flash') || model.includes('gemini-3.5-flash') || model.includes('gemini-1.5-flash') || model.includes('flash')) {
                    // Discovery Ledger: Strictly pegged to standard non-promotional rates ($1.50 / 1M input, $7.50 / 1M output)
                    projectExactCost += (u.prompt / 1000000) * 1.50;
                    projectExactCost += ((u.candidates + reasoningTokens) / 1000000) * 7.50;
                }
            }
            exactCost += projectExactCost;
            hasExactCost = true;
        }

        let projectDeepWebCost = 0;
        if (pData.deepWebApiUsage && typeof pData.deepWebApiUsage === 'object') {
            for (const [model, usage] of Object.entries(pData.deepWebApiUsage)) {
                if (!usage || typeof usage !== 'object') continue;
                const u = usage as any;
                const prompt = Number(u.prompt) || 0;
                const candidates = Number(u.candidates) || 0;
                const total = Number(u.total) || (prompt + candidates);
                const reasoningTokens = Math.max(0, total - (prompt + candidates));
                if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
                    projectDeepWebCost += (prompt / 1_000_000) * 3.50;
                    projectDeepWebCost += ((candidates + reasoningTokens) / 1_000_000) * 10.50;
                } else {
                    projectDeepWebCost += (prompt / 1_000_000) * 1.50;
                    projectDeepWebCost += ((candidates + reasoningTokens) / 1_000_000) * 7.50;
                }
            }
        }

        let generationType = pData.generationType;
        let cost = 0;
        let isEstimate = false;
        const hasFilters = !!(pData.discoveryFilters && pData.discoveryFilters !== '{}');

        if (generationType) {
            if (generationType === "Direct Hit" || generationType === "Clone") {
                cost = projectDeepWebCost;
            } else if (projectHasExactCost) {
                cost = projectExactCost + projectDeepWebCost;
            } else {
                cost = (projectLiveQueries * COST_PER_AI_CALL) + projectDeepWebCost;
                isEstimate = true;
            }
        } else {
            // Legacy Fallback Logic
            generationType = "Direct Hit";
            if (seeds.length > 1 || hasFilters) {
                generationType = "Complex Generation";
            } else if (hasProCall || (!projectHasExactCost && activeCount > projectLiveQueries)) {
                generationType = (activeCount > 1) ? "Root Generation" : "Direct Hit";
                if (hasProCall) generationType = "Root Generation";
            }
            
            cost = projectHasExactCost ? (projectExactCost + projectDeepWebCost) : ((projectLiveQueries * COST_PER_AI_CALL) + projectDeepWebCost);
            isEstimate = !projectHasExactCost;
            
            if (generationType === "Direct Hit" && !projectHasExactCost) {
                cost = projectDeepWebCost;
                isEstimate = false;
            }
        }

        if (isEstimate && cost > 0) {
            uninstrumentedEstimatedCost += cost;
        }

        const hasRecordedTokens = typeof pData.tokensSpent === 'number';
        const tokensSpent = hasRecordedTokens
            ? Math.max(0, Math.floor(Number(pData.tokensSpent) || 0))
            : generationType === 'Clone'
                ? 0
                : 0;

        // Rule 43: Redact backend cache status from Standard User view
        const userFacingScope =
            generationType === 'Clone'
                ? 'Saved Shared Zcene'
                : generationType === 'Complex Generation' || seeds.length > 1 || hasFilters
                    ? 'Complex Zcene'
                    : 'Single-Seed Zcene';

        let createdAt = 0;
        if (pData.createdAt) {
            createdAt = typeof pData.createdAt.toMillis === 'function' ? pData.createdAt.toMillis() : (pData.createdAt.seconds ? pData.createdAt.seconds * 1000 : Date.now());
        }

        projects.push({
            id: pDoc.id,
            seedArtist: displayTitle,
            generationType,
            userFacingScope,
            tokensSpent,
            hasRecordedTokens,
            cost,
            isEstimate,
            createdAt
        });
    });

    // Aggregate pre-flight / escape-hatch Flash lookup micro-costs (including cancelled Box 4 lookups)
    let preflightCalls = 0;
    let preflightCostUsd = 0;
    if (walletData?.preflightApiUsage && typeof walletData.preflightApiUsage === 'object') {
        for (const [model, usage] of Object.entries(walletData.preflightApiUsage)) {
            if (!usage || typeof usage !== 'object') continue;
            const u = usage as any;
            const prompt = Number(u.prompt) || 0;
            const candidates = Number(u.candidates) || 0;
            const total = Number(u.total) || (prompt + candidates);
            const reasoningTokens = Math.max(0, total - (prompt + candidates));
            const calls = Math.max(0, Math.floor(Number(u.calls) || 0));
            preflightCalls += calls > 0 ? calls : (total > 0 ? 1 : 0);

            if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
                preflightCostUsd += (prompt / 1_000_000) * 3.50;
                preflightCostUsd += ((candidates + reasoningTokens) / 1_000_000) * 10.50;
            } else {
                preflightCostUsd += (prompt / 1_000_000) * 1.50;
                preflightCostUsd += ((candidates + reasoningTokens) / 1_000_000) * 7.50;
            }
        }
        if (preflightCalls > 0 || preflightCostUsd > 0) {
            if (!hasExactCost && uninstrumentedEstimatedCost > 0) {
                exactCost += uninstrumentedEstimatedCost;
            }
            exactCost += preflightCostUsd;
            hasExactCost = true;
        }
    }

    // Aggregate Deep Connections (Deep Web) grounded consult micro-costs
    let deepWebCalls = 0;
    let deepWebCostUsd = 0;
    if (walletData?.deepWebApiUsage && typeof walletData.deepWebApiUsage === 'object') {
        for (const [model, usage] of Object.entries(walletData.deepWebApiUsage)) {
            if (!usage || typeof usage !== 'object') continue;
            const u = usage as any;
            const prompt = Number(u.prompt) || 0;
            const candidates = Number(u.candidates) || 0;
            const total = Number(u.total) || (prompt + candidates);
            const reasoningTokens = Math.max(0, total - (prompt + candidates));
            const calls = Math.max(0, Math.floor(Number(u.calls) || 0));
            deepWebCalls += calls > 0 ? calls : (total > 0 ? 1 : 0);

            if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
                deepWebCostUsd += (prompt / 1_000_000) * 3.50;
                deepWebCostUsd += ((candidates + reasoningTokens) / 1_000_000) * 10.50;
            } else {
                deepWebCostUsd += (prompt / 1_000_000) * 1.50;
                deepWebCostUsd += ((candidates + reasoningTokens) / 1_000_000) * 7.50;
            }
        }
        if (deepWebCalls > 0 || deepWebCostUsd > 0) {
            if (!hasExactCost && uninstrumentedEstimatedCost > 0) {
                exactCost += uninstrumentedEstimatedCost;
            }
            exactCost += deepWebCostUsd;
            hasExactCost = true;
        }
    }

    projects.sort((a, b) => b.createdAt - a.createdAt);

    // Sort frequency map to get top searches
    const sortedSearches = Object.entries(artistFrequencyMap)
        .map(([artistName, count]) => ({ artistName, count }))
        .sort((a, b) => b.count - a.count);

    // Get total unique artist seeds count
    const globalCount = Object.values(artistFrequencyMap).reduce((sum, count) => sum + count, 0);

    return {
        email,
        projectsCount: projects.length,
        actionTriggers: {
            createCount: projects.length,
            updateCount: totalUpdates
        },
        artistSearches: {
            globalCount,
            topSearches: sortedSearches.slice(0, 4)
        },
        cacheEfficiency: {
            liveQueries: totalLiveQueries,
            cacheHits: totalCacheHits
        },
        deepCutsOpened: deepCutsOpened || 0,
        onboardingProgress: onboardingProgress || {},
        exactCost,
        hasExactCost,
        preflightLookups: {
            calls: preflightCalls,
            costUsd: preflightCostUsd,
        },
        deepWebConsults: {
            calls: deepWebCalls,
            costUsd: deepWebCostUsd,
        },
        tokenBalance: Math.max(0, Math.floor(Number(walletData?.tokenBalance) || 0)),
        lifetimeTokensPurchased: Math.max(0, Math.floor(Number(walletData?.lifetimeTokensPurchased) || 0)),
        lifetimeTokensSpent: Math.max(0, Math.floor(Number(walletData?.lifetimeTokensSpent) || 0)),
        projects
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
    onNavigateMenu,
    profile
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [simulateNormalUser, setSimulateNormalUser] = useState(false);
    const [ledgerData, setLedgerData] = useState<UserTelemetry[]>([]);
    const [tokenTransactions, setTokenTransactions] = useState<TokenTransaction[]>([]);
    const [jitHeals, setJitHeals] = useState<JitHealRecord[]>([]);
    const [isJitEnabled, setIsJitEnabled] = useState<boolean>(true);
    const [isTogglingJit, setIsTogglingJit] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeUserEmail = user?.email || 'sandbox@zcene.online';

    // Compute if we are displaying in restricted Normal User Mode
    const isNormalUserView = !isAdmin || simulateNormalUser;

    const triggerTopUp = useCallback((tierId?: TokenTopUpTierId) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-topup-modal', { detail: { tierId: tierId || 'gbp_10' } }));
        }
    }, []);

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
                    const email = uData.email || uDoc.id;
                    
                    const projectsSnap = await getDocs(collection(db, 'users', uDoc.id, 'projects'));
                    
                    return calculateTelemetryForUser(email, uData.onboardingProgress, projectsSnap.docs, uData.deepCutsOpened, {
                        tokenBalance: uData.tokenBalance,
                        lifetimeTokensPurchased: uData.lifetimeTokensPurchased,
                        lifetimeTokensSpent: uData.lifetimeTokensSpent,
                        preflightApiUsage: uData.preflightApiUsage,
                        deepWebApiUsage: uData.deepWebApiUsage,
                    });
                });
                telemetryList = await Promise.all(userPromises);
                setTokenTransactions([]);
            } else {
                // Fetch only active user + immutable tokenTransactions ledger
                const userDocRef = doc(db, 'users', user.uid);
                const [userDocSnap, projectsSnap, txSnap] = await Promise.all([
                    getDoc(userDocRef),
                    getDocs(collection(db, 'users', user.uid, 'projects')),
                    getDocs(query(collection(db, 'users', user.uid, 'tokenTransactions'), orderBy('createdAt', 'desc'), limit(50))).catch(() => null),
                ]);

                const uData = userDocSnap.exists() ? userDocSnap.data() : {
                    email: user.email || '',
                    displayName: user.displayName || '',
                    onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true }
                };
                
                const singleTelemetry = calculateTelemetryForUser(
                    uData.email || user.email || 'sandbox@zcene.online',
                    uData.onboardingProgress,
                    projectsSnap.docs,
                    uData.deepCutsOpened,
                    {
                        tokenBalance: uData.tokenBalance,
                        lifetimeTokensPurchased: uData.lifetimeTokensPurchased,
                        lifetimeTokensSpent: uData.lifetimeTokensSpent,
                        preflightApiUsage: uData.preflightApiUsage,
                        deepWebApiUsage: uData.deepWebApiUsage,
                    }
                );
                telemetryList = [singleTelemetry];

                if (txSnap) {
                    const parsedTxs: TokenTransaction[] = txSnap.docs.map(d => {
                        const t = d.data();
                        return {
                            id: d.id,
                            uid: t.uid || user.uid,
                            type: t.type || 'spend_live_synthesis',
                            delta: Number(t.delta ?? t.amount ?? 0),
                            balanceAfter: Number(t.balanceAfter) || 0,
                            tierId: t.tierId,
                            amountGbp: t.amountGbp,
                            projectId: t.projectId,
                            curationSessionId: t.curationSessionId,
                            description: t.description || 'Token activity',
                            createdAt: t.createdAt,
                        };
                    });
                    setTokenTransactions(parsedTxs);
                } else {
                    setTokenTransactions([]);
                }
            }
            
            setLedgerData(telemetryList);

            // Phase 3: Fetch JIT Auto-Healing Telemetry (Admin View Only)
            if (isAdmin && !simulateNormalUser) {
                try {
                    // Fetch global JIT kill switch state from adminLedger/system
                    const systemSettingsRef = doc(db, 'adminLedger', 'system');
                    const systemSettingsSnap = await getDoc(systemSettingsRef);
                    if (systemSettingsSnap.exists() && typeof systemSettingsSnap.data()?.jitEnabled === 'boolean') {
                        setIsJitEnabled(systemSettingsSnap.data()?.jitEnabled);
                    } else {
                        setIsJitEnabled(true);
                    }

                    const healsRef = collection(db, 'adminLedger', 'system', 'jitHeals');
                    const healsQuery = query(healsRef, orderBy('timestamp', 'desc'), limit(100));
                    const healsSnap = await getDocs(healsQuery);
                    const parsedHeals: JitHealRecord[] = healsSnap.docs.map(d => {
                        const hData = d.data();
                        let ts = Date.now();
                        if (hData.timestamp?.toMillis) {
                            ts = hData.timestamp.toMillis();
                        } else if (hData.healedAtMs) {
                            ts = hData.healedAtMs;
                        } else if (hData.timestamp?.seconds) {
                            ts = hData.timestamp.seconds * 1000;
                        }
                        return {
                            id: d.id,
                            entityId: hData.entityId || d.id,
                            rawEntityId: hData.rawEntityId || hData.entityId || d.id,
                            entityType: hData.entityType || 'artist',
                            displayName: hData.displayName || hData.entityId || d.id,
                            callerUid: hData.callerUid || 'anonymous',
                            callerEmail: hData.callerEmail || 'guest@zcene.online',
                            projectId: hData.projectId || null,
                            projectName: hData.projectName || null,
                            totalTokens: hData.totalTokens || 0,
                            promptTokens: hData.promptTokens || 0,
                            candidatesTokens: hData.candidatesTokens || 0,
                            costUsd: hData.costUsd || 0,
                            timestamp: ts
                        };
                    });
                    setJitHeals(parsedHeals);
                } catch (healErr: any) {
                    console.warn("[UsageAnalyticsPage] Could not query JIT heals collection or settings:", healErr.message);
                }
            } else {
                setJitHeals([]);
            }
        } catch (err: any) {
            console.error("Error fetching ledger data:", err);
            setError("Failed to query discovery archive: " + (err.message || String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [user, isAdmin, simulateNormalUser]);

    const handleToggleJit = async () => {
        if (!isAdmin || isTogglingJit) return;
        setIsTogglingJit(true);
        try {
            const nextState = !isJitEnabled;
            const systemSettingsRef = doc(db, 'adminLedger', 'system');
            await setDoc(systemSettingsRef, {
                jitEnabled: nextState,
                updatedAt: serverTimestamp(),
                updatedBy: user?.email || 'admin'
            }, { merge: true });
            setIsJitEnabled(nextState);
        } catch (err: any) {
            console.error("[UsageAnalyticsPage] Failed to toggle JIT kill switch:", err);
        } finally {
            setIsTogglingJit(false);
        }
    };

    useEffect(() => {
        if (isActive) {
            fetchLedger();
        }
    }, [isActive, fetchLedger, profile?.tokenBalance]);

    useEffect(() => {
        if (isActive && containerRef.current && typeof containerRef.current.scrollTo === 'function') {
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

    const currentUserTelemetry = filteredLedger[0] || ledgerData[0] || null;
    const liveTokenBalance = Math.max(
        0,
        Math.floor(Number(profile?.tokenBalance ?? currentUserTelemetry?.tokenBalance ?? 0))
    );
    const liveLifetimePurchased = Math.max(
        0,
        Math.floor(Number(profile?.lifetimeTokensPurchased ?? currentUserTelemetry?.lifetimeTokensPurchased ?? 0))
    );
    const liveLifetimeSpent = Math.max(
        0,
        Math.floor(Number(profile?.lifetimeTokensSpent ?? currentUserTelemetry?.lifetimeTokensSpent ?? 0))
    );
    const juiceMax = Math.max(liveLifetimePurchased, liveTokenBalance, 100);
    const juicePct = Math.min(100, Math.round((liveTokenBalance / juiceMax) * 100));

    const aggregateMetrics = useMemo(() => {
        let totalProjects = 0;
        let totalCreates = 0;
        let totalUpdates = 0;
        let totalLiveQueries = 0;
        let totalCacheHits = 0;
        let totalExactCosts = 0;

        ledgerData.forEach(user => {
            totalProjects += user.projectsCount;
            totalCreates += user.actionTriggers.createCount;
            totalUpdates += user.actionTriggers.updateCount;
            totalLiveQueries += user.cacheEfficiency.liveQueries;
            totalCacheHits += user.cacheEfficiency.cacheHits;
            totalExactCosts += user.hasExactCost ? user.exactCost : (user.cacheEfficiency.liveQueries * COST_PER_AI_CALL);
        });

        const totalQueries = totalLiveQueries + totalCacheHits;
        const overallEfficiency = totalQueries > 0 ? (totalCacheHits / totalQueries) * 100 : 0;
        const totalSavings = totalCacheHits * COST_PER_AI_CALL;

        return {
            totalProjects,
            totalActions: totalCreates + totalUpdates,
            totalLiveQueries,
            totalCacheHits,
            overallEfficiency,
            totalCosts: totalExactCosts,
            totalSavings
        };
    }, [ledgerData]);

    const toggleRow = (email: string) => {
        setExpandedRow(prev => prev === email ? null : email);
    };

    const formatTxTimestamp = (createdAt: any): string => {
        if (!createdAt) return 'Just now';
        const ms = typeof createdAt?.toMillis === 'function'
            ? createdAt.toMillis()
            : typeof createdAt?.seconds === 'number'
                ? createdAt.seconds * 1000
                : typeof createdAt === 'number'
                    ? createdAt
                    : Date.now();
        const d = new Date(ms);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
            d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-[#000000] text-zinc-200 font-display flex flex-col relative select-text">
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
                tokenBalance={liveTokenBalance}
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
                                    ? "Your personal Token Wallet, curated Zcene history, and immutable token activity receipts."
                                    : "Platform-wide ledger tracking curation volume, seed-artist expansions, AI synthesis requests, token wallets, and cache recall across all Authors."
                                }
                            </p>
                        </div>
                        {isAdmin && (
                            <div className="flex-shrink-0">
                                <AdminViewToggle value={simulateNormalUser} onChange={setSimulateNormalUser} />
                            </div>
                        )}
                    </div>

                    {/* Overview Cards (Admin Exclusive) */}
                    <TelemetryOverviewCards
                        aggregateMetrics={aggregateMetrics}
                        isNormalUserView={isNormalUserView}
                    />

                    {/* Standard User & Admin Preview Mode: Token Wallet Juice Bar + Personal Ledgers */}
                    {isNormalUserView && (
                        <div data-testid="wallet-hero-card" className={`bg-zinc-900/40 border border-zinc-800 p-6 sm:p-8 space-y-6 ${RADIUS_TOKENS.frame}`}>
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 block">
                                        Available Discovery Balance
                                    </span>
                                    <div className="flex items-baseline gap-3">
                                        <span data-testid="wallet-balance-value" className="text-4xl sm:text-5xl font-bold font-mono text-primary">
                                            {liveTokenBalance}
                                        </span>
                                        <span className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
                                            Tokens
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 max-w-xl">
                                        Tokens unlock new Single-Seed Zcenes, Multi-Seed / Anchored Zcenes, and Deep Connections grounded artist consults.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                    {TOP_UP_TIER_LIST.map((tier) => (
                                        <button
                                            key={tier.id}
                                            type="button"
                                            data-testid={`analytics-topup-${tier.id}`}
                                            onClick={() => triggerTopUp(tier.id)}
                                            className={`px-4 py-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${RADIUS_TOKENS.button} ${
                                                tier.featured
                                                    ? 'bg-primary text-black border-primary hover:bg-primary-hover shadow-[0_0_20px_rgba(204,255,0,0.18)]'
                                                    : 'bg-zinc-950 text-white border-zinc-700 hover:border-primary/60'
                                            }`}
                                        >
                                            <span className="font-mono">+{tier.tokens}T</span>
                                            <span className={tier.featured ? 'text-black/80 font-mono' : 'text-zinc-400 font-mono'}>
                                                ({tier.priceDisplay})
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Token Juice Bar */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                                    <span>Token Juice Reserve</span>
                                    <span>{liveTokenBalance} / {juiceMax} T ({juicePct}%)</span>
                                </div>
                                <div className="h-3 w-full bg-zinc-950 border border-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${juicePct}%` }}
                                        transition={{ duration: 0.45, ease: 'easeOut' }}
                                        className={`h-full rounded-full ${
                                            liveTokenBalance < 5 ? 'bg-amber-400' : 'bg-primary'
                                        }`}
                                    />
                                </div>
                            </div>

                            {/* Personal Metrics Strip */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/80">
                                <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 block">Zcenes Curated</span>
                                    <span className="text-2xl font-bold font-mono text-white mt-1 block">
                                        {currentUserTelemetry?.projectsCount ?? 0}
                                    </span>
                                </div>
                                <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 block">Lifetime Purchased</span>
                                    <span className="text-2xl font-bold font-mono text-emerald-300 mt-1 block">
                                        {liveLifetimePurchased} T
                                    </span>
                                </div>
                                <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 block">Lifetime Spent</span>
                                    <span className="text-2xl font-bold font-mono text-zinc-200 mt-1 block">
                                        {liveLifetimeSpent} T
                                    </span>
                                </div>
                            </div>

                            {/* Transparent Pricing Reference */}
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400 pt-1">
                                <span><strong className="text-white font-mono">5T</strong> Single-Seed Zcene</span>
                                <span><strong className="text-white font-mono">10T</strong> Multi-Seed / Anchored Zcene</span>
                                <span><strong className="text-white font-mono">3T</strong> Deep Connections (3 Messages)</span>
                                <span><strong className="text-emerald-300 font-mono">0T</strong> Shared Zcenes & Clones</span>
                            </div>
                        </div>
                    )}

                    {/* Filter controls & Refresh */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        {!isNormalUserView && (
                            <div className={`flex-grow flex items-center gap-4 bg-zinc-950 px-4 py-2 border border-zinc-800 h-[38px] ${RADIUS_TOKENS.input}`}>
                                <span className="material-symbols-outlined text-zinc-500 select-none">search</span>
                                <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
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
                            className={`flex items-center justify-center gap-2 px-6 bg-zinc-900 border border-zinc-800 text-zinc-350 hover:border-zinc-500 hover:text-white transition-all cursor-pointer font-medium text-sm disabled:opacity-50 h-[38px] ${
                                isNormalUserView ? `w-full sm:w-auto ${RADIUS_TOKENS.button}` : RADIUS_TOKENS.button
                            }`}
                        >
                            <span className={`material-symbols-outlined text-sm select-none ${isLoading ? 'animate-spin' : ''}`}>
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

                    {isNormalUserView ? (
                        <div className="space-y-10">
                            {/* Personal Curated Zcenes Ledger (Strictly Masked — Zero USD or Cache Telemetry) */}
                            <div data-testid="standard-projects-ledger" className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-medium text-white">Your Curated Zcenes</h3>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Token spend across your saved Zcene workspaces. Shared Zcenes saved to your dashboard always cost 0 Tokens.
                                    </p>
                                </div>
                                <div className={`border border-zinc-800 bg-zinc-950/30 overflow-x-auto ${RADIUS_TOKENS.frame}`}>
                                    <table className="w-full text-left border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Zcene / Seed</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curated</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curation Scope</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Tokens Spent</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isLoading && (!currentUserTelemetry || currentUserTelemetry.projects.length === 0) ? (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-zinc-500 text-xs italic">
                                                        Loading your curated Zcenes...
                                                    </td>
                                                </tr>
                                            ) : !currentUserTelemetry || currentUserTelemetry.projects.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-zinc-500 text-xs italic">
                                                        No curated Zcenes recorded yet. Start from any seed artist to map your first Zcene.
                                                    </td>
                                                </tr>
                                            ) : (
                                                currentUserTelemetry.projects.map((proj) => (
                                                    <tr key={proj.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                                        <td className="p-4 text-sm font-medium text-white">
                                                            {proj.seedArtist}
                                                        </td>
                                                        <td className="p-4 text-xs font-mono text-zinc-400">
                                                            {proj.createdAt ? formatTxTimestamp(proj.createdAt) : '—'}
                                                        </td>
                                                        <td className="p-4 text-xs">
                                                            <span className="px-2.5 py-1 rounded-lg border border-zinc-700/80 bg-zinc-900 text-zinc-300 font-medium">
                                                                {proj.userFacingScope}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-xs text-right font-mono font-bold text-primary">
                                                            {proj.hasRecordedTokens ? `${proj.tokensSpent} Tokens` : '0 Tokens'}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Immutable Token Activity & Top-Up Receipts */}
                            <div data-testid="token-transactions-ledger" className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-medium text-white">Token Activity & Top-Up Receipts</h3>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Verified wallet credits, artist lookups, Zcene curations, Deep Connections unlocks, and automatic error refunds.
                                    </p>
                                </div>
                                <div className={`border border-zinc-800 bg-zinc-950/30 overflow-x-auto ${RADIUS_TOKENS.frame}`}>
                                    <table className="w-full text-left border-collapse min-w-[640px]">
                                        <thead>
                                            <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Activity</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Category</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Change</th>
                                                <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Balance After</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isLoading && tokenTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-zinc-500 text-xs italic">
                                                        Loading token activity...
                                                    </td>
                                                </tr>
                                            ) : tokenTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-zinc-500 text-xs italic">
                                                        No token transactions yet. Top up your wallet above to begin curating.
                                                    </td>
                                                </tr>
                                            ) : (
                                                tokenTransactions.map((tx) => {
                                                    const badge = formatTxTypeBadge(tx.type);
                                                    const isPositive = tx.delta > 0;
                                                    return (
                                                        <tr key={tx.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                                            <td className="p-4 text-xs font-mono text-zinc-400">
                                                                {formatTxTimestamp(tx.createdAt)}
                                                            </td>
                                                            <td className="p-4 text-sm text-zinc-200">
                                                                {tx.description}
                                                            </td>
                                                            <td className="p-4 text-xs">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${badge.style}`}>
                                                                    {badge.label}
                                                                </span>
                                                            </td>
                                                            <td className={`p-4 text-xs text-right font-mono font-bold ${
                                                                isPositive ? 'text-emerald-400' : 'text-zinc-200'
                                                            }`}>
                                                                {isPositive ? `+${tx.delta} T` : `${tx.delta} T`}
                                                            </td>
                                                            <td className="p-4 text-xs text-right font-mono text-zinc-400">
                                                                {tx.balanceAfter} T
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Master Ledger List (Admin Mode) */}
                            <DiscoveryLedgerTable
                                isLoading={isLoading}
                                filteredLedger={filteredLedger}
                                expandedRow={expandedRow}
                                toggleRow={toggleRow}
                            />

                            {/* JIT Auto-Healing Telemetry (Phase 3 Admin Exclusive) */}
                            <div className="space-y-4 pt-6">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-xl font-medium text-white">JIT Auto-Healing Telemetry</h3>
                                            
                                            {/* 1. Static Status Badge (Design System: Badges & Tags) */}
                                            <span 
                                                className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-xl w-fit select-none ${
                                                    isJitEnabled 
                                                        ? 'bg-emerald-500/20 text-emerald-300' 
                                                        : 'bg-red-500/20 text-red-300'
                                                }`}
                                            >
                                                {isJitEnabled ? 'ACTIVE' : 'DISABLED'}
                                            </span>

                                            {/* 2. Standard Toggle Switch (Design System: Standard Toggle Switch) */}
                                            <button
                                                type="button"
                                                onClick={handleToggleJit}
                                                disabled={isTogglingJit}
                                                aria-label="Toggle JIT Auto-Healing status"
                                                title={isJitEnabled ? "Click to disable JIT Auto-Healing" : "Click to enable JIT Auto-Healing"}
                                                className="w-10 h-5 rounded-full relative transition-colors bg-zinc-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <div 
                                                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                                                        isJitEnabled 
                                                            ? 'translate-x-5 bg-primary' 
                                                            : 'bg-zinc-400'
                                                    }`} 
                                                />
                                            </button>
                                        </div>

                                        {/* 3. Descriptive Context Block */}
                                        <p className="text-sm text-zinc-400 mt-2 max-w-3xl leading-relaxed">
                                            The JIT Healer synthesizes missing database assets on-the-fly via Gemini Flash. To prevent runaway API costs, it is strictly capped at 100 automatic heals per 24 hours (a maximum daily exposure of ~$0.04). If this rolling threshold is breached, JIT Healing will automatically disable. You can use the toggle to manually override and lock the system at any time.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-6 font-mono text-xs">
                                        <div>
                                            <span className="text-zinc-500 block text-[10px] uppercase">Healed Assets</span>
                                            <span className="text-white font-bold">{jitHeals.length}</span>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500 block text-[10px] uppercase">Total Tokens</span>
                                            <span className="text-zinc-300 font-bold">{jitHeals.reduce((acc, h) => acc + h.totalTokens, 0).toLocaleString()}</span>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500 block text-[10px] uppercase">Total Cost</span>
                                            <span className="text-red-400 font-bold font-mono">${jitHeals.reduce((acc, h) => acc + h.costUsd, 0).toFixed(5)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-zinc-800 bg-zinc-950/20 overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[700px]">
                                        <thead>
                                            <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Entity</th>
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Type</th>
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Triggered By</th>
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Tokens</th>
                                                <th className="p-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isLoading && jitHeals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-6 text-center text-zinc-500 text-xs italic">
                                                        Loading healing receipts...
                                                    </td>
                                                </tr>
                                            ) : jitHeals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-6 text-center text-zinc-500 text-xs italic">
                                                        No JIT healing events recorded yet.
                                                    </td>
                                                </tr>
                                            ) : (
                                                jitHeals.map((heal) => {
                                                    const d = new Date(heal.timestamp);
                                                    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
                                                        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                                    return (
                                                        <tr key={heal.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                                            <td className="p-3.5 text-xs text-zinc-400 font-mono">
                                                                {dateStr}
                                                            </td>
                                                            <td className="p-3.5 text-sm text-white font-medium">
                                                                {heal.displayName}
                                                                <span className="block text-[11px] font-mono text-zinc-600">{heal.entityId}</span>
                                                            </td>
                                                            <td className="p-3.5 text-xs">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                                                    heal.entityType === 'label'
                                                                        ? 'border-teal-500/30 text-teal-400 bg-teal-950/20'
                                                                        : 'border-purple-500/30 text-purple-400 bg-purple-950/20'
                                                                }`}>
                                                                    {heal.entityType}
                                                                </span>
                                                            </td>
                                                            <td className="p-3.5 text-xs text-zinc-300">
                                                                <span className="font-medium text-zinc-200 block truncate max-w-[220px]" title={heal.callerEmail || heal.callerUid}>
                                                                    {heal.callerEmail || heal.callerUid}
                                                                </span>
                                                                {heal.projectName ? (
                                                                    <span 
                                                                        className="block text-[11px] text-zinc-400 font-medium mt-0.5 truncate max-w-[220px]" 
                                                                        title={heal.projectId ? `${heal.projectName} (${heal.projectId})` : heal.projectName}
                                                                    >
                                                                        {heal.projectName}
                                                                    </span>
                                                                ) : heal.projectId ? (
                                                                    <span 
                                                                        className="block text-[11px] font-mono text-zinc-500 mt-0.5 truncate max-w-[220px]" 
                                                                        title={heal.projectId}
                                                                    >
                                                                        {heal.projectId}
                                                                    </span>
                                                                ) : (
                                                                    <span className="block text-[11px] font-mono text-zinc-600 mt-0.5 select-none">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3.5 text-xs text-right font-mono text-zinc-400">
                                                                {heal.totalTokens.toLocaleString()}
                                                            </td>
                                                            <td className="p-3.5 text-xs text-right font-mono text-red-400 font-bold">
                                                                ${heal.costUsd.toFixed(5)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </main>

            <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800 mt-10">
                <div className="container mx-auto text-center">
                    <ZceneLogo className="h-8 w-auto text-primary mx-auto mb-4" />
                    <p className="text-zinc-600">
                        {isNormalUserView
                            ? "© 2026 Zcene. Own Music Discovery."
                            : "© 2026 Zcene Admin Console. Restricted access authorisation archives."}
                    </p>
                </div>
            </footer>
        </div>
    );
};

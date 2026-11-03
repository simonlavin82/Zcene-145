import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, COST_PER_AI_CALL, RADIUS_TOKENS, TokenTransaction } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { motion } from 'motion/react';
import { InfoTooltip } from './ui/InfoTooltip';
import { AdminViewToggle } from './ui/AdminViewToggle';
import { cleanArtistDisplayName } from '../services/artistCacheService';
import {
    TOP_UP_TIER_LIST,
    TokenTopUpTierId,
    TOKEN_PRICING,
    TOKEN_UNIT_GBP,
    TOKEN_UNIT_USD,
    isAdminEmail,
    tokensToGbp,
    tokensToUsd,
    usdToGbp,
} from '../shared/tokenEconomy';
import { BackButton } from './DesignSystem';

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

export interface LedgerTransactionRecord {
    id: string;
    uid?: string;
    type: string;
    delta: number;
    balanceAfter?: number | null;
    tierId?: TokenTopUpTierId;
    amountGbp?: number;
    projectId?: string;
    curationSessionId?: string;
    seedArtist?: string;
    generationType?: string;
    costUsd?: number;
    apiUsage?: Record<string, any>;
    description: string;
    createdAt?: any;
}

export interface UserTelemetry {
    uid?: string;
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
    transactions?: LedgerTransactionRecord[];
}

export interface ProjectTelemetry {
    id: string;
    seedArtist: string;
    canonicalSeed?: string;
    generationType: string;
    userFacingScope: string;
    tokensSpent: number;
    hasRecordedTokens: boolean;
    cost: number;
    curationOnlyCost?: number;
    isEstimate: boolean;
    createdAt: number;
    status?: 'active' | 'trashed' | 'deleted' | 'archived' | string;
    isArchived?: boolean;
}

export interface TelemetryAggregateMetrics {
    // Card 1: Token Revenue (Earned)
    customerTokensSpent: number;
    customerEarnedGbp: number;
    customerEarnedUsd: number;
    customerGrossPurchasedTokens: number;
    customerGrossPurchasedGbp: number;
    customerGrossPurchasedUsd: number;
    customerUnspentFloatTokens: number;
    customerUnspentFloatGbp: number;
    customerUnspentFloatUsd: number;

    // Card 2: Actual AI API Cost
    totalPlatformAiCostUsd: number;
    totalPlatformAiCostGbp: number;
    customerAiCostUsd: number;
    adminAiCostUsd: number;
    jitAiCostUsd: number;

    // Card 3: Net Gross Profit & Margin
    customerNetProfitUsd: number;
    customerGrossMarginPct: number | null;
    platformNetProfitUsd: number;
    platformNetMarginPct: number | null;
    avgColdCurationCostUsd: number | null;
    coldCurationCount: number;

    // Card 4: Cache Hit Efficiency
    totalCurations: number;
    directHitCurations: number;
    directHitRatePct: number;
    estimatedDirectHitSavingsUsd: number;
}

export type ActivityFilterCategory = 'all' | 'curations' | 'deep_connections' | 'topups_refunds';

export interface UnifiedActivityRow {
    id: string;
    timestampMs: number;
    createdAt: any;
    txType: string;
    filterCategory: Exclude<ActivityFilterCategory, 'all'>;
    title: string;
    subtitle?: string;
    rawDescription: string;
    isCurationRow: boolean;
    projectStatus?: 'active' | 'trashed' | 'deleted' | 'archived' | string;
    userFacingScope?: string;
    generationType?: string;
    categoryBadge: { label: string; style: string };
    delta: number;
    totalProjectTokens?: number;
    balanceAfter: number | null;
    isSyntheticFallback: boolean;
    isAdminBypass: boolean;
    aiCostUsd: number | null;
    isCostEstimate: boolean;
    netMarginUsd: number | null;
    netMarginPct: number | null;
}

const extractTimestampMs = (rawTime: any): number => {
    if (!rawTime) return 0;
    if (typeof rawTime?.toMillis === 'function') return rawTime.toMillis();
    if (typeof rawTime?.toDate === 'function') return rawTime.toDate().getTime();
    if (typeof rawTime?.seconds === 'number') return rawTime.seconds * 1000;
    if (rawTime instanceof Date) return rawTime.getTime();
    if (typeof rawTime === 'number') return rawTime;
    return 0;
};

const computeApiUsageCostUsd = (apiUsage?: Record<string, any> | null): number => {
    if (!apiUsage || typeof apiUsage !== 'object') return 0;
    let sum = 0;
    for (const [model, usage] of Object.entries(apiUsage)) {
        if (!usage || typeof usage !== 'object') continue;
        const u = usage as any;
        const prompt = Number(u.prompt) || 0;
        const candidates = Number(u.candidates) || 0;
        const total = Number(u.total) || (prompt + candidates);
        const reasoningTokens = Math.max(0, total - (prompt + candidates));
        if (model.includes('gemini-3.1-pro') || model.includes('gemini-1.5-pro')) {
            if (prompt > 128000) {
                sum += (prompt / 1_000_000) * 7.00 + ((candidates + reasoningTokens) / 1_000_000) * 21.00;
            } else {
                sum += (prompt / 1_000_000) * 3.50 + ((candidates + reasoningTokens) / 1_000_000) * 10.50;
            }
        } else {
            sum += (prompt / 1_000_000) * 1.50 + ((candidates + reasoningTokens) / 1_000_000) * 7.50;
        }
    }
    return sum;
};

const roundUsd4 = (val: number): number => {
    if (!Number.isFinite(val)) return 0;
    const sign = val < 0 ? -1 : 1;
    return sign * (Math.round((Math.abs(val) + 1e-12) * 10000) / 10000);
};

const formatUsd4 = (val: number): string => roundUsd4(val).toFixed(4);

const formatSignedUsd = (val: number, decimals = 2): string => {
    const absStr = Math.abs(val).toFixed(decimals);
    if (Math.abs(val) < 0.00005) return `$${(0).toFixed(decimals)}`;
    return val > 0 ? `+$${absStr}` : `-$${absStr}`;
};

const formatSignedPct = (val: number, decimals = 1): string => {
    const absStr = Math.abs(val).toFixed(decimals);
    if (Math.abs(val) < 0.05) return `0.0%`;
    return val > 0 ? `+${absStr}%` : `-${absStr}%`;
};

export const formatTxTimestamp = (createdAt: any): string => {
    if (!createdAt) return 'Just now';
    const ms = extractTimestampMs(createdAt) || Date.now();
    const d = new Date(ms);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const formatTxTypeBadge = (type: string): { label: string; style: string } => {
    switch (type) {
        case 'topup_simulated':
        case 'top_up_simulated':
            return { label: 'Top-Up', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'refund':
        case 'admin_refund':
        case 'refund_pipeline_error':
        case 'refund_error':
            return { label: 'Auto-Refund', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'spend_preflight_lookup':
        case 'spend_preflight':
        case 'spend_escape_hatch':
            return { label: 'Artist Lookup', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
        case 'spend_deep_web':
            return { label: 'Deep Connections', style: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
        case 'clone_saved':
            return { label: 'Shared Clone', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'spend_direct_hit':
        case 'spend_live_synthesis':
        default:
            return { label: 'Zcene Curation', style: 'bg-primary/15 text-primary border-primary/30' };
    }
};

const renderProjectStatusBadge = (
    status?: string,
    maskPurgedAsArchived = false
): React.ReactNode => {
    if (!status) return null;
    if (status === 'trashed') {
        return (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0">
                TRASHED
            </span>
        );
    }
    if (status === 'deleted' && !maskPurgedAsArchived) {
        return (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-red-500/15 text-red-300 border border-red-500/30 whitespace-nowrap shrink-0">
                PURGED
            </span>
        );
    }
    if (status === 'archived' || (status === 'deleted' && maskPurgedAsArchived)) {
        return (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-zinc-800 text-zinc-400 border border-zinc-700 whitespace-nowrap shrink-0">
                ARCHIVED
            </span>
        );
    }
    return (
        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap shrink-0">
            ACTIVE
        </span>
    );
};

export const computeAggregateMetrics = (
    ledgerData: UserTelemetry[],
    jitHeals: JitHealRecord[] = []
): TelemetryAggregateMetrics => {
    let customerTokensSpent = 0;
    let customerGrossPurchasedTokens = 0;
    let customerUnspentFloatTokens = 0;
    let customerAiCostUsd = 0;
    let adminAiCostUsd = 0;

    let totalCurations = 0;
    let directHitCurations = 0;
    let coldCurationCostSum = 0;
    let coldCurationCount = 0;

    ledgerData.forEach((u) => {
        const userAiCost = u.hasExactCost ? u.exactCost : (u.cacheEfficiency.liveQueries * COST_PER_AI_CALL);
        if (isAdminEmail(u.email)) {
            adminAiCostUsd += userAiCost;
        } else {
            customerTokensSpent += Math.max(0, Number(u.lifetimeTokensSpent) || 0);
            customerGrossPurchasedTokens += Math.max(0, Number(u.lifetimeTokensPurchased) || 0);
            customerUnspentFloatTokens += Math.max(0, Number(u.tokenBalance) || 0);
            customerAiCostUsd += userAiCost;
        }

        (u.projects || []).forEach((proj) => {
            if (proj.generationType === 'Clone') return;
            totalCurations += 1;
            if (proj.generationType === 'Direct Hit') {
                directHitCurations += 1;
            } else {
                const pureCurationCost = typeof proj.curationOnlyCost === 'number' ? proj.curationOnlyCost : proj.cost;
                if (!proj.isEstimate && pureCurationCost > 0) {
                    coldCurationCostSum += pureCurationCost;
                    coldCurationCount += 1;
                }
            }
        });
    });

    const jitAiCostUsd = jitHeals.reduce((sum, h) => sum + (Number(h.costUsd) || 0), 0);
    const totalPlatformAiCostUsd = roundUsd4(
        roundUsd4(customerAiCostUsd) + roundUsd4(adminAiCostUsd) + roundUsd4(jitAiCostUsd)
    );
    const totalPlatformAiCostGbp = usdToGbp(totalPlatformAiCostUsd);

    const customerEarnedGbp = tokensToGbp(customerTokensSpent);
    const customerEarnedUsd = tokensToUsd(customerTokensSpent);
    const customerGrossPurchasedGbp = tokensToGbp(customerGrossPurchasedTokens);
    const customerGrossPurchasedUsd = tokensToUsd(customerGrossPurchasedTokens);
    const customerUnspentFloatGbp = tokensToGbp(customerUnspentFloatTokens);
    const customerUnspentFloatUsd = tokensToUsd(customerUnspentFloatTokens);

    const customerNetProfitUsd = customerEarnedUsd - customerAiCostUsd;
    const customerGrossMarginPct = customerEarnedUsd > 0
        ? (customerNetProfitUsd / customerEarnedUsd) * 100
        : null;

    const platformNetProfitUsd = customerEarnedUsd - totalPlatformAiCostUsd;
    const platformNetMarginPct = customerEarnedUsd > 0
        ? (platformNetProfitUsd / customerEarnedUsd) * 100
        : null;

    const avgColdCurationCostUsd = coldCurationCount > 0
        ? coldCurationCostSum / coldCurationCount
        : null;

    const directHitRatePct = totalCurations > 0
        ? (directHitCurations / totalCurations) * 100
        : 0;

    const estimatedDirectHitSavingsUsd = avgColdCurationCostUsd !== null
        ? directHitCurations * avgColdCurationCostUsd
        : 0;

    return {
        customerTokensSpent,
        customerEarnedGbp,
        customerEarnedUsd,
        customerGrossPurchasedTokens,
        customerGrossPurchasedGbp,
        customerGrossPurchasedUsd,
        customerUnspentFloatTokens,
        customerUnspentFloatGbp,
        customerUnspentFloatUsd,
        totalPlatformAiCostUsd,
        totalPlatformAiCostGbp,
        customerAiCostUsd,
        adminAiCostUsd,
        jitAiCostUsd,
        customerNetProfitUsd,
        customerGrossMarginPct,
        platformNetProfitUsd,
        platformNetMarginPct,
        avgColdCurationCostUsd,
        coldCurationCount,
        totalCurations,
        directHitCurations,
        directHitRatePct,
        estimatedDirectHitSavingsUsd,
    };
};

export const buildUnifiedActivityRows = (
    userTelemetry: UserTelemetry | null | undefined,
    overrideTransactions?: Array<TokenTransaction | LedgerTransactionRecord>
): UnifiedActivityRow[] => {
    if (!userTelemetry && (!overrideTransactions || overrideTransactions.length === 0)) {
        return [];
    }

    const projects = userTelemetry?.projects || [];
    const rawTxs: LedgerTransactionRecord[] = (overrideTransactions ?? userTelemetry?.transactions ?? []) as LedgerTransactionRecord[];
    const authorIsAdmin = isAdminEmail(userTelemetry?.email);

    const projectsById = new Map<string, ProjectTelemetry>();
    projects.forEach((p) => projectsById.set(p.id, p));
    const matchedProjectIds = new Set<string>();

    const perPreflightLookupCost =
        (userTelemetry?.preflightLookups?.calls ?? 0) > 0
            ? (userTelemetry!.preflightLookups!.costUsd / userTelemetry!.preflightLookups!.calls)
            : null;

    // Count net non-refunded Deep Connections unlocks to apportion user-level deepWebApiUsage cleanly when tx.costUsd isn't stamped
    const deepWebUnlockCount = rawTxs.filter((t) => t.type === 'spend_deep_web').length;
    const deepWebRefundCount = rawTxs.filter(
        (t) =>
            (t.type === 'refund' || t.type === 'admin_refund' || t.type === 'refund_error') &&
            typeof t.description === 'string' &&
            t.description.toLowerCase().includes('deep connections')
    ).length;
    const netDeepWebPasses = Math.max(0, deepWebUnlockCount - deepWebRefundCount);
    const apportionedDeepWebPassCost =
        netDeepWebPasses > 0 && (userTelemetry?.deepWebConsults?.costUsd ?? 0) > 0
            ? (userTelemetry!.deepWebConsults!.costUsd / netDeepWebPasses)
            : 0;
    let remainingRefundedDeepWebLocks = deepWebRefundCount;

    const rows: UnifiedActivityRow[] = [];

    rawTxs.forEach((tx, index) => {
        const txId = tx.id || `tx_${index}`;
        const tsMs = extractTimestampMs(tx.createdAt);
        const delta = Number(tx.delta) || 0;
        const rawDescription = tx.description || 'Token Activity';
        const txType = tx.type || 'spend_live_synthesis';

        const isCurationTx =
            txType === 'spend_live_synthesis' ||
            txType === 'spend_direct_hit' ||
            (typeof rawDescription === 'string' &&
                (rawDescription.toLowerCase().includes('zcene curation') ||
                    rawDescription.toLowerCase().includes('zcene synthesis')));

        const isPreflightTx =
            txType === 'spend_preflight_lookup' ||
            txType === 'spend_preflight' ||
            txType === 'spend_escape_hatch';

        const isDeepWebTx = txType === 'spend_deep_web';

        const isTopUpOrRefundTx =
            txType === 'topup_simulated' ||
            txType === 'top_up_simulated' ||
            txType === 'refund' ||
            txType === 'admin_refund' ||
            txType === 'refund_pipeline_error' ||
            txType === 'refund_error' ||
            delta > 0;

        if (isCurationTx) {
            let matchedProj: ProjectTelemetry | undefined;

            // 1. Primary Join: Exact projectId or reconstituted synthetic archived_{tx.id}
            if (tx.projectId && projectsById.has(tx.projectId)) {
                matchedProj = projectsById.get(tx.projectId);
            } else if (projectsById.has(`archived_${txId}`)) {
                matchedProj = projectsById.get(`archived_${txId}`);
            }

            // Extract clean seed from tx
            let rawSeed = tx.seedArtist || '';
            if (!rawSeed && typeof rawDescription === 'string') {
                rawSeed = rawDescription
                    .replace(/^Zcene\s+(?:Curation|Synthesis):\s*/i, '')
                    .replace(/\s*\(\d+T.*?\)$/i, '')
                    .trim();
            }
            const cleanSeed = cleanArtistDisplayName(rawSeed || 'Archived Curation');
            const cleanSeedLower = cleanSeed.toLowerCase();

            // 2. Secondary Join: Chronological normalized seed match for pre-V41 curations lacking tx.projectId
            if (!matchedProj && cleanSeedLower && cleanSeedLower !== 'archived curation') {
                const candidates = projects.filter((p) => {
                    if (matchedProjectIds.has(p.id)) return false;
                    const pCanonical = (p.canonicalSeed || cleanArtistDisplayName(p.seedArtist)).toLowerCase();
                    const pDisplay = cleanArtistDisplayName(p.seedArtist).toLowerCase();
                    return pCanonical === cleanSeedLower || pDisplay === cleanSeedLower || pDisplay.startsWith(cleanSeedLower + ' (');
                });
                if (candidates.length > 0) {
                    candidates.sort((a, b) => Math.abs((a.createdAt || 0) - tsMs) - Math.abs((b.createdAt || 0) - tsMs));
                    matchedProj = candidates[0];
                }
            }

            if (matchedProj) {
                matchedProjectIds.add(matchedProj.id);
            }

            const hasPreFlightCredit = /after\s+1t\s+pre-flight/i.test(rawDescription) || Math.abs(delta) === 4 || Math.abs(delta) === 9;
            const totalProjectTokens = matchedProj?.hasRecordedTokens && matchedProj.tokensSpent > 0
                ? matchedProj.tokensSpent
                : (hasPreFlightCredit ? Math.abs(delta) + 1 : Math.abs(delta));

            const resolvedStatus = matchedProj?.status || 'archived';
            const resolvedScope =
                matchedProj?.userFacingScope ||
                (totalProjectTokens >= TOKEN_PRICING.COMPLEX_QUERY ? 'Multi-Seed Zcene' : 'Single-Seed Zcene');
            const resolvedGenType =
                tx.generationType ||
                matchedProj?.generationType ||
                (txType === 'spend_direct_hit' ? 'Direct Hit' : 'Root Generation');

            const displayTitle = matchedProj?.seedArtist || cleanSeed;
            const splitDebitNote = hasPreFlightCredit
                ? `${Math.abs(delta)}T settlement after 1T pre-flight`
                : undefined;

            let aiCostUsd: number | null = null;
            let isCostEstimate = false;
            if (typeof tx.costUsd === 'number') {
                aiCostUsd = tx.costUsd;
            } else if (tx.apiUsage && Object.keys(tx.apiUsage).length > 0) {
                aiCostUsd = computeApiUsageCostUsd(tx.apiUsage);
            } else if (matchedProj) {
                aiCostUsd = typeof matchedProj.curationOnlyCost === 'number' ? matchedProj.curationOnlyCost : matchedProj.cost;
                isCostEstimate = Boolean(matchedProj.isEstimate);
            } else if (resolvedGenType === 'Direct Hit') {
                aiCostUsd = 0;
            }

            const rowRevUsd = authorIsAdmin ? 0 : tokensToUsd(Math.abs(delta));
            const netMarginUsd = aiCostUsd !== null ? rowRevUsd - aiCostUsd : null;
            const netMarginPct = !authorIsAdmin && rowRevUsd > 0 && netMarginUsd !== null
                ? (netMarginUsd / rowRevUsd) * 100
                : null;

            rows.push({
                id: txId,
                timestampMs: tsMs,
                createdAt: tx.createdAt,
                txType,
                filterCategory: 'curations',
                title: displayTitle,
                subtitle: splitDebitNote,
                rawDescription,
                isCurationRow: true,
                projectStatus: resolvedStatus,
                userFacingScope: resolvedScope,
                generationType: resolvedGenType,
                categoryBadge: formatTxTypeBadge(txType),
                delta,
                totalProjectTokens,
                balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : null,
                isSyntheticFallback: false,
                isAdminBypass: authorIsAdmin,
                aiCostUsd,
                isCostEstimate,
                netMarginUsd,
                netMarginPct,
            });
            return;
        }

        if (isPreflightTx) {
            const aiCostUsd = typeof tx.costUsd === 'number'
                ? tx.costUsd
                : (tx.apiUsage ? computeApiUsageCostUsd(tx.apiUsage) : perPreflightLookupCost);
            const rowRevUsd = authorIsAdmin ? 0 : tokensToUsd(Math.abs(delta));
            const netMarginUsd = aiCostUsd !== null ? rowRevUsd - aiCostUsd : null;
            const netMarginPct = !authorIsAdmin && rowRevUsd > 0 && netMarginUsd !== null
                ? (netMarginUsd / rowRevUsd) * 100
                : null;

            rows.push({
                id: txId,
                timestampMs: tsMs,
                createdAt: tx.createdAt,
                txType,
                filterCategory: 'curations',
                title: rawDescription,
                rawDescription,
                isCurationRow: false,
                categoryBadge: formatTxTypeBadge(txType),
                delta,
                balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : null,
                isSyntheticFallback: false,
                isAdminBypass: authorIsAdmin,
                aiCostUsd,
                isCostEstimate: false,
                netMarginUsd,
                netMarginPct,
            });
            return;
        }

        if (isDeepWebTx) {
            // Note: rawTxs is sorted newest-first; earlier failed unlocks correspond to later entries if refunded
            let aiCostUsd: number | null = null;
            if (typeof tx.costUsd === 'number') {
                aiCostUsd = tx.costUsd;
            } else if (remainingRefundedDeepWebLocks > 0 && index >= rawTxs.length - (deepWebRefundCount * 2 + 5)) {
                aiCostUsd = 0;
                remainingRefundedDeepWebLocks -= 1;
            } else {
                aiCostUsd = apportionedDeepWebPassCost;
            }
            const rowRevUsd = authorIsAdmin ? 0 : tokensToUsd(Math.abs(delta));
            const netMarginUsd = aiCostUsd !== null ? rowRevUsd - aiCostUsd : null;
            const netMarginPct = !authorIsAdmin && rowRevUsd > 0 && netMarginUsd !== null
                ? (netMarginUsd / rowRevUsd) * 100
                : null;

            rows.push({
                id: txId,
                timestampMs: tsMs,
                createdAt: tx.createdAt,
                txType,
                filterCategory: 'deep_connections',
                title: rawDescription,
                rawDescription,
                isCurationRow: false,
                categoryBadge: formatTxTypeBadge(txType),
                delta,
                balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : null,
                isSyntheticFallback: false,
                isAdminBypass: authorIsAdmin,
                aiCostUsd,
                isCostEstimate: false,
                netMarginUsd,
                netMarginPct,
            });
            return;
        }

        if (isTopUpOrRefundTx) {
            rows.push({
                id: txId,
                timestampMs: tsMs,
                createdAt: tx.createdAt,
                txType,
                filterCategory: 'topups_refunds',
                title: rawDescription,
                rawDescription,
                isCurationRow: false,
                categoryBadge: formatTxTypeBadge(txType),
                delta,
                balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : null,
                isSyntheticFallback: false,
                isAdminBypass: authorIsAdmin,
                aiCostUsd: null,
                isCostEstimate: false,
                netMarginUsd: null,
                netMarginPct: null,
            });
            return;
        }

        // Generic fallback for any unrecognized negative spend transaction
        const rowRevUsd = authorIsAdmin ? 0 : tokensToUsd(Math.abs(delta));
        const aiCostUsd = typeof tx.costUsd === 'number' ? tx.costUsd : null;
        const netMarginUsd = aiCostUsd !== null ? rowRevUsd - aiCostUsd : null;
        rows.push({
            id: txId,
            timestampMs: tsMs,
            createdAt: tx.createdAt,
            txType,
            filterCategory: 'curations',
            title: rawDescription,
            rawDescription,
            isCurationRow: false,
            categoryBadge: formatTxTypeBadge(txType),
            delta,
            balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : null,
            isSyntheticFallback: false,
            isAdminBypass: authorIsAdmin,
            aiCostUsd,
            isCostEstimate: false,
            netMarginUsd,
            netMarginPct: !authorIsAdmin && rowRevUsd > 0 && netMarginUsd !== null ? (netMarginUsd / rowRevUsd) * 100 : null,
        });
    });

    // Synthesize fallback rows for unmatched projects (e.g., Admin 0T sandbox curations, 0T shared clones, or standalone test fixtures)
    projects.forEach((proj) => {
        if (matchedProjectIds.has(proj.id)) return;
        const isClone = proj.generationType === 'Clone';
        const fallbackTxType = isClone
            ? 'clone_saved'
            : (proj.generationType === 'Direct Hit' ? 'spend_direct_hit' : 'spend_live_synthesis');
        const tokenDelta = authorIsAdmin || isClone
            ? 0
            : (proj.hasRecordedTokens && proj.tokensSpent > 0 ? -proj.tokensSpent : 0);
        const aiCostUsd = typeof proj.curationOnlyCost === 'number' ? proj.curationOnlyCost : proj.cost;
        const rowRevUsd = authorIsAdmin ? 0 : tokensToUsd(Math.abs(tokenDelta));
        const netMarginUsd = rowRevUsd - aiCostUsd;
        const netMarginPct = !authorIsAdmin && rowRevUsd > 0 ? (netMarginUsd / rowRevUsd) * 100 : null;

        rows.push({
            id: `proj_fallback_${proj.id}`,
            timestampMs: proj.createdAt || 0,
            createdAt: proj.createdAt,
            txType: fallbackTxType,
            filterCategory: 'curations',
            title: proj.seedArtist,
            subtitle: authorIsAdmin
                ? 'Admin Sandbox Curation (0T Wallet Bypass)'
                : (isClone ? 'Shared Zcene saved to workspace (0T)' : undefined),
            rawDescription: proj.seedArtist,
            isCurationRow: true,
            projectStatus: proj.status || 'active',
            userFacingScope: proj.userFacingScope || 'Single-Seed Zcene',
            generationType: proj.generationType || 'Direct Hit',
            categoryBadge: formatTxTypeBadge(fallbackTxType),
            delta: tokenDelta,
            totalProjectTokens: proj.tokensSpent,
            balanceAfter: null,
            isSyntheticFallback: true,
            isAdminBypass: authorIsAdmin,
            aiCostUsd,
            isCostEstimate: Boolean(proj.isEstimate),
            netMarginUsd,
            netMarginPct,
        });
    });

    // Admin 0T Pre-Flight Lookup fallback row when Admin bypassed tokenTransactions
    if (authorIsAdmin && rawTxs.length === 0 && (userTelemetry?.preflightLookups?.calls ?? 0) > 0) {
        const calls = userTelemetry!.preflightLookups!.calls;
        const costUsd = userTelemetry!.preflightLookups!.costUsd;
        const earliestTs = rows.length > 0 ? Math.max(0, Math.min(...rows.map((r) => r.timestampMs)) - 1000) : Date.now();
        rows.push({
            id: `admin_preflight_summary_${userTelemetry?.uid || 'admin'}`,
            timestampMs: earliestTs,
            createdAt: earliestTs,
            txType: 'spend_preflight_lookup',
            filterCategory: 'curations',
            title: `Pre-Flight Artist Lookups (${calls} Sandbox ${calls === 1 ? 'Call' : 'Calls'})`,
            subtitle: 'Admin Sandbox Pre-Flight (0T Wallet Bypass)',
            rawDescription: 'Admin Pre-Flight Lookups',
            isCurationRow: false,
            categoryBadge: formatTxTypeBadge('spend_preflight_lookup'),
            delta: 0,
            balanceAfter: null,
            isSyntheticFallback: true,
            isAdminBypass: true,
            aiCostUsd: costUsd,
            isCostEstimate: false,
            netMarginUsd: -costUsd,
            netMarginPct: null,
        });
    }

    rows.sort((a, b) => b.timestampMs - a.timestampMs);
    return rows;
};

export const TokenEconomicsKeyStrip: React.FC<{ isNormalUserView: boolean }> = ({ isNormalUserView }) => {
    if (isNormalUserView) return null;

    const singleGbp = tokensToGbp(TOKEN_PRICING.SINGLE_SEED).toFixed(2);
    const singleUsd = tokensToUsd(TOKEN_PRICING.SINGLE_SEED).toFixed(2);
    const complexGbp = tokensToGbp(TOKEN_PRICING.COMPLEX_QUERY).toFixed(2);
    const complexUsd = tokensToUsd(TOKEN_PRICING.COMPLEX_QUERY).toFixed(2);
    const deepGbp = tokensToGbp(TOKEN_PRICING.DEEP_WEB_CONSULT).toFixed(2);
    const deepUsd = tokensToUsd(TOKEN_PRICING.DEEP_WEB_CONSULT).toFixed(2);
    const preflightGbp = tokensToGbp(TOKEN_PRICING.PREFLIGHT_FLASH_FEE).toFixed(2);
    const preflightUsd = tokensToUsd(TOKEN_PRICING.PREFLIGHT_FLASH_FEE).toFixed(2);

    return (
        <div
            data-testid="token-economics-key-strip"
            className={`bg-zinc-900/35 border border-zinc-800/90 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-400 ${RADIUS_TOKENS.frame}`}
        >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                Token Economics Key
            </span>
            <span className="font-mono text-zinc-200 whitespace-nowrap">
                <strong>1T</strong> = £{TOKEN_UNIT_GBP.toFixed(2)} / ~${TOKEN_UNIT_USD.toFixed(2)} USD
            </span>
            <span className="text-zinc-700 select-none">•</span>
            <span className="whitespace-nowrap">
                Single-Seed Zcene (<span className="font-mono text-white">5T</span>) = <span className="font-mono text-zinc-300">£{singleGbp} / ~${singleUsd}</span>
            </span>
            <span className="text-zinc-700 select-none">•</span>
            <span className="whitespace-nowrap">
                Complex Zcene (<span className="font-mono text-white">10T</span>) = <span className="font-mono text-zinc-300">£{complexGbp} / ~${complexUsd}</span>
            </span>
            <span className="text-zinc-700 select-none">•</span>
            <span className="whitespace-nowrap">
                Deep Connections (<span className="font-mono text-white">3T</span>) = <span className="font-mono text-zinc-300">£{deepGbp} / ~${deepUsd}</span>
            </span>
            <span className="text-zinc-700 select-none">•</span>
            <span className="whitespace-nowrap">
                Pre-Flight Lookup (<span className="font-mono text-white">1T</span>) = <span className="font-mono text-zinc-300">£{preflightGbp} / ~${preflightUsd}</span>
            </span>
        </div>
    );
};

export interface TelemetryOverviewCardsProps {
    aggregateMetrics: TelemetryAggregateMetrics;
    isNormalUserView: boolean;
}

export const TelemetryOverviewCards: React.FC<TelemetryOverviewCardsProps> = ({
    aggregateMetrics,
    isNormalUserView,
}) => {
    if (isNormalUserView) return null;

    const isProfitable = aggregateMetrics.customerNetProfitUsd >= 0;
    const isPlatformProfitable = aggregateMetrics.platformNetProfitUsd >= 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Token Revenue (Earned) */}
            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Token Revenue (Earned)</span>
                        <InfoTooltip content="Recognized revenue from tokens spent by non-admin customers (1T = £0.10 / ~$0.13 USD). Unspent wallet float remains deferred liability until consumed." />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold font-mono text-emerald-400">
                            £{aggregateMetrics.customerEarnedGbp.toFixed(2)}
                        </span>
                        <span className="text-sm font-mono text-zinc-400">
                            ~${aggregateMetrics.customerEarnedUsd.toFixed(2)}
                        </span>
                        <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {aggregateMetrics.customerTokensSpent}T
                        </span>
                    </div>
                </div>
                <div className="text-[11px] text-zinc-400 mt-3 space-y-0.5 leading-relaxed">
                    <div>
                        Gross Top-Ups: <span className="font-mono text-zinc-200">{aggregateMetrics.customerGrossPurchasedTokens}T</span>{' '}
                        <span className="font-mono text-zinc-500">(£{aggregateMetrics.customerGrossPurchasedGbp.toFixed(2)} / ~${aggregateMetrics.customerGrossPurchasedUsd.toFixed(2)})</span>
                    </div>
                    <div>
                        Unspent Wallet Float: <span className="font-mono text-primary">{aggregateMetrics.customerUnspentFloatTokens}T</span>{' '}
                        <span className="font-mono text-zinc-500">(£{aggregateMetrics.customerUnspentFloatGbp.toFixed(2)})</span>
                    </div>
                </div>
            </div>

            {/* Card 2: Actual AI API Cost */}
            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Actual AI API Cost</span>
                        <InfoTooltip content="Total real Gemini 3.1 Pro + 3.6 Flash API expenditure across customer curations, Admin/Sandbox test runs, and background JIT Auto-Healing." />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold font-mono text-red-400">
                            ${formatUsd4(aggregateMetrics.totalPlatformAiCostUsd)}
                        </span>
                        <span className="text-sm font-mono text-zinc-400">
                            ~£{aggregateMetrics.totalPlatformAiCostGbp.toFixed(2)}
                        </span>
                    </div>
                </div>
                <div className="text-[11px] text-zinc-400 mt-3 space-y-0.5 leading-relaxed font-mono">
                    <div>
                        Customer: <span className="text-zinc-200">${formatUsd4(aggregateMetrics.customerAiCostUsd)}</span>
                        {' • '}
                        Admin: <span className="text-zinc-300">${formatUsd4(aggregateMetrics.adminAiCostUsd)}</span>
                    </div>
                    <div>
                        JIT Auto-Healing: <span className="text-zinc-300">${formatUsd4(aggregateMetrics.jitAiCostUsd)}</span>
                    </div>
                </div>
            </div>

            {/* Card 3: Net Gross Profit & Margin */}
            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between border-l-2 ${isProfitable ? 'border-l-primary' : 'border-l-red-400'} relative ${RADIUS_TOKENS.frame}`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Net Gross Profit & Margin</span>
                        <InfoTooltip content="Customer Earned Revenue minus Customer AI Cost. Subtitle reports platform-wide net profit after Admin R&D/Sandbox and JIT healing spend, alongside cold synthesis unit economics." />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2 mt-2">
                        <span className={`text-3xl font-bold font-mono ${isProfitable ? 'text-primary' : 'text-red-400'}`}>
                            {formatSignedUsd(aggregateMetrics.customerNetProfitUsd, 2)}
                        </span>
                        {aggregateMetrics.customerGrossMarginPct !== null && (
                            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                isProfitable
                                    ? 'bg-primary/15 text-primary border-primary/30'
                                    : 'bg-red-500/15 text-red-300 border-red-500/30'
                            }`}>
                                {formatSignedPct(aggregateMetrics.customerGrossMarginPct, 1)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-[11px] text-zinc-400 mt-3 space-y-0.5 leading-relaxed">
                    <div>
                        Platform Net (incl. Admin):{' '}
                        <span className={`font-mono ${isPlatformProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatSignedUsd(aggregateMetrics.platformNetProfitUsd, 2)}
                            {aggregateMetrics.platformNetMarginPct !== null ? ` (${formatSignedPct(aggregateMetrics.platformNetMarginPct, 1)})` : ''}
                        </span>
                    </div>
                    <div>
                        Avg Cold Curation:{' '}
                        <span className="font-mono text-zinc-200">
                            {aggregateMetrics.avgColdCurationCostUsd !== null
                                ? `~$${aggregateMetrics.avgColdCurationCostUsd.toFixed(2)}`
                                : '—'}
                        </span>
                        {' '}vs 5T (<span className="font-mono text-zinc-300">~$0.65</span>)
                    </div>
                </div>
            </div>

            {/* Card 4: Cache Hit Efficiency */}
            <div className={`bg-zinc-900/30 border border-zinc-800 p-6 flex flex-col justify-between relative ${RADIUS_TOKENS.frame}`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Cache Hit Efficiency</span>
                        <InfoTooltip content="Share of Zcene curations resolved instantly from the verified global topology cache at $0.00 AI cost, valued at the real average cold curation Gemini cost." />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold font-mono text-primary">
                            {aggregateMetrics.directHitRatePct.toFixed(1)}%
                        </span>
                        {aggregateMetrics.estimatedDirectHitSavingsUsd > 0 && (
                            <span className="text-xs font-mono text-emerald-400">
                                ~${aggregateMetrics.estimatedDirectHitSavingsUsd.toFixed(2)} saved
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-[11px] text-zinc-400 mt-3 space-y-0.5 leading-relaxed">
                    <div>
                        Direct Hits: <span className="font-mono text-zinc-200">{aggregateMetrics.directHitCurations} / {aggregateMetrics.totalCurations}</span> Curations at <span className="font-mono text-primary">$0.00</span> AI cost
                    </div>
                    <div>
                        {aggregateMetrics.avgColdCurationCostUsd !== null
                            ? <>Avoided @ <span className="font-mono text-zinc-300">~${aggregateMetrics.avgColdCurationCostUsd.toFixed(2)}</span> / cold synthesis</>
                            : 'Zero cold synthesis baseline yet'}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface DeepConnectionsQueryLogProps {
    uid?: string;
    email: string;
}

interface DeepWebQueryItem {
    id: string;
    nodeId?: string | null;
    nodeName?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    question: string;
    costUsd: number;
    promptTokens: number;
    candidatesTokens: number;
    timestamp: any;
}

const DeepConnectionsQueryLog: React.FC<DeepConnectionsQueryLogProps> = ({ uid }) => {
    const [queries, setQueries] = useState<DeepWebQueryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        if (!uid) {
            setIsLoading(false);
            return;
        }

        const fetchQueries = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const qRef = collection(db, 'users', uid, 'deepWebQueries');
                const snap = await getDocs(query(qRef, orderBy('timestamp', 'desc'), limit(15)));
                if (isMounted) {
                    const items: DeepWebQueryItem[] = snap.docs.map(doc => {
                        const d = doc.data();
                        return {
                            id: doc.id,
                            nodeId: d.nodeId || null,
                            nodeName: d.nodeName || null,
                            projectId: d.projectId || null,
                            projectName: d.projectName || null,
                            question: d.question || '',
                            costUsd: typeof d.costUsd === 'number' ? d.costUsd : 0,
                            promptTokens: typeof d.promptTokens === 'number' ? d.promptTokens : 0,
                            candidatesTokens: typeof d.candidatesTokens === 'number' ? d.candidatesTokens : 0,
                            timestamp: d.timestamp,
                        };
                    });
                    setQueries(items);
                }
            } catch (err: any) {
                console.error('[DeepConnectionsQueryLog] Failed to load queries:', err);
                if (isMounted) {
                    setError('Unable to load query log.');
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchQueries();
        return () => { isMounted = false; };
    }, [uid]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Deep Connections Query Log
                </h4>
                <span className="text-[10px] text-zinc-500 font-mono">
                    {queries.length > 0 ? `${queries.length} consults` : ''}
                </span>
            </div>

            <div className="bg-black/50 border border-zinc-800 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/30">
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Artist / Node</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Project</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Question</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-xs text-zinc-500 italic">
                                    <span className="inline-flex items-center gap-2">
                                        <span className="material-symbols-outlined !text-[14px] animate-spin">progress_activity</span>
                                        Loading Deep Connections queries...
                                    </span>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-xs text-red-400 italic">
                                    {error}
                                </td>
                            </tr>
                        ) : queries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-xs text-zinc-500 italic">
                                    No Deep Connections consults recorded yet for this author.
                                </td>
                            </tr>
                        ) : (
                            queries.map((q) => {
                                const dateMs = extractTimestampMs(q.timestamp);
                                const dateStr = dateMs
                                    ? new Date(dateMs).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ',')
                                    : '—';
                                return (
                                    <tr key={q.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/20">
                                        <td className="p-3 text-xs text-zinc-400 whitespace-nowrap font-mono">{dateStr}</td>
                                        <td className="p-3 text-xs text-zinc-300 font-medium whitespace-nowrap">{q.nodeName || q.nodeId || '—'}</td>
                                        <td className="p-3 text-xs text-zinc-400 whitespace-nowrap">{q.projectName || q.projectId || '—'}</td>
                                        <td className="p-3 text-xs text-zinc-300 max-w-md truncate" title={q.question}>
                                            "{q.question}"
                                        </td>
                                        <td className="p-3 text-xs text-right font-mono text-red-400/80 whitespace-nowrap">
                                            ${q.costUsd.toFixed(4)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface AuthorUnifiedActivityTableProps {
    user: UserTelemetry;
}

const AuthorUnifiedActivityTable: React.FC<AuthorUnifiedActivityTableProps> = ({ user }) => {
    const unifiedRows = useMemo(() => buildUnifiedActivityRows(user), [user]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Token Activity & Top-Up Receipts
                </h4>
                <span className="text-[10px] text-zinc-500 font-mono">
                    {unifiedRows.length > 0 ? `${unifiedRows.length} entries` : ''}
                </span>
            </div>

            <div className="bg-black/50 border border-zinc-800 rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/30">
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Activity / Zcene</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Type / Generation</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Tokens</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Balance</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">AI Cost</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Net Margin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {unifiedRows.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-4 text-center text-xs text-zinc-500 italic">
                                    No curation or token activity recorded yet for this author.
                                </td>
                            </tr>
                        ) : (
                            unifiedRows.map((row) => {
                                const isPositive = row.delta > 0;
                                const isZeroCostDirectHit = row.isCurationRow && (row.generationType === 'Direct Hit' || row.generationType === 'Clone') && (row.aiCostUsd ?? 0) === 0;
                                const dateStr = row.createdAt ? formatTxTimestamp(row.createdAt) : '—';

                                const tokenLabel = row.delta === 0
                                    ? '0T'
                                    : (isPositive ? `+${row.delta}T` : `${row.delta}T`);

                                const costStr = row.aiCostUsd !== null
                                    ? `${row.isCostEstimate ? '~' : ''}$${row.aiCostUsd.toFixed(4)}`
                                    : '—';

                                return (
                                    <tr key={row.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/20">
                                        <td className="p-3 text-xs text-zinc-400 whitespace-nowrap font-mono">{dateStr}</td>
                                        <td className="p-3 text-xs text-zinc-200 font-medium">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {row.isCurationRow && renderProjectStatusBadge(row.projectStatus, false)}
                                                <span className="text-white">{row.title}</span>
                                            </div>
                                            {row.subtitle && (
                                                <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                                                    {row.subtitle}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-xs whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap inline-flex items-center shrink-0 ${row.categoryBadge.style}`}>
                                                    {row.categoryBadge.label}
                                                </span>
                                                {row.isCurationRow && row.generationType && (
                                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                                        row.generationType === 'Direct Hit'
                                                            ? 'border-primary/30 text-primary bg-primary/10'
                                                            : 'border-zinc-700 text-zinc-300 bg-zinc-900'
                                                    }`}>
                                                        {row.generationType}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`p-3 text-xs text-right font-mono font-bold whitespace-nowrap ${
                                            isPositive ? 'text-emerald-400' : row.delta === 0 ? 'text-zinc-400' : 'text-zinc-200'
                                        }`}>
                                            {tokenLabel}
                                        </td>
                                        <td className="p-3 text-xs text-right font-mono text-zinc-400 whitespace-nowrap">
                                            {row.balanceAfter !== null ? `${row.balanceAfter}T` : '—'}
                                        </td>
                                        <td className={`p-3 text-xs text-right font-mono whitespace-nowrap ${
                                            row.aiCostUsd === null
                                                ? 'text-zinc-600'
                                                : isZeroCostDirectHit
                                                    ? 'text-primary/90 font-semibold'
                                                    : 'text-red-400/80'
                                        }`}>
                                            {costStr}
                                        </td>
                                        <td className="p-3 text-xs text-right font-mono whitespace-nowrap">
                                            {row.netMarginUsd === null ? (
                                                <span className="text-zinc-600">—</span>
                                            ) : row.isAdminBypass ? (
                                                <span className="text-zinc-400">
                                                    {formatSignedUsd(row.netMarginUsd, 4)}{' '}
                                                    <span className="text-[10px] text-zinc-500">(Sandbox)</span>
                                                </span>
                                            ) : (
                                                <span className={row.netMarginUsd >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                                                    {formatSignedUsd(row.netMarginUsd, 2)}
                                                    {row.netMarginPct !== null ? (
                                                        <span className="text-[10px] text-zinc-400 font-normal ml-1">
                                                            ({row.netMarginPct.toFixed(0)}%)
                                                        </span>
                                                    ) : null}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export interface DiscoveryLedgerTableProps {
    isLoading: boolean;
    filteredLedger: UserTelemetry[];
    expandedRow: string | null;
    toggleRow: (email: string) => void;
    onInspectUser?: (user: UserTelemetry) => void;
}

export const DiscoveryLedgerTable: React.FC<DiscoveryLedgerTableProps> = ({
    isLoading,
    filteredLedger,
    expandedRow,
    toggleRow,
    onInspectUser,
}) => {
    return (
        <div className="border border-zinc-800 bg-zinc-950/20 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Author</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Wallet</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center">Zcenes</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Revenue (Spent)</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">AI Cost</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Net Margin</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 w-14"></th>
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
                            const totalActions = user.actionTriggers.createCount + user.actionTriggers.updateCount + (user.preflightLookups?.calls || 0) + (user.deepWebConsults?.calls || 0);
                            const cost = user.hasExactCost ? user.exactCost : (user.cacheEfficiency.liveQueries * COST_PER_AI_CALL);
                            const costPrefix = user.hasExactCost ? '' : '~';
                            const authorIsAdmin = isAdminEmail(user.email);
                            const spentTokens = Math.max(0, Number(user.lifetimeTokensSpent) || 0);
                            const earnedGbp = authorIsAdmin ? 0 : tokensToGbp(spentTokens);
                            const earnedUsd = authorIsAdmin ? 0 : tokensToUsd(spentTokens);
                            const netMarginUsd = earnedUsd - cost;
                            const netMarginPct = !authorIsAdmin && earnedUsd > 0 ? (netMarginUsd / earnedUsd) * 100 : null;
                            const isExpanded = expandedRow === user.email;

                            return (
                                <React.Fragment key={user.email}>
                                    <tr 
                                        onClick={() => toggleRow(user.email)} 
                                        className="border-b border-zinc-900 hover:bg-zinc-900/20 cursor-pointer transition-colors"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-white truncate">{user.email}</span>
                                                    {authorIsAdmin && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0">
                                                            ADMIN
                                                        </span>
                                                    )}
                                                </div>
                                                {onInspectUser && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onInspectUser(user);
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer select-none shrink-0"
                                                        title={`Inspect ${user.email}'s live wallet and curated zcenes`}
                                                    >
                                                        <span className="material-symbols-outlined !text-[13px]">visibility</span>
                                                        Inspect Wallet
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center font-mono text-primary font-semibold whitespace-nowrap">
                                            {user.tokenBalance ?? 0}T
                                        </td>
                                        <td className="p-4 text-center font-mono text-white">
                                            {user.projectsCount}
                                        </td>
                                        <td className="p-4 text-right font-mono whitespace-nowrap">
                                            {authorIsAdmin ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-zinc-500">$0.00</span>
                                                    <span className="text-[10px] text-zinc-600">0T Bypass</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-emerald-400 font-semibold">
                                                        £{earnedGbp.toFixed(2)} <span className="text-zinc-400 font-normal">/ ~${earnedUsd.toFixed(2)}</span>
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500">
                                                        {spentTokens}T spent ({user.lifetimeTokensPurchased ?? 0}T top-ups)
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono text-red-400/80 whitespace-nowrap">
                                            {costPrefix}${cost.toFixed(4)}
                                        </td>
                                        <td className="p-4 text-right font-mono whitespace-nowrap">
                                            {authorIsAdmin ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-zinc-400">{formatSignedUsd(-cost, 4)}</span>
                                                    <span className="text-[10px] text-zinc-500">Sandbox R&amp;D</span>
                                                </div>
                                            ) : spentTokens === 0 && cost === 0 ? (
                                                <span className="text-zinc-600">—</span>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className={netMarginUsd >= 0 ? 'text-primary font-semibold' : 'text-red-400 font-semibold'}>
                                                        {formatSignedUsd(netMarginUsd, 2)}
                                                    </span>
                                                    {netMarginPct !== null && (
                                                        <span className={`text-[10px] font-bold ${netMarginUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {formatSignedPct(netMarginPct, 1)} Margin
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
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
                                                     
                                                     {/* Left Column: Curation Actions Summary */}
                                                     <div className="space-y-4">
                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Curation Actions</h4>
                                                         <div className="space-y-2">
                                                             <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                 <span className="text-zinc-400">Zcenes Curated:</span>
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

                                                     {/* Right Column: Top Artist Discoveries */}
                                                     <div className="space-y-4">
                                                         <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Top Artist Discoveries (<span className="font-mono">{user.artistSearches.globalCount}</span> Total)</h4>
                                                         <div className="space-y-2">
                                                             {user.artistSearches.topSearches.length === 0 ? (
                                                                 <div className="text-xs text-zinc-500 italic">No artist seeds recorded yet.</div>
                                                             ) : (
                                                                 user.artistSearches.topSearches.map((search, i) => (
                                                                     <div key={i} className="flex justify-between border-b border-zinc-800/50 pb-1">
                                                                         <span className="text-zinc-300">{search.artistName}</span>
                                                                         <span className="text-zinc-400"><span className="font-mono">{search.count}</span> digs</span>
                                                                     </div>
                                                                 ))
                                                             )}
                                                         </div>
                                                     </div>

                                                     {/* Full Width: Consolidated Unified Token Activity, Curations & Top-Up Receipts */}
                                                     <div className="col-span-1 md:col-span-2 pt-4 border-t border-zinc-900 mt-2">
                                                         <AuthorUnifiedActivityTable user={user} />
                                                     </div>

                                                     {/* Full Width: Deep Connections Query Log (Admin Exclusive) */}
                                                     <div className="col-span-1 md:col-span-2 pt-4 border-t border-zinc-900 mt-2">
                                                         <DeepConnectionsQueryLog uid={user.uid} email={user.email} />
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
    },
    uid?: string,
    txDocs?: any[]
): UserTelemetry => {
    let totalUpdates = 0;
    let totalLiveQueries = 0;
    let totalCacheHits = 0;
    let exactCost = 0;
    let uninstrumentedEstimatedCost = 0;
    let hasExactCost = false;
    const artistFrequencyMap: Record<string, number> = {};
    const projects: ProjectTelemetry[] = [];
    const parsedTransactions: LedgerTransactionRecord[] = [];
    const knownProjectIds = new Set<string>();
    const existingProjectsBySeed: Record<string, { id: string; matched: boolean }[]> = {};

    projectDocs.forEach((pDoc) => {
        const pData = pDoc.data();
        const projectId = pDoc.id;
        knownProjectIds.add(projectId);

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
        const activeNodesCount = typeof pData.activeNodesCount === 'number'
            ? pData.activeNodesCount
            : (Array.isArray(pData.activeNodes) ? pData.activeNodes.length : 0);
        const artistIdsCount = Array.isArray(pData.artistIds) ? pData.artistIds.length : 0;
        const labelIdsCount = Array.isArray(pData.labelIds) ? pData.labelIds.length : 0;
        const hasCacheKey = Boolean(pData.cacheKey && String(pData.cacheKey).trim());
        const hasSpendOrHistory = (typeof pData.tokensSpent === 'number' && pData.tokensSpent > 0) || Boolean(pData.apiUsage) || pData.status === 'deleted' || pData.status === 'trashed';

        const isUnmappedEmptyDraft =
            !hasSpendOrHistory &&
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

        const canonicalSeed = cleanArtistDisplayName(seeds[0] || projectName || displayTitle);
        const seedKey = canonicalSeed.toLowerCase();
        if (seedKey && seedKey !== 'unknown') {
            if (!existingProjectsBySeed[seedKey]) existingProjectsBySeed[seedKey] = [];
            existingProjectsBySeed[seedKey].push({ id: pDoc.id, matched: false });
        }

        const projectLiveQueries = seeds.length || 1;
        const activeCount = activeNodesCount > 0 ? activeNodesCount : graphNodesCount;
        
        let projectCacheHits = 0;
        if (pData.anchorResolution && typeof pData.anchorResolution === 'object') {
            const hits = Number(pData.anchorResolution.cacheHits) || 0;
            const misses = Number(pData.anchorResolution.cacheMisses) || 0;
            projectCacheHits = hits;
            totalLiveQueries += (misses > 0 ? misses : (pData.generationType === 'Direct Hit' ? 0 : 1));
            totalCacheHits += hits;
            totalUpdates += (hits + misses);
        } else {
            projectCacheHits = Math.max(0, activeCount - projectLiveQueries);
            totalLiveQueries += (pData.generationType === 'Direct Hit' ? 0 : projectLiveQueries);
            totalCacheHits += (pData.generationType === 'Direct Hit' ? activeCount : projectCacheHits);
            totalUpdates += activeCount;
        }

        let projectExactCost = 0;
        let projectHasExactCost = false;
        let hasProCall = false;

        if (pData.apiUsage) {
            projectHasExactCost = true;
            for (const [model, usage] of Object.entries(pData.apiUsage)) {
                const u = usage as any;
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
                    projectExactCost += (u.prompt / 1000000) * 1.50;
                    projectExactCost += ((u.candidates + reasoningTokens) / 1000000) * 7.50;
                }
            }
            exactCost += projectExactCost;
            hasExactCost = true;
        }

        const projectDeepWebCost = computeApiUsageCostUsd(pData.deepWebApiUsage);

        let generationType = pData.generationType;
        let curationOnlyCost = 0;
        let cost = 0;
        let isEstimate = false;
        const hasFilters = !!(pData.discoveryFilters && pData.discoveryFilters !== '{}');

        if (generationType) {
            if (generationType === "Direct Hit" || generationType === "Clone") {
                curationOnlyCost = 0;
                cost = projectDeepWebCost;
            } else if (projectHasExactCost) {
                curationOnlyCost = projectExactCost;
                cost = projectExactCost + projectDeepWebCost;
            } else {
                curationOnlyCost = projectLiveQueries * COST_PER_AI_CALL;
                cost = curationOnlyCost + projectDeepWebCost;
                isEstimate = true;
            }
        } else {
            generationType = "Direct Hit";
            if (seeds.length > 1 || hasFilters) {
                generationType = "Complex Generation";
            } else if (hasProCall || (!projectHasExactCost && activeCount > projectLiveQueries)) {
                generationType = (activeCount > 1) ? "Root Generation" : "Direct Hit";
                if (hasProCall) generationType = "Root Generation";
            }
            
            curationOnlyCost = projectHasExactCost ? projectExactCost : (projectLiveQueries * COST_PER_AI_CALL);
            cost = curationOnlyCost + projectDeepWebCost;
            isEstimate = !projectHasExactCost;
            
            if (generationType === "Direct Hit" && !projectHasExactCost) {
                curationOnlyCost = 0;
                cost = projectDeepWebCost;
                isEstimate = false;
            }
        }

        if (isEstimate && curationOnlyCost > 0) {
            uninstrumentedEstimatedCost += curationOnlyCost;
        }

        const hasRecordedTokens = typeof pData.tokensSpent === 'number';
        const tokensSpent = hasRecordedTokens
            ? Math.max(0, Math.floor(Number(pData.tokensSpent) || 0))
            : 0;

        // Rule 43: Redact backend cache status from Standard User view
        const userFacingScope =
            generationType === 'Clone'
                ? 'Saved Shared Zcene'
                : generationType === 'Complex Generation' || seeds.length > 1 || hasFilters
                    ? 'Multi-Seed Zcene'
                    : 'Single-Seed Zcene';

        const createdAt = extractTimestampMs(pData.createdAt);
        const status = pData.status === 'trashed' ? 'trashed' : (pData.status === 'deleted' ? 'deleted' : 'active');

        projects.push({
            id: pDoc.id,
            seedArtist: displayTitle,
            canonicalSeed,
            generationType,
            userFacingScope,
            tokensSpent,
            hasRecordedTokens,
            cost,
            curationOnlyCost,
            isEstimate,
            createdAt,
            status
        });
    });

    // V41 / V42.2 Automatic Archive Reconciliation: Reconstitute hard-deleted runs from tokenTransactions
    if (Array.isArray(txDocs)) {
        txDocs.forEach((txDoc, idx) => {
            const tx = typeof txDoc.data === 'function' ? txDoc.data() : txDoc;
            const resolvedTxId = txDoc.id || tx.id || `tx_${idx}`;

            parsedTransactions.push({
                id: resolvedTxId,
                uid: tx.uid || uid,
                type: tx.type || 'spend_live_synthesis',
                delta: Number(tx.delta ?? tx.amount ?? 0),
                balanceAfter: typeof tx.balanceAfter === 'number' ? tx.balanceAfter : (tx.balanceAfter !== undefined ? Number(tx.balanceAfter) : null),
                tierId: tx.tierId,
                amountGbp: tx.amountGbp,
                projectId: tx.projectId,
                curationSessionId: tx.curationSessionId,
                seedArtist: tx.seedArtist,
                generationType: tx.generationType,
                costUsd: typeof tx.costUsd === 'number' ? tx.costUsd : undefined,
                apiUsage: tx.apiUsage,
                description: tx.description || 'Token Activity',
                createdAt: tx.createdAt,
            });

            const isCurationSpend = 
                tx.type === 'spend_live_synthesis' || 
                tx.type === 'spend_direct_hit' || 
                (typeof tx.description === 'string' && (tx.description.toLowerCase().includes('zcene curation') || tx.description.toLowerCase().includes('zcene synthesis')));

            if (!isCurationSpend) return;

            const txProjectId = tx.projectId;
            if (txProjectId && knownProjectIds.has(txProjectId)) {
                return;
            }

            let seedName = tx.seedArtist || '';
            if (!seedName && typeof tx.description === 'string') {
                seedName = tx.description
                    .replace(/^Zcene\s+(?:Curation|Synthesis):\s*/i, '')
                    .replace(/\s*\(\d+T.*?\)$/i, '')
                    .trim();
            }
            if (!seedName) seedName = 'Archived Curation';
            const cleanSeed = cleanArtistDisplayName(seedName);
            const seedKey = cleanSeed.toLowerCase();

            if (!txProjectId && existingProjectsBySeed[seedKey]) {
                const unmatchedProject = existingProjectsBySeed[seedKey].find(p => !p.matched);
                if (unmatchedProject) {
                    unmatchedProject.matched = true;
                    return;
                }
            }

            const syntheticId = txProjectId || `archived_${resolvedTxId}`;
            if (knownProjectIds.has(syntheticId)) return;
            knownProjectIds.add(syntheticId);

            // Normalize split-debit project token total (e.g. 4T after 1T pre-flight -> 5T; 9T after 1T pre-flight -> 10T)
            const rawAbsDelta = Math.abs(Number(tx.delta ?? tx.amount ?? 5)) || 5;
            const descStr = typeof tx.description === 'string' ? tx.description : '';
            const hasPreFlightCredit = /after\s+1t\s+pre-flight/i.test(descStr) || rawAbsDelta === 4 || rawAbsDelta === 9;
            const tokensSpent = hasPreFlightCredit ? rawAbsDelta + 1 : rawAbsDelta;

            let generationType = tx.generationType;
            if (!generationType) {
                generationType = tx.type === 'spend_direct_hit' ? 'Direct Hit' : 'Root Generation';
            }

            let txCost = 0;
            let isEstimate = false;
            if (typeof tx.costUsd === 'number') {
                txCost = tx.costUsd;
            } else if (tx.apiUsage && Object.keys(tx.apiUsage).length > 0) {
                txCost = computeApiUsageCostUsd(tx.apiUsage);
            } else if (generationType === 'Direct Hit') {
                txCost = 0.0000;
            } else {
                txCost = COST_PER_AI_CALL;
                isEstimate = true;
            }

            if (txCost > 0) {
                exactCost += txCost;
                hasExactCost = true;
            }

            if (generationType === 'Direct Hit') {
                totalCacheHits += 10;
                totalUpdates += 10;
            } else {
                totalLiveQueries += 1;
                totalCacheHits += 9;
                totalUpdates += 10;
            }

            artistFrequencyMap[cleanSeed] = (artistFrequencyMap[cleanSeed] || 0) + 1;
            const createdAt = extractTimestampMs(tx.createdAt) || Date.now();

            projects.push({
                id: syntheticId,
                seedArtist: cleanSeed,
                canonicalSeed: cleanSeed,
                generationType,
                userFacingScope: tokensSpent >= TOKEN_PRICING.COMPLEX_QUERY ? 'Multi-Seed Zcene' : 'Single-Seed Zcene',
                tokensSpent,
                hasRecordedTokens: true,
                cost: txCost,
                curationOnlyCost: txCost,
                isEstimate,
                createdAt,
                status: 'archived',
                isArchived: true
            });
        });
    }

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

    const sortedSearches = Object.entries(artistFrequencyMap)
        .map(([artistName, count]) => ({ artistName, count }))
        .sort((a, b) => b.count - a.count);

    const globalCount = Object.values(artistFrequencyMap).reduce((sum, count) => sum + count, 0);

    return {
        uid: uid || undefined,
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
        projects,
        transactions: parsedTransactions,
    };
};

const ACTIVITY_FILTER_PILLS: Array<{ id: ActivityFilterCategory; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'curations', label: 'Curations' },
    { id: 'deep_connections', label: 'Deep Connections' },
    { id: 'topups_refunds', label: 'Top-Ups & Refunds' },
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
    onNavigateMenu,
    profile
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [simulateNormalUser, setSimulateNormalUser] = useState(false);
    const [inspectedAuthor, setInspectedAuthor] = useState<{ uid: string; email: string } | null>(null);
    const [activityFilter, setActivityFilter] = useState<ActivityFilterCategory>('all');
    const [ledgerData, setLedgerData] = useState<UserTelemetry[]>([]);
    const [tokenTransactions, setTokenTransactions] = useState<TokenTransaction[]>([]);
    const [jitHeals, setJitHeals] = useState<JitHealRecord[]>([]);
    const [isJitEnabled, setIsJitEnabled] = useState<boolean>(true);
    const [isTogglingJit, setIsTogglingJit] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeUserEmail = user?.email || 'sandbox@zcene.online';
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
                const usersSnap = await getDocs(collection(db, 'users'));
                const userPromises = usersSnap.docs.map(async (uDoc) => {
                    const uData = uDoc.data();
                    const email = uData.email || uDoc.id;
                    
                    const [projectsSnap, txSnap] = await Promise.all([
                        getDocs(collection(db, 'users', uDoc.id, 'projects')),
                        getDocs(query(collection(db, 'users', uDoc.id, 'tokenTransactions'), orderBy('createdAt', 'desc'), limit(500))).catch(() => null),
                    ]);
                    
                    return calculateTelemetryForUser(
                        email,
                        uData.onboardingProgress,
                        projectsSnap.docs,
                        uData.deepCutsOpened,
                        {
                            tokenBalance: uData.tokenBalance,
                            lifetimeTokensPurchased: uData.lifetimeTokensPurchased,
                            lifetimeTokensSpent: uData.lifetimeTokensSpent,
                            preflightApiUsage: uData.preflightApiUsage,
                            deepWebApiUsage: uData.deepWebApiUsage,
                        },
                        uDoc.id,
                        txSnap ? txSnap.docs : []
                    );
                });
                telemetryList = await Promise.all(userPromises);
                setTokenTransactions([]);
            } else {
                let targetUid = user.uid;
                let targetEmail = user.email || 'sandbox@zcene.online';

                if (isAdmin && simulateNormalUser) {
                    if (inspectedAuthor && inspectedAuthor.uid) {
                        targetUid = inspectedAuthor.uid;
                        targetEmail = inspectedAuthor.email;
                    } else {
                        const candidate = ledgerData.find(l => l.email !== user.email && l.uid);
                        if (candidate && candidate.uid) {
                            targetUid = candidate.uid;
                            targetEmail = candidate.email;
                        }
                    }
                }

                const userDocRef = doc(db, 'users', targetUid);
                const [userDocSnap, projectsSnap, txSnap] = await Promise.all([
                    getDoc(userDocRef),
                    getDocs(collection(db, 'users', targetUid, 'projects')),
                    getDocs(query(collection(db, 'users', targetUid, 'tokenTransactions'), orderBy('createdAt', 'desc'), limit(500))).catch(() => null),
                ]);

                const uData = userDocSnap.exists() ? userDocSnap.data() : {
                    email: targetEmail,
                    displayName: '',
                    onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true }
                };
                
                const singleTelemetry = calculateTelemetryForUser(
                    uData.email || targetEmail,
                    uData.onboardingProgress,
                    projectsSnap.docs,
                    uData.deepCutsOpened,
                    {
                        tokenBalance: uData.tokenBalance,
                        lifetimeTokensPurchased: uData.lifetimeTokensPurchased,
                        lifetimeTokensSpent: uData.lifetimeTokensSpent,
                        preflightApiUsage: uData.preflightApiUsage,
                        deepWebApiUsage: uData.deepWebApiUsage,
                    },
                    targetUid,
                    txSnap ? txSnap.docs : []
                );
                telemetryList = [singleTelemetry];

                if (txSnap) {
                    const parsedTxs: TokenTransaction[] = txSnap.docs.map(d => {
                        const t = d.data();
                        return {
                            id: d.id,
                            uid: t.uid || targetUid,
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

            // Fetch JIT Auto-Healing Telemetry (Admin View Only)
            if (isAdmin && !simulateNormalUser) {
                try {
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
    }, [user, isAdmin, simulateNormalUser, inspectedAuthor]);

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

    const filteredLedger = useMemo(() => {
        if (isNormalUserView) {
            return ledgerData;
        }
        return ledgerData.filter(u => 
            u.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, isNormalUserView, ledgerData]);

    const currentUserTelemetry = filteredLedger[0] || ledgerData[0] || null;
    const liveTokenBalance = (isAdmin && simulateNormalUser)
        ? Math.max(0, Math.floor(Number(currentUserTelemetry?.tokenBalance ?? 0)))
        : Math.max(0, Math.floor(Number(profile?.tokenBalance ?? currentUserTelemetry?.tokenBalance ?? 0)));
    const liveLifetimePurchased = (isAdmin && simulateNormalUser)
        ? Math.max(0, Math.floor(Number(currentUserTelemetry?.lifetimeTokensPurchased ?? 0)))
        : Math.max(0, Math.floor(Number(profile?.lifetimeTokensPurchased ?? currentUserTelemetry?.lifetimeTokensPurchased ?? 0)));
    const liveLifetimeSpent = (isAdmin && simulateNormalUser)
        ? Math.max(0, Math.floor(Number(currentUserTelemetry?.lifetimeTokensSpent ?? 0)))
        : Math.max(0, Math.floor(Number(profile?.lifetimeTokensSpent ?? currentUserTelemetry?.lifetimeTokensSpent ?? 0)));
    const juiceMax = Math.max(liveLifetimePurchased, liveTokenBalance, 100);
    const juicePct = Math.min(100, Math.round((liveTokenBalance / juiceMax) * 100));

    const aggregateMetrics = useMemo(
        () => computeAggregateMetrics(ledgerData, jitHeals),
        [ledgerData, jitHeals]
    );

    const unifiedUserRows = useMemo(
        () => buildUnifiedActivityRows(currentUserTelemetry, currentUserTelemetry?.transactions ?? tokenTransactions),
        [currentUserTelemetry, tokenTransactions]
    );

    const filteredUserRows = useMemo(() => {
        if (activityFilter === 'all') return unifiedUserRows;
        return unifiedUserRows.filter((r) => r.filterCategory === activityFilter);
    }, [unifiedUserRows, activityFilter]);

    const toggleRow = (email: string) => {
        setExpandedRow(prev => prev === email ? null : email);
    };

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative select-text">
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
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    
                    {/* Header Info */}
                    <div className="border-b border-zinc-800 pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-medium text-white mb-2">The Discovery Ledger</h2>
                            <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
                                {isNormalUserView 
                                    ? "Your personal Token Wallet, curated Zcene history, and immutable token activity receipts."
                                    : "Executive P&L ledger tracking earned token revenue, real Gemini API expenditure, gross margin, cache efficiency, and author activity."
                                }
                            </p>
                        </div>
                        {isAdmin && (
                            <div className="flex-shrink-0">
                                <AdminViewToggle 
                                    value={simulateNormalUser} 
                                    onChange={(nextVal) => {
                                        if (nextVal && !inspectedAuthor) {
                                            const primaryAuthor = ledgerData.find(l => l.email !== user?.email && l.uid);
                                            if (primaryAuthor && primaryAuthor.uid) {
                                                setInspectedAuthor({ uid: primaryAuthor.uid, email: primaryAuthor.email });
                                            }
                                        } else if (!nextVal) {
                                            setInspectedAuthor(null);
                                        }
                                        setActivityFilter('all');
                                        setSimulateNormalUser(nextVal);
                                    }} 
                                />
                            </div>
                        )}
                    </div>

                    {/* Admin Inspection Exit Banner */}
                    {isAdmin && simulateNormalUser && (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                            <div className="flex items-center gap-3 text-amber-200">
                                <span className="material-symbols-outlined text-amber-400 !text-xl flex-shrink-0">visibility</span>
                                <span>
                                    Previewing wallet & curation history as <strong className="text-white">{inspectedAuthor?.email || currentUserTelemetry?.email || activeUserEmail}</strong>. Real money API costs and cache statistics are masked according to Standard User permissions.
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    setSimulateNormalUser(false);
                                    setInspectedAuthor(null);
                                    setActivityFilter('all');
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
                            >
                                Exit Inspection
                            </button>
                        </div>
                    )}

                    {/* Token Economics Reference Key & Executive P&L KPI Cards (Admin Exclusive) */}
                    {!isNormalUserView && (
                        <div className="space-y-4">
                            <TokenEconomicsKeyStrip isNormalUserView={isNormalUserView} />
                            <TelemetryOverviewCards
                                aggregateMetrics={aggregateMetrics}
                                isNormalUserView={isNormalUserView}
                            />
                        </div>
                    )}

                    {/* Standard User & Admin Preview Mode: Token Wallet Juice Bar */}
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

                    {/* Author Search Bar (Admin Exclusive — manual Sync Archives removed; reconciliation runs automatically on load) */}
                    {!isNormalUserView && (
                        <div className={`w-full flex items-center gap-4 bg-zinc-950 px-4 py-2 border border-zinc-800 h-[38px] ${RADIUS_TOKENS.input}`}>
                            <span className="material-symbols-outlined text-zinc-500 select-none">search</span>
                            <input
                                autoComplete="off"
                                data-1p-ignore="true"
                                data-lpignore="true"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by Author identity..."
                                className="bg-transparent text-white w-full border-none outline-none focus:ring-0 text-sm placeholder:text-zinc-600"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-950/20 border border-red-500/30 text-red-200 p-4 font-mono text-xs flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-400 text-sm">warning</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {isNormalUserView ? (
                        <div data-testid="token-transactions-ledger" className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-medium text-white">Token Activity & Top-Up Receipts</h3>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Unified Zcene curations, workspace lifecycle status, artist lookups, Deep Connections unlocks, and wallet receipts. Shared Zcenes cost 0 Tokens.
                                    </p>
                                </div>

                                {/* Filter Pills */}
                                <div role="tablist" aria-label="Filter token activity" className="flex flex-wrap items-center gap-1.5">
                                    {ACTIVITY_FILTER_PILLS.map((pill) => {
                                        const isSelected = activityFilter === pill.id;
                                        return (
                                            <button
                                                key={pill.id}
                                                type="button"
                                                role="tab"
                                                aria-selected={isSelected}
                                                data-testid={`activity-filter-${pill.id}`}
                                                onClick={() => setActivityFilter(pill.id)}
                                                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer border ${RADIUS_TOKENS.button} ${
                                                    isSelected
                                                        ? 'bg-primary text-black border-primary'
                                                        : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'
                                                }`}
                                            >
                                                {pill.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className={`border border-zinc-800 bg-zinc-950/30 overflow-x-auto ${RADIUS_TOKENS.frame}`}>
                                <table className="w-full text-left border-collapse min-w-[640px]">
                                    <thead>
                                        <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                            <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Date</th>
                                            <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Activity / Zcene</th>
                                            <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 min-w-[140px] w-max whitespace-nowrap">Category & Scope</th>
                                            <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Change</th>
                                            <th className="p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Balance After</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading && unifiedUserRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-zinc-500 text-xs italic">
                                                    Loading token activity...
                                                </td>
                                            </tr>
                                        ) : filteredUserRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-zinc-500 text-xs italic">
                                                    {unifiedUserRows.length === 0
                                                        ? 'No token activity recorded yet. Top up your wallet above to begin curating.'
                                                        : 'No activity entries match the selected filter.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredUserRows.map((row) => {
                                                const isPositive = row.delta > 0;
                                                const changeLabel = row.delta === 0
                                                    ? '0 T'
                                                    : (isPositive ? `+${row.delta} T` : `${row.delta} T`);

                                                return (
                                                    <tr key={row.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                                        <td className="p-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                                                            {row.createdAt ? formatTxTimestamp(row.createdAt) : '—'}
                                                        </td>
                                                        <td className="p-4 text-sm text-zinc-200">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {row.isCurationRow && renderProjectStatusBadge(row.projectStatus, true)}
                                                                <span className="font-medium text-white">{row.title}</span>
                                                            </div>
                                                            {row.subtitle && (
                                                                <span className="block text-[11px] text-zinc-500 mt-0.5">
                                                                    {row.subtitle}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-xs min-w-[140px] w-max whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border whitespace-nowrap inline-flex items-center shrink-0 ${row.categoryBadge.style}`}>
                                                                    {row.categoryBadge.label}
                                                                </span>
                                                                {row.isCurationRow && row.userFacingScope && (
                                                                    <span className="px-2 py-0.5 rounded-lg border border-zinc-700/80 bg-zinc-900 text-zinc-300 text-[11px] font-medium whitespace-nowrap inline-flex items-center shrink-0">
                                                                        {row.userFacingScope}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className={`p-4 text-xs text-right font-mono font-bold whitespace-nowrap ${
                                                            isPositive ? 'text-emerald-400' : row.delta === 0 ? 'text-emerald-300' : 'text-zinc-200'
                                                        }`}>
                                                            {changeLabel}
                                                        </td>
                                                        <td className="p-4 text-xs text-right font-mono text-zinc-400 whitespace-nowrap">
                                                            {row.balanceAfter !== null ? `${row.balanceAfter} T` : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
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
                                onInspectUser={(inspected) => {
                                    setInspectedAuthor({ uid: inspected.uid || '', email: inspected.email });
                                    setActivityFilter('all');
                                    setSimulateNormalUser(true);
                                }}
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

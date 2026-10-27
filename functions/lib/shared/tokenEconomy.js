"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOP_UP_TIER_LIST = exports.TOP_UP_TIERS = exports.TOKEN_PRICING = exports.ADMIN_EMAIL = void 0;
exports.isAdminEmail = isAdminEmail;
exports.computeBaseProjectTokenCost = computeBaseProjectTokenCost;
exports.computeRemainingSettlementTokens = computeRemainingSettlementTokens;
exports.ADMIN_EMAIL = 'zcene.online@gmail.com';
function isAdminEmail(email) {
    if (!email || typeof email !== 'string')
        return false;
    return email.trim().toLowerCase() === exports.ADMIN_EMAIL;
}
exports.TOKEN_PRICING = {
    SINGLE_SEED: 5,
    COMPLEX_QUERY: 10,
    PREFLIGHT_FLASH_FEE: 1,
    MAX_CREDITABLE_PREFLIGHT: 1,
    DEEP_WEB_CONSULT: 3,
    SHARED_VIEW_AND_CLONE: 0,
    INITIAL_SIGNUP_BALANCE: 0,
};
exports.TOP_UP_TIERS = {
    gbp_5: {
        id: 'gbp_5',
        amountGbp: 5,
        priceDisplay: '£5',
        tokens: 50,
        label: 'Starter Crate',
        tagline: 'Up to 10 Single-Seed Zcenes',
    },
    gbp_10: {
        id: 'gbp_10',
        amountGbp: 10,
        priceDisplay: '£10',
        tokens: 100,
        label: 'Scene Explorer',
        tagline: 'Up to 20 Single-Seed or 10 Complex Zcenes',
        featured: true,
    },
    gbp_15: {
        id: 'gbp_15',
        amountGbp: 15,
        priceDisplay: '£15',
        tokens: 150,
        label: 'Deep Archive',
        tagline: 'Up to 30 Single-Seed or 15 Complex Zcenes',
    },
};
exports.TOP_UP_TIER_LIST = [
    exports.TOP_UP_TIERS.gbp_5,
    exports.TOP_UP_TIERS.gbp_10,
    exports.TOP_UP_TIERS.gbp_15,
];
function computeBaseProjectTokenCost(seedCount, hasActiveFilters) {
    return (seedCount > 1 || hasActiveFilters) ? exports.TOKEN_PRICING.COMPLEX_QUERY : exports.TOKEN_PRICING.SINGLE_SEED;
}
function computeRemainingSettlementTokens(totalProjectCost, preFlightTokensDeducted) {
    const safePreFlight = Math.max(0, Math.floor(preFlightTokensDeducted || 0));
    const creditablePreFlight = Math.min(safePreFlight, exports.TOKEN_PRICING.MAX_CREDITABLE_PREFLIGHT);
    const remainingSettlement = Math.max(0, totalProjectCost - creditablePreFlight);
    return { creditablePreFlight, remainingSettlement };
}
//# sourceMappingURL=tokenEconomy.js.map
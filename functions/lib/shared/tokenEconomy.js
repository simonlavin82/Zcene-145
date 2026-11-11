"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_UNIT_USD = exports.GBP_TO_USD_RATE = exports.TOKEN_UNIT_GBP = exports.TOP_UP_TIER_LIST = exports.TOP_UP_TIERS = exports.TOKEN_PRICING = exports.ADMIN_UID = exports.ADMIN_EMAIL = exports.ZCENE_BUYMEACOFFEE_URL = exports.ZCENE_INSTAGRAM_HANDLE = exports.ZCENE_INSTAGRAM_URL = exports.ZCENE_TSHIRT_MAILTO = exports.ZCENE_SUPPORT_MAILTO = exports.ZCENE_SUPPORT_EMAIL = void 0;
exports.isAdminEmail = isAdminEmail;
exports.isAdminUser = isAdminUser;
exports.tokensToGbp = tokensToGbp;
exports.tokensToUsd = tokensToUsd;
exports.usdToGbp = usdToGbp;
exports.computeBaseProjectTokenCost = computeBaseProjectTokenCost;
exports.computeRemainingSettlementTokens = computeRemainingSettlementTokens;
// --- Official Support & Brand Contacts (Single Source of Truth) ---
exports.ZCENE_SUPPORT_EMAIL = 'support@zcene.online';
exports.ZCENE_SUPPORT_MAILTO = `mailto:${exports.ZCENE_SUPPORT_EMAIL}?subject=Zcene%20Support%20Inquiry`;
exports.ZCENE_TSHIRT_MAILTO = `mailto:${exports.ZCENE_SUPPORT_EMAIL}?subject=Zcene%20T-Shirt%20Order&body=${encodeURIComponent(`Hi Zcene team,\n\nI would like to order an official Zcene T-shirt.\n\n- Color (Black/White): \n- Size (S/M/L/XL/XXL): \n- Delivery City & Country: \n\nThank you!`)}`;
exports.ZCENE_INSTAGRAM_URL = 'https://www.instagram.com/zcene.online/';
exports.ZCENE_INSTAGRAM_HANDLE = '@zcene.online';
exports.ZCENE_BUYMEACOFFEE_URL = 'https://buymeacoffee.com/zcene';
exports.ADMIN_EMAIL = 'zcene.online@gmail.com';
exports.ADMIN_UID = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';
function isAdminEmail(email) {
    if (!email || typeof email !== 'string')
        return false;
    return email.trim().toLowerCase() === exports.ADMIN_EMAIL;
}
function isAdminUser(uid, email) {
    if (!uid || typeof uid !== 'string')
        return false;
    if (!email || typeof email !== 'string')
        return false;
    return uid.trim() === exports.ADMIN_UID && email.trim().toLowerCase() === exports.ADMIN_EMAIL;
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
exports.TOKEN_UNIT_GBP = 0.10;
exports.GBP_TO_USD_RATE = 1.30;
exports.TOKEN_UNIT_USD = 0.13;
function tokensToGbp(tokens) {
    const safeTokens = Number.isFinite(tokens) ? tokens : 0;
    return Number((safeTokens * exports.TOKEN_UNIT_GBP).toFixed(4));
}
function tokensToUsd(tokens) {
    const safeTokens = Number.isFinite(tokens) ? tokens : 0;
    return Number((safeTokens * exports.TOKEN_UNIT_USD).toFixed(4));
}
function usdToGbp(usd) {
    const safeUsd = Number.isFinite(usd) ? usd : 0;
    return Number((safeUsd / exports.GBP_TO_USD_RATE).toFixed(4));
}
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
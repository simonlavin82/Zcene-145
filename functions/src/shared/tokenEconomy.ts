export const ADMIN_EMAIL = 'zcene.online@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

export const TOKEN_PRICING = {
  SINGLE_SEED: 5,
  COMPLEX_QUERY: 10,
  PREFLIGHT_FLASH_FEE: 1,
  MAX_CREDITABLE_PREFLIGHT: 1,
  DEEP_WEB_CONSULT: 3,
  SHARED_VIEW_AND_CLONE: 0,
  INITIAL_SIGNUP_BALANCE: 0,
} as const;

export type TokenTopUpTierId = 'gbp_5' | 'gbp_10' | 'gbp_15';

export interface TokenTopUpTier {
  id: TokenTopUpTierId;
  amountGbp: 5 | 10 | 15;
  priceDisplay: '£5' | '£10' | '£15';
  tokens: 50 | 100 | 150;
  label: string;
  tagline: string;
  featured?: boolean;
}

export const TOP_UP_TIERS: Record<TokenTopUpTierId, TokenTopUpTier> = {
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

export const TOP_UP_TIER_LIST: TokenTopUpTier[] = [
  TOP_UP_TIERS.gbp_5,
  TOP_UP_TIERS.gbp_10,
  TOP_UP_TIERS.gbp_15,
];

export function computeBaseProjectTokenCost(seedCount: number, hasActiveFilters: boolean): 5 | 10 {
  return (seedCount > 1 || hasActiveFilters) ? TOKEN_PRICING.COMPLEX_QUERY : TOKEN_PRICING.SINGLE_SEED;
}

export function computeRemainingSettlementTokens(
  totalProjectCost: number,
  preFlightTokensDeducted: number
): { creditablePreFlight: number; remainingSettlement: number } {
  const safePreFlight = Math.max(0, Math.floor(preFlightTokensDeducted || 0));
  const creditablePreFlight = Math.min(safePreFlight, TOKEN_PRICING.MAX_CREDITABLE_PREFLIGHT);
  const remainingSettlement = Math.max(0, totalProjectCost - creditablePreFlight);
  return { creditablePreFlight, remainingSettlement };
}

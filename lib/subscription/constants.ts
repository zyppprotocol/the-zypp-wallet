/**
 * Subscription Constants
 * 
 * Defines limits, fees, and pricing for subscription tiers
 */

export const BASIC_TIER_LIMIT = 10; // 10 offline transactions per month
export const BASIC_FEE_PERCENTAGE = 0.005; // 0.5%
export const BASIC_FEE_CAP_USD = 0.50; // $0.50 cap

export const PREMIUM_FEE_PERCENTAGE = 0.001; // 0.1%
export const PREMIUM_FEE_CAP_USD = 0.10; // $0.10 cap

// Premium subscription price (in SOL or USD equivalent)
// This will be set via environment variable
export const PREMIUM_SUBSCRIPTION_PRICE_SOL = 0.1; // Default: 0.1 SOL per month

// Monthly reset period (30 days in milliseconds)
export const MONTHLY_RESET_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

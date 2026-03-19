/**
 * Fee Calculator
 * 
 * Calculates broadcast fees based on subscription tier and transaction amount
 * Fees are calculated in lamports and capped in USD
 */

import { getTokenPrice } from "../solana/token-utils";
import type { SubscriptionTier } from "./subscription-manager";
import {
  BASIC_FEE_CAP_USD,
  BASIC_FEE_PERCENTAGE,
  PREMIUM_FEE_CAP_USD,
  PREMIUM_FEE_PERCENTAGE,
} from "./constants";
import { log } from "../utils/logger";

// SOL has 9 decimal places (lamports)
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Convert USD to lamports based on SOL price
 */
async function usdToLamports(usdAmount: number): Promise<bigint> {
  try {
    const solPrice = await getTokenPrice("SOL");
    if (!solPrice || solPrice <= 0) {
      log.warn("Failed to get SOL price, using default $100");
      // Default to $100 SOL if price fetch fails
      const defaultSolPrice = 100;
      const solAmount = usdAmount / defaultSolPrice;
      return BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    }

    const solAmount = usdAmount / solPrice;
    return BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  } catch (error) {
    log.error("Error converting USD to lamports", error);
    // Fallback to default price
    const defaultSolPrice = 100;
    const solAmount = usdAmount / defaultSolPrice;
    return BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  }
}

/**
 * Convert lamports to USD based on SOL price
 */
async function lamportsToUsd(lamports: bigint): Promise<number> {
  try {
    const solPrice = await getTokenPrice("SOL");
    if (!solPrice || solPrice <= 0) {
      log.warn("Failed to get SOL price, using default $100");
      const defaultSolPrice = 100;
      const solAmount = Number(lamports) / LAMPORTS_PER_SOL;
      return solAmount * defaultSolPrice;
    }

    const solAmount = Number(lamports) / LAMPORTS_PER_SOL;
    return solAmount * solPrice;
  } catch (error) {
    log.error("Error converting lamports to USD", error);
    const defaultSolPrice = 100;
    const solAmount = Number(lamports) / LAMPORTS_PER_SOL;
    return solAmount * defaultSolPrice;
  }
}

/**
 * Calculate broadcast fee based on transaction amount and subscription tier
 * 
 * @param amount - Transaction amount in lamports (for SOL) or smallest unit (for tokens)
 * @param tier - Subscription tier ("basic" or "premium")
 * @param token - Token symbol ("SOL" or "USDC")
 * @returns Fee amount in lamports
 */
export async function calculateBroadcastFee(
  amount: bigint,
  tier: SubscriptionTier,
  token: string = "SOL"
): Promise<{
  feeAmount: bigint;
  feePercentage: number;
  feeCapped: boolean;
  feeUsd: number;
}> {
  try {
    // Get token price for USD conversion
    const tokenPrice = await getTokenPrice(token);
    if (!tokenPrice || tokenPrice <= 0) {
      log.warn(`Failed to get ${token} price, using default calculation`);
    }

    // Determine fee percentage based on tier
    const feePercentage =
      tier === "basic" ? BASIC_FEE_PERCENTAGE : PREMIUM_FEE_PERCENTAGE;
    const feeCapUsd =
      tier === "basic" ? BASIC_FEE_CAP_USD : PREMIUM_FEE_CAP_USD;

    // Convert amount to USD
    let amountUsd: number;
    if (token === "SOL") {
      amountUsd = await lamportsToUsd(amount);
    } else {
      // For tokens, assume they use same decimal places as USDC (6 decimals)
      // This is a simplification - in production, you'd fetch token decimals
      const tokenDecimals = token === "USDC" ? 6 : 9; // Default to 9 if unknown
      const tokenAmount = Number(amount) / Math.pow(10, tokenDecimals);
      amountUsd = tokenAmount * (tokenPrice || 1); // Default to $1 if price unknown
    }

    // Calculate fee in USD
    let feeUsd = amountUsd * feePercentage;

    // Apply cap
    const feeCapped = feeUsd > feeCapUsd;
    if (feeCapped) {
      feeUsd = feeCapUsd;
    }

    // Convert fee back to lamports (fees are always paid in SOL)
    const feeAmount = await usdToLamports(feeUsd);

    log.debug("Broadcast fee calculated", {
      tier,
      amountUsd: amountUsd.toFixed(2),
      feePercentage: (feePercentage * 100).toFixed(2) + "%",
      feeUsd: feeUsd.toFixed(2),
      feeCapped,
      feeAmount: feeAmount.toString(),
      token,
    });

    return {
      feeAmount,
      feePercentage,
      feeCapped,
      feeUsd,
    };
  } catch (error) {
    log.error("Failed to calculate broadcast fee", error);
    // Return minimum fee on error (0.001 SOL = 1,000,000 lamports)
    const minFeeLamports = BigInt(1_000_000);
    return {
      feeAmount: minFeeLamports,
      feePercentage: tier === "basic" ? BASIC_FEE_PERCENTAGE : PREMIUM_FEE_PERCENTAGE,
      feeCapped: false,
      feeUsd: 0.001,
    };
  }
}

/**
 * Get fee information for display purposes (without calculating)
 */
export function getFeeInfo(tier: SubscriptionTier): {
  percentage: number;
  capUsd: number;
  description: string;
} {
  const percentage =
    tier === "basic" ? BASIC_FEE_PERCENTAGE : PREMIUM_FEE_PERCENTAGE;
  const capUsd = tier === "basic" ? BASIC_FEE_CAP_USD : PREMIUM_FEE_CAP_USD;

  return {
    percentage,
    capUsd,
    description: `${(percentage * 100).toFixed(1)}% (capped at $${capUsd.toFixed(2)})`,
  };
}

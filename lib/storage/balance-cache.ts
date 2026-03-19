/**
 * Balance Cache
 *
 * Caches SOL balance locally with TTL (time-to-live)
 * Allows offline balance display and reduces API calls
 *
 * Flow:
 * 1. Fetch balance from Solana (online)
 * 2. Cache locally with timestamp
 * 3. Return cached balance if fresh (within TTL)
 * 4. Refresh periodically or on-demand
 */

import * as SecureStore from "expo-secure-store";
import { log } from "../utils/logger";

interface CachedBalance {
  publicKey: string;
  solBalance: number; // in SOL
  cachedAt: number; // Unix timestamp
  ttl: number; // Time-to-live in ms
}

const CACHE_KEY_PREFIX = "zypp_balance_cache_";
const DEFAULT_BALANCE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cache key for a public key
 */
function getCacheKey(publicKey: string): string {
  return `${CACHE_KEY_PREFIX}${publicKey}`;
}

/**
 * Set cached balance in secure storage
 */
export async function setCachedBalance(
  publicKey: string,
  solBalance: number,
  ttl: number = DEFAULT_BALANCE_TTL
): Promise<void> {
  const cached: CachedBalance = {
    publicKey,
    solBalance,
    cachedAt: Date.now(),
    ttl,
  };

  await SecureStore.setItemAsync(
    getCacheKey(publicKey),
    JSON.stringify(cached)
  );
}

/**
 * Get cached balance if available and fresh
 */
export async function getCachedBalance(
  publicKey: string
): Promise<number | null> {
  try {
    const data = await SecureStore.getItemAsync(getCacheKey(publicKey));
    if (!data) return null;

    const cached: CachedBalance = JSON.parse(data);
    const now = Date.now();
    const age = now - cached.cachedAt;

    // Return null if cache is stale
    if (age > cached.ttl) {
      // Optionally delete stale cache
      try {
        await SecureStore.deleteItemAsync(getCacheKey(publicKey));
      } catch {
        // ignore
      }
      return null;
    }

    return cached.solBalance;
  } catch (err) {
    log.warn("Failed to get cached balance", err);
    return null;
  }
}

/**
 * Clear cached balance for a public key
 */
export async function clearCachedBalance(publicKey: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(getCacheKey(publicKey));
  } catch (err) {
    log.warn("Failed to clear cached balance", err);
  }
}

/**
 * Get cache age in ms
 */
export async function getCachedBalanceAge(
  publicKey: string
): Promise<number | null> {
  try {
    const data = await SecureStore.getItemAsync(getCacheKey(publicKey));
    if (!data) return null;

    const cached: CachedBalance = JSON.parse(data);
    return Date.now() - cached.cachedAt;
  } catch {
    return null;
  }
}

/**
 * Check if cached balance is still fresh
 */
export async function isCachedBalanceFresh(
  publicKey: string
): Promise<boolean> {
  try {
    const data = await SecureStore.getItemAsync(getCacheKey(publicKey));
    if (!data) return false;

    const cached: CachedBalance = JSON.parse(data);
    const age = Date.now() - cached.cachedAt;
    return age <= cached.ttl;
  } catch {
    return false;
  }
}

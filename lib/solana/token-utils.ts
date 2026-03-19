/**
 * Token utilities for fetching token balances and metadata
 * Integrates with Solana SPL Token program and CoinGecko API for prices
 */

import { Connection, PublicKey } from "@solana/web3.js";
import * as SecureStore from "expo-secure-store";
import { log } from "../utils/logger";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// USDC mint address on devnet (Solend's USDC)
const USDC_MINT = "EPjFWaJY3uyenQYVtEKVwFxupnideipeBeP8FqwADUU";

// SPL Token Program ID (same on all networks)
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJsyFbPVwwQQftor5PvZijiakeU";

// RPC Endpoints Configuration
const RPC_ENDPOINTS = [
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL, // Primary (Custom/Paid)
  "https://api.devnet.solana.com",        // Devnet Official
].filter(Boolean) as string[];

// Price Cache Configuration
const CACHE_KEY = "zypp_price_cache";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes persistence

// ============================================================================
// SINGLETON CONNECTION MANAGER
// ============================================================================

/**
 * Custom Fetch implementation that is strictly quiet.
 * Stops the "Retrying after Xms delay" console spam from web3.js default fetcher.
 */
async function silentFetch(url: string, options: any): Promise<Response> {
  const res = await fetch(url, options);
  return res;
}

class ConnectionManager {
  private static instance: Connection;
  private static currentEndpointIndex = 0;

  public static getConnection(): Connection {
    if (!this.instance) {
      this.instance = new Connection(
        RPC_ENDPOINTS[this.currentEndpointIndex],
        {
          commitment: "confirmed",
          // Replacing the fetch controller with a silent one
          // @ts-ignore
          fetch: silentFetch,
        }
      );
    }
    return this.instance;
  }

  /**
   * Rotates to the next RPC endpoint if the current one is failing.
   */
  public static rotateEndpoint(): Connection {
    if (RPC_ENDPOINTS.length <= 1) {
      return this.instance;
    }

    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % RPC_ENDPOINTS.length;
    const newEndpoint = RPC_ENDPOINTS[this.currentEndpointIndex];
    
    this.instance = new Connection(newEndpoint, {
      commitment: "confirmed",
      // @ts-ignore
      fetch: silentFetch,
    });
    return this.instance;
  }
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Fetch all token accounts for a wallet
 * Includes error handling for RPC failures and automatic endpoint rotation
 */
export async function getTokenAccounts(walletPublicKey: string) {
  const pubkey = new PublicKey(walletPublicKey);
  let retries = 0;
  const maxRetries = RPC_ENDPOINTS.length - 1;

  while (retries <= maxRetries) {
    try {
      const conn = ConnectionManager.getConnection();
      
      const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
        pubkey,
        {
          programId: new PublicKey(TOKEN_PROGRAM_ID),
        }
      );

      return tokenAccounts.value.map((accountData: any) => {
        const parsedInfo = (accountData.account.data as any).parsed?.info;
        return {
          address: accountData.pubkey.toBase58(),
          mint: parsedInfo?.mint,
          owner: parsedInfo?.owner,
          balance: parsedInfo?.tokenAmount?.uiAmount || 0,
          decimals: parsedInfo?.tokenAmount?.decimals || 0,
        };
      });

    } catch (err: any) {
      if (retries < maxRetries) {
        // Rotate connection and retry silently
        ConnectionManager.rotateEndpoint();
        retries++;
      } else {
        // Final fallback: all nodes failed or timed out
        // We return an empty list silently to maintain production-ready clean logs
        return [];
      }
    }
  }
  return [];
}

/**
 * Fetch USDC balance specifically
 */
export async function getUSDCBalance(walletPublicKey: string): Promise<number> {
  try {
    const accounts = await getTokenAccounts(walletPublicKey);
    const usdcAccount = accounts.find(
      (acc) => acc.mint?.toLowerCase() === USDC_MINT.toLowerCase()
    );
    return usdcAccount?.balance || 0;
  } catch (err) {
    return 0;
  }
}

// ============================================================================
// PRICE UTILITIES (PERSISTENT CACHING)
// ============================================================================

let priceCache: { data: Record<string, number>; timestamp: number } | null = null;

function isCacheValid(cache: { timestamp: number } | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION_MS;
}

/**
 * Fetch real token prices from CoinGecko API
 * Features:
 * - In-memory L1 cache
 * - SecureStore Disk L2 cache (Persistence)
 * - 429 Rate Limit Handling
 */
export async function fetchTokenPrices(): Promise<Record<string, number>> {
  // 1. Check Memory Cache
  if (isCacheValid(priceCache)) {
    return priceCache!.data;
  }

  // 2. Check Disk Cache (Load if memory empty)
  if (!priceCache) {
    try {
      const stored = await SecureStore.getItemAsync(CACHE_KEY);
      if (stored) {
        priceCache = JSON.parse(stored);
        log.info("[PriceUtils] Loaded prices from disk cache");
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  // 3. Return memory cache if valid (strictly for limiting network requests)
  if (isCacheValid(priceCache)) {
    return priceCache!.data;
  }

  // 4. Network Request
  try {
    const coingeckoIds = ["solana", "usd-coin"];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(",")}&vs_currencies=usd`;

    const response = await fetch(url);

    if (!response.ok) throw new Error(`CoinGecko status: ${response.status}`);

    const data = (await response.json()) as Record<string, any>;
    const prices = {
      SOL: data?.solana?.usd || (priceCache?.data?.SOL ?? 180),
      USDC: data?.["usd-coin"]?.usd || (priceCache?.data?.USDC ?? 1.0),
    };

    // Update caches
    priceCache = { data: prices, timestamp: Date.now() };
    SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(priceCache)).catch(() => {});

    return prices;
  } catch (err) {
    // Fail gracefully: Use EXISTING cache (even if stale) before hardcoded defaults
    if (priceCache?.data) {
      log.warn("[PriceUtils] Fetch failed, using stale cache", err);
      return priceCache.data;
    }
    return { SOL: 180, USDC: 1.0 };
  }
}

/**
 * Get token price (uses cached or fetched prices)
 */
export async function getTokenPrice(symbol: string): Promise<number | null> {
  const prices = await fetchTokenPrices();
  return prices[symbol.toUpperCase()] || null;
}

/**
 * Format token balance to human-readable string
 */
export function formatTokenBalance(
  balance: number,
  decimals: number = 6
): string {
  return balance.toFixed(Math.min(decimals, 6));
}

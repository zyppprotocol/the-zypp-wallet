/**
 * Token Resolver
 * 
 * Resolves token symbols to Solana mint addresses
 * Production-ready token address resolution
 */

import { PublicKey } from "@solana/web3.js";
import { log } from "../utils/logger";

// Well-known token mint addresses (mainnet)
const TOKEN_MINTS: Record<string, string> = {
  // Native SOL
  SOL: "So11111111111111111111111111111111111111112",
  
  // Stablecoins
  USDC: "EPjFWaJY3uyenQYVtEKVwFxupnideipeBeP8FqwADUU", // Mainnet USDC
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // Mainnet USDT
  
  // Devnet tokens (for testing)
  "USDC_DEVNET": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet USDC
};

/**
 * Resolve token symbol to mint address
 * Handles both mainnet and devnet tokens
 */
export function resolveTokenMint(
  tokenSymbol: string,
  network: "mainnet" | "devnet" = "devnet"
): string {
  // If already a valid mint address (base58, 32-44 chars), return as-is
  if (isValidMintAddress(tokenSymbol)) {
    return tokenSymbol;
  }

  const symbol = tokenSymbol.toUpperCase();
  
  // Check network-specific tokens first
  if (network === "devnet" && symbol === "USDC") {
    return TOKEN_MINTS["USDC_DEVNET"];
  }
  
  // Check mainnet tokens
  if (TOKEN_MINTS[symbol]) {
    return TOKEN_MINTS[symbol];
  }
  
  // If not found, log warning and return SOL as fallback
  log.warn(`Unknown token symbol: ${tokenSymbol}, defaulting to SOL`, undefined, {
    tokenSymbol,
    network,
  });
  
  return TOKEN_MINTS.SOL;
}

/**
 * Validate if a string is a valid Solana mint address
 */
function isValidMintAddress(address: string): boolean {
  try {
    // Solana addresses are base58 encoded, typically 32-44 characters
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    
    // Try to create a PublicKey to validate
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get token symbol from mint address (reverse lookup)
 */
export function getTokenSymbol(mintAddress: string): string {
  for (const [symbol, mint] of Object.entries(TOKEN_MINTS)) {
    if (mint === mintAddress) {
      return symbol === "USDC_DEVNET" ? "USDC" : symbol;
    }
  }
  
  // Return first 8 chars of address if not found
  return mintAddress.slice(0, 8) + "...";
}

/**
 * Check if token is a known token
 */
export function isKnownToken(tokenSymbol: string): boolean {
  const symbol = tokenSymbol.toUpperCase();
  return symbol in TOKEN_MINTS || symbol === "USDC_DEVNET";
}

/**
 * Nonce Tracker
 * 
 * Production-ready nonce tracking for replay attack prevention
 * Tracks used nonces to ensure each transaction can only be executed once
 */

import * as SecureStore from "expo-secure-store";
import { log } from "../utils/logger";

const NONCE_STORAGE_KEY_PREFIX = "zypp_nonce_";
const NONCE_LIST_KEY = "zypp_used_nonces";
const MAX_NONCE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours - nonces expire after this

/**
 * Check if a nonce has been used (replay protection)
 */
export async function isNonceUsed(nonce: string): Promise<boolean> {
  try {
    const usedNoncesJson = await SecureStore.getItemAsync(NONCE_LIST_KEY);
    if (!usedNoncesJson) {
      return false;
    }

    const usedNonces = JSON.parse(usedNoncesJson) as Array<{
      nonce: string;
      timestamp: number;
    }>;

    // Check if nonce exists and is not expired
    const now = Date.now();
    const nonceEntry = usedNonces.find((entry) => entry.nonce === nonce);
    
    if (nonceEntry) {
      // Check if expired
      if (now - nonceEntry.timestamp > MAX_NONCE_AGE_MS) {
        // Remove expired nonce
        await removeNonce(nonce);
        return false;
      }
      return true; // Nonce was used and is still valid
    }

    return false;
  } catch (error) {
    log.error("Failed to check nonce usage", error, { nonce });
    // On error, assume nonce is not used (fail open for availability)
    return false;
  }
}

/**
 * Mark a nonce as used (call after transaction is confirmed)
 */
export async function markNonceAsUsed(nonce: string): Promise<void> {
  try {
    const usedNoncesJson = await SecureStore.getItemAsync(NONCE_LIST_KEY);
    const usedNonces = usedNoncesJson
      ? (JSON.parse(usedNoncesJson) as Array<{ nonce: string; timestamp: number }>)
      : [];

    // Check if already exists
    if (usedNonces.some((entry) => entry.nonce === nonce)) {
      log.warn("Nonce already marked as used", undefined, { nonce });
      return;
    }

    // Add new nonce with timestamp
    usedNonces.push({
      nonce,
      timestamp: Date.now(),
    });

    // Clean up expired nonces
    const now = Date.now();
    const validNonces = usedNonces.filter(
      (entry) => now - entry.timestamp <= MAX_NONCE_AGE_MS
    );

    // Store updated list
    await SecureStore.setItemAsync(
      NONCE_LIST_KEY,
      JSON.stringify(validNonces),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      }
    );

    log.debug("Nonce marked as used", { nonce, totalTracked: validNonces.length });
  } catch (error) {
    log.error("Failed to mark nonce as used", error, { nonce });
  }
}

/**
 * Remove a nonce from tracking (for cleanup)
 */
async function removeNonce(nonce: string): Promise<void> {
  try {
    const usedNoncesJson = await SecureStore.getItemAsync(NONCE_LIST_KEY);
    if (!usedNoncesJson) return;

    const usedNonces = JSON.parse(usedNoncesJson) as Array<{
      nonce: string;
      timestamp: number;
    }>;

    const filtered = usedNonces.filter((entry) => entry.nonce !== nonce);

    await SecureStore.setItemAsync(
      NONCE_LIST_KEY,
      JSON.stringify(filtered),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      }
    );
  } catch (error) {
    log.error("Failed to remove nonce", error, { nonce });
  }
}

/**
 * Validate nonce format (64 hex characters = 32 bytes)
 */
export function validateNonceFormat(nonce: string): boolean {
  // Nonce should be 64 hex characters (32 bytes)
  return /^[0-9a-f]{64}$/i.test(nonce);
}

/**
 * Clean up expired nonces (call periodically)
 */
export async function cleanupExpiredNonces(): Promise<number> {
  try {
    const usedNoncesJson = await SecureStore.getItemAsync(NONCE_LIST_KEY);
    if (!usedNoncesJson) return 0;

    const usedNonces = JSON.parse(usedNoncesJson) as Array<{
      nonce: string;
      timestamp: number;
    }>;

    const now = Date.now();
    const validNonces = usedNonces.filter(
      (entry) => now - entry.timestamp <= MAX_NONCE_AGE_MS
    );

    const removedCount = usedNonces.length - validNonces.length;

    if (removedCount > 0) {
      await SecureStore.setItemAsync(
        NONCE_LIST_KEY,
        JSON.stringify(validNonces),
        {
          keychainAccessible: SecureStore.WHEN_UNLOCKED,
        }
      );
      log.info("Cleaned up expired nonces", { removedCount, remaining: validNonces.length });
    }

    return removedCount;
  } catch (error) {
    log.error("Failed to cleanup expired nonces", error);
    return 0;
  }
}

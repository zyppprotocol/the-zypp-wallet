/**
 * Subscription Manager
 * 
 * Handles subscription tier management, transaction limits, and count tracking
 * Works offline-first: all checks and updates happen locally, sync to cloud when online
 */

import { SecureStorage } from "../storage/secure-storage";
import { log } from "../utils/logger";
import {
    BASIC_TIER_LIMIT,
    MONTHLY_RESET_PERIOD_MS,
} from "./constants";

export type SubscriptionTier = "basic" | "premium";

/**
 * Check if transaction count should be reset (new month)
 */
function shouldResetCount(lastResetDate: number): boolean {
  const now = Date.now();
  return now - lastResetDate >= MONTHLY_RESET_PERIOD_MS;
}

/**
 * Get current subscription tier
 */
export async function getSubscriptionTier(): Promise<SubscriptionTier> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      return "basic"; // Default to basic if no user
    }

    // Initialize subscription if missing
    if (!user.subscription) {
      const now = Date.now();
      user.subscription = {
        tier: "basic",
        startDate: now,
        transactionCount: 0,
        lastResetDate: now,
      };
      await SecureStorage.setUser(user);
      log.info("Initialized missing subscription field for user");
    }

    // Check if subscription needs reset
    if (shouldResetCount(user.subscription.lastResetDate)) {
      await resetMonthlyCount();
      const updatedUser = await SecureStorage.getUser();
      return updatedUser?.subscription.tier || "basic";
    }

    return user.subscription.tier;
  } catch (error) {
    log.error("Failed to get subscription tier", error);
    return "basic"; // Default to basic on error
  }
}

/**
 * Check if user can create a transaction based on subscription limits
 */
export async function canCreateTransaction(): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number;
}> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      return { allowed: false, reason: "User not found" };
    }

    // Initialize subscription if missing
    if (!user.subscription) {
      const now = Date.now();
      user.subscription = {
        tier: "basic",
        startDate: now,
        transactionCount: 0,
        lastResetDate: now,
      };
      await SecureStorage.setUser(user);
      log.info("Initialized missing subscription field for user");
    }

    const tier = user.subscription.tier;

    // Premium tier: unlimited transactions
    if (tier === "premium") {
      return { allowed: true };
    }

    // Basic tier: check limit
    // Reset count if new month
    if (shouldResetCount(user.subscription.lastResetDate)) {
      await resetMonthlyCount();
      const updatedUser = await SecureStorage.getUser();
      if (!updatedUser) {
        return { allowed: false, reason: "Failed to reset count" };
      }
      return {
        allowed: updatedUser.subscription.transactionCount < BASIC_TIER_LIMIT,
        remaining: BASIC_TIER_LIMIT - updatedUser.subscription.transactionCount,
      };
    }

    const remaining = BASIC_TIER_LIMIT - user.subscription.transactionCount;
    const allowed = user.subscription.transactionCount < BASIC_TIER_LIMIT;

    return {
      allowed,
      remaining: allowed ? remaining : 0,
      reason: allowed
        ? undefined
        : `Monthly limit of ${BASIC_TIER_LIMIT} transactions reached. Upgrade to Premium for unlimited transactions.`,
    };
  } catch (error) {
    log.error("Failed to check transaction limit", error);
    return { allowed: false, reason: "Error checking limit" };
  }
}

/**
 * Increment transaction count after queuing a transaction
 */
export async function incrementTransactionCount(): Promise<void> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      log.warn("Cannot increment transaction count: user not found");
      return;
    }

    // Reset if new month
    if (shouldResetCount(user.subscription.lastResetDate)) {
      await resetMonthlyCount();
      const updatedUser = await SecureStorage.getUser();
      if (!updatedUser) {
        log.error("Failed to get user after reset");
        return;
      }
      updatedUser.subscription.transactionCount = 1;
    } else {
      user.subscription.transactionCount += 1;
    }

    await SecureStorage.setUser(user);
    log.debug("Transaction count incremented", {
      tier: user.subscription.tier,
      count: user.subscription.transactionCount,
      limit: user.subscription.tier === "basic" ? BASIC_TIER_LIMIT : "unlimited",
    });
  } catch (error) {
    log.error("Failed to increment transaction count", error);
  }
}

/**
 * Reset monthly transaction count
 */
export async function resetMonthlyCount(): Promise<void> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      log.warn("Cannot reset count: user not found");
      return;
    }

    const previousCount = user.subscription.transactionCount;
    user.subscription.transactionCount = 0;
    user.subscription.lastResetDate = Date.now();

    await SecureStorage.setUser(user);
    log.info("Monthly transaction count reset", {
      previousCount,
      tier: user.subscription.tier,
    });
  } catch (error) {
    log.error("Failed to reset monthly count", error);
  }
}

/**
 * Get current transaction count and limit
 */
export async function getTransactionCountInfo(): Promise<{
  count: number;
  limit: number | "unlimited";
  tier: SubscriptionTier;
  remaining: number | "unlimited";
  resetDate: number;
}> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      return {
        count: 0,
        limit: BASIC_TIER_LIMIT,
        tier: "basic",
        remaining: BASIC_TIER_LIMIT,
        resetDate: Date.now(),
      };
    }

    // Initialize subscription if missing (for users created before subscription feature)
    if (!user.subscription) {
      const now = Date.now();
      user.subscription = {
        tier: "basic",
        startDate: now,
        transactionCount: 0,
        lastResetDate: now,
      };
      await SecureStorage.setUser(user);
      log.info("Initialized missing subscription field for user");
    }

    // Reset if new month
    if (shouldResetCount(user.subscription.lastResetDate)) {
      await resetMonthlyCount();
      const updatedUser = await SecureStorage.getUser();
      if (!updatedUser) {
        return {
          count: 0,
          limit: BASIC_TIER_LIMIT,
          tier: "basic",
          remaining: BASIC_TIER_LIMIT,
          resetDate: Date.now(),
        };
      }
      return {
        count: updatedUser.subscription.transactionCount,
        limit: updatedUser.subscription.tier === "premium" ? "unlimited" : BASIC_TIER_LIMIT,
        tier: updatedUser.subscription.tier,
        remaining:
          updatedUser.subscription.tier === "premium"
            ? "unlimited"
            : BASIC_TIER_LIMIT - updatedUser.subscription.transactionCount,
        resetDate: updatedUser.subscription.lastResetDate,
      };
    }

    const limit =
      user.subscription.tier === "premium" ? "unlimited" : BASIC_TIER_LIMIT;
    const remaining =
      user.subscription.tier === "premium"
        ? "unlimited"
        : BASIC_TIER_LIMIT - user.subscription.transactionCount;

    return {
      count: user.subscription.transactionCount,
      limit,
      tier: user.subscription.tier,
      remaining,
      resetDate: user.subscription.lastResetDate,
    };
  } catch (error) {
    log.error("Failed to get transaction count info", error);
    return {
      count: 0,
      limit: BASIC_TIER_LIMIT,
      tier: "basic",
      remaining: BASIC_TIER_LIMIT,
      resetDate: Date.now(),
    };
  }
}

/**
 * Update subscription tier (used when user upgrades)
 */
export async function updateSubscriptionTier(
  tier: SubscriptionTier,
  endDate?: number
): Promise<void> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      throw new Error("User not found");
    }

    const previousTier = user.subscription.tier;
    user.subscription.tier = tier;
    user.subscription.startDate = Date.now();
    if (endDate) {
      user.subscription.endDate = endDate;
    }

    await SecureStorage.setUser(user);
    log.info("Subscription tier updated", {
      previousTier,
      newTier: tier,
      endDate,
    });
  } catch (error) {
    log.error("Failed to update subscription tier", error);
    throw error;
  }
}

/**
 * Check transaction limit (alias for canCreateTransaction for convenience)
 */
export async function checkTransactionLimit(): Promise<boolean> {
  const result = await canCreateTransaction();
  return result.allowed;
}

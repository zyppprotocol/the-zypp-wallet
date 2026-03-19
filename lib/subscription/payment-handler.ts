/**
 * Payment Handler
 *
 * Handles subscription payments using in-app crypto payments
 * Users pay for Premium subscription using SOL/USDC directly from their wallet
 * NO WEB2 PAYMENT METHODS (Stripe, RevenueCat, etc.)
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getRpcUrl } from "../config/network";
import { getTokenPrice } from "../solana/token-utils";
import { SecureStorage } from "../storage/secure-storage";
import { log } from "../utils/logger";
import { PREMIUM_SUBSCRIPTION_PRICE_SOL } from "./constants";
import { updateSubscriptionTier } from "./subscription-manager";

// Subscription payment recipient address (your wallet address for receiving subscription payments)
const SUBSCRIPTION_PAYMENT_WALLET =
  process.env.EXPO_PUBLIC_SUBSCRIPTION_PAYMENT_WALLET || "";

/**
 * Get premium subscription price in lamports
 */
export function getPremiumSubscriptionPrice(): bigint {
  // Convert SOL to lamports (1 SOL = 1,000,000,000 lamports)
  return BigInt(Math.floor(PREMIUM_SUBSCRIPTION_PRICE_SOL * 1_000_000_000));
}

/**
 * Create a subscription payment transaction
 * User pays for Premium subscription using SOL from their wallet
 */
export async function createSubscriptionPaymentTransaction(): Promise<{
  transaction: Transaction;
  amount: bigint;
  recipient: string;
}> {
  if (!SUBSCRIPTION_PAYMENT_WALLET) {
    throw new Error("Subscription payment wallet not configured");
  }

  const user = await SecureStorage.getUser();
  if (!user) {
    throw new Error("User not found");
  }

  const amount = getPremiumSubscriptionPrice();
  const senderPubkey = new PublicKey(user.solanaPublicKey);
  const recipientPubkey = new PublicKey(SUBSCRIPTION_PAYMENT_WALLET);

  const connection = new Connection(getRpcUrl(), "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: senderPubkey,
      toPubkey: recipientPubkey,
      lamports: Number(amount),
    }),
  );

  transaction.recentBlockhash = blockhash;
  transaction.feePayer = senderPubkey;

  log.info("Subscription payment transaction created", {
    amount: amount.toString(),
    recipient: SUBSCRIPTION_PAYMENT_WALLET,
    sender: user.solanaPublicKey,
  });

  return {
    transaction,
    amount,
    recipient: SUBSCRIPTION_PAYMENT_WALLET,
  };
}

/**
 * Process subscription payment and upgrade user to Premium
 * This should be called after the payment transaction is confirmed on-chain
 * The UI should handle transaction signing and confirmation separately
 */
export async function processSubscriptionUpgrade(
  paymentSignature: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Check if already Premium
    if (user.subscription.tier === "premium") {
      return {
        success: false,
        error: "User already has Premium subscription",
      };
    }

    // Verify payment was confirmed
    const verified = await verifySubscriptionPayment(paymentSignature);
    if (!verified) {
      return {
        success: false,
        error: "Payment verification failed",
      };
    }

    // Update subscription tier to Premium
    // Calculate end date (30 days from now)
    const endDate = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    await updateSubscriptionTier("premium", endDate);

    log.info("User upgraded to Premium", {
      userId: user.zyppUserId,
      paymentSignature,
      endDate: new Date(endDate).toISOString(),
    });

    return {
      success: true,
    };
  } catch (error) {
    log.error("Failed to process subscription upgrade", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check subscription payment status
 * Verifies if payment transaction was confirmed on-chain
 */
export async function verifySubscriptionPayment(
  signature: string,
): Promise<boolean> {
  try {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
    });

    if (!transaction) {
      return false;
    }

    // Check if transaction was successful
    if (transaction.meta?.err) {
      return false;
    }

    // Verify payment amount and recipient
    const amount = getPremiumSubscriptionPrice();
    const recipient = new PublicKey(SUBSCRIPTION_PAYMENT_WALLET);

    // Check if transaction includes payment to subscription wallet
    const paymentFound = transaction.transaction.message.accountKeys.some(
      (key, index) => {
        if (key.equals(recipient)) {
          // Check if this account received the payment amount
          const preBalance = transaction.meta?.preBalances?.[index] || 0;
          const postBalance = transaction.meta?.postBalances?.[index] || 0;
          const received = postBalance - preBalance;
          return received >= Number(amount);
        }
        return false;
      },
    );

    return paymentFound;
  } catch (error) {
    log.error("Failed to verify subscription payment", error);
    return false;
  }
}

/**
 * Get subscription payment info for display
 */
export async function getSubscriptionPaymentInfo(): Promise<{
  priceSol: number;
  priceUsd: number;
  recipient: string;
  currentTier: "basic" | "premium";
}> {
  const user = await SecureStorage.getUser();
  const priceSol = PREMIUM_SUBSCRIPTION_PRICE_SOL;

  // Fetch SOL price from token-utils for accurate USD conversion
  const solPrice = await getTokenPrice("SOL");
  const priceUsd = priceSol * (solPrice || 100); // Fallback to $100 if price unavailable

  // Initialize subscription if missing
  if (user && !user.subscription) {
    const now = Date.now();
    user.subscription = {
      tier: "basic",
      startDate: now,
      transactionCount: 0,
      lastResetDate: now,
    };
    await SecureStorage.setUser(user);
    log.info("Initialized missing subscription field in payment handler");
  }

  return {
    priceSol,
    priceUsd,
    recipient: SUBSCRIPTION_PAYMENT_WALLET || "",
    currentTier: (user?.subscription?.tier || "basic") as "basic" | "premium",
  };
}

/**
 * Transaction Broadcaster
 *
 * Handles re-broadcasting pending transactions to Solana RPC
 * with retry logic, exponential backoff, relayer fallback, and error recovery
 *
 * Flow:
 * 1. When app comes online, check for pending transactions
 * 2. For each pending tx: attempt broadcast via RPC
 * 3. If RPC fails: try relayer network (if enabled)
 * 4. If success: mark as confirmed
 * 5. If failure: increment retry count
 * 6. If max retries exceeded: mark as failed
 * 7. Otherwise: retry with exponential backoff
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getRpcUrl } from "../config/network";
import { executeDefiIntent } from "../defi/defi-executor";
import {
  RelayerPool,
  getRelayerPoolConfig,
  recordRelayerFee,
  shouldUseRelayer,
} from "../relayer";
import {
  getPendingTransactions,
  markAsBroadcasting,
  markAsConfirmed,
  markAsFailed,
} from "../storage/offline-queue";
import { SecureStorage } from "../storage/secure-storage";
import { TransactionIntent } from "../storage/types";
import { log } from "../utils/logger";
import { executePaymentIntent } from "./payment-executor";
import { signTransactionWithBiometric } from "./transaction-signer";

// Retry configuration
const MAX_BROADCAST_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000; // Start with 2 seconds
const RETRY_BACKOFF_MULTIPLIER = 1.5; // Exponential backoff: 2s, 3s, 4.5s, 6.75s, 10.1s

interface BroadcastResult {
  success: boolean;
  signature?: string;
  error?: string;
  retriesLeft?: number;
}

/**
 * Broadcast a transaction to Solana RPC with optional relayer fallback
 * Handles errors and retries with exponential backoff
 */
export async function broadcastTransaction(
  tx: TransactionIntent,
  retryAttempt = 0,
  useRelayerFallback = true,
): Promise<BroadcastResult> {
  try {
    // Mark as broadcasting
    await markAsBroadcasting(tx.id);

    // Transaction is already signed (signature field contains the tx data)
    if (!tx.signature) {
      return {
        success: false,
        error: "Transaction not signed",
      };
    }

    const url = getRpcUrl();
    const conn = new Connection(url, "confirmed");

    // Attempt to confirm the transaction on-chain
    try {
      const confirmation = await conn.confirmTransaction(
        tx.onchainSignature || tx.signature,
        "confirmed",
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed on-chain: ${confirmation.value.err}`,
        );
      }

      // Success - mark as confirmed
      await markAsConfirmed(
        tx.id,
        tx.onchainSignature || tx.signature,
        tx.blockHash || "",
        tx.slot || 0,
      );

      // Mark nonce as used to prevent replay attacks (production security)
      if (tx.nonce) {
        const { markNonceAsUsed } = await import("../storage/nonce-tracker");
        await markNonceAsUsed(tx.nonce).catch((err) => {
          log.warn("Failed to mark nonce as used", err, { nonce: tx.nonce });
        });
      }

      return {
        success: true,
        signature: tx.onchainSignature || tx.signature,
      };
    } catch (confirmErr) {
      // If confirmation fails, determine if it's retriable
      const errorMessage =
        confirmErr instanceof Error ? confirmErr.message : String(confirmErr);
      const isRetriable =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("Blockhash not found") ||
        errorMessage.includes("was not confirmed");

      if (isRetriable) {
        throw new Error(`Confirmation failed (retriable): ${errorMessage}`);
      } else {
        // Non-retriable error (e.g., insufficient funds, invalid transaction)
        throw new Error(`Confirmation failed (non-retriable): ${errorMessage}`);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retriesLeft = MAX_BROADCAST_ATTEMPTS - retryAttempt - 1;

    // Try relayer fallback if enabled and RPC failed
    if (useRelayerFallback && shouldUseRelayer() && retriesLeft > 0) {
      try {
        log.info("RPC broadcast failed, attempting relayer fallback", {
          txId: tx.id,
          error,
        });

        const relayerResult = await broadcastViaRelayer(tx);
        if (relayerResult.success) {
          return relayerResult;
        }
      } catch (relayerErr) {
        log.warn("Relayer fallback also failed", relayerErr, { txId: tx.id });
        // Fall through to standard retry logic
      }
    }

    // If max retries exceeded, mark as failed
    if (retriesLeft <= 0) {
      await markAsFailed(tx.id, error);
      return {
        success: false,
        error: `Max retries exceeded: ${error}`,
        retriesLeft: 0,
      };
    }

    // Calculate backoff delay
    const delayMs = Math.floor(
      RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, retryAttempt),
    );

    log.warn(
      `Broadcast attempt ${retryAttempt + 1}/${MAX_BROADCAST_ATTEMPTS} failed for tx ${tx.id}. Retrying in ${delayMs}ms`,
      undefined,
      {
        txId: tx.id,
        retryAttempt: retryAttempt + 1,
        error,
        delayMs,
      },
    );

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Recursive retry
    return broadcastTransaction(tx, retryAttempt + 1, useRelayerFallback);
  }
}

/**
 * Get fee wallet address from environment or use default
 */
function getFeeWalletAddress(): string {
  const feeWallet = process.env.EXPO_PUBLIC_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    log.error(
      "Fee wallet address not configured - fee collection disabled",
      undefined,
      {
        envVar: "EXPO_PUBLIC_FEE_WALLET_ADDRESS",
      },
    );
    throw new Error(
      "Fee wallet address must be configured in production. Set EXPO_PUBLIC_FEE_WALLET_ADDRESS environment variable.",
    );
  }
  return feeWallet;
}

/**
 * Send fee transaction to fee wallet
 * This creates and signs a separate transaction for the fee
 */
async function sendFeeTransaction(
  feeAmount: bigint,
  senderPublicKey: string,
): Promise<string | null> {
  try {
    const feeWalletAddress = getFeeWalletAddress();
    if (!feeWalletAddress || feeAmount <= 0) {
      return null; // No fee to collect or no fee wallet configured
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);
    const feePubkey = new PublicKey(feeWalletAddress);

    // Create fee transaction
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: feePubkey,
        lamports: Number(feeAmount),
      }),
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    feeTransaction.recentBlockhash = blockhash;
    feeTransaction.feePayer = senderPubkey;

    // Sign the fee transaction using biometric authentication
    log.info("Signing fee transaction", {
      feeAmount: feeAmount.toString(),
      feeWallet: feeWalletAddress,
      sender: senderPublicKey,
    });

    const signResult = await signTransactionWithBiometric(
      feeTransaction,
      "Sign fee transaction",
    );

    if (!signResult.success || !signResult.signedTransaction) {
      log.error("Failed to sign fee transaction", undefined, {
        error: signResult.error,
      });
      return null;
    }

    // Send and confirm fee transaction
    const signedTx = signResult.signedTransaction as Transaction;
    const feeSignature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      },
    );

    // Wait for confirmation with timeout
    await connection.confirmTransaction(
      {
        signature: feeSignature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed",
    );

    log.info("Fee transaction confirmed", {
      signature: feeSignature,
      feeAmount: feeAmount.toString(),
    });

    return feeSignature;
  } catch (error) {
    log.error("Failed to send fee transaction", error);
    return null;
  }
}

/**
 * Broadcast transaction via relayer network (Phase 2 fallback)
 */
async function broadcastViaRelayer(
  tx: TransactionIntent,
): Promise<BroadcastResult> {
  try {
    const relayerConfig = getRelayerPoolConfig();
    if (!relayerConfig) {
      return {
        success: false,
        error: "Relayer not configured",
      };
    }

    const relayerPool = new RelayerPool(relayerConfig);

    // Start health checks in background
    relayerPool.startHealthChecks();

    log.info("Submitting transaction to relayer pool", {
      txId: tx.id,
      relayerCount: relayerPool.getRelayerCount(),
    });

    // Submit to relayer pool
    const response = await relayerPool.submitTransaction({
      transaction: tx.signature, // Base64-encoded signed tx
      intentId: tx.id,
      subscriptionTier: tx.subscriptionTier,
      maxRetries: 3,
      metadata: {
        source: "zypp-wallet",
        timestamp: Date.now(),
      },
    });

    if (response.status === "confirmed" || response.status === "finalized") {
      // Relayer confirmed the transaction
      await markAsConfirmed(tx.id, response.signature || tx.signature, "", 0);

      // Record relayer fee if applicable
      if (response.relayer) {
        try {
          const user = await SecureStorage.getUser();
          if (user?.zyppUserId) {
            // Record the relayer fee for accounting
            const feeResult = await recordRelayerFee(
              user.zyppUserId,
              tx.id,
              response.relayer,
              "0", // TODO: Get actual fee from relayer response
            );

            if (feeResult.success) {
              log.info("Relayer fee recorded", {
                feeId: feeResult.feeId,
                relayer: response.relayer,
                txId: tx.id,
              });
            }
          }
        } catch (feeError) {
          log.warn("Failed to record relayer fee", feeError);
          // Don't fail the entire operation if fee recording fails
        }
      }

      log.info("Transaction confirmed via relayer", {
        txId: tx.id,
        signature: response.signature,
        relayer: response.relayer,
      });

      return {
        success: true,
        signature: response.signature || tx.signature,
      };
    } else if (
      response.status === "pending" ||
      response.status === "submitted"
    ) {
      // Relayer accepted but not yet confirmed
      log.info("Transaction accepted by relayer, awaiting confirmation", {
        txId: tx.id,
        relayer: response.relayer,
      });

      return {
        success: true,
        signature: response.signature || tx.signature,
      };
    } else {
      // Relayer rejected or failed
      return {
        success: false,
        error: response.error || "Relayer rejected transaction",
      };
    }
  } catch (error) {
    log.error("Relayer submission failed", error, {
      txId: tx.id,
    });

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Relayer submission failed",
    };
  }
}

/**
 * Sort transactions by subscription tier (Premium first, then Basic)
 */
function sortTransactionsByPriority(
  transactions: TransactionIntent[],
): TransactionIntent[] {
  return [...transactions].sort((a, b) => {
    const tierA = a.subscriptionTier || "basic";
    const tierB = b.subscriptionTier || "basic";

    // Premium comes first
    if (tierA === "premium" && tierB === "basic") return -1;
    if (tierA === "basic" && tierB === "premium") return 1;

    // Within same tier, maintain original order (by creation time)
    return a.createdAt - b.createdAt;
  });
}

/**
 * Sync all pending transactions to Solana
 * Broadcast each pending tx and track results
 * Premium tier transactions are processed first
 */
export async function syncPendingTransactions(): Promise<{
  total: number;
  confirmed: number;
  failed: number;
  stillPending: number;
  errors: { txId: string; error: string }[];
}> {
  try {
    const pending = await getPendingTransactions();

    if (pending.length === 0) {
      return {
        total: 0,
        confirmed: 0,
        failed: 0,
        stillPending: 0,
        errors: [],
      };
    }

    log.info(`Syncing ${pending.length} pending transactions...`);

    // Sort by priority: Premium first, then Basic
    const sortedPending = sortTransactionsByPriority(pending);

    const premiumCount = sortedPending.filter(
      (tx) => tx.subscriptionTier === "premium",
    ).length;
    const basicCount = sortedPending.length - premiumCount;

    log.info(
      `Transaction priority: ${premiumCount} Premium, ${basicCount} Basic`,
    );

    const results = {
      total: sortedPending.length,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      errors: [] as { txId: string; error: string }[],
    };

    // Process transactions sequentially to maintain priority order
    // (Premium transactions will be processed first)
    for (const tx of sortedPending) {
      try {
        // Check if this is a DeFi intent that needs execution
        const isDefiIntent =
          tx.type === "swap_intent" ||
          tx.type === "yield_deposit" ||
          tx.type === "yield_withdraw" ||
          tx.type === "lend" ||
          tx.type === "borrow" ||
          tx.type === "repay";

        if (isDefiIntent) {
          // Execute DeFi intent
          const defiResult = await executeDefiIntent(tx);

          if (defiResult.success) {
            // Mark as confirmed if execution was successful
            if (defiResult.signature) {
              await markAsConfirmed(tx.id, defiResult.signature, "", 0);
              results.confirmed++;
            } else {
              // Execution prepared but needs signing
              log.info("DeFi intent executed, awaiting signature", {
                txId: tx.id,
                type: tx.type,
              });
              results.stillPending++;
            }
          } else {
            // Check if rate changed (user needs to review)
            if (defiResult.rateChanged) {
              log.warn("DeFi intent rate changed, user review needed", {
                txId: tx.id,
                error: defiResult.error,
              });
              results.stillPending++;
            } else {
              results.failed++;
              results.errors.push({
                txId: tx.id,
                error: defiResult.error || "DeFi execution failed",
              });
            }
          }
          continue; // Skip normal broadcast for DeFi intents
        }

        // Payment intents must be executed locally (SOL + SPL) instead of
        // trying to confirm intent.signature as if it were an on-chain tx id.
        if (tx.type === "payment") {
          await markAsBroadcasting(tx.id);

          // Collect fee (if configured) before settlement
          if (tx.feeAmount && tx.feeAmount > 0) {
            await sendFeeTransaction(tx.feeAmount, tx.sender);
          }

          const paymentResult = await executePaymentIntent(tx);

          if (paymentResult.success && paymentResult.signature) {
            await markAsConfirmed(
              tx.id,
              paymentResult.signature,
              paymentResult.blockHash || "",
              paymentResult.slot || 0,
            );
            results.confirmed++;
          } else {
            const error =
              paymentResult.error || "Payment execution failed (unknown error)";
            await markAsFailed(tx.id, error);
            results.failed++;
            results.errors.push({ txId: tx.id, error });
          }

          continue;
        }

        // Send fee transaction if fee is configured
        if (tx.feeAmount && tx.feeAmount > 0) {
          await sendFeeTransaction(tx.feeAmount, tx.sender);
          log.debug("Fee transaction processed", {
            txId: tx.id,
            feeAmount: tx.feeAmount.toString(),
            tier: tx.subscriptionTier,
          });
        }

        // Broadcast main transaction
        const result = await broadcastTransaction(tx);

        if (result.success) {
          results.confirmed++;
        } else if (result.retriesLeft === 0) {
          results.failed++;
          results.errors.push({
            txId: tx.id,
            error: result.error || "Unknown error",
          });
        } else {
          results.stillPending++;
        }
      } catch (error) {
        log.error("Error processing transaction", error, { txId: tx.id });
        results.failed++;
        results.errors.push({
          txId: tx.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info(
      `Sync complete: ${results.confirmed} confirmed, ${results.failed} failed, ${results.stillPending} still pending`,
      results,
    );

    return results;
  } catch (err) {
    log.error("Failed to sync pending transactions", err);
    return {
      total: 0,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      errors: [
        {
          txId: "unknown",
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
}

/**
 * Get retry status for a pending transaction
 */
export async function getTransactionRetryStatus(txId: string): Promise<{
  attemptsRemaining: number;
  nextRetryIn?: number;
  shouldRetry: boolean;
}> {
  try {
    const pending = await getPendingTransactions();
    const tx = pending.find((t) => t.id === txId);

    if (!tx) {
      return {
        attemptsRemaining: 0,
        shouldRetry: false,
      };
    }

    const attemptsRemaining = Math.max(
      0,
      MAX_BROADCAST_ATTEMPTS - (tx.broadcastAttempts || 0),
    );
    const shouldRetry = attemptsRemaining > 0 && tx.status === "pending";

    return {
      attemptsRemaining,
      shouldRetry,
    };
  } catch (err) {
    log.error("Failed to get retry status", err);
    return {
      attemptsRemaining: 0,
      shouldRetry: false,
    };
  }
}

export default {
  broadcastTransaction,
  syncPendingTransactions,
  getTransactionRetryStatus,
};

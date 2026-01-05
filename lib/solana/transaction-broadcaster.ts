/**
 * Transaction Broadcaster
 *
 * Handles re-broadcasting pending transactions to Solana RPC
 * with retry logic, exponential backoff, and error recovery
 *
 * Flow:
 * 1. When app comes online, check for pending transactions
 * 2. For each pending tx: attempt broadcast
 * 3. If success: mark as confirmed
 * 4. If failure: increment retry count
 * 5. If max retries exceeded: mark as failed
 * 6. Otherwise: retry with exponential backoff
 */

import { clusterApiUrl, Connection } from "@solana/web3.js";
import {
  getPendingTransactions,
  markAsBroadcasting,
  markAsConfirmed,
  markAsFailed,
} from "../storage/offline-queue";
import { TransactionIntent } from "../storage/types";

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
 * Broadcast a transaction to Solana RPC
 * Handles errors and retries with exponential backoff
 */
export async function broadcastTransaction(
  tx: TransactionIntent,
  retryAttempt = 0
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

    const url = clusterApiUrl("devnet");
    const conn = new Connection(url, "confirmed");

    // Attempt to confirm the transaction on-chain
    try {
      const confirmation = await conn.confirmTransaction(
        tx.onchainSignature || tx.signature,
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed on-chain: ${confirmation.value.err}`
        );
      }

      // Success - mark as confirmed
      await markAsConfirmed(
        tx.id,
        tx.onchainSignature || tx.signature,
        tx.blockHash || "",
        tx.slot || 0
      );
      return {
        success: true,
        signature: tx.onchainSignature || tx.signature,
      };
    } catch (confirmErr) {
      // If confirmation fails, could be a network issue or actual failure
      // Treat as retriable for now
      throw new Error(
        `Confirmation failed: ${confirmErr instanceof Error ? confirmErr.message : String(confirmErr)}`
      );
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retriesLeft = MAX_BROADCAST_ATTEMPTS - retryAttempt - 1;

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
      RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, retryAttempt)
    );

    console.warn(
      `Broadcast attempt ${retryAttempt + 1}/${MAX_BROADCAST_ATTEMPTS} failed for tx ${tx.id}. Retrying in ${delayMs}ms: ${error}`
    );

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Recursive retry
    return broadcastTransaction(tx, retryAttempt + 1);
  }
}

/**
 * Sync all pending transactions to Solana
 * Broadcast each pending tx and track results
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

    console.info(`Syncing ${pending.length} pending transactions...`);

    const results = {
      total: pending.length,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      errors: [] as { txId: string; error: string }[],
    };

    // Broadcast each transaction
    const broadcastPromises = pending.map(async (tx) => {
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

      return result;
    });

    await Promise.allSettled(broadcastPromises);

    console.info(
      `Sync complete: ${results.confirmed} confirmed, ${results.failed} failed, ${results.stillPending} still pending`
    );

    return results;
  } catch (err) {
    console.error("Failed to sync pending transactions:", err);
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
      MAX_BROADCAST_ATTEMPTS - (tx.broadcastAttempts || 0)
    );
    const shouldRetry = attemptsRemaining > 0 && tx.status === "pending";

    return {
      attemptsRemaining,
      shouldRetry,
    };
  } catch (err) {
    console.error("Failed to get retry status:", err);
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

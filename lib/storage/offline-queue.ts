/**
 * Offline Transaction Queue
 *
 * Stores pending transactions locally when offline
 * Transactions are queued as signed intents until device reconnects
 *
 * Flow:
 * 1. User creates transaction offline
 * 2. Transaction is encrypted and signed
 * 3. Stored locally as pending
 * 4. When online, attempt to push to Solana
 * 5. On success, mark as confirmed
 * 6. On failure, keep as pending for retry
 */

import * as SecureStore from "expo-secure-store";
import { log } from "../utils/logger";
import { TransactionIntent } from "./types";
import { canCreateTransaction, incrementTransactionCount } from "../subscription/subscription-manager";
import { getSubscriptionTier } from "../subscription/subscription-manager";
import { calculateBroadcastFee } from "../subscription/fee-calculator";

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_PREFIX = "zypp_tx_";
const PENDING_TRANSACTIONS_LIST = "zypp_pending_tx_list";
const TX_EXPIRY_WINDOW = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// TRANSACTION QUEUE API
// ============================================================================

/**
 * Queue a new offline transaction
 * Checks subscription limits and calculates fees before queuing
 */
export async function queueOfflineTransaction(params: {
  type: "payment" | "swap" | "nft_transfer" | "yield_deposit" | "yield_withdraw" | "lend" | "borrow" | "repay" | "swap_intent";
  sender: string;
  recipient: string;
  amount: bigint;
  token: string;
  encryptedPayload: string; // Already encrypted
  signature: string; // Already signed
  nonce: string;
  memo?: string;
  defiProtocol?: string;
  defiAction?: string;
}): Promise<string> {
  // Check subscription limits before queuing
  const canCreate = await canCreateTransaction();
  if (!canCreate.allowed) {
    throw new Error(canCreate.reason || "Transaction limit exceeded");
  }

  // Get subscription tier and calculate fee
  const tier = await getSubscriptionTier();
  const feeInfo = await calculateBroadcastFee(params.amount, tier, params.token);

  const transactionId = generateUUID();
  const now = Date.now();

  const intent: TransactionIntent = {
    id: transactionId,
    type: params.type,
    sender: params.sender,
    recipient: params.recipient,
    amount: params.amount,
    token: params.token,
    encryptedPayload: params.encryptedPayload,
    signature: params.signature,
    nonce: params.nonce,
    status: "signed",
    createdAt: now,
    expiresAt: now + TX_EXPIRY_WINDOW,
    broadcastAttempts: 0,
    memo: params.memo,
    intentVersion: 1,
    connectivity: "bluetooth", // default connectivity method
    // Subscription and fee metadata
    feeAmount: feeInfo.feeAmount,
    feePercentage: feeInfo.feePercentage,
    feeCapped: feeInfo.feeCapped,
    subscriptionTier: tier,
    // DeFi metadata
    defiProtocol: params.defiProtocol,
    defiAction: params.defiAction,
  };

  // Store transaction
  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${transactionId}`,
    JSON.stringify(intent),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );

  // Add to pending list
  await addToPendingList(transactionId);

  // Increment transaction count
  await incrementTransactionCount();

  log.info("Transaction queued with fee", {
    transactionId,
    tier,
    feeAmount: feeInfo.feeAmount.toString(),
    feeUsd: feeInfo.feeUsd.toFixed(2),
    feeCapped: feeInfo.feeCapped,
  });

  return transactionId;
}

/**
 * Get pending transactions
 */
export async function getPendingTransactions(): Promise<TransactionIntent[]> {
  try {
    const pendingListJson = await SecureStore.getItemAsync(
      PENDING_TRANSACTIONS_LIST
    );
    if (!pendingListJson) {
      return [];
    }

    const pendingIds = JSON.parse(pendingListJson) as string[];
    const transactions: TransactionIntent[] = [];

    for (const id of pendingIds) {
      const txJson = await SecureStore.getItemAsync(
        `${STORAGE_KEY_PREFIX}${id}`
      );
      if (txJson) {
        transactions.push(JSON.parse(txJson));
      }
    }

    return transactions;
  } catch (error) {
    log.error("Error getting pending transactions", error);
    return [];
  }
}

/**
 * Get a single transaction by ID
 */
export async function getTransaction(
  id: string
): Promise<TransactionIntent | null> {
  try {
    const txJson = await SecureStore.getItemAsync(`${STORAGE_KEY_PREFIX}${id}`);
    if (!txJson) {
      return null;
    }
    return JSON.parse(txJson);
  } catch (error) {
    log.error("Error retrieving transaction", error, { transactionId: id });
    return null;
  }
}

/**
 * Mark transaction as broadcasting
 */
export async function markAsUploading(id: string): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "broadcasting";
  tx.broadcastAttempts += 1;
  tx.lastBroadcastAt = Date.now();

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );
}

/**
 * Mark transaction as confirmed (settled on-chain)
 */
export async function markAsConfirmed(
  id: string,
  onchainSignature: string,
  blockHash: string,
  slot: number
): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "confirmed";
  tx.onchainSignature = onchainSignature;
  tx.blockHash = blockHash;
  tx.slot = slot;

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );

  // Remove from pending list
  await removeFromPendingList(id);
}

/**
 * Mark transaction as failed
 */
export async function markAsFailed(id: string, reason: string): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "failed";

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );

  // Keep in pending for manual retry
}

/**
 * Mark transaction as broadcasting (in-flight to RPC)
 */
export async function markAsBroadcasting(id: string): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "broadcasting";
  tx.broadcastAttempts = (tx.broadcastAttempts || 0) + 1;
  tx.lastBroadcastAt = Date.now();

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );
}

/**
 * Mark transaction as expired
 */
export async function markAsExpired(id: string): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "expired";

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );

  // Remove from pending
  await removeFromPendingList(id);
}

/**
 * Clean up expired transactions
 */
export async function cleanupExpiredTransactions(): Promise<void> {
  const now = Date.now();
  const pending = await getPendingTransactions();

  for (const tx of pending) {
    if (now > tx.expiresAt && tx.status !== "confirmed") {
      await markAsExpired(tx.id);
    }
  }
}

/**
 * Retry a failed transaction
 */
export async function retryTransaction(id: string): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) {
    throw new Error(`Transaction ${id} not found`);
  }

  tx.status = "signed"; // Reset to signed state
  tx.broadcastAttempts = 0;

  await SecureStore.setItemAsync(
    `${STORAGE_KEY_PREFIX}${id}`,
    JSON.stringify(tx),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    }
  );
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(id: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`${STORAGE_KEY_PREFIX}${id}`);
    await removeFromPendingList(id);
  } catch (error) {
    log.error("Error deleting transaction", error, { transactionId: id });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add transaction ID to pending list
 */
async function addToPendingList(id: string): Promise<void> {
  try {
    const listJson = await SecureStore.getItemAsync(PENDING_TRANSACTIONS_LIST);
    const list = listJson ? JSON.parse(listJson) : [];

    if (!list.includes(id)) {
      list.push(id);
      await SecureStore.setItemAsync(
        PENDING_TRANSACTIONS_LIST,
        JSON.stringify(list),
        {
          keychainAccessible: SecureStore.WHEN_UNLOCKED,
        }
      );
    }
  } catch (error) {
    log.error("Error adding to pending list", error, { transactionId: id });
  }
}

/**
 * Remove transaction ID from pending list
 */
async function removeFromPendingList(id: string): Promise<void> {
  try {
    const listJson = await SecureStore.getItemAsync(PENDING_TRANSACTIONS_LIST);
    if (!listJson) return;

    const list = JSON.parse(listJson) as string[];
    const filtered = list.filter((txId) => txId !== id);

    await SecureStore.setItemAsync(
      PENDING_TRANSACTIONS_LIST,
      JSON.stringify(filtered),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      }
    );
  } catch (error) {
    log.error("Error removing from pending list", error, { transactionId: id });
  }
}

// ============================================================================
// EXPORT API
// ============================================================================

export const OfflineTransactionQueue = {
  queueOfflineTransaction,
  getPendingTransactions,
  getTransaction,
  markAsUploading,
  markAsConfirmed,
  markAsFailed,
  markAsExpired,
  cleanupExpiredTransactions,
  retryTransaction,
  deleteTransaction,
};

export default OfflineTransactionQueue;

/**
 * Intent Builder
 *
 * Constructs unsigned TransactionIntent objects with ALL required fields
 * This is the core of the offline-first send flow
 *
 * Flow:
 * 1. Validate inputs (amount, recipient, token)
 * 2. Build unsigned intent with all required fields
 * 3. Return intent ready for encryption and signing
 *
 * CRITICAL: Every field from TransactionIntent is REQUIRED and DEMANDED
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ConnectivityMethod,
  TransactionIntent,
  TransactionType,
} from "../storage/types";

/**
 * Parameters for building an intent
 */
export interface BuildIntentParams {
  // Transaction details (REQUIRED - ALL PARAMS DEMANDED)
  type: TransactionType; // "payment" | "swap" | "nft_transfer"
  sender: string; // Solana public key of sender
  recipient: string; // Solana public key of recipient
  amount: bigint; // Amount in smallest units (lamports for SOL)
  token: string; // Token mint or "SOL"
  connectivity: ConnectivityMethod; // "bluetooth" | "nfc" | "mesh" | "unknown"
  memo?: string; // Optional memo/note for transaction
}

/**
 * Build an UNSIGNED transaction intent
 * All fields are populated - NONE are left empty
 *
 * @param params All required parameters (DEMANDED - NONE OPTIONAL)
 * @returns Unsigned TransactionIntent ready for encryption + signing
 */
export function buildTransactionIntent(
  params: BuildIntentParams
): TransactionIntent {
  const { type, sender, recipient, amount, token, connectivity, memo } = params;

  // Validate required fields
  if (!type || !sender || !recipient || amount === undefined || !token) {
    throw new Error(
      "Missing required intent parameters: type, sender, recipient, amount, token"
    );
  }

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  // Generate unique ID for this intent
  const id = uuidv4();
  const now = Date.now();

  // Create unsigned intent with ALL fields populated (NOTHING left undefined)
  const intent: TransactionIntent = {
    // Required fields (DEMANDED - ALL PROVIDED)
    id,
    intentVersion: 1, // Version for future migrations
    type, // Transaction type: payment, swap, nft_transfer
    sender, // Sender public key
    recipient, // Recipient public key
    amount, // Amount in smallest units
    token, // Token mint address or "SOL"
    connectivity, // Delivery method: bluetooth, nfc, mesh, unknown

    // Encryption/Signing (populated during signing phase)
    encryptedPayload: "", // Will be encrypted after signing
    signature: "", // Will be signed by biometric
    nonce: "", // Will be generated during signing

    // Status tracking
    status: "pending", // Initial status before signing
    createdAt: now, // Timestamp of intent creation
    expiresAt: now + 5 * 60 * 1000, // Expires in 5 minutes
    broadcastAttempts: 0, // Not yet broadcast

    // Optional fields with defaults
    memo: memo || undefined, // Optional note
    lastBroadcastAt: undefined, // Not yet broadcast
    onchainSignature: undefined, // Not yet confirmed on-chain
    blockHash: undefined, // Not yet confirmed
    slot: undefined, // Not yet confirmed
  };

  return intent;
}

/**
 * Validate a TransactionIntent has all required fields
 */
export function validateIntent(intent: TransactionIntent): boolean {
  const requiredFields = [
    "id",
    "intentVersion",
    "type",
    "sender",
    "recipient",
    "amount",
    "token",
    "connectivity",
    "status",
    "createdAt",
    "expiresAt",
    "broadcastAttempts",
  ];

  for (const field of requiredFields) {
    if (!(field in intent) || (intent as any)[field] === undefined) {
      console.warn(`Intent missing required field: ${field}`);
      return false;
    }
  }

  return true;
}

/**
 * Check if an intent has expired
 */
export function isIntentExpired(intent: TransactionIntent): boolean {
  return Date.now() > intent.expiresAt;
}

/**
 * Calculate total amount including fee
 */
export function calculateTotalWithFee(
  intent: TransactionIntent,
  fee: bigint = BigInt(5000)
): bigint {
  return intent.amount + fee;
}

export default {
  buildTransactionIntent,
  validateIntent,
  isIntentExpired,
  calculateTotalWithFee,
};

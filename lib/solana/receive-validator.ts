/**
 * Receive Intent Validator
 *
 * Validates and processes intents received from other devices
 * Checks for fraud, expiry, and correctness before displaying to user
 *
 * Flow (10):
 * 1. Receive intent via BLE/NFC/QR
 * 2. Decrypt intent
 * 3. Validate all fields
 * 4. Check expiry
 * 5. Check sender reputation (optional)
 * 6. Return validated intent for preview
 */

import { PublicKey } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import type { TransactionIntent } from "../storage/types";
import { decryptIntent } from "./intent-encryption";
import { log } from "../utils/logger";
import { isNonceUsed, validateNonceFormat } from "../storage/nonce-tracker";

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  intent?: TransactionIntent;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  field: string;
  reason: string;
  severity: "critical" | "warning";
}

export interface ReceivedIntentData {
  id: string;
  sender: string;
  recipient: string;
  amount: string;
  token: string;
  type: string;
  encrypted: string;
  version?: number;
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

const VALIDATION_RULES = {
  // Amount limits
  MIN_AMOUNT: BigInt(1),
  MAX_AMOUNT: BigInt("18446744073709551615"), // Max uint64

  // Token validation
  VALID_TOKENS: ["SOL", "USDC", "USDT"],
  VALID_TYPES: ["payment", "swap", "nft_transfer"],

  // Timing
  MAX_INTENT_AGE_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CLOCK_SKEW_MS: 30 * 1000, // 30 seconds clock skew tolerance

  // Public key validation
  SOLANA_KEY_LENGTH: 44, // Base58 encoded public key length
} as const;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a received intent (either encrypted or transparent)
 *
 * @param data Encrypted intent string OR partial TransactionIntent object
 * @param currentTime Current timestamp for expiry check
 * @returns Validation result with intent and any errors
 */
export async function validateReceivedIntent(
  data: string | Partial<TransactionIntent>,
  currentTime: number = Date.now()
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    // ========================================================================
    // STEP 1: RESOLVE INTENT (DECRYPT IF STRING)
    // ========================================================================
    let intent: TransactionIntent;

    if (typeof data === "string") {
      try {
        intent = (await decryptIntent(data)) as TransactionIntent;
      } catch (err) {
        return {
          valid: false,
          errors: [
            {
              field: "encryptedPayload",
              reason: `Decryption failed: ${err}`,
              severity: "critical",
            },
          ],
          warnings: [],
        };
      }
    } else {
      intent = { ...data } as TransactionIntent;
    }

    // Ensure amount is BigInt if it came as a string (from P2P transport)
    if (typeof intent.amount === "string") {
      intent.amount = BigInt(intent.amount);
    }

    // ========================================================================
    // STEP 2: VALIDATE ALL REQUIRED FIELDS
    // ========================================================================

    // Validate ID
    if (!intent.id || typeof intent.id !== "string") {
      errors.push({
        field: "id",
        reason: "Missing or invalid transaction ID",
        severity: "critical",
      });
    }

    // Validate sender
    if (!intent.sender || typeof intent.sender !== "string") {
      errors.push({
        field: "sender",
        reason: "Missing or invalid sender public key",
        severity: "critical",
      });
    } else if (!isValidSolanaPublicKey(intent.sender)) {
      warnings.push(
        `Sender public key format may be invalid: ${intent.sender}`
      );
    }

    // Validate recipient
    if (!intent.recipient || typeof intent.recipient !== "string") {
      errors.push({
        field: "recipient",
        reason: "Missing or invalid recipient public key",
        severity: "critical",
      });
    } else if (!isValidSolanaPublicKey(intent.recipient)) {
      warnings.push(
        `Recipient public key format may be invalid: ${intent.recipient}`
      );
    }

    // Check sender != recipient
    if (intent.sender === intent.recipient) {
      errors.push({
        field: "sender/recipient",
        reason: "Cannot send to yourself",
        severity: "critical",
      });
    }

    // Validate amount
    if (intent.amount === undefined || intent.amount === null) {
      errors.push({
        field: "amount",
        reason: "Missing amount",
        severity: "critical",
      });
    } else {
      const amount = BigInt(intent.amount);

      if (amount <= VALIDATION_RULES.MIN_AMOUNT) {
        errors.push({
          field: "amount",
          reason: `Amount must be greater than 0`,
          severity: "critical",
        });
      }

      if (amount > VALIDATION_RULES.MAX_AMOUNT) {
        errors.push({
          field: "amount",
          reason: `Amount exceeds maximum (${VALIDATION_RULES.MAX_AMOUNT})`,
          severity: "critical",
        });
      }
    }

    // Validate token
    if (!intent.token || typeof intent.token !== "string") {
      errors.push({
        field: "token",
        reason: "Missing or invalid token",
        severity: "critical",
      });
    } else if (
      !(VALIDATION_RULES.VALID_TOKENS as readonly string[]).includes(
        intent.token
      ) &&
      !isSPLTokenMint(intent.token)
    ) {
      warnings.push(`Token not in known list: ${intent.token}`);
    }

    // Validate type
    if (!intent.type || !VALIDATION_RULES.VALID_TYPES.includes(intent.type)) {
      errors.push({
        field: "type",
        reason: `Invalid transaction type: ${intent.type}`,
        severity: "critical",
      });
    }

    // Validate status
    if (intent.status !== "signed" && intent.status !== "pending") {
      warnings.push(
        `Unexpected transaction status: ${intent.status} (expected: signed or pending)`
      );
    }

    // ========================================================================
    // STEP 3: CHECK EXPIRY
    // ========================================================================
    if (intent.expiresAt) {
      const age = currentTime - intent.createdAt;
      const isExpired = currentTime > intent.expiresAt;

      if (isExpired) {
        errors.push({
          field: "expiresAt",
          reason: `Intent has expired (${Math.round(age / 1000)} seconds old)`,
          severity: "critical",
        });
      } else if (age > VALIDATION_RULES.MAX_INTENT_AGE_MS) {
        warnings.push(
          `Intent is ${Math.round(age / 1000)} seconds old (max recommended: ${VALIDATION_RULES.MAX_INTENT_AGE_MS / 1000}s)`
        );
      }
    }

    // ========================================================================
    // STEP 4: CHECK CLOCK SKEW
    // ========================================================================
    if (intent.createdAt) {
      const clockSkew = Math.abs(currentTime - intent.createdAt);
      if (clockSkew > VALIDATION_RULES.MAX_CLOCK_SKEW_MS) {
        warnings.push(
          `Large clock skew detected (${Math.round(clockSkew / 1000)}s). Your device clock may be out of sync.`
        );
      }
    }

    // ========================================================================
    // STEP 5: VALIDATE NONCE (REPLAY PROTECTION)
    // ========================================================================
    if (intent.nonce) {
      // Validate nonce format (64 hex chars = 32 bytes)
      if (!validateNonceFormat(intent.nonce)) {
        errors.push({
          field: "nonce",
          reason: "Invalid nonce format - must be 64 hex characters (32 bytes)",
          severity: "critical",
        });
      } else {
        // Check if nonce has been used before (replay attack detection)
        const nonceUsed = await isNonceUsed(intent.nonce);
        if (nonceUsed) {
          errors.push({
            field: "nonce",
            reason: "Nonce has already been used - possible replay attack",
            severity: "critical",
          });
        }
      }
    } else {
      errors.push({
        field: "nonce",
        reason: "Missing nonce - required for replay protection",
        severity: "critical",
      });
    }

    // ========================================================================
    // STEP 6: VERIFY SIGNATURE
    // ========================================================================
    if (intent.signature && intent.sender) {
      const isValid = verifyIntentSignature(intent);
      if (!isValid) {
        errors.push({
          field: "signature",
          reason: "Invalid transaction signature",
          severity: "critical",
        });
      }
    } else {
      errors.push({
        field: "signature",
        reason: "Missing signature or sender public key",
        severity: "critical",
      });
    }

    // ========================================================================
    // RETURN RESULT
    // ========================================================================
    const isValid = errors.length === 0;

    return {
      valid: isValid,
      intent: isValid ? (intent as TransactionIntent) : undefined,
      errors,
      warnings,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          field: "general",
          reason: `Validation failed: ${err}`,
          severity: "critical",
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Validate a fully formed TransactionIntent
 * (lighter validation than encrypted data)
 */
export function validateIntent(intent: TransactionIntent): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Check all required fields are present
  const requiredFields = [
    "id",
    "sender",
    "recipient",
    "amount",
    "token",
    "type",
    "createdAt",
    "expiresAt",
    "status",
    "nonce", // Nonce is required for replay protection
    "signature", // Signature is required for authentication
  ];

  for (const field of requiredFields) {
    if (!(field in intent) || (intent as any)[field] === undefined || (intent as any)[field] === "") {
      errors.push({
        field,
        reason: `Missing required field: ${field}`,
        severity: "critical",
      });
    }
  }

  // Validate nonce format and check for replay attacks
  if (intent.nonce) {
    if (!validateNonceFormat(intent.nonce)) {
      errors.push({
        field: "nonce",
        reason: "Invalid nonce format - must be 64 hex characters (32 bytes)",
        severity: "critical",
      });
    }
  }

  // Validate specific fields
  if (!isValidSolanaPublicKey(intent.sender)) {
    warnings.push(`Invalid sender public key format: ${intent.sender}`);
  }

  if (!isValidSolanaPublicKey(intent.recipient)) {
    warnings.push(`Invalid recipient public key format: ${intent.recipient}`);
  }

  if (intent.amount <= 0) {
    errors.push({
      field: "amount",
      reason: "Amount must be greater than 0",
      severity: "critical",
    });
  }

  if (!VALIDATION_RULES.VALID_TYPES.includes(intent.type)) {
    errors.push({
      field: "type",
      reason: `Invalid type: ${intent.type}`,
      severity: "critical",
    });
  }

  return {
    valid: errors.length === 0,
    intent: errors.length === 0 ? intent : undefined,
    errors,
    warnings,
  };
}

/**
 * Verify the Ed25519 signature of an intent
 */
export function verifyIntentSignature(intent: TransactionIntent): boolean {
  try {
    if (!intent.signature || !intent.sender) return false;

    // 1. Re-create canonical bytes (MUST MATCH sender's serialization)
    const canonical = {
      type: intent.type,
      sender: intent.sender,
      recipient: intent.recipient,
      amount: intent.amount.toString(),
      token: intent.token,
      createdAt: intent.createdAt,
      id: intent.id,
      nonce: intent.nonce,
    };

    const jsonStr = JSON.stringify(canonical);
    const intentBytes = new TextEncoder().encode(jsonStr);

    // 2. Decode signature and public key
    const signatureBytes = base64ToBytes(intent.signature);
    
    // Solana sender is Base58, we need to convert to Uint8Array for nacl
    const publicKeyBytes = new PublicKey(intent.sender).toBytes();
    
    return nacl.sign.detached.verify(intentBytes, signatureBytes, publicKeyBytes);
  } catch (err) {
    console.error("Signature verification failed:", err);
    log.error("Signature verification failed", err);
    return false;
  }
}

/**
 * Base64 decoder helper
 */
function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if a string is a valid Solana public key
 */
function isValidSolanaPublicKey(key: string): boolean {
  if (typeof key !== "string") return false;
  if (key.length < 40 || key.length > 50) return false;

  // Base58 validation: no 0, O, I, l
  const base58Regex = /^[1-9A-HJ-NP-Z]+$/;
  return base58Regex.test(key);
}

/**
 * Check if a string is a valid SPL token mint
 * (also a base58 public key, ~44 characters)
 */
function isSPLTokenMint(mint: string): boolean {
  return isValidSolanaPublicKey(mint);
}

/**
 * Format validation errors for user display
 */
export function formatValidationErrors(result: ValidationResult): string {
  const criticErrors = result.errors.filter((e) => e.severity === "critical");

  if (criticErrors.length === 0) return "";

  return criticErrors.map((err) => `${err.field}: ${err.reason}`).join("\n");
}

/**
 * Format validation warnings for user display
 */
export function formatValidationWarnings(result: ValidationResult): string {
  if (result.warnings.length === 0) return "";
  return result.warnings.join("\n");
}

export default {
  validateReceivedIntent,
  validateIntent,
  formatValidationErrors,
  formatValidationWarnings,
};

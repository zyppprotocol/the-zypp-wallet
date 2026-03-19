/**
 * Biometric Intent Signing
 *
 * Signs transaction intents with biometric authentication
 *
 * Flow (9.3):
 * 1. Biometric prompt (Face ID / Touch ID)
 * 2. Decrypt private key in memory (only during signing window)
 * 3. Sign intent using private key
 * 4. Immediately wipe key from memory
 * 5. Re-encrypt signed payload
 *
 * Security properties:
 * - Private key NEVER written to disk
 * - Private key only in memory during signing (~1 second)
 * - Buffer zeroed immediately after use
 * - Biometric gates access to signing
 */

import * as nacl from "tweetnacl";
import { authenticateWithBiometric } from "../storage/biometric";
import { unlockWithPin } from "../storage/secure-storage";
import { log } from "../utils/logger";
import type { TransactionIntent } from "../storage/types";
import { encryptIntent } from "./intent-encryption";

// ============================================================================
// TYPES
// ============================================================================

export interface SigningResult {
  success: boolean;
  signedIntent?: TransactionIntent; // Intent with signature populated
  error?: string;
  signingTime?: number; // Time taken to sign (ms)
}

// ============================================================================
// BIOMETRIC SIGNING FLOW (9.3)
// ============================================================================

/**
 * Sign a transaction intent with biometric authentication
 *
 * Steps:
 * 1. Prompt for biometric authentication
 * 2. If biometric fails or unavailable → fallback to PIN
 * 3. Unlock wallet with PIN/biometric
 * 4. Decrypt private key (minimal window)
 * 5. Sign intent bytes
 * 6. Wipe private key immediately
 * 7. Encrypt signed payload
 * 8. Return signed intent
 *
 * @param unsignedIntent Intent that has been encrypted but not yet signed
 * @param biometricReason Custom message for biometric prompt
 * @returns Signed intent ready for storage/transmission
 */
export async function signIntentWithBiometric(
  unsignedIntent: TransactionIntent,
  biometricReason: string = "Sign transaction to send funds"
): Promise<SigningResult> {
  const startTime = Date.now();

  try {
    // ========================================================================
    // STEP 1: ATTEMPT BIOMETRIC AUTHENTICATION
    // ========================================================================
    log.info("Attempting biometric authentication...");

    const bioResult = await authenticateWithBiometric(biometricReason);

    // ========================================================================
    // STEP 2: HANDLE BIOMETRIC RESULT OR FALLBACK TO PIN
    // ========================================================================
    if (bioResult.success) {
      // Biometric succeeded
      log.info(
        `Biometric authenticated`,
        undefined,
        { biometricUsed: bioResult.biometricUsed || "unknown" }
      );
      return await signWithBiometricPin(unsignedIntent, startTime);
    } else {
      // Biometric failed or unavailable - fallback to PIN
      log.warn(
        `Biometric unavailable or failed: ${bioResult.error}. Falling back to PIN.`,
        undefined,
        { error: bioResult.error }
      );
      return {
        success: false,
        error: `Biometric authentication failed: ${bioResult.error}. Please use PIN instead.`,
        signingTime: Date.now() - startTime,
      };
    }
  } catch (err) {
    log.error("Signing error", err);
    return {
      success: false,
      error: `Signing failed: ${err}`,
      signingTime: Date.now() - startTime,
    };
  }
}

/**
 * Sign intent with biometric PIN (internal)
 */
async function signWithBiometricPin(
  unsignedIntent: TransactionIntent,
  startTime: number
): Promise<SigningResult> {
  let privateKey: Uint8Array | null = null;

  try {
    // ====================================================================
    // STEP 1: GET BIOMETRIC PIN
    // ====================================================================
    const biometricPin = await getStoredBiometricPin();

    if (!biometricPin) {
      return {
        success: false,
        error: "No biometric PIN configured. Please set up biometrics first.",
        signingTime: Date.now() - startTime,
      };
    }

    // ====================================================================
    // STEP 2: DECRYPT PRIVATE KEY (MINIMAL WINDOW)
    // ====================================================================
    log.debug("Decrypting private key with biometric PIN...");

    privateKey = await unlockWithPin(biometricPin);

    if (!privateKey || privateKey.length === 0) {
      return {
        success: false,
        error: "Failed to decrypt private key",
        signingTime: Date.now() - startTime,
      };
    }

    // ====================================================================
    // STEP 3: SIGN INTENT
    // ====================================================================
    log.debug("Signing intent...");

    // Generate random nonce for replay protection (9.4: Nonce Generation)
    const nonceBytes = nacl.randomBytes(32);
    const nonceHex = Buffer.from(nonceBytes).toString('hex');
    
    // Create intent copy with nonce
    const intentWithNonce = {
      ...unsignedIntent,
      nonce: nonceHex,
    };

    const intentBytes = serializeIntentForSigning(intentWithNonce);
    const signature = nacl.sign.detached(intentBytes, privateKey);

    if (!signature) {
      return {
        success: false,
        error: "Signing failed",
        signingTime: Date.now() - startTime,
      };
    }

    // ====================================================================
    // STEP 4: WIPE PRIVATE KEY IMMEDIATELY
    // ====================================================================
    log.debug("Wiping private key from memory...");
    if (privateKey && privateKey.length > 0) {
      privateKey.fill(0);
    }
    privateKey = null;

    // ====================================================================
    // STEP 5: POPULATE SIGNED INTENT
    // ====================================================================
    const signedIntent: TransactionIntent = {
      ...unsignedIntent,
      status: "signed",
      nonce: nonceHex, // Include the generated nonce
      signature: bytesToBase64(new Uint8Array(signature)),
      lastBroadcastAt: Date.now(),
    };

    // ====================================================================
    // STEP 6: ENCRYPT SIGNED PAYLOAD
    // ====================================================================
    log.debug("Encrypting signed intent...");
    const encryptedPayload = await encryptIntent(signedIntent);
    signedIntent.encryptedPayload = encryptedPayload;

    log.info(`Intent signed successfully`, undefined, {
      signingTime: Date.now() - startTime,
    });

    return {
      success: true,
      signedIntent,
      signingTime: Date.now() - startTime,
    };
  } finally {
    if (privateKey && privateKey.length > 0) {
      log.warn("Force-wiping private key in finally block");
      privateKey.fill(0);
    }
  }
}

/**
 * Sign intent with PIN fallback (when biometric unavailable)
 *
 * Used when:
 * - Device biometrics fail
 * - User prefers PIN
 * - Biometrics not configured
 */
export async function signIntentWithPin(
  unsignedIntent: TransactionIntent,
  pin: string
): Promise<SigningResult> {
  const startTime = Date.now();

  try {
    // ====================================================================
    // STEP 1: VALIDATE PIN
    // ====================================================================
    if (!pin || pin.length < 4) {
      return {
        success: false,
        error: "PIN must be at least 4 digits",
        signingTime: Date.now() - startTime,
      };
    }

    // ====================================================================
    // STEP 2: DECRYPT PRIVATE KEY
    // ====================================================================
    log.debug("Decrypting private key with PIN...");

    let privateKey: Uint8Array | null = null;

    try {
      privateKey = await unlockWithPin(pin);

      if (!privateKey || privateKey.length === 0) {
        return {
          success: false,
          error: "Invalid PIN or failed to decrypt key",
          signingTime: Date.now() - startTime,
        };
      }

      // ====================================================================
      // STEP 3: SIGN INTENT
      // ====================================================================
      log.debug("Signing intent with PIN...");

      // Generate random nonce for replay protection
      const nonceBytes = nacl.randomBytes(32);
      const nonceHex = Buffer.from(nonceBytes).toString('hex');

      const intentWithNonce = {
        ...unsignedIntent,
        nonce: nonceHex,
      };

      const intentBytes = serializeIntentForSigning(intentWithNonce);
      const signature = nacl.sign.detached(intentBytes, privateKey);

      if (!signature) {
        return {
          success: false,
          error: "Signing failed",
          signingTime: Date.now() - startTime,
        };
      }

      // ====================================================================
      // STEP 4: WIPE PRIVATE KEY
      // ====================================================================
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
      privateKey = null;

      // ====================================================================
      // STEP 5: CREATE SIGNED INTENT
      // ====================================================================
      const signedIntent: TransactionIntent = {
        ...unsignedIntent,
        status: "signed",
        nonce: nonceHex,
        signature: bytesToBase64(new Uint8Array(signature)),
        lastBroadcastAt: Date.now(),
      };

      // ====================================================================
      // STEP 6: ENCRYPT SIGNED PAYLOAD
      // ====================================================================
      const encryptedPayload = await encryptIntent(signedIntent);
      signedIntent.encryptedPayload = encryptedPayload;

      return {
        success: true,
        signedIntent,
        signingTime: Date.now() - startTime,
      };
    } finally {
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
    }
  } catch (err) {
    log.error("PIN signing error", err);
    return {
      success: false,
      error: `PIN signing failed: ${err}`,
      signingTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Serialize intent for signing
 * Uses a consistent format so signature can be verified
 */
function serializeIntentForSigning(intent: TransactionIntent): Uint8Array {
  // Create canonical representation for signing
  const canonical = {
    type: intent.type,
    sender: intent.sender,
    recipient: intent.recipient,
    amount: intent.amount.toString(),
    token: intent.token,
    createdAt: intent.createdAt,
    id: intent.id,
    nonce: intent.nonce, // Crucial for replay protection
  };

  const jsonStr = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  return encoder.encode(jsonStr);
}

/**
 * Retrieve stored biometric PIN from secure storage
 * This is set up during wallet initialization
 */
async function getStoredBiometricPin(): Promise<string | null> {
  try {
    // Import at function level to avoid circular dependencies
    const { getBiometricPin } = await import("../storage/secure-storage");
    const pin = await getBiometricPin();
    return pin;
  } catch (err) {
    log.warn("Failed to retrieve biometric PIN", err);
    return null;
  }
}

/**
 * Convert Uint8Array to base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return btoa(result);
}

export default {
  signIntentWithBiometric,
  signIntentWithPin,
};

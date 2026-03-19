/**
 * Transaction Signer
 * 
 * Production-ready Solana transaction signing using wallet's private key
 * Integrates with biometric/PIN authentication for secure signing
 */

import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { SecureStorage } from "../storage/secure-storage";
import { signIntentWithBiometric, signIntentWithPin } from "./biometric-signing";
import { log } from "../utils/logger";
import * as nacl from "tweetnacl";

/**
 * Sign a Solana Transaction using biometric authentication
 * This is the production-ready signing flow
 */
export async function signTransactionWithBiometric(
  transaction: Transaction | VersionedTransaction,
  biometricReason: string = "Sign transaction to send funds"
): Promise<{
  success: boolean;
  signedTransaction?: Transaction | VersionedTransaction;
  error?: string;
}> {
  try {
    // Get user's public key to verify we're signing with the right wallet
    const publicKeyBytes = await SecureStorage.getPublicKey().catch(() => null);
    if (!publicKeyBytes) {
      return {
        success: false,
        error: "Wallet not initialized",
      };
    }
    const publicKeyBase58 = new PublicKey(publicKeyBytes).toBase58();

    // Create a transaction intent for signing (we'll extract the signature)
    // This allows us to use the existing biometric signing infrastructure
    const { PublicKey } = await import("@solana/web3.js");
    const senderPubkey = new PublicKey(publicKeyBase58);
    
    // Verify transaction fee payer matches wallet
    if (transaction instanceof Transaction) {
      if (transaction.feePayer && !transaction.feePayer.equals(senderPubkey)) {
        return {
          success: false,
          error: "Transaction fee payer does not match wallet",
        };
      }
      transaction.feePayer = senderPubkey;
    }

    // Serialize transaction for signing
    const message = transaction.serializeMessage();
    
    // Get private key via biometric authentication
    // We'll use the unlock flow but need to sign the transaction bytes directly
    const { unlockWithPin } = await import("../storage/secure-storage");
    const { getStoredBiometricPin, authenticateWithBiometric } = await import(
      "../storage/biometric"
    );
    
    const biometricPin = await getStoredBiometricPin();
    if (!biometricPin) {
      return {
        success: false,
        error: "Biometric authentication required",
      };
    }

    // CRITICAL: enforce an actual biometric prompt before unlocking/signing.
    const bioResult = await authenticateWithBiometric(biometricReason);
    if (!bioResult.success) {
      return {
        success: false,
        error: bioResult.error || "Biometric authentication failed",
      };
    }

    // Unlock private key (minimal window)
    const privateKey = await unlockWithPin(biometricPin);
    if (!privateKey || privateKey.length === 0) {
      return {
        success: false,
        error: "Failed to unlock wallet",
      };
    }

    try {
      // Sign transaction message
      // Solana uses ed25519 signatures (64 bytes)
      const signature = nacl.sign.detached(message, privateKey);
      
      // Add signature to transaction
      if (transaction instanceof Transaction) {
        transaction.addSignature(senderPubkey, Buffer.from(signature));
      } else if (transaction instanceof VersionedTransaction) {
        // VersionedTransaction uses a different signing approach
        // We need to sign with the keypair
        const keypair = Keypair.fromSecretKey(privateKey);
        transaction.sign([keypair]);
      }

      log.info("Transaction signed successfully", {
        signature: Buffer.from(signature).toString("base64").slice(0, 16) + "...",
      });

      return {
        success: true,
        signedTransaction: transaction,
      };
    } finally {
      // CRITICAL: Zero out private key immediately
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
    }
  } catch (error) {
    log.error("Failed to sign transaction with biometric", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sign a Solana Transaction using PIN
 */
export async function signTransactionWithPin(
  transaction: Transaction | VersionedTransaction,
  pin: string
): Promise<{
  success: boolean;
  signedTransaction?: Transaction | VersionedTransaction;
  error?: string;
}> {
  try {
    const { unlockWithPin } = await import("../storage/secure-storage");
    const { PublicKey } = await import("@solana/web3.js");
    
    const publicKeyBytes = await SecureStorage.getPublicKey().catch(() => null);
    if (!publicKeyBytes) {
      return {
        success: false,
        error: "Wallet not initialized",
      };
    }

    const senderPubkey = new PublicKey(publicKeyBytes).toBase58();
    const senderPubkeyObj = new PublicKey(senderPubkey);
    
    if (transaction instanceof Transaction) {
      if (transaction.feePayer && !transaction.feePayer.equals(senderPubkeyObj)) {
        transaction.feePayer = senderPubkeyObj;
      }
    }

    const message = transaction.serializeMessage();
    const privateKey = await unlockWithPin(pin);
    
    if (!privateKey || privateKey.length === 0) {
      return {
        success: false,
        error: "Invalid PIN",
      };
    }

    try {
      const signature = nacl.sign.detached(message, privateKey);
      
      if (transaction instanceof Transaction) {
        transaction.addSignature(senderPubkeyObj, Buffer.from(signature));
      } else {
        const keypair = Keypair.fromSecretKey(privateKey);
        transaction.sign([keypair]);
      }

      return {
        success: true,
        signedTransaction: transaction,
      };
    } finally {
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
    }
  } catch (error) {
    log.error("Failed to sign transaction with PIN", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

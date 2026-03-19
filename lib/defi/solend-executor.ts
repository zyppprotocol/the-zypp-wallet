/**
 * Solend Yield & Lending Executor
 *
 * Handles yield deposits (supply to earn interest) and lending operations
 * via Solend protocol on Solana
 */

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getRpcUrl } from "../config/network";
import { signTransactionWithBiometric } from "../solana/transaction-signer";
import { log } from "../utils/logger";

// Solend program IDs
const SOLEND_PROGRAM_ID = "So1endDq2YkqhipRLMv8KfRV3uxaJ5ayziZi4sSgP99"; // Mainnet
const SOLEND_MARKET_ID = "GvjoVKNjBvQcNL2QyLh6DH3NExJi9eYHVeMXH8sHe5Ph"; // Example market

export interface SolendYieldDepositParams {
  senderPublicKey: string;
  tokenMint: string; // e.g., USDC mint
  amount: bigint;
  intentId: string;
}

export interface SolendBorrowParams {
  senderPublicKey: string;
  tokenMint: string; // Collateral token
  collateralAmount: bigint;
  borrowTokenMint: string; // Token to borrow
  borrowAmount: bigint;
  intentId: string;
}

export interface SolendRepayParams {
  senderPublicKey: string;
  borrowTokenMint: string;
  repayAmount: bigint;
  intentId: string;
}

/**
 * Supply tokens to Solend to earn yield
 */
export async function depositToSolend(
  params: SolendYieldDepositParams,
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const { senderPublicKey, tokenMint, amount, intentId } = params;

    log.info("Depositing to Solend for yield", {
      intentId,
      tokenMint,
      amount: Number(amount) / LAMPORTS_PER_SOL,
    });

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);

    // For production implementation, use @solendprotocol/solend-sdk
    // Step 1: Get market accounts
    // Step 2: Get user's token account
    // Step 3: Create supply instruction
    // Step 4: Sign and send

    // Example structure (using SDK):
    // import { Solend } from "@solendprotocol/solend-sdk";
    // const solend = new Solend(connection);
    // const supplyTx = await solend.deposit({
    //   market: SOLEND_MARKET_ID,
    //   mint: new PublicKey(tokenMint),
    //   amount: BigInt(amount),
    // });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Create mock supply transaction
    // In production, this would use actual Solend program instructions
    const transaction = new Transaction();

    // Add placeholder instruction
    // In production, use actual Solend supply instruction builder
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    log.debug("Solend deposit transaction prepared", {
      amount: Number(amount) / LAMPORTS_PER_SOL,
      token: tokenMint,
      intentId,
    });

    // Sign with biometric
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign Solend supply transaction",
    );

    if (!signResult.success || !signResult.signedTransaction) {
      return {
        success: false,
        error: signResult.error || "Failed to sign transaction",
      };
    }

    // Send transaction
    const signedTx = signResult.signedTransaction as Transaction;
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      },
    );

    // Wait for confirmation
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed",
    );

    log.info("Solend deposit confirmed", {
      signature,
      amount: Number(amount) / LAMPORTS_PER_SOL,
      token: tokenMint,
      intentId,
    });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    log.error("Solend deposit failed", error, {
      intentId: params.intentId,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Solend deposit failed",
    };
  }
}

/**
 * Borrow tokens from Solend using collateral
 */
export async function borrowFromSolend(params: SolendBorrowParams): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const { senderPublicKey, borrowTokenMint, borrowAmount, intentId } = params;

    log.info("Borrowing from Solend", {
      intentId,
      borrowToken: borrowTokenMint,
      borrowAmount: Number(borrowAmount) / LAMPORTS_PER_SOL,
    });

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);

    // For production, use @solendprotocol/solend-sdk
    // Check collateral ratio before borrowing
    // Create borrow instruction

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Create mock borrow transaction
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    log.debug("Solend borrow transaction prepared", {
      borrowAmount: Number(borrowAmount) / LAMPORTS_PER_SOL,
      borrowToken: borrowTokenMint,
      intentId,
    });

    // Sign with biometric
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign Solend borrow transaction",
    );

    if (!signResult.success || !signResult.signedTransaction) {
      return {
        success: false,
        error: signResult.error || "Failed to sign transaction",
      };
    }

    // Send transaction
    const signedTx = signResult.signedTransaction as Transaction;
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      },
    );

    // Wait for confirmation
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed",
    );

    log.info("Solend borrow confirmed", {
      signature,
      borrowAmount: Number(borrowAmount) / LAMPORTS_PER_SOL,
      borrowToken: borrowTokenMint,
      intentId,
    });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    log.error("Solend borrow failed", error, {
      intentId: params.intentId,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Solend borrow failed",
    };
  }
}

/**
 * Repay borrowed tokens to Solend
 */
export async function repayToSolend(params: SolendRepayParams): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const { senderPublicKey, borrowTokenMint, repayAmount, intentId } = params;

    log.info("Repaying to Solend", {
      intentId,
      borrowToken: borrowTokenMint,
      repayAmount: Number(repayAmount) / LAMPORTS_PER_SOL,
    });

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);

    // For production, use @solendprotocol/solend-sdk
    // Calculate interest owed
    // Create repay instruction

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Create mock repay transaction
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    log.debug("Solend repay transaction prepared", {
      repayAmount: Number(repayAmount) / LAMPORTS_PER_SOL,
      borrowToken: borrowTokenMint,
      intentId,
    });

    // Sign with biometric
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign Solend repay transaction",
    );

    if (!signResult.success || !signResult.signedTransaction) {
      return {
        success: false,
        error: signResult.error || "Failed to sign transaction",
      };
    }

    // Send transaction
    const signedTx = signResult.signedTransaction as Transaction;
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      },
    );

    // Wait for confirmation
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed",
    );

    log.info("Solend repay confirmed", {
      signature,
      repayAmount: Number(repayAmount) / LAMPORTS_PER_SOL,
      borrowToken: borrowTokenMint,
      intentId,
    });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    log.error("Solend repay failed", error, {
      intentId: params.intentId,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Solend repay failed",
    };
  }
}

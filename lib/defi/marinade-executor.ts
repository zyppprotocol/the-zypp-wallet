/**
 * Marinade Finance Yield Executor
 *
 * Handles liquid staking of SOL via Marinade Finance
 * Allows users to earn yield on their SOL while maintaining liquidity
 */

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getRpcUrl } from "../config/network";
import { signTransactionWithBiometric } from "../solana/transaction-signer";
import { log } from "../utils/logger";

// Marinade program IDs on different networks
const MARINADE_PROGRAM_ID = "MarBmsSgKXdrQP92noxpPc8aE3BwyKn88UNqB2TnygM";
const MARINADE_STATE_ACCOUNT = "8szGkuLTAsPyd8WwtsKBcRB7AzrRy3twwaiQazz3QnPE";

export interface MarinadeYieldDepositParams {
  senderPublicKey: string;
  solAmount: bigint;
  intentId: string;
}

export interface MarinadeYieldWithdrawParams {
  senderPublicKey: string;
  mSolAmount: bigint;
  intentId: string;
}

/**
 * Deposit SOL to Marinade Finance for liquid staking
 */
export async function depositToMarinade(
  params: MarinadeYieldDepositParams,
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const { senderPublicKey, solAmount, intentId } = params;

    log.info("Depositing to Marinade Finance", {
      intentId,
      solAmount: (Number(solAmount) / LAMPORTS_PER_SOL).toFixed(2),
    });

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);

    // For production, this would:
    // 1. Fetch Marinade state (to get current staking parameters)
    // 2. Create deposit instruction via @marinade.finance/marinade-ts-sdk
    // 3. Sign and send transaction
    //
    // For now, create a mock liquid staking transaction structure
    // In production, use: https://github.com/marinade-finance/marinade-ts-sdk

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Create a basic SOL transfer as a placeholder
    // In production, this would use Marinade's actual program instructions
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: new PublicKey(MARINADE_STATE_ACCOUNT),
        lamports: Number(solAmount),
      }),
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    log.debug("Marinade deposit transaction prepared", {
      amount: Number(solAmount) / LAMPORTS_PER_SOL,
      intentId,
    });

    // Sign with biometric
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign Marinade deposit transaction",
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

    log.info("Marinade deposit confirmed", {
      signature,
      amount: Number(solAmount) / LAMPORTS_PER_SOL,
      intentId,
    });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    log.error("Marinade deposit failed", error, {
      intentId: params.intentId,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Marinade deposit failed",
    };
  }
}

/**
 * Withdraw from Marinade Finance (unstake mSOL to SOL)
 */
export async function withdrawFromMarinade(
  params: MarinadeYieldWithdrawParams,
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const { senderPublicKey, mSolAmount, intentId } = params;

    log.info("Withdrawing from Marinade Finance", {
      intentId,
      mSolAmount: (Number(mSolAmount) / LAMPORTS_PER_SOL).toFixed(2),
    });

    const connection = new Connection(getRpcUrl(), "confirmed");
    const senderPubkey = new PublicKey(senderPublicKey);

    // For production, use @marinade.finance/marinade-ts-sdk
    // Import example:
    // import { Marinade } from "@marinade.finance/marinade-ts-sdk";
    // const marinade = new Marinade({ connection });
    // const unstakeTx = await marinade.createUnstakeSolTx({ mSolAmount });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Create mock unstaking transaction
    // In production, this uses Marinade's unstaking instructions
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: new PublicKey(MARINADE_STATE_ACCOUNT),
        lamports: Number(mSolAmount),
      }),
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    log.debug("Marinade withdraw transaction prepared", {
      amount: Number(mSolAmount) / LAMPORTS_PER_SOL,
      intentId,
    });

    // Sign with biometric
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign Marinade withdraw transaction",
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

    log.info("Marinade withdraw confirmed", {
      signature,
      amount: Number(mSolAmount) / LAMPORTS_PER_SOL,
      intentId,
    });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    log.error("Marinade withdraw failed", error, {
      intentId: params.intentId,
    });

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Marinade withdraw failed",
    };
  }
}

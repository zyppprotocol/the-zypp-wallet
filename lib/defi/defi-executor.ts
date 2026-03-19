/**
 * DeFi Executor
 *
 * Executes DeFi intents when device comes online
 * Handles swaps via Jupiter, yield deposits/withdraws, and lending operations
 */

import { Connection, Transaction } from "@solana/web3.js";
import { getRpcUrl, isMainnet } from "../config/network";
import { signTransactionWithBiometric } from "../solana/transaction-signer";
import type { TransactionIntent } from "../storage/types";
import { log } from "../utils/logger";
import { depositToMarinade, withdrawFromMarinade } from "./marinade-executor";
import { getSwapRate } from "./rate-fetcher";
import {
  borrowFromSolend,
  depositToSolend,
  repayToSolend,
} from "./solend-executor";
import { resolveTokenMint } from "./token-resolver";

/**
 * Execute a swap intent via Jupiter
 */
export async function executeSwapIntent(intent: TransactionIntent): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
  rateChanged?: boolean;
  newAmountOut?: bigint;
}> {
  try {
    // Parse swap details from memo
    let swapDetails: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      minAmountOut?: string;
      slippageBps?: number;
    } | null = null;

    try {
      const memoData = JSON.parse(intent.memo || "{}");
      if (memoData.type === "swap") {
        swapDetails = memoData;
      }
    } catch (error) {
      log.warn("Failed to parse swap details from memo", error);
    }

    if (!swapDetails) {
      return {
        success: false,
        error: "Invalid swap intent: missing swap details",
      };
    }

    // Get current swap rate
    const currentRate = await getSwapRate(
      swapDetails.tokenIn,
      swapDetails.tokenOut,
      BigInt(swapDetails.amountIn),
    );

    // Check if rate changed significantly (more than 5%)
    const originalAmountOut = swapDetails.minAmountOut
      ? BigInt(swapDetails.minAmountOut)
      : currentRate.amountOut;
    const rateChange =
      Math.abs(Number(currentRate.amountOut - originalAmountOut)) /
      Number(originalAmountOut);

    if (rateChange > 0.05) {
      log.warn("Swap rate changed significantly", {
        originalAmountOut: originalAmountOut.toString(),
        currentAmountOut: currentRate.amountOut.toString(),
        rateChange: (rateChange * 100).toFixed(2) + "%",
      });

      return {
        success: false,
        error: `Swap rate changed by ${(rateChange * 100).toFixed(2)}%. Please review and try again.`,
        rateChanged: true,
        newAmountOut: currentRate.amountOut,
      };
    }

    // Execute swap via Jupiter
    const jupiterApiUrl =
      process.env.EXPO_PUBLIC_JUPITER_API_URL || "https://quote-api.jup.ag/v6";
    const swapApiUrl = "https://quote-api.jup.ag/v6/swap";

    // Resolve token symbols to mint addresses (production-ready)
    const network = isMainnet() ? "mainnet" : "devnet";
    const inputMint = resolveTokenMint(swapDetails.tokenIn, network);
    const outputMint = resolveTokenMint(swapDetails.tokenOut, network);

    const quoteUrl = `${jupiterApiUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapDetails.amountIn}&slippageBps=${swapDetails.slippageBps || 50}`;

    const quoteResponse = await fetch(quoteUrl);
    if (!quoteResponse.ok) {
      throw new Error(`Jupiter quote API error: ${quoteResponse.status}`);
    }

    const quote = await quoteResponse.json();

    // Get swap transaction
    const swapResponse = await fetch(swapApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: intent.sender,
        wrapUnwrapSOL: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    if (!swapResponse.ok) {
      throw new Error(`Jupiter swap API error: ${swapResponse.status}`);
    }

    const swapTransaction = await swapResponse.json();
    const transactionBuf = Buffer.from(
      swapTransaction.swapTransaction,
      "base64",
    );
    const transaction = Transaction.from(transactionBuf);

    log.info("Swap transaction prepared, signing...", {
      intentId: intent.id,
      tokenIn: swapDetails.tokenIn,
      tokenOut: swapDetails.tokenOut,
      amountIn: swapDetails.amountIn,
      amountOut: currentRate.amountOut.toString(),
    });

    // Sign transaction using biometric authentication
    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign swap transaction",
    );

    if (!signResult.success || !signResult.signedTransaction) {
      log.error("Failed to sign swap transaction", undefined, {
        intentId: intent.id,
        error: signResult.error,
      });
      return {
        success: false,
        error: signResult.error || "Failed to sign transaction",
        rateChanged: false,
      };
    }

    // Send and confirm transaction
    const connection = new Connection(getRpcUrl(), "confirmed");
    const signedTx = signResult.signedTransaction as Transaction;
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      },
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");

    log.info("Swap transaction confirmed", {
      intentId: intent.id,
      signature,
      amountOut: currentRate.amountOut.toString(),
    });

    return {
      success: true,
      signature,
      rateChanged: false,
      newAmountOut: currentRate.amountOut,
    };
  } catch (error) {
    log.error("Failed to execute swap intent", error, { intentId: intent.id });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a yield deposit intent
 */
export async function executeYieldDepositIntent(
  intent: TransactionIntent,
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const protocol = intent.defiProtocol || "marinade";
    log.info("Executing yield deposit", {
      intentId: intent.id,
      protocol,
      amount: intent.amount.toString(),
      token: intent.token,
    });

    // Route to appropriate protocol executor
    if (protocol === "marinade") {
      return await depositToMarinade({
        senderPublicKey: intent.sender,
        solAmount: intent.amount,
        intentId: intent.id,
      });
    } else if (protocol === "solend") {
      return await depositToSolend({
        senderPublicKey: intent.sender,
        tokenMint:
          intent.token || "So11111111111111111111111111111111111111112", // Default to SOL
        amount: intent.amount,
        intentId: intent.id,
      });
    } else {
      return {
        success: false,
        error: `Unknown yield protocol: ${protocol}. Supported protocols: marinade, solend`,
      };
    }
  } catch (error) {
    log.error("Failed to execute yield deposit", error, {
      intentId: intent.id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a yield withdraw intent
 */
export async function executeYieldWithdrawIntent(
  intent: TransactionIntent,
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const protocol = intent.defiProtocol || "marinade";
    log.info("Executing yield withdraw", {
      intentId: intent.id,
      protocol,
      amount: intent.amount.toString(),
      token: intent.token,
    });

    // Route to appropriate protocol executor
    if (protocol === "marinade") {
      return await withdrawFromMarinade({
        senderPublicKey: intent.sender,
        mSolAmount: intent.amount,
        intentId: intent.id,
      });
    } else if (protocol === "solend") {
      log.info(
        "Solend yield withdrawal requires manual withdrawal via protocol UI",
        {
          intentId: intent.id,
        },
      );
      return {
        success: false,
        error:
          "Solend withdrawals require manual action. Use the Solend protocol directly to withdraw.",
      };
    } else {
      return {
        success: false,
        error: `Unknown yield protocol: ${protocol}. Supported protocols: marinade, solend`,
      };
    }
  } catch (error) {
    log.error("Failed to execute yield withdraw", error, {
      intentId: intent.id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a lending deposit intent
 */
export async function executeLendIntent(intent: TransactionIntent): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const protocol = intent.defiProtocol || "solend";
    log.info("Executing lend", {
      intentId: intent.id,
      protocol,
      amount: intent.amount.toString(),
      token: intent.token,
    });

    // Route to appropriate protocol executor
    if (protocol === "solend") {
      return await depositToSolend({
        senderPublicKey: intent.sender,
        tokenMint:
          intent.token || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wWugQSoWHG33P", // Default to USDC
        amount: intent.amount,
        intentId: intent.id,
      });
    } else {
      return {
        success: false,
        error: `Unknown lending protocol: ${protocol}. Supported protocols: solend`,
      };
    }
  } catch (error) {
    log.error("Failed to execute lend", error, { intentId: intent.id });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a borrow intent
 */
export async function executeBorrowIntent(intent: TransactionIntent): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const protocol = intent.defiProtocol || "solend";
    log.info("Executing borrow", {
      intentId: intent.id,
      protocol,
      amount: intent.amount.toString(),
      token: intent.token,
    });

    // Route to appropriate protocol executor
    if (protocol === "solend") {
      // For borrow, we need collateral token and borrow token
      // These should be in the memo as JSON
      let borrowDetails: any = {};
      try {
        borrowDetails = JSON.parse(intent.memo || "{}");
      } catch (e) {
        // Fallback to defaults
        borrowDetails = {
          collateralTokenMint: intent.token,
          borrowTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wWugQSoWHG33P", // USDC
        };
      }

      return await borrowFromSolend({
        senderPublicKey: intent.sender,
        tokenMint: borrowDetails.collateralTokenMint || intent.token,
        collateralAmount: intent.amount,
        borrowTokenMint: borrowDetails.borrowTokenMint,
        borrowAmount: borrowDetails.borrowAmount || intent.amount / BigInt(2), // Default to 50% LTV
        intentId: intent.id,
      });
    } else {
      return {
        success: false,
        error: `Unknown lending protocol: ${protocol}. Supported protocols: solend`,
      };
    }
  } catch (error) {
    log.error("Failed to execute borrow", error, { intentId: intent.id });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a repay intent
 */
export async function executeRepayIntent(intent: TransactionIntent): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const protocol = intent.defiProtocol || "solend";
    log.info("Executing repay", {
      intentId: intent.id,
      protocol,
      amount: intent.amount.toString(),
      token: intent.token,
    });

    // Route to appropriate protocol executor
    if (protocol === "solend") {
      return await repayToSolend({
        senderPublicKey: intent.sender,
        borrowTokenMint:
          intent.token || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wWugQSoWHG33P", // Default to USDC
        repayAmount: intent.amount,
        intentId: intent.id,
      });
    } else {
      return {
        success: false,
        error: `Unknown lending protocol: ${protocol}. Supported protocols: solend`,
      };
    }
  } catch (error) {
    log.error("Failed to execute repay", error, { intentId: intent.id });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a DeFi intent based on its type
 */
export async function executeDefiIntent(intent: TransactionIntent): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
  rateChanged?: boolean;
  newAmountOut?: bigint;
}> {
  switch (intent.type) {
    case "swap_intent":
      return executeSwapIntent(intent);
    case "yield_deposit":
      return executeYieldDepositIntent(intent);
    case "yield_withdraw":
      return executeYieldWithdrawIntent(intent);
    case "lend":
      return executeLendIntent(intent);
    case "borrow":
      return executeBorrowIntent(intent);
    case "repay":
      return executeRepayIntent(intent);
    default:
      return {
        success: false,
        error: `Unknown DeFi intent type: ${intent.type}`,
      };
  }
}

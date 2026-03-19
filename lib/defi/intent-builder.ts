/**
 * DeFi Intent Builder
 * 
 * Creates DeFi transaction intents (swap, yield, lending) that can be queued offline
 * These intents are executed when the device comes online
 */

import { v4 as uuidv4 } from "uuid";
import type { TransactionIntent } from "../storage/types";
import { log } from "../utils/logger";

/**
 * Build a swap intent (offline)
 * The actual swap will be executed via Jupiter when online
 */
export function buildSwapIntent(params: {
  sender: string;
  tokenIn: string; // Token symbol or mint address
  tokenOut: string; // Token symbol or mint address
  amountIn: bigint; // Amount in smallest units
  minAmountOut?: bigint; // Minimum amount out (slippage protection)
  slippageBps?: number; // Slippage in basis points (default: 50 = 0.5%)
}): TransactionIntent {
  const { sender, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps = 50 } = params;

  if (amountIn <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "swap_intent",
    sender,
    recipient: "", // Will be set when executing via Jupiter
    amount: amountIn,
    token: tokenIn,
    encryptedPayload: "", // Will be encrypted during signing
    signature: "", // Will be signed
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000, // 5 minutes
    broadcastAttempts: 0,
    memo: `Swap ${tokenIn} → ${tokenOut}`,
    defiProtocol: "jupiter",
    defiAction: "swap",
    // Store swap parameters in memo or as additional fields
    // For now, we'll use memo to store JSON metadata
  };

    // Store swap details in memo as JSON for execution
    // This is the production approach - memo contains all swap parameters
    try {
      const swapDetails = {
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut?.toString(),
        slippageBps,
      };
      intent.memo = JSON.stringify({
        type: "swap",
        ...swapDetails,
      });
      log.debug("Swap intent created with memo", { tokenIn, tokenOut, amountIn: amountIn.toString() });
    } catch (error) {
      log.error("Failed to serialize swap details", error);
      throw new Error("Failed to create swap intent: serialization error");
    }

  return intent;
}

/**
 * Build a yield deposit intent (offline)
 * The actual deposit will be executed when online
 */
export function buildYieldDepositIntent(params: {
  sender: string;
  amount: bigint;
  token: string;
  protocol: string; // e.g., "marinade", "jito", "solend"
}): TransactionIntent {
  const { sender, amount, token, protocol } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "yield_deposit",
    sender,
    recipient: "", // Will be set to protocol address when executing
    amount,
    token,
    encryptedPayload: "",
    signature: "",
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    broadcastAttempts: 0,
    memo: `Deposit ${token} to ${protocol}`,
    defiProtocol: protocol,
    defiAction: "deposit",
  };

  return intent;
}

/**
 * Build a yield withdraw intent (offline)
 */
export function buildYieldWithdrawIntent(params: {
  sender: string;
  amount: bigint;
  token: string;
  protocol: string;
}): TransactionIntent {
  const { sender, amount, token, protocol } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "yield_withdraw",
    sender,
    recipient: "", // Will be set to protocol address when executing
    amount,
    token,
    encryptedPayload: "",
    signature: "",
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    broadcastAttempts: 0,
    memo: `Withdraw ${token} from ${protocol}`,
    defiProtocol: protocol,
    defiAction: "withdraw",
  };

  return intent;
}

/**
 * Build a lending deposit intent (offline)
 */
export function buildLendIntent(params: {
  sender: string;
  amount: bigint;
  token: string;
  protocol: string; // e.g., "solend", "marginfi"
}): TransactionIntent {
  const { sender, amount, token, protocol } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "lend",
    sender,
    recipient: "", // Will be set to protocol address when executing
    amount,
    token,
    encryptedPayload: "",
    signature: "",
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    broadcastAttempts: 0,
    memo: `Lend ${token} to ${protocol}`,
    defiProtocol: protocol,
    defiAction: "lend",
  };

  return intent;
}

/**
 * Build a borrow intent (offline)
 */
export function buildBorrowIntent(params: {
  sender: string;
  amount: bigint;
  token: string;
  protocol: string;
  collateral?: string; // Collateral token
}): TransactionIntent {
  const { sender, amount, token, protocol, collateral } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "borrow",
    sender,
    recipient: "", // Will be set to protocol address when executing
    amount,
    token,
    encryptedPayload: "",
    signature: "",
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    broadcastAttempts: 0,
    memo: `Borrow ${token} from ${protocol}${collateral ? ` (collateral: ${collateral})` : ""}`,
    defiProtocol: protocol,
    defiAction: "borrow",
  };

  return intent;
}

/**
 * Build a repay intent (offline)
 */
export function buildRepayIntent(params: {
  sender: string;
  amount: bigint;
  token: string;
  protocol: string;
}): TransactionIntent {
  const { sender, amount, token, protocol } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const now = Date.now();
  const intent: TransactionIntent = {
    id: uuidv4(),
    intentVersion: 1,
    type: "repay",
    sender,
    recipient: "", // Will be set to protocol address when executing
    amount,
    token,
    encryptedPayload: "",
    signature: "",
    nonce: uuidv4(),
    connectivity: "unknown",
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    broadcastAttempts: 0,
    memo: `Repay ${token} to ${protocol}`,
    defiProtocol: protocol,
    defiAction: "repay",
  };

  return intent;
}

import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { TransactionIntent } from "../storage/types";
import { log } from "../utils/logger";
import { resolveTokenMint } from "../defi/token-resolver";
import { signTransactionWithBiometric } from "./transaction-signer";
import { getPublicKeyBase58 } from ".";

export interface ExecutePaymentResult {
  success: boolean;
  signature?: string;
  blockHash?: string;
  slot?: number;
  error?: string;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

function getSolanaNetworkFromEnv(): "mainnet" | "devnet" {
  const raw = process.env.EXPO_PUBLIC_SOLANA_NETWORK;
  if (!raw) return "devnet";
  const normalized = raw.toLowerCase().trim();
  return normalized === "mainnet" ? "mainnet" : "devnet";
}

function toClusterName(network: "mainnet" | "devnet"): "mainnet-beta" | "devnet" {
  return network === "mainnet" ? "mainnet-beta" : "devnet";
}

async function getSolanaConnection(network: "mainnet" | "devnet"): Promise<Connection> {
  const clusterName = toClusterName(network);
  return new Connection(clusterApiUrl(clusterName), "confirmed");
}

export async function executePaymentIntent(
  intent: TransactionIntent
): Promise<ExecutePaymentResult> {
  try {
    if (intent.type !== "payment") {
      return { success: false, error: `Unsupported intent type: ${intent.type}` };
    }

    const network = getSolanaNetworkFromEnv();
    const conn = await getSolanaConnection(network);

    // Only the intent sender should be able to execute (non-custodial settlement).
    // Prevents accidental signing attempts on devices that don't own `intent.sender`.
    const walletPubkeyBase58 = await getPublicKeyBase58();
    if (walletPubkeyBase58 !== intent.sender) {
      return {
        success: false,
        error: "Wallet does not match intent sender; cannot execute payment locally",
      };
    }

    const senderPubkey = new PublicKey(intent.sender);
    const recipientPubkey = new PublicKey(intent.recipient);

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash(
      "confirmed"
    );

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;

    if (intent.token === "SOL") {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      if (intent.amount > maxSafe) {
        return { success: false, error: "SOL transfer amount exceeds safe integer range" };
      }

      transaction.feePayer = senderPubkey;
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports: Number(intent.amount),
        })
      );
    } else {
      const mintAddress = resolveTokenMint(intent.token, network);
      if (mintAddress === SOL_MINT) {
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        if (intent.amount > maxSafe) {
          return { success: false, error: "SOL transfer amount exceeds safe integer range" };
        }

        transaction.feePayer = senderPubkey;
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: recipientPubkey,
            lamports: Number(intent.amount),
          })
        );
      } else {
        const mintPubkey = new PublicKey(mintAddress);

        const senderATA = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
        const recipientATA = await getAssociatedTokenAddress(
          mintPubkey,
          recipientPubkey
        );

        // Rent-payer for ATA creation: the sender wallet.
        const ataPayer = senderPubkey;

        const senderAtaInfo = await conn.getAccountInfo(senderATA);
        if (!senderAtaInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              ataPayer,
              senderATA,
              senderPubkey,
              mintPubkey
            )
          );
        }

        const recipientAtaInfo = await conn.getAccountInfo(recipientATA);
        if (!recipientAtaInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              ataPayer,
              recipientATA,
              recipientPubkey,
              mintPubkey
            )
          );
        }

        transaction.feePayer = senderPubkey;
        transaction.add(
          createTransferInstruction(
            senderATA,
            recipientATA,
            senderPubkey,
            intent.amount
          )
        );
      }
    }

    const signResult = await signTransactionWithBiometric(
      transaction,
      "Sign payment transaction"
    );

    if (!signResult.success || !signResult.signedTransaction) {
      return {
        success: false,
        error: signResult.error || "Failed to sign payment transaction",
      };
    }

    const signedTx = signResult.signedTransaction as Transaction;

    const signature = await conn.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    const confirmation = await conn.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    if (confirmation.value.err) {
      return {
        success: false,
        error: `Payment failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    return {
      success: true,
      signature,
      blockHash: blockhash,
      slot: (confirmation.value as any)?.slot ?? 0,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("executePaymentIntent failed", err, { error });
    return { success: false, error };
  }
}


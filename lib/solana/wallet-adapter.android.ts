import {
    transact,
    Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
    Transaction,
    VersionedTransaction
} from "@solana/web3.js";
import { log } from "../utils/logger";

// Constants for MWA
const APP_IDENTITY = {
  name: "Zypp Wallet",
  uri: "https://zypp.fun",
  icon: "https://zypp.fun/icon.png",
};

export interface WalletAdapter {
  connectWallet(): Promise<{
    publicKey: string;
    authToken?: string;
  }>;
  signAndSendTransaction(
    transaction: VersionedTransaction | Transaction
  ): Promise<string>;
}

// Store auth token in memory
let _authToken: string | null = null;
let _currentAccount: string | null = null;

class SolanaWalletAdapterAndroid implements WalletAdapter {
  async connectWallet(): Promise<{ publicKey: string; authToken?: string }> {
    console.log("Connecting via MWA (Android)...");
    log.info("Connecting via MWA (Android)...");
    let result: { publicKey: string; authToken?: string } | null = null;

    try {
      await transact(async (wallet: Web3MobileWallet) => {
        // Authorize with the wallet
        const authResult = await wallet.authorize({
          identity: APP_IDENTITY,
          auth_token: _authToken || undefined,
        });

        _authToken = authResult.auth_token;
        _currentAccount = authResult.accounts[0].address;

        result = {
          publicKey: authResult.accounts[0].address,
          authToken: authResult.auth_token,
        };
      });
    } catch (err) {
      console.error("MWA Connect Error:", err);
      log.error("MWA Connect Error", err);
      throw err;
    }

    if (!result) throw new Error("Failed to connect to wallet");
    return result;
  }

  async signAndSendTransaction(
    transaction: VersionedTransaction | Transaction
  ): Promise<string> {
    console.log("Signing via MWA (Android)...");
    log.info("Signing via MWA (Android)...");
    let signature: string | null = null;

    try {
      await transact(async (wallet: Web3MobileWallet) => {
        // Re-authorize ensures we have a valid session
        const authResult = await wallet.authorize({
          identity: APP_IDENTITY,
          auth_token: _authToken || undefined,
        });
        
        _authToken = authResult.auth_token;
        _currentAccount = authResult.accounts[0].address;

        // Sign and send
        const signatures = await wallet.signAndSendTransactions({
          transactions: [transaction],
        });

        signature = signatures[0];
      });
    } catch (err) {
      console.error("MWA Sign Error:", err);
      log.error("MWA Sign Error", err);
      throw err;
    }

    if (!signature) throw new Error("Failed to sign transaction");
    return signature;
  }
}

export const solanaWalletAdapter = new SolanaWalletAdapterAndroid();

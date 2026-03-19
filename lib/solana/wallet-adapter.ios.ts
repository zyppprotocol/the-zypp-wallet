import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import { log } from "../utils/logger";

export interface WalletAdapter {
  connectWallet(): Promise<{
    publicKey: string;
    authToken?: string;
  }>;
  signAndSendTransaction(
    transaction: VersionedTransaction | Transaction,
  ): Promise<string>;
  disconnectWallet(): Promise<void>;
}

class SolanaWalletAdapterIOS implements WalletAdapter {
  private connectedPublicKey: string | null = null;

  /**
   * Connect to a wallet on iOS
   * Since Mobile Wallet Adapter v2.2.5 is not supported on iOS,
   * this provides alternative connection methods:
   * 1. QR code scanning for WalletConnect v2 (future)
   * 2. Manual address paste
   * 3. Stored/recovered address
   */
  async connectWallet(): Promise<{ publicKey: string; authToken?: string }> {
    return new Promise((resolve, reject) => {
      // Check if we have a previously connected wallet
      const previousPublicKey = SecureStore.getItem("lastConnectedWallet");

      const options = ["Manual Address Entry"];
      if (previousPublicKey) {
        options.unshift("Use Previous Wallet");
      }
      options.push("Cancel");

      Alert.alert(
        "Connect Wallet",
        "Mobile Wallet Adapter (MWA) is not available on iOS. Choose a connection method:",
        options.map((option, index) => ({
          text: option,
          onPress: async () => {
            try {
              if (option === "Use Previous Wallet" && previousPublicKey) {
                log.debug("Reconnecting to previous wallet", {
                  publicKey: previousPublicKey,
                });
                this.connectedPublicKey = previousPublicKey;
                resolve({ publicKey: previousPublicKey });
              } else if (option === "Manual Address Entry") {
                // Note: In a real app, this would open a modal with a text input
                // For now, we return a placeholder that the UI should handle
                reject(
                  new Error("Manual address entry requires UI implementation"),
                );
              } else if (option === "Cancel") {
                reject(new Error("User cancelled wallet connection"));
              }
            } catch (error) {
              log.error("Wallet connection error", error);
              reject(error);
            }
          },
          style: option === "Cancel" ? "cancel" : "default",
        })),
      );
    });
  }

  /**
   * Sign and send transaction on iOS
   * On iOS, this requires the transaction to be signed by the app
   * (since we have the private key stored locally)
   */
  async signAndSendTransaction(
    transaction: VersionedTransaction | Transaction,
  ): Promise<string> {
    try {
      if (!this.connectedPublicKey) {
        throw new Error("Wallet not connected");
      }

      log.warn(
        "iOS wallet signing not yet fully integrated - use local signing instead",
      );

      // On iOS, we use the wallet's local signing mechanism
      // The actual transaction signing should be handled by the app's biometric-gated signing pipeline
      throw new Error(
        "iOS wallet signing not available through WalletAdapter. " +
          "Please use the app's native signing interface.",
      );
    } catch (error) {
      log.error("iOS transaction signing failed", error);
      throw error;
    }
  }

  /**
   * Disconnect wallet
   */
  async disconnectWallet(): Promise<void> {
    this.connectedPublicKey = null;
    log.debug("Wallet disconnected");
  }

  /**
   * Get connected public key if available
   */
  getConnectedPublicKey(): string | null {
    return this.connectedPublicKey;
  }

  /**
   * Manually set a connected public key (for testing or fallback)
   */
  async setConnectedPublicKey(publicKey: string): Promise<void> {
    try {
      // Validate it's a valid Solana public key
      new PublicKey(publicKey);
      this.connectedPublicKey = publicKey;
      await SecureStore.setItemAsync("lastConnectedWallet", publicKey);
      log.debug("Connected to wallet", { publicKey });
    } catch (error) {
      log.error("Invalid public key", error);
      throw new Error("Invalid Solana public key format");
    }
  }
}

export const solanaWalletAdapter = new SolanaWalletAdapterIOS();

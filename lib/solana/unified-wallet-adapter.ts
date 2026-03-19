/**
 * Unified Wallet Adapter
 *
 * Provides a platform-agnostic interface for wallet connections
 * Handles both Android (via Mobile Wallet Adapter) and iOS (via fallback methods)
 */

import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { log } from "../utils/logger";

export interface ConnectWalletOptions {
  allowManualEntry?: boolean;
  allowQrScanning?: boolean;
  allowStoredWallets?: boolean;
}

export interface WalletConnectionResult {
  publicKey: string;
  authToken?: string;
  connectionMethod: "mwa" | "manual" | "qr" | "stored";
}

export class UnifiedWalletAdapter {
  private connectedPublicKey: string | null = null;
  private connectionMethod: "mwa" | "manual" | "qr" | "stored" | null = null;

  /**
   * Connect to any wallet using available platform features
   */
  async connectWallet(
    options: ConnectWalletOptions = {},
  ): Promise<WalletConnectionResult> {
    const {
      allowManualEntry = true,
      allowQrScanning = true,
      allowStoredWallets = true,
    } = options;

    // Try platform-specific methods first
    if (Platform.OS === "android") {
      try {
        // Try Mobile Wallet Adapter first on Android
        // Note: This would require @solana-mobile/mobile-wallet-adapter-protocol
        log.debug("Attempting Android wallet connection via MWA");
        // TODO: Implement MWA for Android
      } catch (error) {
        log.warn("MWA connection failed, falling back", error);
      }
    }

    // Fall back to universal methods
    if (allowStoredWallets) {
      const storedPublicKey = SecureStore.getItem("lastConnectedWallet");
      if (storedPublicKey) {
        try {
          new PublicKey(storedPublicKey); // Validate format
          this.connectedPublicKey = storedPublicKey;
          this.connectionMethod = "stored";
          log.debug("Connected via stored wallet", {
            publicKey: storedPublicKey,
          });
          return {
            publicKey: storedPublicKey,
            connectionMethod: "stored",
          };
        } catch (error) {
          log.warn("Stored wallet validation failed", error);
        }
      }
    }

    if (allowManualEntry) {
      return this.connectManualWallet();
    }

    throw new Error("No wallet connection methods available");
  }

  /**
   * Connect via manual address entry
   * In a full implementation, this would show a TextInput modal
   */
  async connectManualWallet(): Promise<WalletConnectionResult> {
    // This is a stub - the UI should handle the modal display
    // and call setConnectedPublicKey() when done
    throw new Error(
      "Manual wallet entry requires UI modal. " +
        "Please call setConnectedPublicKey() with the user's address.",
    );
  }

  /**
   * Connect via QR code scanning (showing destination address)
   * This allows receiving by QR code
   */
  async getQrCode(): Promise<string> {
    if (!this.connectedPublicKey) {
      throw new Error("Wallet not connected");
    }
    return this.connectedPublicKey;
  }

  /**
   * Manually set a connected public key (for manual entry, testing, etc.)
   */
  async setConnectedPublicKey(publicKey: string): Promise<void> {
    try {
      const validatedKey = new PublicKey(publicKey);
      this.connectedPublicKey = validatedKey.toBase58();
      this.connectionMethod = "manual";
      await SecureStore.setItemAsync(
        "lastConnectedWallet",
        this.connectedPublicKey,
      );
      log.debug("Connected to wallet", { publicKey: this.connectedPublicKey });
    } catch (error) {
      log.error("Invalid public key", error);
      throw new Error("Invalid Solana public key format");
    }
  }

  /**
   * Get the currently connected public key
   */
  getConnectedPublicKey(): string | null {
    return this.connectedPublicKey;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.connectedPublicKey !== null;
  }

  /**
   * Sign and send a transaction via the wallet
   * On self-custodial wallets (where keys are stored locally),
   * this would use the local signing pipeline.
   */
  async signAndSendTransaction(
    transaction: VersionedTransaction | Transaction,
  ): Promise<string> {
    if (!this.connectedPublicKey) {
      throw new Error("Wallet not connected");
    }

    // Note: Actual signing should be handled by the app's signing pipeline
    // which uses biometric authentication and secure key storage
    log.warn("signAndSendTransaction should be routed to app signing pipeline");
    throw new Error(
      "Use app's native signing interface for secure transaction signing",
    );
  }

  /**
   * Disconnect wallet
   */
  async disconnectWallet(): Promise<void> {
    this.connectedPublicKey = null;
    this.connectionMethod = null;
    log.debug("Wallet disconnected");
  }

  /**
   * Get connection method used
   */
  getConnectionMethod(): string | null {
    return this.connectionMethod;
  }

  /**
   * Recover last connected wallet if available
   */
  async recoverLastWallet(): Promise<WalletConnectionResult | null> {
    try {
      const storedPublicKey = SecureStore.getItem("lastConnectedWallet");
      if (storedPublicKey) {
        new PublicKey(storedPublicKey); // Validate
        this.connectedPublicKey = storedPublicKey;
        this.connectionMethod = "stored";
        log.debug("Recovered last connected wallet", {
          publicKey: storedPublicKey,
        });
        return {
          publicKey: storedPublicKey,
          connectionMethod: "stored",
        };
      }
    } catch (error) {
      log.warn("Failed to recover last wallet", error);
    }
    return null;
  }
}

// Export singleton instance
export const unifiedWalletAdapter = new UnifiedWalletAdapter();

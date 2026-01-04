export interface ZyppUser {
  id: string;
  zyppUserId: string;
  solanaPublicKey: string;
  keyProtection: {
    method: "biometric" | "biometric+pin";
    biometricType: "fingerprint" | "faceId" | "unknown";
  };
  secureStorage: {
    provider: "expo-secure-store" | "keychain" | "keystore";
    keyAlias: string;
    createdAt: number;
  };
  settings: {
    allowOfflineTransactions: true;
    autoSyncOnReconnect: boolean;
    defaultPrivacyMode: "standard" | "private";
    // Auto-lock timeout in milliseconds. 0 = disabled. Defaults to 5 minutes.
    autoLockTimeoutMs?: number;
  };
  balances: {
    settled: Record<string, string>;
    pending: Record<string, string>;
  };
  device: {
    deviceId: string;
    platform: "ios" | "android";
    lastUnlockedAt: number;
    lastSyncedAt?: number;
  };
  // Optional profile information
  profileImageUrl?: string | null;
  profileImageUploadedAt?: number | null;
  profilePromptDismissedAt?: number | null;
  status: "active" | "locked" | "suspended";
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface StoredKeyData {
  encryptedPrivateKey: string;
  nonce: string;
  salt: string;
  publicKey: string;
  biometricEnabled: boolean;
  pinEnabled: boolean;
  version: number;
}

export type BiometricType = "fingerprint" | "facial" | "iris" | "none";
export type SecurityLevel = "low" | "medium" | "high";

export interface BiometricAuthStatus {
  available: boolean;
  enrolled: boolean;
  types: BiometricType[];
  securityLevel: SecurityLevel;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometricUsed?: BiometricType;
}

export type TransactionStatus =
  | "pending"
  | "signed"
  | "broadcasting"
  | "confirmed"
  | "failed"
  | "expired";
export type TransactionType = "payment" | "swap" | "nft_transfer";
export type ConnectivityMethod = "bluetooth" | "nfc" | "mesh" | "unknown";

export interface TransactionIntent {
  id: string;
  intentVersion: number;
  type: TransactionType;
  sender: string;
  recipient: string;
  amount: bigint;
  token: string;
  encryptedPayload: string;
  signature: string;
  nonce: string;
  connectivity: ConnectivityMethod;
  status: TransactionStatus;
  createdAt: number;
  expiresAt: number;
  broadcastAttempts: number;
  lastBroadcastAt?: number;
  onchainSignature?: string;
  blockHash?: string;
  slot?: number;
  memo?: string;
}

export interface OfflineTransaction {
  intent: TransactionIntent;
  rawTransaction: Uint8Array;
}

export class SecureStorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "SecureStorageError";
  }
}

export const ErrorCodes = {
  WALLET_NOT_INITIALIZED: "WALLET_NOT_INITIALIZED",
  INVALID_PIN: "INVALID_PIN",
  BIOMETRIC_FAILED: "BIOMETRIC_FAILED",
  ENCRYPTION_FAILED: "ENCRYPTION_FAILED",
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
  STORAGE_ERROR: "STORAGE_ERROR",
  SIGNING_FAILED: "SIGNING_FAILED",
  TRANSACTION_EXPIRED: "TRANSACTION_EXPIRED",
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
} as const;

export interface WalletConfig {
  biometricEnabled: boolean;
  pinEnabled: boolean;
}

export interface InitOptions {
  useBiometric?: boolean;
  usePin?: boolean;
  pin?: string;
}

export interface QueueTransactionParams {
  type: TransactionType;
  sender: string;
  recipient: string;
  amount: bigint;
  token: string;
  encryptedPayload: string;
  signature: string;
  nonce: string;
  memo?: string;
}

export interface SignResult {
  signature: Uint8Array;
  publicKey: Uint8Array;
}

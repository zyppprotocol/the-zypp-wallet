/**
 * Auth backend helpers
 * - createUser: orchestrates wallet creation + user record creation
 * - getUser / deleteUser: retrieve or remove stored ZyppUser
 *
 * Flow (Biometrics-first):
 * 1. Check biometric availability
 * 2. If biometrics available & user opted in: create wallet and bind to biometric
 * 3. If biometrics unavailable: require PIN (mandated)
 * 4. Store ZyppUser object into secure storage (SecureStore)
 */

import { Platform } from "react-native";
import * as Solana from "../solana";
import { checkBiometricAvailability } from "../storage/biometric";
import { SecureStorage } from "../storage/secure-storage";
import type { ZyppUser } from "../storage/types";

// Generate minimal id without external dependency
function generateId(): string {
  return `zypp_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export interface CreateUserOptions {
  zyppUserId: string; // requested username / zyppId
  useBiometric?: boolean; // preference
  pin?: string; // optional PIN; required if biometrics are not available
  // Optional mnemonic import (BIP39). If provided, the wallet will be derived from this mnemonic.
  mnemonic?: string;
  mnemonicPath?: string; // derivation path (defaults to m/44'/501'/0'/0')
  storeMnemonic?: boolean; // whether to store the mnemonic securely (optional)
}

/**
 * Create a new Zypp user and wallet.
 * - If biometrics are supported and user opts in, wallet will be biometric-gated
 * - Otherwise, PIN is required and used to encrypt the wallet
 */
export async function createUser(opts: CreateUserOptions): Promise<ZyppUser> {
  const {
    zyppUserId,
    useBiometric = true,
    pin,
    mnemonic,
    mnemonicPath,
    storeMnemonic = false,
  } = opts;

  // Check biometric availability
  const bioStatus = await checkBiometricAvailability();
  const biometricAvailable = bioStatus.available && bioStatus.enrolled;

  // Decide biometric type
  let biometricType: ZyppUser["keyProtection"]["biometricType"] = "unknown";

  if (biometricAvailable) {
    biometricType =
      bioStatus.types[0] === "facial"
        ? "faceId"
        : bioStatus.types[0] === "fingerprint"
          ? "fingerprint"
          : "unknown";
  }

  // If user prefers biometrics but device doesn't support it, require PIN
  if (!biometricAvailable && useBiometric) {
    if (!pin) {
      throw new Error(
        "Biometric unavailable: PIN is required when biometrics are unavailable"
      );
    }
  }

  // If user doesn't want biometric or it's unavailable, require PIN
  if (!useBiometric || !biometricAvailable) {
    if (!pin) {
      throw new Error(
        "PIN is required when biometrics are not used or not available"
      );
    }
  }

  // Wallet creation/import
  let publicKey: string;

  if (mnemonic) {
    // Import from mnemonic (BIP39)
    publicKey = await Solana.createWalletFromMnemonic({
      mnemonic,
      path: mnemonicPath,
      useBiometric: biometricAvailable && useBiometric,
      pin,
      storeMnemonic,
    });
  } else {
    // Create a fresh wallet
    publicKey = await Solana.createWallet({
      useBiometric: biometricAvailable && useBiometric,
      pin,
    });
  }

  // Build ZyppUser object
  const user: ZyppUser = {
    id: generateId(),
    zyppUserId: zyppUserId,
    solanaPublicKey: publicKey,
    keyProtection: {
      method:
        biometricAvailable && useBiometric ? "biometric" : "biometric+pin",
      biometricType: biometricType,
    },
    secureStorage: {
      provider: "expo-secure-store",
      keyAlias: "zypp_key_data",
      createdAt: Date.now(),
    },
    settings: {
      allowOfflineTransactions: true,
      autoSyncOnReconnect: true,
      defaultPrivacyMode: "standard",
      autoLockTimeoutMs: 5 * 60 * 1000, // default 5 minutes
    },
    balances: {
      settled: {},
      pending: {},
    },
    device: {
      deviceId: generateId(),
      platform: Platform.OS === "ios" ? "ios" : "android",
      lastUnlockedAt: Date.now(),
      lastSyncedAt: undefined,
    },
    // Profile fields are intentionally null at creation
    profileImageUrl: null,
    profileImageUploadedAt: null,
    profilePromptDismissedAt: null,

    status: "active",
  };

  // Persist the user object in secure storage
  await SecureStorage.setUser(user);

  return user;
}

/**
 * Finalize a Zypp user record for an existing wallet.
 * This is used when the keypair already exists (createWallet was run separately)
 * and we need to bind a ZyppUser (username) to the existing wallet.
 */
export async function finalizeUser(zyppUserId: string): Promise<ZyppUser> {
  // Ensure a wallet exists
  try {
    const publicKey = await Solana.getPublicKeyBase58();

    const bioStatus = await checkBiometricAvailability();
    const biometricAvailable = bioStatus.available && bioStatus.enrolled;

    let biometricType: ZyppUser["keyProtection"]["biometricType"] = "unknown";
    if (biometricAvailable) {
      biometricType =
        bioStatus.types[0] === "facial"
          ? "faceId"
          : bioStatus.types[0] === "fingerprint"
            ? "fingerprint"
            : "unknown";
    }

    const config = await SecureStorage.getWalletConfig().catch(() => ({
      biometricEnabled: false,
      pinEnabled: true,
    }));

    const user: ZyppUser = {
      id: generateId(),
      zyppUserId: zyppUserId,
      solanaPublicKey: publicKey,
      keyProtection: {
        method: config.biometricEnabled ? "biometric" : "biometric+pin",
        biometricType,
      },
      secureStorage: {
        provider: "expo-secure-store",
        keyAlias: "zypp_key_data",
        createdAt: Date.now(),
      },
      settings: {
        allowOfflineTransactions: true,
        autoSyncOnReconnect: true,
        defaultPrivacyMode: "standard",
        autoLockTimeoutMs: 5 * 60 * 1000, // default 5 minutes
      },
      balances: {
        settled: {},
        pending: {},
      },
      device: {
        deviceId: generateId(),
        platform: Platform.OS === "ios" ? "ios" : "android",
        lastUnlockedAt: Date.now(),
        lastSyncedAt: undefined,
      },
      // Profile fields are intentionally null at finalization too
      profileImageUrl: null,
      profileImageUploadedAt: null,
      profilePromptDismissedAt: null,

      status: "active",
    };

    await SecureStorage.setUser(user);
    return user;
  } catch (err) {
    console.warn(err);
    throw new Error("Failed to finalize user: no wallet found or other error");
  }
}

/**
 * Get the stored ZyppUser (if any)
 */
export async function getUser(): Promise<ZyppUser | null> {
  return await SecureStorage.getUser();
}

/**
 * Update the current user's profile image (local URI or remote URL).
 */
export async function updateUserProfileImage(
  imageUri: string
): Promise<ZyppUser> {
  const user = await SecureStorage.getUser();
  if (!user) throw new Error("No user found");

  const updated: ZyppUser = {
    ...user,
    profileImageUrl: imageUri,
    profileImageUploadedAt: Date.now(),
  };

  await SecureStorage.setUser(updated);
  return updated;
}

/**
 * Dismiss the profile upload prompt for the current user (won't show modal again)
 */
export async function dismissProfilePrompt(): Promise<ZyppUser> {
  const user = await SecureStorage.getUser();
  if (!user) throw new Error("No user found");

  const updated: ZyppUser = {
    ...user,
    profilePromptDismissedAt: Date.now(),
  };

  await SecureStorage.setUser(updated);
  return updated;
}

/**
 * Delete stored user and wipe wallet
 */
export async function deleteUser(): Promise<void> {
  await SecureStorage.deleteUser();
  // Also wipe wallet (irreversible)
  await SecureStorage.wipeWallet();
}

/**
 * Check if the user is fully authenticated (complete auth flow).
 * A user is considered fully authenticated when:
 * 1. A wallet exists (isWalletInitialized)
 * 2. A ZyppUser exists with a zyppUserId (username)
 * 3. PIN or biometrics are set up (at least one of pinEnabled or biometricEnabled)
 *
 * This is used to determine whether lock screens, restricted routes, etc. should be accessible.
 */
export async function isUserComplete(): Promise<boolean> {
  try {
    // Check if wallet is initialized
    const walletInitialized = await SecureStorage.isWalletInitialized();
    if (!walletInitialized) return false;

    // Check if user exists with a zyppUserId
    const user = await SecureStorage.getUser();
    if (!user || !user.zyppUserId) return false;

    // Check if PIN or biometrics are set up
    const config = await SecureStorage.getWalletConfig();
    if (!config.pinEnabled && !config.biometricEnabled) {
      return false;
    }

    // User is complete when all conditions are met
    return true;
  } catch {
    return false;
  }
}

export default {
  createUser,
  finalizeUser,
  getUser,
  deleteUser,
  isUserComplete,
};

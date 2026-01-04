/**
 * Solana wallet backend helpers
 * - createWallet: generates a Solana Keypair and stores the secret key in secure storage
 * - getConnection: returns a Connection to devnet
 * - requestAirdrop / getBalance: devnet helpers for testing
 * - getPublicKeyBase58: returns stored public key in base58
 * - signMessage: signs arbitrary messages using the stored private key (requires PIN)
 *
 * NOTE: This file dynamically imports `@solana/web3.js` so that the dependency is optional.
 * Please install it in your project with:
 *   npm install @solana/web3.js
 */

import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";

import * as bip39 from "bip39";
// `derivePath` from ed25519-hd-key is loaded lazily inside `deriveKeypairFromMnemonic` to avoid
// module-initialization side-effects on platforms where Node shims aren't ready yet.
import ShaJS from "sha.js";
import * as nacl from "tweetnacl";
import { SecureStorage } from "../storage/secure-storage";

/**
 * Create a new Solana wallet and store its secret key using secure storage.
 * If `useBiometric` is true, this will use biometric gating.
 * Returns the base58 public key.
 */
export async function createWallet(
  options: { useBiometric?: boolean; pin?: string } = {}
) {
  const { useBiometric = false, pin } = options;

  console.debug("createWallet: starting (useBiometric=", useBiometric, ")");
  // Generate a Solana keypair (ed25519)
  const kp = Keypair.generate();

  // If not using biometric, require an explicit PIN
  if (!useBiometric && !pin) {
    throw new Error("PIN is required when biometric is not used");
  }

  // Persist secret key securely (ed25519 secretKey is 64 bytes)
  try {
    await SecureStorage.initializeSecureStorageFromSecretKey(
      kp.secretKey,
      useBiometric ? "biometric" : pin!,
      { useBiometric }
    );
  } catch (err) {
    console.error(
      "createWallet: failed to initialize secure storage:",
      err,
      err?.stack
    );
    // Rewrap RangeError with context to make it clear where it originated
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`initializeSecureStorageFromSecretKey failed: ${message}`);
  }

  return kp.publicKey.toBase58();
}

/**
 * Return a Connection object to Solana devnet
 */
export async function getConnection() {
  const url = clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

/**
 * Request airdrop on devnet to the provided public key (base58 or PublicKey)
 */
export async function requestAirdrop(
  publicKeyBase58: string,
  amountSol = 1
): Promise<string> {
  const conn = await getConnection();
  const pk = new PublicKey(publicKeyBase58);
  const sig = await conn.requestAirdrop(
    pk,
    Math.round(amountSol * LAMPORTS_PER_SOL)
  );
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

/**
 * Get balance (lamports) for a public key (base58)
 */
export async function getBalance(publicKeyBase58: string): Promise<number> {
  const conn = await getConnection();
  const pk = new PublicKey(publicKeyBase58);
  return await conn.getBalance(pk, "confirmed");
}

/**
 * Return the stored public key in base58
 */
export async function getPublicKeyBase58(): Promise<string> {
  // Use SecureStorage.getPublicKey() which returns Uint8Array
  const pub = await SecureStorage.getPublicKey();
  const pk = new PublicKey(pub);
  return pk.toBase58();
}

/**
 * Get the cached balance (lamports) for the user's public key (if any)
 */
export async function getCachedBalance(
  publicKeyBase58?: string
): Promise<number | null> {
  try {
    const user = await SecureStorage.getUser();
    if (!user) return null;
    const key = publicKeyBase58 || user.solanaPublicKey;
    const settled = user.balances?.settled ?? {};
    const val = settled?.solana || settled?.[key];
    if (!val) return null;
    const n = Number(val);
    if (isNaN(n)) return null;
    return n; // lamports
  } catch (err) {
    return null;
  }
}

/**
 * Fetch balance from network and update cached value in SecureStorage
 * Returns balance in lamports (number)
 */
export async function syncAndCacheBalance(
  publicKeyBase58?: string
): Promise<number> {
  const key = publicKeyBase58 || (await getPublicKeyBase58());
  const lamports = await getBalance(key);
  try {
    const user = await SecureStorage.getUser();
    if (!user) return lamports;
    const updated: typeof user = {
      ...user,
      balances: {
        ...(user.balances || { settled: {}, pending: {} }),
        settled: {
          ...(user.balances?.settled || {}),
          // store lamports as string under 'solana' key
          solana: String(lamports),
        },
      },
      device: {
        ...(user.device || {}),
        lastSyncedAt: Date.now(),
      },
    };
    await SecureStorage.setUser(updated);
  } catch (err) {
    console.warn("syncAndCacheBalance: failed to persist user balance", err);
  }
  return lamports;
}

/**
 * Sign an arbitrary message with the stored private key (requires PIN)
 * Returns the detached signature bytes
 */
export async function signMessage(
  message: Uint8Array,
  pin: string
): Promise<Uint8Array> {
  // Unlock private key bytes using the PIN
  const secretKey = await SecureStorage.unlockWithPin(pin);

  try {
    // Use nacl.sign.detached with ed25519 secret key
    const sig = nacl.sign.detached(message, secretKey);
    return new Uint8Array(sig);
  } finally {
    // Zero-out the secret key buffer after use
    if (secretKey instanceof Uint8Array) {
      for (let i = 0; i < secretKey.length; i++) secretKey[i] = 0;
    }
  }
}

/**
 * BIP39 / Mnemonic helpers
 * - generateMnemonic
 * - validateMnemonic
 * - deriveKeypairFromMnemonic
 * - createWalletFromMnemonic (persisted securely)
 * - exportMnemonic (requires PIN to retrieve)
 *
 * NOTE: Requires the following packages to be installed in your project:
 *   npm install bip39 ed25519-hd-key
 */
export function generateMnemonic(strength = 256): string {
  return bip39.generateMnemonic(strength);
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

export function deriveKeypairFromMnemonic(
  mnemonic: string,
  path = "m/44'/501'/0'/0'"
): Keypair {
  // Try to obtain a 64-byte seed from mnemonic. If that fails (platform issue),
  // fall back to using mnemonic entropy or a deterministic hash slice.
  let seedBuf: Buffer | null = null;

  try {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    seedBuf = Buffer.isBuffer(seed) ? seed : Buffer.from(seed as any);
  } catch (err) {
    console.warn(
      "bip39.mnemonicToSeedSync failed; attempting fallback using mnemonic entropy",
      err
    );
    try {
      const entropyHex = bip39.mnemonicToEntropy(mnemonic);
      seedBuf = Buffer.from(entropyHex, "hex");
    } catch (err2) {
      // As a last resort, derive a deterministic buffer from the mnemonic string
      console.warn(
        "bip39.mnemonicToEntropy also failed; falling back to simple hash slice",
        err2
      );
      const dh = new ShaJS("sha512");
      dh.update(typeof mnemonic === "string" ? mnemonic : String(mnemonic));
      const digest = dh.digest();
      seedBuf = Buffer.from(digest); // 64 bytes
    }
  }

  // At this point seedBuf should be set; ensure it's at least 32 bytes
  if (!seedBuf || seedBuf.length < 32) {
    throw new Error("Failed to derive a usable seed from mnemonic");
  }

  // Attempt deriving via ed25519-hd-key derivePath using a lazy require to avoid
  // crashing during module initialization when Node shims aren't available yet.
  let derivePathFn: ((p: string, seed: any) => { key: Uint8Array }) | null =
    null;
  try {
    // Use require at runtime so entrypoint polyfills (Buffer, crypto, etc.) have time to initialize

    const mod = require("ed25519-hd-key");
    derivePathFn =
      mod && typeof mod.derivePath === "function" ? mod.derivePath : null;
  } catch (reqErr) {
    console.warn("Could not require ed25519-hd-key at runtime:", reqErr);
    derivePathFn = null;
  }

  try {
    console.debug(
      "deriveKeypairFromMnemonic: seedBuf length=",
      seedBuf.length,
      "type=",
      Object.prototype.toString.call(seedBuf),
      "derivePathFn=",
      !!derivePathFn
    );

    if (derivePathFn) {
      // Try hex string first (most common usage)
      try {
        const res = derivePathFn(path, seedBuf.toString("hex"));
        const key = res && (res as any).key;
        if (key && key.length >= 32) return Keypair.fromSeed(key);
        console.warn("derivePath returned unexpected key (hex input)", {
          keyLength: key ? key.length : undefined,
        });
      } catch (innerErrHex) {
        console.warn("derivePath(hex) threw:", innerErrHex);
      }

      // Try passing the Buffer/Uint8Array directly
      try {
        const res = derivePathFn(path, seedBuf);
        const key = res && (res as any).key;
        if (key && key.length >= 32) return Keypair.fromSeed(key);
        console.warn("derivePath returned unexpected key (buffer input)", {
          keyLength: key ? key.length : undefined,
        });
      } catch (innerErrBuf) {
        console.warn("derivePath(buffer) threw:", innerErrBuf);
      }
    } else {
      console.warn(
        "derivePath function not available; skipping ed25519-hd-key derivation"
      );
    }

    // If derivePath didn't succeed or wasn't available, fall back to using the first 32 bytes of seedBuf
    console.warn(
      "ed25519-hd-key derivePath failed or unavailable; falling back to seed slice"
    );
    const fallbackSeed = seedBuf && seedBuf.slice ? seedBuf.slice(0, 32) : null;
    if (!fallbackSeed) {
      throw new Error(
        "Unable to obtain fallback seed (seedBuf.slice undefined)"
      );
    }
    return Keypair.fromSeed(new Uint8Array(fallbackSeed));
  } finally {
    // Zero the seed buffer for safety
    try {
      if (seedBuf && Buffer.isBuffer(seedBuf)) {
        seedBuf.fill(0);
      } else if (seedBuf && (seedBuf as any).fill) {
        // Some environments may produce Uint8Array
        try {
          (seedBuf as any).fill(0);
        } catch (e) {
          // ignore
        }
      }
    } catch (zeroErr) {
      // ignore
    }
  }
}

export async function createWalletFromMnemonic(options: {
  mnemonic: string;
  path?: string;
  useBiometric?: boolean;
  pin?: string;
  storeMnemonic?: boolean; // store backup phrase in secure storage (optional)
}): Promise<string> {
  const {
    mnemonic,
    path = "m/44'/501'/0'/0'",
    useBiometric = false,
    pin,
    storeMnemonic = false,
  } = options;

  if (!validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");

  let kp;
  try {
    kp = deriveKeypairFromMnemonic(mnemonic, path);
  } catch (err) {
    console.error("Failed to derive keypair from mnemonic:", err);
    throw new Error(
      "Failed to derive keypair from mnemonic. Please verify your mnemonic and try again."
    );
  }

  if (!useBiometric && !pin) {
    throw new Error("PIN is required when biometric is not used");
  }

  await SecureStorage.initializeSecureStorageFromSecretKey(
    kp.secretKey,
    useBiometric ? "biometric" : pin!,
    { useBiometric }
  );

  if (storeMnemonic) {
    await SecureStorage.setMnemonic(mnemonic);
  }

  return kp.publicKey.toBase58();
}

export async function importMnemonic(options: {
  mnemonic: string;
  path?: string;
  useBiometric?: boolean;
  pin?: string;
  storeMnemonic?: boolean;
}) {
  return await createWalletFromMnemonic(options);
}

/**
 * Export mnemonic that was stored with `storeMnemonic` option.
 * Requires PIN to reveal mnemonic for safety.
 */
export async function exportMnemonic(pin: string): Promise<string | null> {
  // Verify PIN by unlocking key first
  const privateKey = await SecureStorage.unlockWithPin(pin);
  try {
    const m = await SecureStorage.getMnemonic();
    return m;
  } finally {
    if (privateKey && privateKey.length > 0) privateKey.fill(0);
  }
}

export default {
  createWallet,
  getConnection,
  requestAirdrop,
  getBalance,
  getPublicKeyBase58,
  signMessage,
};

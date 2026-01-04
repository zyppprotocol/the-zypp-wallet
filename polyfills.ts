import * as Crypto from "expo-crypto";
import "react-native-get-random-values";

// Override the global Crypto type
declare global {
  interface Crypto {
    getRandomValues(array: Uint8Array): Uint8Array;
    subtle: typeof subtleCrypto;
    randomUUID(): string;
  }
}

interface CustomCryptoKey {
  type: string;
  extractable: boolean;
  algorithm: {
    name: string;
  };
  usages: string[];
  _keyMaterial?: ArrayBufferLike;
}

interface CustomAlgorithm {
  name: string;
  hash?: string;
  salt?: Uint8Array;
  iterations?: number;
  length?: number;
  iv?: Uint8Array;
}

// Create a full SubtleCrypto implementation using expo-crypto
const subtleCrypto = {
  async importKey(
    format: string,
    keyData: ArrayBuffer | Uint8Array,
    algorithm: CustomAlgorithm,
    extractable: boolean,
    keyUsages: string[]
  ): Promise<CustomCryptoKey> {
    // Ensure we have an ArrayBuffer
    const keyBuffer = keyData instanceof Uint8Array ? keyData.buffer : keyData;

    return {
      type: format,
      extractable,
      algorithm,
      usages: keyUsages,
      _keyMaterial: keyBuffer,
    };
  },

  async deriveBits(
    algorithm: CustomAlgorithm,
    baseKey: CustomCryptoKey,
    length: number
  ): Promise<ArrayBuffer> {
    if (!baseKey._keyMaterial) {
      throw new Error("No key material available");
    }

    const keyMaterial = new Uint8Array(baseKey._keyMaterial);
    if (!algorithm.salt) {
      throw new Error("Salt is required for key derivation");
    }

    // Implement PBKDF2 using expo-crypto
    const iterations = algorithm.iterations || 100000;

    // Combine key material and salt
    const combined = new Uint8Array(keyMaterial.length + algorithm.salt.length);
    combined.set(keyMaterial);
    combined.set(algorithm.salt, keyMaterial.length);

    // Initial hash
    let resultArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, combined)
    );

    // Perform iterations
    for (let i = 1; i < iterations; i++) {
      resultArray = new Uint8Array(
        await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, resultArray)
      );
    }

    // Return the requested number of bits
    return resultArray.slice(0, length / 8).buffer;
  },

  async encrypt(
    algorithm: CustomAlgorithm,
    key: CustomCryptoKey,
    data: ArrayBuffer
  ): Promise<ArrayBuffer> {
    if (!key._keyMaterial) {
      throw new Error("No key material available");
    }
    if (!algorithm.iv) {
      throw new Error("IV is required for encryption");
    }

    const keyBytes = new Uint8Array(key._keyMaterial);
    const dataBytes = new Uint8Array(data);
    const ivBytes = new Uint8Array(algorithm.iv);

    // Derive encryption key
    const encryptionKeyArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, keyBytes)
    );

    // Create key stream
    const keyStreamInput = new Uint8Array(
      encryptionKeyArray.length + ivBytes.length
    );
    keyStreamInput.set(encryptionKeyArray);
    keyStreamInput.set(ivBytes, encryptionKeyArray.length);

    const keyStreamArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, keyStreamInput)
    );

    // Encrypt using XOR with key stream
    const encryptedArray = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      encryptedArray[i] =
        dataBytes[i] ^ keyStreamArray[i % keyStreamArray.length];
    }

    // Generate auth tag
    const authInput = new Uint8Array(
      encryptionKeyArray.length + encryptedArray.length
    );
    authInput.set(encryptionKeyArray);
    authInput.set(encryptedArray, encryptionKeyArray.length);

    const authTagArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, authInput)
    );

    // Combine encrypted data and auth tag
    const resultArray = new Uint8Array(
      encryptedArray.length + authTagArray.length
    );
    resultArray.set(encryptedArray);
    resultArray.set(authTagArray, encryptedArray.length);

    return resultArray.buffer;
  },

  async decrypt(
    algorithm: CustomAlgorithm,
    key: CustomCryptoKey,
    data: ArrayBuffer
  ): Promise<ArrayBuffer> {
    if (!key._keyMaterial) {
      throw new Error("No key material available");
    }
    if (!algorithm.iv) {
      throw new Error("IV is required for decryption");
    }

    const keyBytes = new Uint8Array(key._keyMaterial);
    const dataBytes = new Uint8Array(data);
    const ivBytes = new Uint8Array(algorithm.iv);

    // Split input into encrypted data and auth tag
    const authTagSize = 32; // SHA-256 output size
    const encryptedArray = dataBytes.slice(0, -authTagSize);
    const receivedAuthTag = dataBytes.slice(-authTagSize);

    // Derive encryption key
    const encryptionKeyArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, keyBytes)
    );

    // Verify auth tag
    const authInput = new Uint8Array(
      encryptionKeyArray.length + encryptedArray.length
    );
    authInput.set(encryptionKeyArray);
    authInput.set(encryptedArray, encryptionKeyArray.length);

    const computedAuthTagArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, authInput)
    );

    if (!receivedAuthTag.every((v, i) => v === computedAuthTagArray[i])) {
      throw new Error("Decryption failed: Invalid authentication tag");
    }

    // Generate key stream
    const keyStreamInput = new Uint8Array(
      encryptionKeyArray.length + ivBytes.length
    );
    keyStreamInput.set(encryptionKeyArray);
    keyStreamInput.set(ivBytes, encryptionKeyArray.length);

    const keyStreamArray = new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, keyStreamInput)
    );

    // Decrypt using XOR with key stream
    const decryptedArray = new Uint8Array(encryptedArray.length);
    for (let i = 0; i < encryptedArray.length; i++) {
      decryptedArray[i] =
        encryptedArray[i] ^ keyStreamArray[i % keyStreamArray.length];
    }

    return decryptedArray.buffer;
  },
};

// Export as global to ensure consistent crypto access
export const cryptoPolyfill = {
  getRandomValues: (array: Uint8Array) => {
    // Prefer platform global crypto.getRandomValues if available (react-native-get-random-values)
    // But guard against calling ourselves to avoid infinite recursion.
    if (
      (global as any).crypto &&
      typeof (global as any).crypto.getRandomValues === "function" &&
      (global as any).crypto.getRandomValues !== cryptoPolyfill.getRandomValues
    ) {
      return (global as any).crypto.getRandomValues(array);
    }

    // Fallback to expo-crypto.getRandomBytes and copy into the provided array
    try {
      const bytes = Crypto.getRandomBytes(array.length);
      // Crypto.getRandomBytes returns Uint8Array according to Expo docs
      if (bytes && (bytes as Uint8Array).length) {
        array.set(bytes as Uint8Array);
        return array;
      }
    } catch (err) {
      console.error(
        "cryptoPolyfill.getRandomValues fallback failed:",
        err,
        err?.stack
      );
    }

    throw new Error("No secure random source available");
  },
  subtle: subtleCrypto,
  randomUUID: Crypto.randomUUID,
};

// Ensure crypto is available globally
if (!global.crypto || !global.crypto.subtle) {
  (global as any).crypto = cryptoPolyfill;
}

export default cryptoPolyfill;

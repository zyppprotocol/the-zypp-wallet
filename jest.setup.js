/**
 * Jest Setup File
 *
 * Configures testing environment and mocks
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.EXPO_PUBLIC_SOLANA_CLUSTER = "devnet";

// Mock Solana Web3.js
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  return {
    ...actual,
    Connection: jest.fn(() => ({
      getLatestBlockhash: jest.fn(async () => ({
        blockhash: "test-blockhash",
        lastValidBlockHeight: 100,
      })),
      getHealth: jest.fn(async () => "ok"),
      simulateTransaction: jest.fn(async () => ({ value: { err: null } })),
      sendRawTransaction: jest.fn(async () => "test-signature"),
    })),
  };
});

// Mock Expo modules
jest.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1, 2]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

// Suppress console in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

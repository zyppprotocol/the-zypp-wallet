/**
 * Network Configuration for Zypp Wallet
 * Supports mainnet, testnet, and devnet clusters
 */

export type SolanaCluster = "mainnet-beta" | "testnet" | "devnet";

export interface NetworkConfig {
  cluster: SolanaCluster;
  rpcUrl: string;
  name: string;
  description: string;
}

/**
 * Network configurations for Solana clusters
 * RPC endpoints can be customized via environment variables
 */
export const NETWORKS: Record<SolanaCluster, NetworkConfig> = {
  "mainnet-beta": {
    cluster: "mainnet-beta",
    rpcUrl:
      process.env.EXPO_PUBLIC_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com",
    name: "Mainnet",
    description: "Production Solana network",
  },
  testnet: {
    cluster: "testnet",
    rpcUrl:
      process.env.EXPO_PUBLIC_TESTNET_RPC || "https://api.testnet.solana.com",
    name: "Testnet",
    description: "Solana testnet for staging",
  },
  devnet: {
    cluster: "devnet",
    rpcUrl:
      process.env.EXPO_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com",
    name: "Devnet",
    description: "Development and testing network",
  },
};

/**
 * Get the current network cluster from environment or default to devnet
 * Environment variable: EXPO_PUBLIC_SOLANA_CLUSTER
 * Defaults to: devnet
 */
export function getCurrentCluster(): SolanaCluster {
  const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ||
    "devnet") as SolanaCluster;

  if (!NETWORKS[cluster]) {
    console.warn(`Invalid cluster "${cluster}", defaulting to devnet`);
    return "devnet";
  }

  return cluster;
}

/**
 * Get the current network configuration
 */
export function getCurrentNetwork(): NetworkConfig {
  const cluster = getCurrentCluster();
  return NETWORKS[cluster];
}

/**
 * Get RPC URL for a specific cluster
 */
export function getRpcUrl(cluster?: SolanaCluster): string {
  const targetCluster = cluster || getCurrentCluster();
  return NETWORKS[targetCluster].rpcUrl;
}

/**
 * Check if running on mainnet (production)
 */
export function isMainnet(): boolean {
  return getCurrentCluster() === "mainnet-beta";
}

/**
 * Check if running on testnet
 */
export function isTestnet(): boolean {
  return getCurrentCluster() === "testnet";
}

/**
 * Check if running on devnet (development)
 */
export function isDevnet(): boolean {
  return getCurrentCluster() === "devnet";
}

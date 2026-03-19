/**
 * Relayer Configuration
 *
 * Configures the Zypp Relayer Network endpoints and connection settings
 */

import { isDevnet, isMainnet } from "../config/network";
import { log } from "../utils/logger";
import { RelayerPoolConfig } from "./relayer-types";

/**
 * Get relayer pool configuration based on current network
 * Environment variables can override defaults:
 * - EXPO_PUBLIC_RELAYER_ENABLED: "true" | "false"
 * - EXPO_PUBLIC_RELAYER_PRIMARY: "https://relayer1.zypp.fun/api"
 * - EXPO_PUBLIC_RELAYER_SECONDARY: "https://relayer2.zypp.fun/api"
 * - EXPO_PUBLIC_RELAYER_API_KEY: "your-api-key"
 */
export function getRelayerPoolConfig(): RelayerPoolConfig | null {
  const relayerEnabled = process.env.EXPO_PUBLIC_RELAYER_ENABLED !== "false";

  if (!relayerEnabled) {
    log.debug("Relayer integration is disabled");
    return null;
  }

  // Get API key from environment
  const apiKey = process.env.EXPO_PUBLIC_RELAYER_API_KEY || "development-key";

  if (apiKey === "development-key") {
    log.warn(
      "Using development relayer API key. Set EXPO_PUBLIC_RELAYER_API_KEY for production.",
    );
  }

  // Configure endpoints based on network
  let primaryEndpoint: string;
  let secondaryEndpoint: string;
  let tertiaryEndpoint: string | null = null;

  if (isMainnet()) {
    primaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_PRIMARY || "https://relayer.zypp.fun/api";
    secondaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_SECONDARY ||
      "https://relayer2.zypp.fun/api";
    tertiaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_TERTIARY ||
      "https://relayer3.zypp.fun/api";
  } else if (isDevnet()) {
    primaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_PRIMARY ||
      "https://relayer-devnet.zypp.fun/api";
    secondaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_SECONDARY ||
      "https://relayer2-devnet.zypp.fun/api";
    tertiaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_TERTIARY ||
      "https://relayer3-devnet.zypp.fun/api";
  } else {
    // Testnet
    primaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_PRIMARY ||
      "https://relayer-testnet.zypp.fun/api";
    secondaryEndpoint =
      process.env.EXPO_PUBLIC_RELAYER_SECONDARY ||
      "https://relayer2-testnet.zypp.fun/api";
  }

  const relayers = [
    {
      endpoint: primaryEndpoint,
      apiKey,
      timeout: 30000,
      priority: 1,
      enabled: true,
    },
    {
      endpoint: secondaryEndpoint,
      apiKey,
      timeout: 30000,
      priority: 2,
      enabled: true,
    },
  ];

  // Add tertiary relayer if configured
  if (tertiaryEndpoint) {
    relayers.push({
      endpoint: tertiaryEndpoint,
      apiKey,
      timeout: 30000,
      priority: 3,
      enabled: true,
    });
  }

  const config: RelayerPoolConfig = {
    relayers,
    failoverStrategy: "priority",
    healthCheckIntervalMs: 60000,
    maxRetries: 3,
  };

  log.info("Relayer pool configured", {
    relayerCount: relayers.length,
    primaryEndpoint,
    failoverStrategy: config.failoverStrategy,
  });

  return config;
}

/**
 * Check if relayer is enabled for current network
 */
export function isRelayerEnabled(): boolean {
  return process.env.EXPO_PUBLIC_RELAYER_ENABLED !== "false";
}

/**
 * Get primary relayer endpoint
 */
export function getPrimaryRelayerEndpoint(): string | null {
  if (!isRelayerEnabled()) return null;

  const config = getRelayerPoolConfig();
  if (!config || config.relayers.length === 0) return null;

  return config.relayers[0].endpoint;
}

/**
 * Check if it's safe to use relayer (health & availability)
 */
export function shouldUseRelayer(): boolean {
  // Don't use relayer if explicitly disabled
  if (!isRelayerEnabled()) return false;

  // Only use relayer if network is available
  // Additional checks could include health status, etc.
  return true;
}

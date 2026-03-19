/**
 * Relayer Pool Manager
 *
 * Manages a pool of relayer endpoints with load balancing and failover
 */

import { log } from "../utils/logger";
import { RelayerClient } from "./relayer-client";
import {
  RelayerHealthResponse,
  RelayerPoolConfig,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  TransactionStatusRequest,
  TransactionStatusResponse,
} from "./relayer-types";

export class RelayerPool {
  private clients: RelayerClient[] = [];
  private config: RelayerPoolConfig;
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timer | null = null;
  private relayerHealth: Map<string, RelayerHealthResponse> = new Map();

  constructor(config: RelayerPoolConfig) {
    if (!config.relayers || config.relayers.length === 0) {
      throw new Error("At least one relayer configuration is required");
    }

    this.config = {
      failoverStrategy: "priority",
      healthCheckIntervalMs: 60000,
      maxRetries: 3,
      ...config,
    };

    // Initialize clients
    this.clients = this.config.relayers
      .filter((r) => r.enabled !== false)
      .map((r) => new RelayerClient(r))
      .sort((a, b) => a.getPriority() - b.getPriority());

    log.info("Relayer pool initialized", {
      count: this.clients.length,
      strategy: this.config.failoverStrategy,
    });
  }

  /**
   * Submit transaction to relayer pool with fallback
   */
  async submitTransaction(
    request: SubmitTransactionRequest,
  ): Promise<SubmitTransactionResponse> {
    if (this.clients.length === 0) {
      throw new Error("No relayers available in pool");
    }

    const maxRetries = request.maxRetries || this.config.maxRetries || 3;
    const errors: Error[] = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = this.selectNextRelayer();
        log.debug("Submitting transaction to relayer", {
          relayer: client.getEndpoint(),
          attempt: attempt + 1,
          intentId: request.intentId,
        });

        const response = await client.submitTransaction(request);
        return response;
      } catch (error) {
        errors.push(error as Error);
        log.warn(
          `Relayer submission attempt ${attempt + 1} failed, retrying...`,
          error,
        );
      }
    }

    // All retries exhausted
    log.error("All relayers failed", errors[errors.length - 1], {
      intentId: request.intentId,
      attempts: maxRetries,
      errors: errors.map((e) => e.message),
    });

    throw new Error(
      `Transaction submission failed after ${maxRetries} attempts: ${errors[errors.length - 1]?.message}`,
    );
  }

  /**
   * Get transaction status from best available relayer
   */
  async getTransactionStatus(
    request: TransactionStatusRequest,
  ): Promise<TransactionStatusResponse> {
    const errors: Error[] = [];

    // Try relayers in priority order
    for (const client of this.clients) {
      try {
        return await client.getTransactionStatus(request);
      } catch (error) {
        errors.push(error as Error);
        log.warn("Failed to get status from relayer", error);
      }
    }

    throw new Error(
      `Failed to get transaction status from any relayer: ${errors[0]?.message}`,
    );
  }

  /**
   * Select next relayer based on strategy
   */
  private selectNextRelayer(): RelayerClient {
    const strategy = this.config.failoverStrategy || "priority";

    switch (strategy) {
      case "round-robin":
        const rrClient = this.clients[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.clients.length;
        return rrClient;

      case "random":
        return this.clients[Math.floor(Math.random() * this.clients.length)];

      case "priority":
      default:
        // Always use highest priority available
        return this.clients[0];
    }
  }

  /**
   * Start periodic health checks of all relayers
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    const intervalMs = this.config.healthCheckIntervalMs || 60000;

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, intervalMs);

    log.debug("Relayer health checks started", { intervalMs });

    // Perform initial check
    this.performHealthChecks();
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      log.debug("Relayer health checks stopped");
    }
  }

  /**
   * Perform health check on all relayers
   */
  private async performHealthChecks(): Promise<void> {
    const checks = this.clients.map(async (client) => {
      try {
        const health = await client.checkHealth();
        this.relayerHealth.set(client.getEndpoint(), health);
        log.debug("Relayer health check", {
          relayer: client.getEndpoint(),
          healthy: health.healthy,
          queueSize: health.queueSize,
          successRate: health.successRate,
        });
      } catch (error) {
        log.warn("Failed to check relayer health", error);
        this.relayerHealth.set(client.getEndpoint(), {
          healthy: false,
          lastCheckTime: Date.now(),
        });
      }
    });

    await Promise.all(checks);
  }

  /**
   * Get health status of a relayer
   */
  getRelayerHealth(endpoint: string): RelayerHealthResponse | null {
    return this.relayerHealth.get(endpoint) || null;
  }

  /**
   * Get all relayers and their health status
   */
  getAllRelayersHealth(): {
    endpoint: string;
    health: RelayerHealthResponse | null;
    priority: number;
  }[] {
    return this.clients.map((client) => ({
      endpoint: client.getEndpoint(),
      health: this.relayerHealth.get(client.getEndpoint()) || null,
      priority: client.getPriority(),
    }));
  }

  /**
   * Get number of healthy relayers
   */
  getHealthyRelayerCount(): number {
    return Array.from(this.relayerHealth.values()).filter((h) => h.healthy)
      .length;
  }

  /**
   * Check if any relayers are available
   */
  hasAvailableRelayers(): boolean {
    return this.clients.length > 0;
  }

  /**
   * Get total relayers in pool
   */
  getRelayerCount(): number {
    return this.clients.length;
  }
}

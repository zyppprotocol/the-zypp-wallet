/**
 * Relayer Client
 *
 * Handles communication with the Zypp Relayer Network
 * Provides high-level functions for transaction submission and tracking
 */

import * as Crypto from "expo-crypto";
import { log } from "../utils/logger";
import {
  RelayerConfig,
  RelayerFeeEstimate,
  RelayerHealthResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  TransactionStatusRequest,
  TransactionStatusResponse,
} from "./relayer-types";

export class RelayerClient {
  private config: RelayerConfig;
  private lastHealthCheck: number = 0;
  private healthCheckCache: RelayerHealthResponse | null = null;

  constructor(config: RelayerConfig) {
    if (!config.endpoint) {
      throw new Error("Relayer endpoint is required");
    }
    if (!config.apiKey) {
      throw new Error("Relayer API key is required");
    }
    this.config = {
      timeout: 30000,
      priority: 5,
      enabled: true,
      ...config,
    };
  }

  /**
   * Submit a signed transaction to the relayer
   */
  async submitTransaction(
    request: SubmitTransactionRequest,
  ): Promise<SubmitTransactionResponse> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeout || 30000,
      );

      const signature = await this.signRequest(request);

      const response = await fetch(
        `${this.config.endpoint}/v1/transactions/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.config.apiKey,
            "X-Signature": signature,
            "X-Timestamp": Date.now().toString(),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Relayer error: ${response.status} - ${errorData.error || response.statusText}`,
        );
      }

      const data: SubmitTransactionResponse = await response.json();
      log.info("Transaction submitted to relayer", {
        signature: data.signature,
        relayer: data.relayer,
        status: data.status,
      });

      return data;
    } catch (error) {
      log.error("Failed to submit transaction to relayer", error, {
        intentId: request.intentId,
        relayer: this.config.endpoint,
      });
      throw error;
    }
  }

  /**
   * Get transaction status from relayer
   */
  async getTransactionStatus(
    request: TransactionStatusRequest,
  ): Promise<TransactionStatusResponse> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeout || 30000,
      );

      const queryParams = new URLSearchParams({
        signature: request.signature,
        ...(request.intentId && { intentId: request.intentId }),
      });

      const response = await fetch(
        `${this.config.endpoint}/v1/transactions/status?${queryParams}`,
        {
          method: "GET",
          headers: {
            "X-API-Key": this.config.apiKey,
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Relayer error: ${response.status} - ${errorData.error || response.statusText}`,
        );
      }

      const data: TransactionStatusResponse = await response.json();
      return data;
    } catch (error) {
      log.error("Failed to get transaction status from relayer", error);
      throw error;
    }
  }

  /**
   * Estimate fees for relayer submission
   */
  async estimateFees(
    transactionSize: number,
    subscriptionTier?: "basic" | "premium",
  ): Promise<RelayerFeeEstimate> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeout || 30000,
      );

      const queryParams = new URLSearchParams({
        transactionSize: transactionSize.toString(),
        ...(subscriptionTier && { tier: subscriptionTier }),
      });

      const response = await fetch(
        `${this.config.endpoint}/v1/fees/estimate?${queryParams}`,
        {
          method: "GET",
          headers: {
            "X-API-Key": this.config.apiKey,
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Failed to estimate fees: ${response.status}`);
      }

      const data: RelayerFeeEstimate = await response.json();
      return data;
    } catch (error) {
      log.warn("Failed to estimate relayer fees", error);
      // Return default fee estimate on failure
      return {
        feeSol: 0.00001,
        feeLamports: 1000,
      };
    }
  }

  /**
   * Check relayer health
   */
  async checkHealth(): Promise<RelayerHealthResponse> {
    try {
      const now = Date.now();
      // Cache health checks for 30 seconds
      if (this.healthCheckCache && now - this.lastHealthCheck < 30000) {
        return this.healthCheckCache;
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeout || 30000,
      );

      const response = await fetch(`${this.config.endpoint}/v1/health`, {
        method: "GET",
        headers: {
          "X-API-Key": this.config.apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          healthy: false,
          lastCheckTime: now,
          queueSize: 0,
          successRate: 0,
        };
      }

      const data: RelayerHealthResponse = await response.json();
      this.healthCheckCache = data;
      this.lastHealthCheck = now;
      return data;
    } catch (error) {
      log.warn("Relayer health check failed", error);
      return {
        healthy: false,
        lastCheckTime: Date.now(),
        queueSize: 0,
        successRate: 0,
      };
    }
  }

  /**
   * Sign request for authentication with relayer
   */
  private async signRequest(data: any): Promise<string> {
    try {
      const payload = JSON.stringify(data);
      const message = `${this.config.apiKey}:${payload}`;
      const signature = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        message,
      );
      return signature;
    } catch (error) {
      log.error("Failed to sign relayer request", error);
      throw error;
    }
  }

  /**
   * Get configured endpoint
   */
  getEndpoint(): string {
    return this.config.endpoint;
  }

  /**
   * Check if relayer is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled !== false;
  }

  /**
   * Get priority (lower number = higher priority)
   */
  getPriority(): number {
    return this.config.priority || 5;
  }
}

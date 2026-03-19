/**
 * Relayer Types and Interfaces
 *
 * Defines the contract between Zypp Wallet and the Relayer Network
 * for deferred transaction broadcasting and confirmation tracking
 */

export type RelayerStatusCode =
  | "submitted"
  | "pending"
  | "confirmed"
  | "finalized"
  | "failed"
  | "expired";

export interface RelayerConfig {
  /** Relayer endpoint URL */
  endpoint: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Priority (1-10, higher = preferred) */
  priority?: number;
  /** Whether this relayer is enabled */
  enabled?: boolean;
}

export interface SubmitTransactionRequest {
  /** Base64-encoded signed transaction */
  transaction: string;
  /** Intent ID for tracking */
  intentId: string;
  /** Maximum retries before giving up */
  maxRetries?: number;
  /** Optional priority fee in lamports */
  priorityFeeLamports?: number;
  /** Fee paid to relayer (in lamports) */
  relayerFee?: number;
  /** User's subscription tier */
  subscriptionTier?: "basic" | "premium";
  /** Metadata for tracking */
  metadata?: {
    source?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

export interface SubmitTransactionResponse {
  /** Transaction signature */
  signature?: string;
  /** Current status */
  status: RelayerStatusCode;
  /** Relayer that accepted the transaction */
  relayer: string;
  /** Estimated confirmation time in seconds */
  estimatedConfirmationTime?: number;
  /** Error message if failed */
  error?: string;
  /** Request ID for tracking */
  requestId?: string;
}

export interface TransactionStatusRequest {
  /** Transaction signature to check */
  signature: string;
  /** Optional intent ID */
  intentId?: string;
}

export interface TransactionStatusResponse {
  /** Transaction signature */
  signature: string;
  /** Current status */
  status: RelayerStatusCode;
  /** Slot when confirmed */
  confirmationSlot?: number;
  /** Block time when confirmed */
  confirmationTime?: number;
  /** Number of confirmations */
  confirmations?: number;
  /** Error message if failed */
  error?: string;
}

export interface RelayerHealthResponse {
  /** Whether relayer is healthy */
  healthy: boolean;
  /** Current queue size */
  queueSize?: number;
  /** Average confirmation time (seconds) */
  averageConfirmationTime?: number;
  /** Success rate (0-1) */
  successRate?: number;
  /** Last check timestamp */
  lastCheckTime: number;
}

export interface RelayerPoolConfig {
  /** List of relayers to use */
  relayers: RelayerConfig[];
  /** Failover strategy: "round-robin" | "priority" | "random" */
  failoverStrategy?: "round-robin" | "priority" | "random";
  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;
  /** Maximum relayers to try per transaction */
  maxRetries?: number;
}

export interface RelayerFeeEstimate {
  /** Fee in SOL */
  feeSol: number;
  /** Fee in lamports */
  feeLamports: number;
  /** Fee percentage (if applicable) */
  feePercentage?: number;
  /** Breakdown of fee components */
  breakdown?: {
    baseNetworkFee?: number;
    reliabilityPremium?: number;
    priorityFee?: number;
  };
}

export interface RelayerMetrics {
  /** Total transactions submitted */
  totalSubmitted: number;
  /** Confirmed transactions */
  confirmed: number;
  /** Failed transactions */
  failed: number;
  /** Pending transactions */
  pending: number;
  /** Average confirmation time in seconds */
  averageConfirmationTime: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total fees paid in lamports */
  totalFeesPaid: number;
}

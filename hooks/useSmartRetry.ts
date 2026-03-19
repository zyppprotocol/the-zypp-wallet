/**
 * useSmartRetry Hook
 *
 * Handles automatic and manual retry of failed transactions
 * with exponential backoff and intelligent retry logic
 */

import { log } from "@/lib/utils/logger";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetryAttempt?: (attempt: number, nextDelayMs: number) => void;
  onRetrySuccess?: () => void;
  onRetryFailed?: (error: Error) => void;
}

export interface RetryState {
  isRetrying: boolean;
  retryCount: number;
  lastError?: Error;
  nextRetryIn?: number; // milliseconds
}

/**
 * Hook for managing retry logic
 */
export function useSmartRetry(config: RetryConfig = {}) {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 60000,
    backoffMultiplier = 1.5,
    onRetryAttempt,
    onRetrySuccess,
    onRetryFailed,
  } = config;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    retryCount: 0,
  });

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Calculate delay for next retry using exponential backoff
   */
  const calculateNextDelay = useCallback(
    (attemptNumber: number): number => {
      const delay = Math.floor(
        initialDelayMs * Math.pow(backoffMultiplier, attemptNumber),
      );
      return Math.min(delay, maxDelayMs);
    },
    [initialDelayMs, backoffMultiplier, maxDelayMs],
  );

  /**
   * Execute retry with exponential backoff
   */
  const retryWithBackoff = useCallback(
    async (
      operation: () => Promise<any>,
      operationName = "operation",
    ): Promise<{ success: boolean; error?: Error }> => {
      setState({ isRetrying: true, retryCount: 0 });

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          log.debug(`Retry attempt ${attempt + 1}/${maxAttempts}`, {
            operation: operationName,
          });

          const result = await operation();

          setState({
            isRetrying: false,
            retryCount: attempt,
          });

          if (onRetrySuccess) {
            onRetrySuccess();
          }

          log.info("Operation succeeded after retry", {
            operation: operationName,
            attempts: attempt + 1,
          });

          return { success: true };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if we should retry
          if (attempt < maxAttempts - 1) {
            const nextDelay = calculateNextDelay(attempt);

            if (onRetryAttempt) {
              onRetryAttempt(attempt + 1, nextDelay);
            }

            log.warn(
              `Operation failed, retrying in ${nextDelay}ms...`,
              lastError,
              {
                operation: operationName,
                attempt: attempt + 1,
                nextDelayMs: nextDelay,
              },
            );

            // Wait before next attempt
            await new Promise((resolve) => setTimeout(resolve, nextDelay));
          }
        }
      }

      // All retries exhausted
      setState({
        isRetrying: false,
        retryCount: maxAttempts,
        lastError: lastError || new Error("Unknown error"),
      });

      if (onRetryFailed && lastError) {
        onRetryFailed(lastError);
      }

      log.error("Operation failed after all retry attempts", lastError, {
        operation: operationName,
        attempts: maxAttempts,
      });

      return {
        success: false,
        error: lastError || new Error("Operation failed"),
      };
    },
    [
      maxAttempts,
      calculateNextDelay,
      onRetryAttempt,
      onRetrySuccess,
      onRetryFailed,
    ],
  );

  /**
   * Cancel pending retry
   */
  const cancelRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isRetrying: false,
    }));
  }, []);

  /**
   * Reset retry state
   */
  const resetRetry = useCallback(() => {
    cancelRetry();
    setState({
      isRetrying: false,
      retryCount: 0,
    });
  }, [cancelRetry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRetry();
    };
  }, [cancelRetry]);

  return {
    ...state,
    retryWithBackoff,
    cancelRetry,
    resetRetry,
  };
}

/**
 * Batch retry multiple operations
 */
export async function retryMultiple(
  operations: { id: string; operation: () => Promise<any> }[],
  config?: RetryConfig,
): Promise<{
  successful: string[];
  failed: { id: string; error: Error }[];
}> {
  const successful: string[] = [];
  const failed: { id: string; error: Error }[] = [];

  for (const { id, operation } of operations) {
    const result = await new Promise<{
      id: string;
      success: boolean;
      error?: Error;
    }>((resolve) => {
      const maxAttempts = config?.maxAttempts || 3;
      let attempts = 0;
      let lastError: Error | null = null;

      const tryOperation = () => {
        operation()
          .then(() => {
            resolve({ id, success: true });
          })
          .catch((error) => {
            lastError = error;
            attempts++;

            if (attempts < maxAttempts) {
              const delay =
                (config?.initialDelayMs || 1000) *
                Math.pow(config?.backoffMultiplier || 1.5, attempts - 1);
              setTimeout(
                tryOperation,
                Math.min(delay, config?.maxDelayMs || 60000),
              );
            } else {
              resolve({
                id,
                success: false,
                error: lastError || new Error("Unknown error"),
              });
            }
          });
      };

      tryOperation();
    });

    if (result.success) {
      successful.push(result.id);
    } else {
      failed.push({
        id: result.id,
        error: result.error || new Error("Unknown error"),
      });
    }
  }

  return { successful, failed };
}

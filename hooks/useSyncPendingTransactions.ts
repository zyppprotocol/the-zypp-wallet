/**
 * useSyncPendingTransactions Hook
 *
 * Automatically syncs pending transactions when network comes online
 * Monitors network status and triggers broadcast on reconnection
 */

import { syncPendingTransactions } from "@/lib/solana/transaction-broadcaster";
import { useEffect, useRef, useState } from "react";
import { useIsOnline } from "./useNetworkConnection";

interface SyncStatus {
  syncing: boolean;
  lastSyncTime?: number;
  confirmed: number;
  failed: number;
  stillPending: number;
  error?: string;
}

export function useSyncPendingTransactions() {
  const isConnected = useIsOnline();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    syncing: false,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
  });
  const syncInProgressRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);

  // Auto-sync when network comes online
  useEffect(() => {
    if (!isConnected || syncInProgressRef.current) {
      return;
    }

    // Debounce: don't sync too frequently
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    if (timeSinceLastSync < 5000) {
      // Wait at least 5 seconds between auto-syncs
      return;
    }

    let mounted = true;

    async function sync() {
      syncInProgressRef.current = true;
      setSyncStatus((prev) => ({ ...prev, syncing: true }));

      try {
        const result = await syncPendingTransactions();

        if (!mounted) return;

        lastSyncTimeRef.current = Date.now();

        setSyncStatus({
          syncing: false,
          lastSyncTime: Date.now(),
          confirmed: result.confirmed,
          failed: result.failed,
          stillPending: result.stillPending,
          error: result.errors.length > 0 ? result.errors[0].error : undefined,
        });

        console.log("Auto-sync completed:", result);
      } catch (err) {
        if (!mounted) return;

        const errorMsg = err instanceof Error ? err.message : String(err);
        setSyncStatus((prev) => ({
          ...prev,
          syncing: false,
          error: errorMsg,
        }));

        console.error("Auto-sync failed:", err);
      } finally {
        syncInProgressRef.current = false;
      }
    }

    sync();

    return () => {
      mounted = false;
    };
  }, [isConnected]);

  // Manual sync trigger
  const manualSync = async () => {
    if (syncInProgressRef.current) {
      console.warn("Sync already in progress");
      return;
    }

    syncInProgressRef.current = true;
    setSyncStatus((prev) => ({ ...prev, syncing: true, error: undefined }));

    try {
      const result = await syncPendingTransactions();

      lastSyncTimeRef.current = Date.now();

      setSyncStatus({
        syncing: false,
        lastSyncTime: Date.now(),
        confirmed: result.confirmed,
        failed: result.failed,
        stillPending: result.stillPending,
        error: result.errors.length > 0 ? result.errors[0].error : undefined,
      });

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus((prev) => ({
        ...prev,
        syncing: false,
        error: errorMsg,
      }));
      throw err;
    } finally {
      syncInProgressRef.current = false;
    }
  };

  return {
    ...syncStatus,
    manualSync,
    isConnected,
  };
}

export default useSyncPendingTransactions;

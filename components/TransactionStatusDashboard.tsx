/**
 * Transaction Status Dashboard
 *
 * Displays real-time status of pending and recent transactions
 * Shows submission progress, confirmation status, and any errors
 */

import { Text } from "@/components/ui";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TransactionIntent } from "@/lib/storage/types";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export interface TransactionStatusDashboardProps {
  transactions: TransactionIntent[];
  onRetry?: (txId: string) => Promise<void>;
  onClearFailed?: () => Promise<void>;
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "pending":
      return "hourglass";
    case "signed":
      return "checkmark-circle";
    case "broadcasting":
      return "sync";
    case "confirmed":
      return "checkmark-done-circle";
    case "failed":
      return "close-circle";
    default:
      return "help-circle";
  }
}

function getStatusColor(status: string, colorScheme: string) {
  switch (status) {
    case "pending":
      return colorScheme === "dark" ? "#f59e0b" : "#d97706"; // amber
    case "signed":
      return colorScheme === "dark" ? "#06b6d4" : "#0891b2"; // cyan
    case "broadcasting":
      return colorScheme === "dark" ? "#3b82f6" : "#2563eb"; // blue
    case "confirmed":
      return colorScheme === "dark" ? "#10b981" : "#059669"; // green
    case "failed":
      return colorScheme === "dark" ? "#ef4444" : "#dc2626"; // red
    default:
      return colorScheme === "dark" ? "#9ca3af" : "#6b7280"; // gray
  }
}

function formatAmount(amount: bigint, decimals = 9): string {
  const divisor = Math.pow(10, decimals);
  const value = Number(amount) / divisor;
  return value.toFixed(2);
}

export function TransactionStatusDashboard({
  transactions,
  onRetry,
  onClearFailed,
  isLoading = false,
  onRefresh,
}: TransactionStatusDashboardProps) {
  const colorScheme = useColorScheme();
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (txId: string) => {
    if (onRetry) {
      try {
        await onRetry(txId);
      } catch (error) {
        console.error("Retry failed:", error);
      }
    }
  };

  const failedTxs = transactions.filter((tx) => tx.status === "failed");
  const pendingTxs = transactions.filter(
    (tx) => tx.status === "pending" || tx.status === "signed",
  );
  const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed");

  if (transactions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Ionicons
          name="checkmark-circle"
          size={48}
          color={colorScheme === "dark" ? "#10b981" : "#059669"}
        />
        <Text className="text-lg font-semibold mt-4 text-center">
          All caught up!
        </Text>
        <Text className="text-sm opacity-50 text-center mt-2">
          No pending transactions
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={syncing} onRefresh={handleRefresh} />
        ) : undefined
      }
    >
      {/* Summary Section */}
      <View className="px-4 py-4 gap-3">
        {pendingTxs.length > 0 && (
          <View className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex-row items-center gap-2">
            <Ionicons
              name="sync"
              size={16}
              color={colorScheme === "dark" ? "#3b82f6" : "#2563eb"}
            />
            <Text className="text-sm flex-1">
              <Text className="font-semibold">{pendingTxs.length}</Text>{" "}
              transaction{pendingTxs.length === 1 ? "" : "s"} pending submission
            </Text>
          </View>
        )}

        {failedTxs.length > 0 && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-2 flex-1">
              <Ionicons
                name="alert-circle"
                size={16}
                color={colorScheme === "dark" ? "#ef4444" : "#dc2626"}
              />
              <Text className="text-sm flex-1">
                <Text className="font-semibold">{failedTxs.length}</Text> failed
                transaction{failedTxs.length === 1 ? "" : "s"}
              </Text>
            </View>
            {onClearFailed && (
              <TouchableOpacity onPress={onClearFailed} className="px-2">
                <Text className="text-xs font-semibold text-red-600">
                  Clear
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Transaction List */}
      <View className="px-4 pb-6">
        {/* Pending Transactions */}
        {pendingTxs.length > 0 && (
          <View className="mb-6">
            <Text className="text-sm font-semibold opacity-60 mb-3 uppercase">
              Pending ({pendingTxs.length})
            </Text>
            <View className="gap-2">
              {pendingTxs.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  colorScheme={colorScheme}
                  isExpanded={expandedTx === tx.id}
                  onPress={() =>
                    setExpandedTx(expandedTx === tx.id ? null : tx.id)
                  }
                  onRetry={() => handleRetry(tx.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Confirmed Transactions */}
        {confirmedTxs.length > 0 && (
          <View className="mb-6">
            <Text className="text-sm font-semibold opacity-60 mb-3 uppercase">
              Confirmed ({confirmedTxs.length})
            </Text>
            <View className="gap-2">
              {confirmedTxs.slice(0, 3).map((tx) => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  colorScheme={colorScheme}
                  isExpanded={expandedTx === tx.id}
                  onPress={() =>
                    setExpandedTx(expandedTx === tx.id ? null : tx.id)
                  }
                />
              ))}
            </View>
          </View>
        )}

        {/* Failed Transactions */}
        {failedTxs.length > 0 && (
          <View>
            <Text className="text-sm font-semibold opacity-60 mb-3 uppercase">
              Failed ({failedTxs.length})
            </Text>
            <View className="gap-2">
              {failedTxs.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  colorScheme={colorScheme}
                  isExpanded={expandedTx === tx.id}
                  onPress={() =>
                    setExpandedTx(expandedTx === tx.id ? null : tx.id)
                  }
                  onRetry={() => handleRetry(tx.id)}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

interface TransactionCardProps {
  tx: TransactionIntent;
  colorScheme: string;
  isExpanded: boolean;
  onPress: () => void;
  onRetry?: () => void;
}

function TransactionCard({
  tx,
  colorScheme,
  isExpanded,
  onPress,
  onRetry,
}: TransactionCardProps) {
  const statusColor = getStatusColor(tx.status, colorScheme);
  const icon = getStatusIcon(tx.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white dark:bg-black/20 rounded-lg p-3 border border-black/10 dark:border-white/10"
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons name={icon} size={16} color={statusColor} />
          <View className="flex-1">
            <Text className="font-semibold text-sm">
              {tx.type === "payment"
                ? `Send ${tx.token}`
                : tx.type === "swap"
                  ? "Swap"
                  : tx.defiAction || "DeFi"}
            </Text>
            <Text className="text-xs opacity-50" numberOfLines={1}>
              {tx.recipient.slice(0, 8)}...{tx.recipient.slice(-8)}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="font-semibold text-sm">
            {formatAmount(tx.amount)}
          </Text>
          <Text className="text-xs opacity-50 capitalize">{tx.status}</Text>
        </View>
      </View>

      {isExpanded && (
        <View className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 gap-2">
          <View className="flex-row justify-between">
            <Text className="text-xs opacity-60">Intent ID</Text>
            <Text className="text-xs font-mono" numberOfLines={1}>
              {tx.id.slice(0, 8)}...{tx.id.slice(-8)}
            </Text>
          </View>

          {tx.signature && (
            <View className="flex-row justify-between">
              <Text className="text-xs opacity-60">Signature</Text>
              <Text className="text-xs font-mono" numberOfLines={1}>
                {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
              </Text>
            </View>
          )}

          {tx.status === "failed" && onRetry && (
            <TouchableOpacity
              onPress={onRetry}
              className="mt-3 bg-blue-500 rounded-lg py-2 items-center"
            >
              <Text className="font-semibold text-white text-xs">Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Offline Mode Banner Component
 *
 * Displays persistent indicator when device is offline
 * Shows sync status and available actions
 */

import { Text } from "@/components/ui";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { TouchableOpacity, View } from "react-native";

export interface OfflineModeBannerProps {
  visible: boolean;
  syncStatus?: "syncing" | "synced" | "failed" | "idle";
  pendingCount?: number;
  onRetrySync?: () => void;
}

export function OfflineModeBanner({
  visible,
  syncStatus = "idle",
  pendingCount = 0,
  onRetrySync,
}: OfflineModeBannerProps) {
  const colorScheme = useColorScheme();

  if (!visible) {
    return null;
  }

  const getStatusIcon = () => {
    switch (syncStatus) {
      case "syncing":
        return "sync";
      case "synced":
        return "checkmark-circle";
      case "failed":
        return "alert-circle";
      default:
        return "cloud-offline";
    }
  };

  const getStatusColor = () => {
    switch (syncStatus) {
      case "syncing":
        return colorScheme === "dark" ? "#3b82f6" : "#3b82f6"; // blue
      case "synced":
        return colorScheme === "dark" ? "#10b981" : "#059669"; // green
      case "failed":
        return colorScheme === "dark" ? "#ef4444" : "#dc2626"; // red
      default:
        return colorScheme === "dark" ? "#f59e0b" : "#d97706"; // amber
    }
  };

  const getStatusMessage = () => {
    switch (syncStatus) {
      case "syncing":
        return "Syncing your transactions...";
      case "synced":
        return pendingCount > 0
          ? `${pendingCount} transaction${pendingCount === 1 ? "" : "s"} synced`
          : "All synced!";
      case "failed":
        return "Sync failed. Tap to retry.";
      default:
        return `You're offline. ${pendingCount} transaction${pendingCount === 1 ? "" : "s"} pending.`;
    }
  };

  return (
    <View className="bg-black/5 dark:bg-black/20 border-b border-black/10 dark:border-white/10 px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
          <Text
            className={`text-xs font-medium flex-1 ${
              syncStatus === "syncing" ? "animate-pulse" : ""
            }`}
            numberOfLines={1}
          >
            {getStatusMessage()}
          </Text>
        </View>

        {syncStatus === "failed" && onRetrySync && (
          <TouchableOpacity
            onPress={onRetrySync}
            className="px-3 py-1 bg-black/10 dark:bg-white/10 rounded-full"
          >
            <Text className="text-xs font-semibold">Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

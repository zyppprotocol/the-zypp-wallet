import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import useUser from "@/hooks/useUser";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, TouchableOpacity } from "react-native";

export default function Settings() {
  const router = useRouter();
  const colorScheme = useColorScheme();

  const { user, refresh } = useUser();

  const formatTimeout = (ms?: number | null) => {
    if (ms === undefined || ms === null) return "Default (5 min)";
    if (ms === 0) return "Off";
    const mins = Math.round(ms / 60000);
    return `${mins} minute${mins > 1 ? "s" : ""}`;
  };

  const setAutoLockTimeout = async (ms: number) => {
    try {
      const SecureStorage = (await import("@/lib/storage/secure-storage"))
        .SecureStorage;
      const u = await SecureStorage.getUser();
      if (!u) return;
      const updated = {
        ...u,
        settings: {
          ...(u.settings || {}),
          autoLockTimeoutMs: ms,
        },
      };
      await SecureStorage.setUser(updated);
      await refresh();
    } catch (err) {
      console.warn("Failed to update auto-lock timeout", err);
    }
  };

  const showAutoLockOptions = () => {
    Alert.alert(
      "Auto-lock timeout",
      "Choose inactivity timeout before app auto-locks",
      [
        { text: "Off", onPress: () => setAutoLockTimeout(0) },
        { text: "1 minute", onPress: () => setAutoLockTimeout(1 * 60 * 1000) },
        { text: "5 minutes", onPress: () => setAutoLockTimeout(5 * 60 * 1000) },
        {
          text: "15 minutes",
          onPress: () => setAutoLockTimeout(15 * 60 * 1000),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 px-6 py-6">
      <View className="flex-row items-center mb-4">
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
          <Ionicons
            name="chevron-back-outline"
            size={20}
            color={colorScheme === "dark" ? "#fff" : "#000"}
          />
        </TouchableOpacity>
        <Text className="text-2xl font-bold">Settings</Text>
      </View>

      <View className="rounded-2xl bg-white/5 p-4">
        <Text className="font-semibold">Privacy mode</Text>
        <Text className="text-sm opacity-70">
          {user?.settings?.defaultPrivacyMode ?? "standard"}
        </Text>

        <View className="mt-4">
          <Text className="font-semibold">Offline transactions</Text>
          <Text className="text-sm opacity-70">
            {String(user?.settings?.allowOfflineTransactions ?? true)}
          </Text>
        </View>

        <TouchableOpacity onPress={showAutoLockOptions} className="mt-4">
          <Text className="font-semibold">Auto-lock</Text>
          <Text className="text-sm opacity-70">
            {formatTimeout(user?.settings?.autoLockTimeoutMs)}
          </Text>
        </TouchableOpacity>

        {/* Dev-only: Clear local user and wallet (useful to reset state during testing) */}
        {__DEV__ ? (
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Clear local data",
                "This will delete the local Zypp user and wipe the wallet on this device. This is destructive. Continue?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        const { SecureStorage } = await import(
                          "@/lib/storage/secure-storage"
                        );
                        await SecureStorage.deleteUser();
                        await SecureStorage.wipeWallet();
                        Alert.alert(
                          "Cleared",
                          "Local user and wallet wiped. Returning to welcome."
                        );
                        router.replace("/welcome");
                      } catch (err) {
                        console.warn("Failed to clear local data", err);
                        Alert.alert("Error", "Failed to clear local data");
                      }
                    },
                  },
                ]
              )
            }
            className="mt-4"
          >
            <Text className="text-sm text-red-500">
              Clear local user & wallet (dev)
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import useUser from "@/hooks/useUser";
import { useAppLock } from "@/lib/storage/app-lock";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Switch, TouchableOpacity } from "react-native";

export default function Settings() {
  const router = useRouter();
  const colorScheme = useColorScheme();

  const { user, refresh } = useUser();
  const { lock, refreshBiometricAvailability } = useAppLock();
  const [updatingBio, setUpdatingBio] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { SecureStorage } = await import("@/lib/storage/secure-storage");
        const cfg = await SecureStorage.getWalletConfig();
        setBiometricEnabled(cfg.biometricEnabled);
      } catch (err) {
        console.warn("Failed to fetch wallet config", err);
      }
    })();
  }, [user]);

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

  const toggleBiometrics = async (value: boolean) => {
    setUpdatingBio(true);
    try {
      if (value) {
        // Prompt for biometric before enabling
        const { authenticateWithBiometric } = await import(
          "@/lib/storage/biometric"
        );
        const auth = await authenticateWithBiometric(
          "Confirm to enable Biometric Unlock"
        );
        if (!auth.success) {
          throw new Error(auth.error || "Authentication failed");
        }
      }

      const { SecureStorage } = await import("@/lib/storage/secure-storage");
      const cfg = await SecureStorage.getWalletConfig();
      await SecureStorage.setWalletConfig({
        ...cfg,
        biometricEnabled: value,
      });
      setBiometricEnabled(value);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await refreshBiometricAvailability();
      await refresh();
    } catch (err) {
      Alert.alert("Authentication Failed", String(err));
      // Revert toggle state if it fails
      setBiometricEnabled(!value);
    } finally {
      setUpdatingBio(false);
    }
  };

  const handleManualLock = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    lock();
  };

  const handleWipeWallet = () => {
    Alert.prompt(
      "Confirm Wipe",
      'This will permanently delete your keys and profile from this device. Please type "WIPE" to confirm.',
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: async (val) => {
            if (val === "WIPE") {
              try {
                const { SecureStorage } = await import(
                  "@/lib/storage/secure-storage"
                );
                await SecureStorage.deleteUser();
                await SecureStorage.wipeWallet();
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Warning
                );
                router.replace("/welcome");
              } catch (err) {
                Alert.alert("Error", "Failed to wipe wallet");
              }
            } else {
              Alert.alert("Incorrect Phrase", 'Please type "WIPE" exactly.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="relative flex-1">
      {colorScheme === "dark" ? (
        <Image
          source={require("@/assets/images/home-gradient-dark.png")}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            width: "120%",
            height: 500,
          }}
          resizeMode="cover"
        />
      ) : (
        <Image
          source={require("@/assets/images/home-gradient-light.png")}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            width: "120%",
            height: 500,
          }}
          resizeMode="cover"
        />
      )}
      <View className="px-6 py-6">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
            <Ionicons
              name="chevron-back-outline"
              size={20}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>
          <Text className="text-2xl font-semibold">Settings</Text>
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

          <View className="mt-6 pt-4 border-t border-white/10">
            <Text className="text-xs font-bold uppercase tracking-widest opacity-40 mb-4">
              Security
            </Text>

            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="font-semibold">Biometric Unlock</Text>
                <Text className="text-xs opacity-60">
                  Use Face ID / Touch ID
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometrics}
                disabled={updatingBio}
                trackColor={{ true: "#05E28A", false: "#ccc" }}
              />
            </View>

            <TouchableOpacity
              onPress={handleManualLock}
              className="flex-row items-center justify-between py-3"
            >
              <View>
                <Text className="font-semibold">Lock App Now</Text>
                <Text className="text-xs opacity-60">
                  Immediately trigger lock screen
                </Text>
              </View>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleWipeWallet}
              className="flex-row items-center justify-between py-3 mt-2"
            >
              <View>
                <Text className="font-semibold text-red-500">Wipe Wallet</Text>
                <Text className="text-xs text-red-500/60">
                  Destructive: Remove all local data
                </Text>
              </View>
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={20}
                color="#ef4444"
              />
            </TouchableOpacity>
          </View>

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
      </View>
    </SafeAreaView>
  );
}

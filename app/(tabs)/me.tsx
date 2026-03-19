import PrivacyCheckup from "@/components/PrivacyCheckup";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  useColorScheme,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useIsOnline } from "@/hooks/useNetworkConnection";
import useUser from "@/hooks/useUser";
import {
  deleteUser,
  dismissProfilePrompt,
  updateUserProfileImage,
} from "@/lib/auth";
import * as Solana from "@/lib/solana";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from "react-native";

export const Me = () => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { user, refresh } = useUser();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCheckup, setShowCheckup] = useState(false);

  const isOnline = useIsOnline();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!isOnline) {
        Alert.alert(
          "Offline Mode",
          "You are currently offline. Some data may not be up to date."
        );
      }
      await refresh();
    } catch (err) {
      console.error("Failed to refresh:", err);
      Alert.alert(
        "Refresh Failed",
        "Could not update your balance. Please try again."
      );
    } finally {
      setRefreshing(false);
    }
  }, [refresh, isOnline]);

  useEffect(() => {
    let mounted = true;
    async function fetchBalance() {
      if (!user) {
        setBalanceSol(null);
        return;
      }

      // Show cached balance immediately if available
      try {
        const cached = await Solana.getCachedBalance(user.solanaPublicKey);
        if (mounted && cached != null) {
          setBalanceSol(cached / 1e9);
        }
      } catch (err) {
        console.warn("Failed to read cached balance", err);
      }

      // If online, fetch fresh balance and update cache
      if (!isOnline) return;

      setBalLoading(true);
      try {
        const lamports = await Solana.syncAndCacheBalance(user.solanaPublicKey);
        if (!mounted) return;
        setBalanceSol(lamports / 1e9);
      } catch (err) {
        console.warn("Failed to fetch balance", err);
      } finally {
        if (mounted) setBalLoading(false);
      }
    }
    fetchBalance();
    return () => {
      mounted = false;
    };
  }, [user, isOnline]);

  const shortKey = (k?: string) =>
    k ? `${k.slice(0, 4)}...${k.slice(-4)}` : "";

  const handleCopyAddress = async () => {
    if (!user?.solanaPublicKey) return;
    await setStringAsync(user.solanaPublicKey);
    Alert.alert("Copied", "Public key copied to clipboard");
  };

  const handleAirdrop = async (amt = 1) => {
    if (!user?.solanaPublicKey) return;
    try {
      setLoading(true);
      await Solana.requestAirdrop(user.solanaPublicKey, amt);
      const lamports = await Solana.getBalance(user.solanaPublicKey);
      setBalanceSol(lamports / 1e9);
      Alert.alert("Airdrop", `Requested ${amt} SOL on devnet`);
    } catch (err) {
      Alert.alert("Airdrop failed", String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
      } as any);
      const uri = (result as any)?.assets?.[0]?.uri;
      if (!uri) return;
      setUploading(true);
      await updateUserProfileImage(uri);
      await refresh();
    } catch (err) {
      console.warn("Image pick failed", err);
      Alert.alert("Image upload failed", String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDismissProfilePrompt = async () => {
    if (!user) return;
    await dismissProfilePrompt();
    await refresh();
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign out",
      "This will delete the local Zypp account and wallet from this device. This action cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await deleteUser();
              // Navigate back to welcome screen
              router.replace("/welcome");
            } catch (err) {
              console.error("Failed to sign out:", err);
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : String(err)
              );
            } finally {
              setLoading(false);
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        contentContainerStyle={{ flexGrow: 1 }}
        className="px-6 py-6"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colorScheme === "dark" ? "#ffffff" : "#000000"}
            colors={[colorScheme === "dark" ? "#ffffff" : "#000000"]}
            progressBackgroundColor={
              colorScheme === "dark" ? "#000000" : "#ffffff"
            }
            title="Refreshing..."
            titleColor="#888888"
          />
        }
      >
        {/* Header */}
        <View>
          <View className="flex-row items-center justify-between mb-6">
            <View>
              <Text className="text-2xl font-semibold">
                {user?.zyppUserId || "Your name"}
              </Text>
              <View className="flex-row items-center mt-2">
                <View className="rounded-xl bg-black dark:bg-primary px-2 py-1 mr-2">
                  <Text className="text-sm font-semibold text-white dark:text-black">
                    {user?.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handlePickImage}
              className="bg-black/5 dark:bg-white/5 rounded-full p-3"
            >
              {user?.profileImageUrl ? (
                <Image
                  source={{ uri: user.profileImageUrl }}
                  style={{ width: 48, height: 48, borderRadius: 24 }}
                />
              ) : (
                <View className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 items-center justify-center">
                  <Text className="font-semibold">
                    {user?.zyppUserId?.charAt(0).toUpperCase() ?? "U"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Wallet summary */}
          <View className="rounded-2xl bg-white/5 p-4 mb-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm opacity-70">Wallet</Text>
                <Text className="text-xl font-semibold">
                  {balLoading
                    ? "…"
                    : balanceSol != null
                    ? `${balanceSol.toFixed(4)} SOL`
                    : "—"}
                </Text>
                <Text className="text-sm opacity-70 mt-1">
                  {user?.solanaPublicKey
                    ? shortKey(user.solanaPublicKey)
                    : "No wallet"}
                </Text>
              </View>

              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={handleCopyAddress}
                  className="mr-3 bg-black/5 dark:bg-white/5 p-2 rounded-xl"
                >
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color={colorScheme === "dark" ? "#fff" : "#000"}
                  />
                </TouchableOpacity>

                {__DEV__ ? (
                  <TouchableOpacity
                    onPress={() => handleAirdrop(1)}
                    className="bg-black dark:bg-primary py-2 px-5 rounded-full"
                  >
                    {loading ? (
                      <ActivityIndicator color="#000" size="small" />
                    ) : (
                      <Text className="text-white dark:text-black font-semibold">
                        Airdrop
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {user?.profileImageUrl == null && !user?.profilePromptDismissedAt && (
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-semibold">Add a profile photo</Text>
                <TouchableOpacity onPress={handleDismissProfilePrompt}>
                  <Text className="text-sm opacity-70">Dismiss</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={handlePickImage}
                  className="mr-3 bg-white/5 rounded-2xl p-3"
                >
                  {uploading ? <ActivityIndicator /> : <Text>Add photo</Text>}
                </TouchableOpacity>
                <Text className="text-sm opacity-70">
                  Make it easier for friends to recognize you.
                </Text>
              </View>
            </View>
          )}

          {/* Quick Action Tiles */}
          <View className="flex-row justify-between mb-4">
            <TouchableOpacity
              onPress={() => router.push("/help")}
              className="flex-1 mr-3 dark:bg-white/5 bg-black/5 rounded-2xl p-4 items-center"
            >
              <IconSymbol
                name="questionmark.circle"
                size={24}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
              <Text className="mt-2">Help</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/wallet")}
              className="flex-1 mr-3 dark:bg-white/5 bg-black/5 rounded-2xl p-4 items-center"
            >
              <IconSymbol
                name="wallet.bifold.fill"
                size={24}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
              <Text className="mt-2">Wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/activity")}
              className="flex-1 dark:bg-white/5 bg-black/5 rounded-2xl p-4 items-center"
            >
            {Platform.OS === "ios" ? (
              <IconSymbol
                name="chart.bar.fill"
                size={24}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            ) : (
              <MaterialIcons
                name="history"
                size={24}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            )}
              <Text className="mt-2">Activity</Text>
            </TouchableOpacity>
          </View>

          {/* Privacy Checkup Card */}
          <TouchableOpacity
            onPress={() => setShowCheckup(true)}
            className="w-full rounded-2xl dark:bg-white/5 bg-black/5 p-4 mb-6 flex-row items-center justify-between"
          >
            <View className="flex-1 pr-4">
              <Text className="font-semibold mb-1">Privacy checkup</Text>
              <Text className="text-sm opacity-70">
                Take an interactive tour of your privacy settings
              </Text>
            </View>
            <View style={{ width: 64, height: 48 }}>
              <Image
                source={require("@/assets/images/user.png")}
                style={{ width: 64, height: 48 }}
              />
            </View>
          </TouchableOpacity>

          {/* Menu list */}
          <View className="divide-y divide-gray-200 dark:divide-white/10 rounded-2xl overflow-hidden">
            <TouchableOpacity
              onPress={() => router.push("/settings")}
              className="flex-row items-center justify-between px-4 py-5"
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="settings-outline"
                  size={18}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
                <Text className="ml-3">Settings</Text>
              </View>
              <Ionicons
                name="chevron-forward-outline"
                size={18}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/profile")}
              className="flex-row items-center justify-between px-4 py-5"
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
                <Text className="ml-3">Manage Zypp account</Text>
              </View>
              <Ionicons
                name="chevron-forward-outline"
                size={18}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            </TouchableOpacity>
          </View>

          <View className="mt-6">
            {user?.device?.lastUnlockedAt ? (
              <Text className="text-sm opacity-70 mb-2">
                Last unlocked:{" "}
                {new Date(user.device.lastUnlockedAt).toLocaleString()}
              </Text>
            ) : null}

            {user?.device?.lastSyncedAt ? (
              <Text className="text-sm opacity-70 mb-2">
                Last synced:{" "}
                {new Date(user.device.lastSyncedAt).toLocaleString()}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSignOut}
              disabled={loading}
              className={`w-full rounded-full py-3 ${
                loading ? "bg-neutral-400" : "bg-red-600"
              } items-center justify-center mt-4`}
            >
              <Text className="text-white font-semibold">
                {loading ? "Signing out…" : "Sign out"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View className="h-20" />
      </ScrollView>

      <PrivacyCheckup
        visible={showCheckup}
        onClose={() => setShowCheckup(false)}
      />
    </SafeAreaView>
  );
};
export default Me;

import {
  SafeAreaView,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  useIsOnline,
  useNetworkConnection,
} from "@/hooks/useNetworkConnection";
import useUser from "@/hooks/useUser";
import { dismissProfilePrompt, updateUserProfileImage } from "@/lib/auth";
import * as Solana from "@/lib/solana";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ScanLine } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  TouchableOpacity,
} from "react-native";

export const Wallet = () => {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { isConnected, checkConnection } = useNetworkConnection();

  const { user, loading, refresh } = useUser();

  const [refreshing, setRefreshing] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const isOnline = useIsOnline();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!isConnected) {
        Alert.alert(
          "Offline Mode",
          "You are currently offline. Some data may not be up to date."
        );
      }
      await refresh();
    } catch (err) {
      console.error("Failed to refresh:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      Alert.alert(
        "Refresh Failed",
        "Could not update your balance and transactions. Please try again."
      );
    } finally {
      setRefreshing(false);
    }
  }, [refresh, isConnected]);

  useEffect(() => {
    // If hook has finished loading and no user exists, redirect to create-user
    if (!loading && user === null) {
      router.replace("/create-user");
    }

    // If user exists and no profile image and user hasn't dismissed, show modal
    if (
      !loading &&
      user &&
      user.profileImageUrl == null &&
      !user.profilePromptDismissedAt
    ) {
      setShowProfileModal(true);
    }
  }, [loading, user, router]);

  // Fetch balance (cached first, then synced if online)
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

  const handleUploadPhoto = async () => {
    try {
      setUploading(true);
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please allow photo access to upload a profile image."
        );
        return;
      }

      const ImagePickerModule = await import("expo-image-picker");
      const result = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ImagePickerModule.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        aspect: [1, 1],
      });

      // New result shape: { canceled: boolean, assets: [{ uri }] }
      if ("canceled" in result && result.canceled) return;

      const asset = Array.isArray((result as any).assets)
        ? (result as any).assets[0]
        : undefined;
      const uri = asset?.uri;
      if (!uri) return;

      await updateUserProfileImage(uri);
      await refresh();
      setShowProfileModal(false);
      Alert.alert("Profile updated", "Your profile photo was added.");
    } catch (err) {
      console.error("Failed to upload profile image:", err);
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = async () => {
    try {
      await dismissProfilePrompt();
      await refresh();
      setShowProfileModal(false);
    } catch (err) {
      console.error("Failed to dismiss profile prompt:", err);
    }
  };

  return (
    <SafeAreaView className="relative">
      {colorScheme === "dark" ? (
        <Image
          source={require("@/assets/images/home-gradient.png")}
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
        className="flex-1 pt-6 pb-10 px-6 w-full"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colorScheme === "dark" ? "#ffffff" : "#000000"} // iOS
            colors={[colorScheme === "dark" ? "#ffffff" : "#000000"]} // Android
            progressBackgroundColor={
              colorScheme === "dark" ? "#000000" : "#ffffff"
            } // Android
            title="Refreshing..." // iOS
            titleColor="#888888"
          />
        }
      >
        {/* Header */}
        <View className="flex flex-row items-center justify-between">
          <TouchableOpacity
            className="flex-row items-center gap-3 h-14 rounded-full"
            accessibilityLabel="User profile"
            activeOpacity={0.8}
            onPress={() => router.push("/me" as any)}
          >
            <Image
              source={user?.profileImageUrl}
              style={{ width: 40, height: 40, borderRadius: 20 }}
              className="w-10 h-10 rounded-full"
            />
            {/* <Text className="text-white font-semibold text-base">
                {user?.zyppUserId || "Unknown User"}
              </Text>
              <Ionicons
                name="chevron-forward-outline"
                size={14}
                color="white"
              /> */}
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-black/10 flex flex-row items-center justify-center gap-4 dark:bg-white/10 rounded-full py-3 px-8"
            onPress={checkConnection}
          >
            {isConnected ? (
              <>
                <View className="w-3 h-3 bg-black dark:bg-primary rounded-full" />
                <Text className="text-black dark:text-white font-semibold">
                  Online
                </Text>
              </>
            ) : (
              <>
                <View className="w-3 h-3 bg-red-500 rounded-full" />
                <Text className="text-black dark:text-white font-semibold">
                  Offline
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity className="bg-black/5 dark:bg-white/5 rounded-2xl p-3">
            <ScanLine
              size={22}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View className="mt-8 mb-6">
          <Text className="text-3xl font-medium tracking-tighter">
            Hey, {user?.zyppUserId}!
          </Text>
          <Text className=" mt-1 font-medium opacity-70">
            Welcome back to your Zypp wallet.
          </Text>
        </View>

        {/* Wallet Card */}
        <View
          className="w-full h-60 relative rounded-2xl items-start p-6 justify-start"
          style={{
            backgroundColor: colorScheme === "dark" ? "#05E28A" : "#000",
          }}
        >
          <TouchableOpacity className="absolute top-6 right-6 dark:bg-black bg-white rounded-2xl scale-90 p-3">
            <Ionicons
              name="swap-horizontal-outline"
              size={22}
              strokeWidth={5}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row justify-between items-center bg-white dark:bg-black rounded-full border border-white/10 px-1 pr-3 py-1 mb-3">
            <Image
              source={require("@/assets/images/usdc-icon.png")}
              style={{
                borderRadius: 16,
                width: 32,
                height: 32,
              }}
              className="w-8 h-8 mr-2 scale-75 rounded-full"
            />
            <Text className="dark:text-white text-black ml-2 font-semibold text-md">
              USDC
            </Text>
            <Ionicons
              name="chevron-down-outline"
              size={14}
              color={colorScheme === "dark" ? "#fff" : "#000"}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
          <Text className=" mt-1 font-semibold dark:text-black text-white tracking-tighter opacity-70">
            Your balance
          </Text>

          <View className="flex flex-row items-center justify-center gap-6">
            {balLoading ? (
              <ActivityIndicator
                color={colorScheme === "dark" ? "#000" : "#fff"}
              />
            ) : (
              <Text
                className="text-3xl font-semibold"
                style={{ color: colorScheme === "dark" ? "#000" : "#fff" }}
              >
                {balanceHidden
                  ? "•••••"
                  : balanceSol != null
                    ? `${balanceSol.toFixed(2)} SOL`
                    : "--"}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setBalanceHidden(!balanceHidden)}
              className="bg-black/10 dark:bg-white/10 flex items-center justify-center rounded-full"
            >
              <Ionicons
                name={balanceHidden ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colorScheme === "dark" ? "#000" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* <Text
            className="font-medium text-black tracking-tighter opacity-70"
            style={{ color: colorScheme === "dark" ? "#000" : "#fff" }}
          >
            ≈ $249.73 USD
          </Text> */}

          <Text className="mt-4 font-semibold text-sm dark:text-black text-white tracking-tighter opacity-80">
            Wallet Address:
          </Text>
          <View className="flex flex-row items-center gap-2">
            <Text
              className="font-semibold text-lg dark:text-black text-white tracking-tighter opacity-79"
              style={{ color: colorScheme === "dark" ? "#000" : "#fff" }}
            >
              {user?.solanaPublicKey.slice(0, 6)}...
            </Text>
            <TouchableOpacity>
              <Ionicons
                name="copy-outline"
                size={16}
                color={colorScheme === "dark" ? "#000" : "#fff"}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wallet Actions */}
        <View className="mt-8 gap-3">
          {/* Primary Actions */}
          <View className="flex flex-row gap-2 justify-center">
            <TouchableOpacity
              onPress={() => router.push("/send")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-4 flex flex-row items-center justify-center"
            >
              <MaterialCommunityIcons
                name="arrow-top-right"
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ marginRight: 8 }}
              />
              <Text className="text-black dark:text-white text-lg font-semibold">
                Send
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/receive")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-4 flex flex-row items-center justify-center"
            >
              <MaterialCommunityIcons
                name="arrow-bottom-left"
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ marginRight: 8 }}
              />
              <Text className="text-black dark:text-white text-lg font-semibold">
                Receive
              </Text>
            </TouchableOpacity>
          </View>

          {/* Secondary Actions */}
          <View className="flex flex-row gap-2 justify-center">
            <TouchableOpacity
              onPress={() => router.push("/send")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-4 flex flex-row items-center justify-center"
            >
              <IconSymbol
                name="plus.circle"
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ marginRight: 8 }}
              />
              <Text className="text-black dark:text-white text-lg font-semibold">
                Top-up
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/receive")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-4 flex flex-row items-center justify-center"
            >
              <IconSymbol
                name="arrow.up.left.arrow.down.right"
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ marginRight: 8 }}
              />
              <Text className="text-black dark:text-white text-lg font-semibold">
                Redeem
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction History */}
        <View className="mt-10">
          <View className="mb-4 flex flex-row items-center justify-between">
            <Text className="text-xl font-semibold">Activity</Text>
            <TouchableOpacity onPress={() => router.push("/activity" as any)}>
              <Text className="font-semibold opacity-70">See all</Text>
            </TouchableOpacity>
          </View>
          <View className="flex flex-col mt-10 items-center justify-center">
            <Image
              source={
                colorScheme === "dark"
                  ? require("@/assets/images/empty-transactions-dark.png")
                  : require("@/assets/images/empty-transactions-light.png")
              }
              style={{ width: 70, height: 70 }}
              contentFit="contain"
            />
            <Text className="mt-4 font-medium opacity-70">
              No transactions yet.
            </Text>
          </View>
        </View>

        {/* Profile upload modal for new users */}
        <Modal
          visible={showProfileModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowProfileModal(false)}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white dark:bg-black rounded-t-3xl p-6">
              <Text className="text-xl font-semibold mb-2">
                Add a profile photo
              </Text>
              <Text className="text-sm text-neutral-500 mb-4">
                Upload a profile photo for faster recognition and a friendlier
                experience.
              </Text>

              <View className="items-center mb-4">
                {user?.profileImageUrl ? (
                  <Image
                    source={{ uri: user.profileImageUrl }}
                    style={{ width: 104, height: 104, borderRadius: 52 }}
                  />
                ) : (
                  <View
                    style={{ width: 104, height: 104, borderRadius: 52 }}
                    className="bg-black/5 dark:bg-white/5 items-center justify-center"
                  >
                    <Text className="text-2xl">
                      {user?.zyppUserId?.charAt(0).toUpperCase() ?? "U"}
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={handleUploadPhoto}
                  disabled={uploading}
                  className="flex-1 rounded-full bg-black dark:bg-white py-3 items-center justify-center"
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white dark:text-black font-semibold">
                      Upload photo
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSkip}
                  className="flex-1 rounded-full border border-neutral-200 dark:border-white/10 py-3 items-center justify-center"
                >
                  <Text className="font-semibold">Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
};
export default Wallet;

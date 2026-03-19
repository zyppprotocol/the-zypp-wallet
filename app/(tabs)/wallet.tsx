import { AssetsView } from "@/components/AssetsView";
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
import { useSyncPendingTransactions } from "@/hooks/useSyncPendingTransactions";
import useUser from "@/hooks/useUser";
import { dismissProfilePrompt, updateUserProfileImage } from "@/lib/auth";
import * as Solana from "@/lib/solana";
import { fetchTokenPrices, getUSDCBalance } from "@/lib/solana/token-utils";
import { OfflineTransactionQueue } from "@/lib/storage/offline-queue";
import { TransactionIntent } from "@/lib/storage/types";
import { getTransactionCountInfo } from "@/lib/subscription/subscription-manager";
import { log } from "@/lib/utils/logger";
import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { RefreshCcw } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from "react-native";

const TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    image: require("@/assets/images/usdc-icon.png"),
  },
  {
    symbol: "SOL",
    name: "Solana",
    image: require("@/assets/images/sol-icon.png"),
  },
];

export const Wallet = () => {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { isConnected, checkConnection } = useNetworkConnection();

  const { user, loading, refresh } = useUser();

  const [refreshing, setRefreshing] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number>(180); // Default fallback
  const [usdcPrice, setUsdcPrice] = useState<number>(1.0);
  const [balLoading, setBalLoading] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<TransactionIntent[]>([]);

  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    count: number;
    limit: number | "unlimited";
    tier: "basic" | "premium";
    remaining: number | "unlimited";
  } | null>(null);

  const isOnline = useIsOnline();
  const syncPending = useSyncPendingTransactions();

  // Check connection status immediately when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Check connection when screen is focused to update indicator immediately
      checkConnection();
    }, [checkConnection])
  );

  // Check connection when app comes to foreground (e.g., when coming back online)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // App has come to the foreground, check connection immediately
        checkConnection();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkConnection]);

  // Load subscription info
  useEffect(() => {
    const loadSubscriptionInfo = async () => {
      try {
        const info = await getTransactionCountInfo();
        setSubscriptionInfo(info);
      } catch (error) {
        log.error("Failed to load subscription info", error);
      }
    };
    loadSubscriptionInfo();
  }, [user]);

  // Sort tokens by balance (highest first, non-zero first)
  const sortedTokens = useMemo(() => {
    return [...TOKENS].sort((a, b) => {
      const balanceA =
        a.symbol === "SOL" ? balanceSol ?? 0 : balanceUsdc ?? 0;
      const balanceB =
        b.symbol === "SOL" ? balanceSol ?? 0 : balanceUsdc ?? 0;

      // If one is zero and the other isn't, prioritize non-zero
      if (balanceA === 0 && balanceB > 0) return 1;
      if (balanceB === 0 && balanceA > 0) return -1;

      // Otherwise sort by highest balance
      return balanceB - balanceA;
    });
  }, [balanceSol, balanceUsdc]);

  // Update selected token to the one with highest balance when balances change
  useEffect(() => {
    if (sortedTokens.length > 0) {
      const highestBalanceToken = sortedTokens[0];
      const highestBalance =
        highestBalanceToken.symbol === "SOL"
          ? balanceSol ?? 0
          : balanceUsdc ?? 0;
      const currentBalance =
        selectedToken.symbol === "SOL"
          ? balanceSol ?? 0
          : balanceUsdc ?? 0;

      // Update if:
      // 1. Highest balance token is different from current selection, AND
      // 2. Either the highest has a non-zero balance while current is zero, OR
      //    the highest balance is greater than current balance
      if (
        highestBalanceToken.symbol !== selectedToken.symbol &&
        (highestBalance > 0 && currentBalance === 0 || highestBalance > currentBalance)
      ) {
        setSelectedToken(highestBalanceToken);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTokens]);

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
      log.error("Failed to refresh wallet data", err);
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
        setBalanceUsdc(null);
        return;
      }

      // Show cached balance immediately if available
      try {
        const cached = await Solana.getCachedBalance(user.solanaPublicKey);
        if (mounted && cached != null) {
          setBalanceSol(cached / 1e9);
        }
      } catch (err) {
        log.warn("Failed to read cached balance", err);
      }

      setBalLoading(true);
      try {
        const [lamports, usdc, prices] = await Promise.all([
          isOnline
            ? Solana.syncAndCacheBalance(user.solanaPublicKey)
            : Promise.resolve(null),
          isOnline
            ? getUSDCBalance(user.solanaPublicKey)
            : Promise.resolve(null),
          fetchTokenPrices(),
        ]);
        if (!mounted) return;
        if (lamports !== null) setBalanceSol(lamports / 1e9);
        if (usdc !== null) setBalanceUsdc(usdc);
        setSolPrice(prices.SOL);
        setUsdcPrice(prices.USDC);
        log.info("Updated token prices", { sol: prices.SOL, usdc: prices.USDC });
      } catch (err) {
        log.warn("Failed to fetch balance or prices", err);
      } finally {
        if (mounted) {
          setBalLoading(false);
          // Also fetch pending transactions whenever balance is refreshed
          const pending =
            await OfflineTransactionQueue.getPendingTransactions();
          if (mounted) setPendingTxs(pending);
        }
      }
    }
    fetchBalance();
    return () => {
      mounted = false;
    };
  }, [user, isOnline]);

  // After an auto-sync settles transactions, refresh the pending list for UI.
  useEffect(() => {
    if (!user || !syncPending.lastSyncTime) return;

    let mounted = true;
    (async () => {
      try {
        const pending = await OfflineTransactionQueue.getPendingTransactions();
        if (mounted) setPendingTxs(pending);
      } catch (err) {
        log.warn("Failed to refresh pending transactions after sync", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user, syncPending.lastSyncTime]);

  // Fetch token prices whenever user comes online (separate effect for periodic updates)
  useEffect(() => {
    if (!isOnline) return;

    let mounted = true;

    async function fetchPrices() {
      try {
        const prices = await fetchTokenPrices();
        if (mounted) {
          setSolPrice(prices.SOL || 180);
          setUsdcPrice(prices.USDC || 1.0);
        }
      } catch (err) {
        log.warn("Failed to fetch prices", err);
      }
    }

    // Fetch prices immediately when coming online
    fetchPrices();

    // Then fetch every 30 seconds while online
    const interval = setInterval(fetchPrices, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOnline]);

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
      log.error("Failed to upload profile image", err);
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
      log.error("Failed to dismiss profile prompt", err);
    }
  };

  const handleCopyAddress = async () => {
    if (!user?.solanaPublicKey) return;

    await Clipboard.setStringAsync(user.solanaPublicKey);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Wallet address copied to clipboard");
  };

  return (
    <SafeAreaView className="relative">
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
            className="bg-black/10 flex flex-row items-center justify-center gap-4 dark:bg-black/20 rounded-full py-3 px-8"
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
          <TouchableOpacity
            className="bg-black/5 dark:bg-white/5 rounded-2xl p-3"
            onPress={onRefresh}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color={colorScheme === "dark" ? "white" : "black"}
              />
            ) : (
              <RefreshCcw
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View className="mt-8 mb-6">
          <View className="flex flex-row items-center justify-center gap-4">
          <Text className="text-3xl font-medium tracking-tighter">
            Hey, {user?.zyppUserId}!   
          
          </Text>
          {subscriptionInfo && (
            <TouchableOpacity
              onPress={() => router.push("/subscription" as any)}
              className="px-3 py-1.5 rounded-full mr-2 inline-block"
              style={{
                backgroundColor: subscriptionInfo.tier === "premium"
                  ? "#FFD700"
                  : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{
                  color: subscriptionInfo.tier === "premium" ? "#000" : colorScheme === "dark" ? "#fff" : "#000",
                }}
              >
                {subscriptionInfo.tier === "premium"
                  ? "Premium"
                  : `${subscriptionInfo.remaining === "unlimited" ? "∞" : subscriptionInfo.remaining} left`}
              </Text>
            </TouchableOpacity>
          )}
            </View>
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

          <TouchableOpacity
            onPress={() => setIsTokenModalVisible(true)}
            className="flex-row justify-between items-center bg-white dark:bg-black rounded-full border border-white/10 px-1 pr-3 py-1 mb-3"
          >
            <Image
              source={selectedToken.image}
              style={{
                borderRadius: 16,
                width: 32,
                height: 32,
              }}
              className="w-8 h-8 mr-2 scale-75 rounded-full"
            />
            <Text className="dark:text-white text-black ml-2 font-semibold text-md">
              {selectedToken.symbol}
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
                  : selectedToken.symbol === "SOL"
                    ? (function () {
                      if (balanceSol === null) return "--";
                      // Calculate virtual SOL balance
                      const solPendingAdjustment = pendingTxs
                        .filter(
                          (tx) =>
                            tx.token === "SOL" &&
                            (tx.status === "signed" ||
                              tx.status === "broadcasting")
                        )
                        .reduce((acc, tx) => {
                          const amount = Number(tx.amount) / 1e9;
                          return (
                            acc +
                            (tx.recipient === user?.solanaPublicKey
                              ? amount
                              : -amount)
                          );
                        }, 0);
                      const virtualBal = balanceSol + solPendingAdjustment;
                      return `${virtualBal.toFixed(4)} SOL`;
                    })()
                    : (function () {
                      if (balanceUsdc === null) return "--";
                      // Calculate virtual USDC balance
                      const usdcPendingAdjustment = pendingTxs
                        .filter(
                          (tx) =>
                            tx.token === "USDC" &&
                            (tx.status === "signed" ||
                              tx.status === "broadcasting")
                        )
                        .reduce((acc, tx) => {
                          const amount = Number(tx.amount) / 1e6;
                          return (
                            acc +
                            (tx.recipient === user?.solanaPublicKey
                              ? amount
                              : -amount)
                          );
                        }, 0);
                      const virtualBal = balanceUsdc + usdcPendingAdjustment;
                      return `${virtualBal.toFixed(2)} USDC`;
                    })()}
              </Text>
            )}
            {pendingTxs.length > 0 && (
              <View className="flex-row items-center gap-1 opacity-60">
                <MaterialCommunityIcons
                  name="cloud-upload"
                  size={14}
                  color={colorScheme === "dark" ? "#000" : "#fff"}
                />
                <Text
                  className="text-[12px] font-medium"
                  style={{ color: colorScheme === "dark" ? "#000" : "#fff" }}
                >
                  {pendingTxs.length} Pending
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setBalanceHidden(!balanceHidden)}
              className="bg-black/10 dark:bg-black/20 flex items-center justify-center rounded-full"
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
            <TouchableOpacity onPress={handleCopyAddress}>
              <Ionicons
                name="copy-outline"
                size={16}
                color={colorScheme === "dark" ? "#000" : "#fff"}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wallet Actions - Grid Layout */}
        <View className="mt-8">
          {/* Row 1: Send, Receive, Top-up */}
          <View className="flex flex-row gap-2 justify-center mb-2">
            <TouchableOpacity
              onPress={() => router.push("/send")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              <MaterialCommunityIcons
                name="arrow-top-right"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                Send
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/receive")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              <MaterialCommunityIcons
                name="arrow-bottom-left"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                Receive
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/top-up")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              <IconSymbol
                name="plus.circle"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                Top-up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Redeem, Subscription, DeFi */}
          <View className="flex flex-row gap-2 justify-center">
            <TouchableOpacity
              onPress={() => router.push("/redeem")}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              {Platform.OS === "ios" ? (
                <IconSymbol
                  name="arrow.up.left.arrow.down.right"
                  size={24}
                  color={colorScheme === "dark" ? "white" : "black"}
                />
              ) : (
                <FontAwesome5
                  name="exchange-alt"
                  size={22}
                  color={colorScheme === "dark" ? "white" : "#00000090"}
                  style={{ transform: [{ rotate: "45deg" }] }}
                />
              )}
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                Redeem
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/subscription" as any)}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              <IconSymbol
                name="crown.fill"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                Subscription
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/defi" as any)}
              className="flex-1 bg-black/10 dark:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center"
            >
              <IconSymbol
                name="chart.line.uptrend.xyaxis"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
              <Text className="text-black dark:text-white text-sm font-semibold mt-2">
                DeFi
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Assets View */}
        <AssetsView
          solBalance={balanceSol || 0}
          usdcBalance={balanceUsdc || 0}
          solPrice={solPrice}
          usdcPrice={usdcPrice}
          isLoading={balLoading}
          pendingTransactions={pendingTxs}
          userPublicKey={user?.solanaPublicKey}
        />

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

        {/* Token Selector Modal */}
        <Modal
          visible={isTokenModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsTokenModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsTokenModalVisible(false)}
            className="flex-1 bg-black/40 justify-end"
          >
            <View className="w-full bg-white dark:bg-[#121212] rounded-t-[40px] p-8 pb-12">
              <View className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full self-center mb-8" />

              <Text className="text-2xl font-semibold dark:text-white text-black mb-6 tracking-tight">
                Select Token
              </Text>

              <View className="gap-3">
                {sortedTokens.map((token) => {
                  const balance =
                    token.symbol === "SOL" ? balanceSol : balanceUsdc;
                  return (
                    <TouchableOpacity
                      key={token.symbol}
                      onPress={() => {
                        setSelectedToken(token);
                        setIsTokenModalVisible(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      className={`flex-row items-center justify-between p-4 rounded-2xl border ${selectedToken.symbol === token.symbol
                        ? "bg-primary/10 border-primary"
                        : "bg-black/5 dark:bg-white/5 border-transparent"
                        }`}
                    >
                      <View className="flex-row items-center gap-4">
                        <View className="w-12 h-12 rounded-full items-center justify-center overflow-hidden">
                          <Image
                            source={token.image}
                            style={{ width: 35, height: 35 }}
                          />
                        </View>
                        <View>
                          <Text className="font-semibold text-lg dark:text-white text-black">
                            {token.name}
                          </Text>
                          <Text className="text-sm opacity-50 dark:text-white text-black">
                            {token.symbol}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="font-semibold text-lg dark:text-white text-black">
                          {balance != null
                            ? balance.toFixed(token.symbol === "SOL" ? 4 : 2)
                            : "0.00"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
};
export default Wallet;

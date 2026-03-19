import {
    SafeAreaView,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useIsOnline } from "@/hooks/useNetworkConnection";
import useUser from "@/hooks/useUser";
import * as Solana from "@/lib/solana";
import { fetchTokenPrices, getUSDCBalance } from "@/lib/solana/token-utils";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from "react-native";

interface Token {
  symbol: string;
  name: string;
  balance: number;
  value?: number;
  icon?: string;
  mint?: string;
  imageSource?: any;
}

export const Assets = () => {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useUser();
  const isOnline = useIsOnline();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number>(180);
  const [usdcPrice, setUsdcPrice] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch SOL balance
  useEffect(() => {
    let mounted = true;

    async function fetchBalance() {
      if (!user) {
        setBalanceSol(null);
        setBalanceUsdc(null);
        return;
      }

      try {
        const cached = await Solana.getCachedBalance(user.solanaPublicKey);
        if (mounted && cached != null) {
          setBalanceSol(cached / 1e9);
        }
      } catch (err) {
        console.warn("Failed to read cached balance", err);
      }

      if (!isOnline) {
        setIsLoading(false);
        return;
      }

      try {
        const [lamports, usdc, prices] = await Promise.all([
          Solana.syncAndCacheBalance(user.solanaPublicKey),
          getUSDCBalance(user.solanaPublicKey),
          fetchTokenPrices(),
        ]);
        if (!mounted) return;
        if (!mounted) return;
        setBalanceSol(lamports / 1e9);
        setBalanceUsdc(usdc);
        setSolPrice(prices.SOL || 180);
        setUsdcPrice(prices.USDC || 1.0);
        console.log(
          `[Assets Page] Fetched Prices from CoinGecko: SOL=$${prices.SOL}, USDC=$${prices.USDC}`
        );
      } catch (err) {
        console.warn("Failed to fetch balance", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchBalance();
    return () => {
      mounted = false;
    };
  }, [user, isOnline]);

  // Initialize tokens with SOL and USDC always present
  useEffect(() => {
    const initialTokens: Token[] = [
      {
        symbol: "SOL",
        name: "Solana",
        balance: balanceSol || 0,
        value: (balanceSol || 0) * solPrice,
        imageSource: require("@/assets/images/sol-icon.png"),
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        balance: balanceUsdc || 0,
        value: (balanceUsdc || 0) * usdcPrice,
        imageSource: require("@/assets/images/usdc-icon.png"),
      },
    ];

    setTokens(initialTokens);
  }, [balanceSol, balanceUsdc, solPrice, usdcPrice]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (user) {
        const [lamports, usdc, prices] = await Promise.all([
          Solana.syncAndCacheBalance(user.solanaPublicKey),
          getUSDCBalance(user.solanaPublicKey),
          fetchTokenPrices(),
        ]);
        setBalanceSol(lamports / 1e9);
        setBalanceUsdc(usdc);
        setSolPrice(prices.SOL || 180);
        setUsdcPrice(prices.USDC || 1.0);
      }
    } catch (err) {
      console.warn("Failed to refresh balance", err);
    } finally {
      setRefreshing(false);
    }
  };

  const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        className="flex-1 relative z-10"
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View className="px-6 pt-6">
          <View className="flex-row items-center mb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="p-2 mr-3"
            >
              <Ionicons
                name="chevron-back-outline"
                size={20}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            </TouchableOpacity>
            <Text className="text-2xl font-semibold">Assets</Text>
          </View>

          {/* Total Value Section */}
          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator
                color={colorScheme === "dark" ? "white" : "black"}
                size="large"
              />
            </View>
          ) : (
            <View className="bg-black/5 dark:bg-white/5 rounded-2xl p-6">
              <Text className="text-sm opacity-70 mb-2">Total Value</Text>
              <Text style={{ fontFamily: "bold", fontSize: 30, marginTop: 4 }}>
                ${totalValue.toFixed(2)}
              </Text>
              <Text className="text-sm opacity-60 mt-2">
                {tokens.length} {tokens.length === 1 ? "asset" : "assets"}
              </Text>
            </View>
          )}

          {/* Token List */}
          <View className="gap-3 mt-8">
            {tokens.map((token, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  /* TODO: Navigate to token details */
                }}
                className="bg-black/5 dark:bg-white/5 rounded-xl p-4 flex flex-row items-center justify-between active:opacity-70"
              >
                <View className="flex flex-row items-center gap-3 flex-1">
                  <View className="w-14 h-14 items-center justify-center overflow-hidden">
                    {token.imageSource ? (
                      <Image
                        source={token.imageSource}
                        style={{ width: 40, height: 40 }}
                        contentFit="contain"
                      />
                    ) : (
                      <IconSymbol
                        name="wallet.bifold.fill"
                        size={28}
                        color={colorScheme === "dark" ? "white" : "black"}
                      />
                    )}
                  </View>

                  <View className="flex-1">
                    <Text className="font-semibold text-base">
                      {token.name}
                    </Text>
                    <Text className="text-sm opacity-60">
                      {token.balance.toFixed(6)} {token.symbol}
                    </Text>
                  </View>
                </View>

                <View className="items-end gap-1">
                  <Text className="font-semibold text-base">
                    ${(token.value || 0).toFixed(2)}
                  </Text>
                  <View className="flex flex-row items-center gap-1 bg-green-500/20 px-2 py-1 rounded-md">
                    <MaterialCommunityIcons
                      name="trending-up"
                      size={12}
                      color="#10b981"
                    />
                    <Text className="text-xs text-green-600 dark:text-green-400">
                      +2.5%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Empty State Info */}
          {tokens.length === 0 && !isLoading && (
            <View className="py-12 items-center">
              <MaterialCommunityIcons
                name="wallet-outline"
                size={48}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ opacity: 0.5 }}
              />
              <Text className="text-lg font-semibold mt-4 opacity-70">
                No assets yet
              </Text>
              <Text className="text-sm opacity-50 mt-2 text-center">
                Receive or buy assets to get started
              </Text>
            </View>
          )}

          {/* Info Section */}
          <View className="mt-12 bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-8">
            <View className="flex flex-row items-start gap-3">
              <Ionicons
                name="information-circle"
                size={20}
                color={colorScheme === "dark" ? "white" : "black"}
                style={{ opacity: 0.7, marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="font-semibold mb-1">Market Data</Text>
                <Text className="text-sm opacity-60">
                  Prices update in real-time when online. Last updated a few
                  moments ago.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Assets;

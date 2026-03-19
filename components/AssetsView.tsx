import { Text, useColorScheme, View } from "@/components/ui";
import { TransactionIntent } from "@/lib/storage/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, TouchableOpacity } from "react-native";

interface Token {
  symbol: string;
  name: string;
  balance: number;
  value?: number;
  icon?: string;
  mint?: string;
  imageSource?: any;
}

interface AssetsViewProps {
  solBalance?: number;
  isLoading?: boolean;
  usdcBalance?: number;
  solPrice?: number;
  usdcPrice?: number;
  otherTokens?: Token[];
  pendingTransactions?: TransactionIntent[];
  userPublicKey?: string;
}

export const AssetsView: React.FC<AssetsViewProps> = ({
  solBalance = 0,
  isLoading = false,
  usdcBalance = 0,
  solPrice = 180,
  usdcPrice = 1.0,
  otherTokens = [],
  pendingTransactions = [],
  userPublicKey = "",
}) => {
  const colorScheme = useColorScheme();
  const router = useRouter();

  // Log prices whenever they are updated or component renders
  React.useEffect(() => {
    console.log(
      `[AssetsView] SOL Price: $${solPrice}, USDC Price: $${usdcPrice}`
    );
  }, [solPrice, usdcPrice]);

  // Compute tokens directly without state to avoid infinite loops
  const tokens: Token[] = [
    {
      symbol: "SOL",
      name: "Solana",
      balance: solBalance || 0,
      value: (solBalance || 0) * solPrice,
      imageSource: require("@/assets/images/sol-icon.png"),
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      balance: usdcBalance || 0,
      value: (usdcBalance || 0) * usdcPrice,
      imageSource: require("@/assets/images/usdc-icon.png"),
    },
    ...(Array.isArray(otherTokens) ? otherTokens : []),
  ].map(token => {
    // Calculate pending impact for this token
    const pendingForToken = pendingTransactions.filter(tx => 
      (tx.token === token.symbol || (token.symbol === "SOL" && tx.token === "SOL")) &&
      (tx.status === "signed" || tx.status === "broadcasting")
    );

    const pendingAdjustment = pendingForToken.reduce((acc, tx) => {
      const amount = Number(tx.amount) / (tx.token === "SOL" ? 1e9 : 1e6);
      // If user is recipient, add. If sender, subtract.
      return acc + (tx.recipient === userPublicKey ? amount : -amount); 
    }, 0);

    return {
      ...token,
      pendingBalance: token.balance + pendingAdjustment,
      isSyncing: pendingForToken.length > 0
    };
  });

  const handleViewAll = () => {
    router.push("/assets");
  };

  const totalValue = tokens.reduce((sum, token) => {
    const balance = (token as any).pendingBalance ?? token.balance;
    const price = token.symbol === "SOL" ? solPrice : usdcPrice; // Use appropriate price
    return sum + (balance * price);
  }, 0);

  return (
    <View className="mt-8 mb-6 pt-4">
      {/* Header */}
      <View className="mb-4 flex flex-row items-center justify-between px-1">
        <Text className="text-xl font-semibold">Assets</Text>
        <TouchableOpacity
          onPress={handleViewAll}
          className="flex flex-row items-center gap-1"
        >
          <Text className="font-semibold opacity-70">View all</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colorScheme === "dark" ? "white" : "black"}
            style={{ opacity: 0.7 }}
          />
        </TouchableOpacity>
      </View>

      {/* Total Value */}
      {!isLoading && (
        <View className="px-1">
          <Text className="text-sm opacity-70 mb-1">Total Value</Text>
          <Text
            // className=""
            style={{ fontFamily: "bold", fontSize: 25, letterSpacing: -0.5 }}
          >
            ${totalValue.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Token List */}
      <View className="gap-2 mt-4">
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator
              color={colorScheme === "dark" ? "white" : "black"}
            />
          </View>
        ) : (
          tokens.slice(0, 3).map((token, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => {
                /* TODO: Navigate to token details */
              }}
              className="bg-black/5 dark:bg-white/5 rounded-xl p-4 flex flex-row items-center justify-between"
            >
              <View className="flex flex-row items-center gap-3 flex-1">
                <View className="w-12 h-12 items-center justify-center overflow-hidden">
                  {token.imageSource ? (
                    <Image
                      source={token.imageSource}
                      style={{ width: 35, height: 35 }}
                      contentFit="contain"
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="currency-btc"
                      size={24}
                      color={colorScheme === "dark" ? "white" : "black"}
                    />
                  )}
                </View>

                <View className="flex-1">
                  <Text className="font-semibold text-base">{token.name}</Text>
                  <Text className="text-sm opacity-60">{token.symbol}</Text>
                </View>
              </View>

              <View className="items-end">
                <View className="flex-row items-center gap-1">
                  {(token as any).isSyncing && (
                    <MaterialCommunityIcons 
                      name="cloud-upload-outline" 
                      size={14} 
                      color={colorScheme === "dark" ? "#05E28A" : "#000"} 
                      style={{ opacity: 0.6 }}
                    />
                  )}
                  <Text className="font-semibold text-base">
                    {((token as any).pendingBalance ?? token.balance).toFixed(2)} {token.symbol}
                  </Text>
                </View>
                <Text className="text-sm opacity-60">
                  ${(token.value || 0).toFixed(2)}
                </Text>
                {(token as any).isSyncing && (
                  <Text className="text-[10px] text-primary font-medium uppercase tracking-tighter">
                    Syncing...
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {tokens.length > 3 && (
        <TouchableOpacity
          onPress={handleViewAll}
          className="mt-4 py-3 items-center border border-black/10 dark:border-white/10 rounded-lg"
        >
          <Text className="font-semibold opacity-70">
            +{tokens.length - 3} more token{tokens.length - 3 !== 1 ? "s" : ""}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default AssetsView;

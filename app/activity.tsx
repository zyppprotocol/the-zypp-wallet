import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import { useNetworkConnection } from "@/hooks/useNetworkConnection";
import useUser from "@/hooks/useUser";
import {
  clearTransactionHistoryCache,
  getTransactionHistory,
} from "@/lib/solana/transaction-sync";
import { TransactionIntent, TransactionStatus } from "@/lib/storage/types";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from "react-native";

export default function Activity() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { user } = useUser();
  const { isConnected } = useNetworkConnection();

  const [transactions, setTransactions] = useState<TransactionIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = async () => {
    if (!user?.solanaPublicKey) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    try {
      const txs = await getTransactionHistory(user.solanaPublicKey, false, 20);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!user?.solanaPublicKey) return;

    setRefreshing(true);
    try {
      await clearTransactionHistoryCache(user.solanaPublicKey);
      const txs = await getTransactionHistory(user.solanaPublicKey, true, 20);
      setTransactions(txs);

      if (!isConnected) {
        console.info("Refreshed from cache (offline mode)");
      }
    } catch (err) {
      console.error("Failed to refresh transactions:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [user?.solanaPublicKey]);

  const getStatusColor = (status: TransactionStatus): string => {
    switch (status) {
      case "confirmed":
        return "#10b981"; // green
      case "broadcasting":
        return "#3b82f6"; // blue
      case "signed":
        return "#f59e0b"; // amber
      case "pending":
        return "#8b5cf6"; // purple
      case "failed":
      case "expired":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  const getStatusLabel = (status: TransactionStatus): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderTransaction = ({ item }: { item: TransactionIntent }) => {
    const isReceived = item.sender !== user?.solanaPublicKey;
    const amount = Number(item.amount) / 1e9; // SOL divisor

    return (
      <View className="mb-3 rounded-xl bg-white/5 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center">
              <View className="mr-3 rounded-full bg-white/10 p-2">
                <Ionicons
                  name={isReceived ? "arrow-down" : "arrow-up"}
                  size={16}
                  color={isReceived ? "#10b981" : "#ef4444"}
                />
              </View>
              <View className="flex-1">
                <Text className="font-semibold">
                  {isReceived ? "Received" : "Sent"} SOL
                </Text>
                <Text className="text-xs opacity-60">
                  {format(new Date(item.createdAt), "MMM d, yyyy HH:mm")}
                </Text>
              </View>
            </View>
          </View>
          <View className="items-end">
            <Text
              className="font-bold"
              style={{
                color: isReceived ? "#10b981" : "#ef4444",
              }}
            >
              {isReceived ? "+" : "-"}
              {amount.toFixed(4)} SOL
            </Text>
            <View
              style={{
                backgroundColor: getStatusColor(item.status),
                opacity: 0.2,
              }}
              className="mt-1 rounded-full px-2 py-1"
            >
              <Text
                style={{ color: getStatusColor(item.status) }}
                className="text-xs font-semibold"
              >
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Signature */}
        <View className="mt-3 rounded-lg bg-white/5 px-3 py-2">
          <Text className="text-xs opacity-70">
            {item.onchainSignature?.substring(0, 32)}...
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="relative flex-1">
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
      <View className="px-6 py-6">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
            <Ionicons
              name="chevron-back-outline"
              size={20}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>
          <Text className="text-2xl font-semibold">Activity</Text>
        </View>

        {!user?.solanaPublicKey ? (
          <View className="flex-1 items-center justify-center">
            <Text className="opacity-70">Sign in to view your activity</Text>
          </View>
        ) : loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : transactions.length === 0 ? (
          <ScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={{
              justifyContent: "center",
              alignItems: "center",
              flex: 1,
            }}
          >
            <View className="flex flex-col items-center justify-center">
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
              <Text className="mt-2 w text-sm opacity-70 text-center">
                Once you send or receive SOL, {"\n"} your transactions will
                appear here.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View className="rounded-2xl bg-white/5 p-4">
                <Text className="text-sm opacity-70">
                  No transactions found.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

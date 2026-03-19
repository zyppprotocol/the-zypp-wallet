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
import { getUSDCBalance } from "@/lib/solana/token-utils";
import { SecureStorage } from "@/lib/storage/secure-storage";
import { Ionicons } from "@expo/vector-icons";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  TouchableOpacity,
} from "react-native";

const TOKENS = [
  {
    symbol: "SOL",
    name: "Solana",
    image: require("@/assets/images/sol-icon.png"),
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    image: require("@/assets/images/usdc-icon.png"),
  },
];

export default function Redeem() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useUser();
  const isOnline = useIsOnline();

  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);
  const [isBalLoading, setIsBalLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Pin Modal State
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pin, setPin] = useState("");
  const [isSigning, setIsSigning] = useState(false);

  const isWalletConnected = !!user?.externalWalletAddress;

  // Fetch balances for validation
  useEffect(() => {
    let mounted = true;
    async function fetchBalances() {
      if (!user) return;
      setIsBalLoading(true);
      try {
        const [lamports, usdc] = await Promise.all([
          Solana.getCachedBalance(user.solanaPublicKey),
          getUSDCBalance(user.solanaPublicKey),
        ]);
        if (!mounted) return;
        setBalanceSol(lamports != null ? lamports / 1e9 : 0);
        setBalanceUsdc(usdc || 0);
      } catch (err) {
        console.warn("Failed to fetch balances for redeem:", err);
      } finally {
        if (mounted) setIsBalLoading(false);
      }
    }
    fetchBalances();
    return () => {
      mounted = false;
    };
  }, [user]);

  const currentBalance =
    selectedToken.symbol === "SOL" ? balanceSol : balanceUsdc;

  const handleMax = () => {
    if (currentBalance != null) {
      setAmount(currentBalance.toString());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleConnectWallet = async () => {
    // Reuse logic from top-up or redirect
    router.push("/top-up");
  };

  const buildTransaction = useCallback(
    async (amountValue: number) => {
      if (!user?.solanaPublicKey || !user?.externalWalletAddress)
        throw new Error("Missing wallet context");

      const fromPubkey = new PublicKey(user.solanaPublicKey);
      const toPubkey = new PublicKey(user.externalWalletAddress);
      const conn = await Solana.getConnection();

      let instructions: TransactionInstruction[] = [];

      if (selectedToken.symbol === "SOL") {
        // Leave some for fees if transferring max
        // Simple check: if amount === balance, subtract 0.000005 SOL
        let finalAmount = amountValue;
        if (balanceSol && amountValue >= balanceSol) {
          finalAmount = Math.max(0, balanceSol - 0.000005);
        }

        const lamports = Math.round(finalAmount * LAMPORTS_PER_SOL);
        instructions.push(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports,
          })
        );
      } else if (selectedToken.symbol === "USDC") {
        const USDC_MINT = new PublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        ); // Mainnet

        const fromATA = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
        const toATA = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

        const toAccountInfo = await conn.getAccountInfo(toATA);
        if (!toAccountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              fromPubkey,
              toATA,
              toPubkey,
              USDC_MINT
            )
          );
        }

        const rawAmount = Math.round(amountValue * 1_000_000);
        instructions.push(
          createTransferInstruction(
            fromATA,
            toATA,
            fromPubkey,
            BigInt(rawAmount)
          )
        );
      }

      const { blockhash } = await conn.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      return new VersionedTransaction(messageV0);
    },
    [user, selectedToken, balanceSol]
  ); // Ensure balanceSol is dependency

  const handleConfirm = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "You cannot redeem while offline.");
      return;
    }

    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount to redeem.");
      return;
    }

    if (currentBalance === null || val > currentBalance) {
      Alert.alert("Insufficient Balance", "You don't have enough funds.");
      return;
    }

    // Open PIN Modal
    setIsPinModalVisible(true);
  };

  const executeRedeem = async () => {
    if (!pin) {
      Alert.alert("PIN Required", "Please enter your PIN.");
      return;
    }

    setIsSigning(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const val = parseFloat(amount);
      const transaction = await buildTransaction(val);
      const serialized = transaction.serialize();

      // Sign with stored key using PIN
      const signatureBytes = await SecureStorage.signTransaction(
        serialized,
        pin
      );

      // Add signature to transaction
      transaction.addSignature(
        new PublicKey(user!.solanaPublicKey),
        signatureBytes
      );

      // Broadcast
      const conn = await Solana.getConnection();
      const txid = await conn.sendTransaction(transaction);

      setIsSigning(false);
      setIsPinModalVisible(false);
      setPin("");
      setAmount("");

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Redemption Successful",
        `Funds sent! TX: ${txid.slice(0, 8)}...`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (err: any) {
      console.error("Redeem Error:", err);
      setIsSigning(false);
      Alert.alert(
        "Redeem Failed",
        err.message || "Failed to sign or send transaction."
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 relative">
      <View className="absolute top-0 left-0 right-0 w-full h-[500px]">
        <Image
          source={
            colorScheme === "dark"
              ? require("@/assets/images/home-gradient-dark.png")
              : require("@/assets/images/home-gradient-light.png")
          }
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6 pt-6 z-10"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row items-center mb-8">
            <TouchableOpacity
              onPress={() => router.back()}
              className="p-2 -ml-2"
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colorScheme === "dark" ? "white" : "black"}
              />
            </TouchableOpacity>
            <Text className="text-2xl font-semibold ml-2">Redeem</Text>
          </View>

          {/* Offline Warning */}
          {!isOnline && (
            <View className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex-row items-center gap-3">
              <Ionicons name="cloud-offline" size={20} color="#ef4444" />
              <Text className="text-red-500 font-regular text-sm flex-1 leading-tight">
                You are currently offline. Redeem is disabled until you
                reconnect.
              </Text>
            </View>
          )}

          {/* External Wallet Connection */}
          <View className="bg-black/5 dark:bg-black/20 border border-black/0 rounded-3xl py-4 px-4 mb-8">
            {/* <Text className="text-sm font-semibold opacity-60 mb-4 uppercase tracking-wider">
                    External Wallet
                  </Text> */}

            {isWalletConnected ? (
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-neutral-500/20 items-center justify-center">
                    <IconSymbol
                      name="wallet.bifold.fill"
                      size={20}
                      color={colorScheme === "dark" ? "#05E28A" : "#000"}
                    />
                  </View>
                  <View>
                    <Text className="font-semibold text-base">
                      Connected Wallet
                    </Text>
                    <Text className="text-sm opacity-50">
                      {user?.externalWalletAddress?.slice(0, 8)}...
                      {user?.externalWalletAddress?.slice(-8)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleConnectWallet}
                  className="bg-white/10 px-4 py-2 rounded-full"
                >
                  <Text className="font-semibold text-xs text-black dark:text-emerald-500">
                    Change
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleConnectWallet}
                disabled={!isOnline || connecting}
                className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
                style={{ opacity: isOnline ? 1 : 0.5 }}
              >
                {connecting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <IconSymbol
                      name="wallet.bifold.fill"
                      size={20}
                      color="white"
                    />
                    <Text className="text-white font-semibold text-lg tracking-tight">
                      Connect Wallet
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Redeem Form */}
          <View
            className="flex-1 gap-6"
            style={{ opacity: isWalletConnected && isOnline ? 1 : 0.4 }}
          >
            {/* Amount Section */}
            <View>
              <View className="flex-row justify-between items-end w-full mb-3 px-1">
                <Text className="text-lg font-semibold tracking-tight opacity-60">
                  Amount
                </Text>
                <TouchableOpacity
                  onPress={handleMax}
                  disabled={!isWalletConnected || !isOnline}
                >
                  <Text className="text-sm font-bold text-black dark:text-emerald-500">
                    Max: {currentBalance?.toFixed(3) || "0.000"}{" "}
                    {selectedToken.symbol}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="bg-white/5 dark:bg-black/20 border border-white/10 rounded-3xl p-6">
                <View className="flex-row items-center justify-between mb-6">
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor={
                      colorScheme === "dark"
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(0,0,0,0.3)"
                    }
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                    editable={isWalletConnected && isOnline}
                    className="text-4xl tracking-tighter font-semibold flex-1 text-black dark:text-white"
                  />
                  <View className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2">
                    <Text className="font-bold">{selectedToken.symbol}</Text>
                  </View>
                </View>

                {/* Token Selector */}
                <View className="flex-row gap-2">
                  {TOKENS.map((token) => (
                    <TouchableOpacity
                      key={token.symbol}
                      onPress={() => setSelectedToken(token)}
                      disabled={!isWalletConnected || !isOnline}
                      className={`flex-1 rounded-full p-3 flex-row items-center gap-3 ${
                        selectedToken.symbol === token.symbol
                          ? "bg-black/10 dark:bg-black/20 "
                          : "bg-transparent border-white/5"
                      }`}
                    >
                      <Image
                        source={token.image}
                        style={{ width: 27, height: 27 }}
                      />
                      <Text
                        className={`font-bold ${
                          selectedToken.symbol === token.symbol
                            ? "text-black dark:text-emerald-500"
                            : "opacity-60"
                        }`}
                      >
                        {token.symbol}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!isWalletConnected || !isOnline || loading}
              className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
            >
              {loading ? (
                <ActivityIndicator
                  color={colorScheme === "dark" ? "black" : "white"}
                />
              ) : (
                <>
                  <IconSymbol
                    name="arrow.up.right.bottomleft.rectangle.fill"
                    size={20}
                    color={colorScheme === "dark" ? "black" : "white"}
                  />
                  <Text
                    className={`text-lg font-semibold tracking-tight ${
                      colorScheme === "dark" ? "text-black" : "text-white"
                    }`}
                  >
                    Confirm & Continue
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text className="text-center text-xs opacity-40 px-6">
              Your Zypp wallet will sign this transfer to send funds externally.
              Standard network gas fees apply.
            </Text>
          </View>
          <View className="h-20" />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PIN Modal */}
      <Modal
        visible={isPinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPinModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-black/80 justify-center items-center px-6"
        >
          <View className="bg-neutral-900 w-full rounded-3xl p-6 border border-white/10">
            <Text className="text-white text-xl font-bold mb-2">Enter PIN</Text>
            <Text className="text-white/60 mb-6">
              Enter your security PIN to authorise this transaction.
            </Text>

            <TextInput
              autoFocus
              secureTextEntry
              keyboardType="number-pad"
              value={pin}
              onChangeText={setPin}
              placeholder="••••••"
              placeholderTextColor="#666"
              className="bg-black/50 text-white text-center text-3xl font-bold py-4 rounded-xl mb-6 tracking-widest border border-white/10"
              maxLength={6}
            />

            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => {
                  setIsPinModalVisible(false);
                  setPin("");
                }}
                className="flex-1 bg-white/10 py-4 rounded-xl items-center"
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={executeRedeem}
                disabled={isSigning || pin.length < 4}
                className={`flex-1 py-4 rounded-xl items-center ${
                  isSigning || pin.length < 4 ? "bg-primary/50" : "bg-primary"
                }`}
              >
                {isSigning ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <Text className="text-black font-bold">Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

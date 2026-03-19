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
import { setExternalWalletAddress } from "@/lib/auth";
import { solanaWalletAdapter as solanaWalletAdapterAndroid } from "@/lib/solana/wallet-adapter.android";
import { solanaWalletAdapter as solanaWalletAdapterIOS } from "@/lib/solana/wallet-adapter.ios";
import { Ionicons } from "@expo/vector-icons";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  Connection,
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
import React, { useCallback, useMemo, useState } from "react";
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

export default function TopUp() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user, refresh } = useUser();
  const isOnline = useIsOnline();

  const connection = useMemo(
    () =>
      new Connection(
        process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
          "https://api.devnet.solana.com",
        "confirmed",
      ),
    [],
  );

  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const isWalletConnected = !!user?.externalWalletAddress;

  const handleConnectWallet = async () => {
    if (!isOnline) {
      Alert.alert(
        "Offline",
        "You must be online to connect an external wallet.",
      );
      return;
    }

    setConnecting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Real Wallet Connection
      const walletResponse =
        (await Platform.OS) === "ios"
          ? await solanaWalletAdapterIOS.connectWallet()
          : await solanaWalletAdapterAndroid.connectWallet();

      // Update User Auth & State
      // Note: In an ideal world we also verify the wallet owns the key via a message signature,
      // but for this MVP we trust the adapter's return.
      await setExternalWalletAddress(walletResponse.publicKey);
      await refresh();
      setConnecting(false);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Connected",
        `Successfully connected to ${walletResponse.publicKey.slice(0, 4)}...${walletResponse.publicKey.slice(
          -4,
        )}`,
      );
    } catch (err: any) {
      console.error("Failed to connect wallet:", err);
      setConnecting(false);
      Alert.alert(
        "Connection Failed",
        err.message || "Could not connect to external wallet.",
      );
    }
  };

  const buildTransferTransaction = useCallback(
    async (amountValue: number) => {
      if (!user?.externalWalletAddress || !user?.solanaPublicKey)
        throw new Error("Missing wallet context");

      const fromPubkey = new PublicKey(user.externalWalletAddress);
      const toPubkey = new PublicKey(user.solanaPublicKey);

      let instructions: TransactionInstruction[] = [];

      if (selectedToken.symbol === "SOL") {
        const lamports = Math.round(amountValue * LAMPORTS_PER_SOL);
        instructions.push(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports,
          }),
        );
      } else if (selectedToken.symbol === "USDC") {
        // USDC Devnet Mint (fallback to mainnet if env implies)
        // Typically we'd use a robust token list or env var.
        // For this task, assuming Devnet or Mainnet standard USDC.
        // Devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
        // Mainnet USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
        const USDC_MINT = new PublicKey(
          "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        ); // Mainnet default
        // TODO: Detect cluster and switch mint if needed. Assuming mainnet for real logic or devnet mint if testing.

        const fromATA = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
        const toATA = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

        const toAccountInfo = await connection.getAccountInfo(toATA);
        if (!toAccountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              fromPubkey, // payer (external wallet pays for ATA creation on receive? or we pay? usually payer pays)
              toATA,
              toPubkey,
              USDC_MINT,
            ),
          );
        }

        const rawAmount = Math.round(amountValue * 1_000_000); // 6 decimals for USDC
        instructions.push(
          createTransferInstruction(
            fromATA,
            toATA,
            fromPubkey,
            BigInt(rawAmount),
          ),
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      return new VersionedTransaction(messageV0);
    },
    [user, selectedToken, connection],
  );

  const handleConfirm = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "You cannot top up while offline.");
      return;
    }

    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount to top up.");
      return;
    }

    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const transaction = await buildTransferTransaction(val);

      // Request signature from external wallet
      let signature: string;
      if ((await Platform.OS) === "ios") {
        signature =
          await solanaWalletAdapterIOS.signAndSendTransaction(transaction);
      } else {
        signature =
          await solanaWalletAdapterAndroid.signAndSendTransaction(transaction);
      }

      setLoading(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Top Up Successful",
        `Transaction sent! Signature: ${signature.slice(0, 8)}...`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      console.error("Top up failed:", err);
      setLoading(false);
      Alert.alert(
        "Top Up Failed",
        err.message || "Transaction was rejected or failed.",
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
        i{" "}
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
            <Text className="text-2xl font-semibold ml-2">Top Up</Text>
          </View>

          {/* Offline Warning */}
          {!isOnline && (
            <View className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex-row items-center gap-3">
              <Ionicons name="cloud-offline" size={20} color="#ef4444" />
              <Text className="text-red-500 font-regular text-sm flex-1 leading-tight">
                You are currently offline. Top up is disabled until you
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

          {/* Top Up Form */}
          <View
            className="flex-1 gap-6"
            style={{ opacity: isWalletConnected && isOnline ? 1 : 0.4 }}
          >
            {/* Amount Section */}
            <View>
              <Text className="text-lg font-semibold tracking-tight opacity-60 mb-3 px-1">
                Amount
              </Text>
              <View className="bg-white/5 dark:bg-black/20 rounded-3xl p-6">
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
                  <TouchableOpacity
                    onPress={() => setIsTokenModalVisible(true)}
                    disabled={!isWalletConnected || !isOnline}
                    className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2 flex-row items-center gap-2"
                  >
                    <Image
                      source={selectedToken.image}
                      style={{ width: 20, height: 20 }}
                    />
                    <Text className="font-bold">{selectedToken.symbol}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color={colorScheme === "dark" ? "white" : "black"}
                    />
                  </TouchableOpacity>
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
              External wallet transfers may involve network fees from the
              service provider. Zypp does not charge extra for top-ups.
            </Text>
          </View>
          <View className="h-20" />
        </ScrollView>
      </KeyboardAvoidingView>

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
              {TOKENS.map((token) => (
                <TouchableOpacity
                  key={token.symbol}
                  onPress={() => {
                    setSelectedToken(token);
                    setIsTokenModalVisible(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className={`flex-row items-center justify-between p-4 rounded-2xl border ${
                    selectedToken.symbol === token.symbol
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
                    <Ionicons
                      name={
                        selectedToken.symbol === token.symbol
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={24}
                      color={
                        selectedToken.symbol === token.symbol
                          ? "#05E28A"
                          : "#888"
                      }
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

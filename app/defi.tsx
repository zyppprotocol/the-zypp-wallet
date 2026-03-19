import {
    SafeAreaView,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import useUser from "@/hooks/useUser";
import {
    buildBorrowIntent,
    buildLendIntent,
    buildRepayIntent,
    buildSwapIntent,
    buildYieldDepositIntent,
    buildYieldWithdrawIntent,
} from "@/lib/defi/intent-builder";
import {
    getLendingRates,
    getSwapRate,
    getYieldRates,
} from "@/lib/defi/rate-fetcher";
import * as Solana from "@/lib/solana";
import { signIntentWithBiometric } from "@/lib/solana/biometric-signing";
import { encryptIntent } from "@/lib/solana/intent-encryption";
import { getUSDCBalance } from "@/lib/solana/token-utils";
import { queueOfflineTransaction } from "@/lib/storage/offline-queue";
import { log } from "@/lib/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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

type DeFiAction = "swap" | "yield" | "lend";
type YieldAction = "deposit" | "withdraw";
type LendAction = "deposit" | "borrow" | "repay";

export default function DeFi() {
    const colorScheme = useColorScheme();
    const router = useRouter();
    const { user } = useUser();

    const [selectedAction, setSelectedAction] = useState<DeFiAction>("swap");
    const [yieldAction, setYieldAction] = useState<YieldAction>("deposit");
    const [lendAction, setLendAction] = useState<LendAction>("deposit");
    const [amount, setAmount] = useState("");
    const [inputToken, setInputToken] = useState(TOKENS[0]);
    const [outputToken, setOutputToken] = useState(TOKENS[1]);
    const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
    const [tokenModalType, setTokenModalType] = useState<"input" | "output">("input");

    // Yield & Lending rates
    const [yieldRates, setYieldRates] = useState<Record<string, number>>({});
    const [lendingRates, setLendingRates] = useState<{
        supplyRates: Record<string, number>;
        borrowRates: Record<string, number>;
    }>({ supplyRates: {}, borrowRates: {} });
    const [loadingRates, setLoadingRates] = useState(false);

    const [balanceSol, setBalanceSol] = useState<number | null>(null);
    const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);

    const [swapRate, setSwapRate] = useState<{
        rate: number;
        amountOut: bigint;
        priceImpact?: number;
        cached: boolean;
    } | null>(null);
    const [loadingRate, setLoadingRate] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [showPINInput, setShowPINInput] = useState(false);
    const [pin, setPin] = useState("");

    // Fetch balances
    useEffect(() => {
        let mounted = true;
        async function fetchBalances() {
            if (!user) return;
            try {
                const [lamports, usdc] = await Promise.all([
                    Solana.getCachedBalance(user.solanaPublicKey),
                    getUSDCBalance(user.solanaPublicKey),
                ]);
                if (!mounted) return;
                setBalanceSol(lamports != null ? lamports / 1e9 : 0);
                setBalanceUsdc(usdc || 0);
            } catch (err) {
                log.error("Failed to fetch balances", err);
            }
        }
        fetchBalances();
        return () => {
            mounted = false;
        };
    }, [user]);

    // Fetch swap rate when amount or tokens change
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0) {
            setSwapRate(null);
            return;
        }

        if (selectedAction !== "swap") return;

        const fetchRate = async () => {
            setLoadingRate(true);
            try {
                const amountIn = BigInt(
                    Math.floor(
                        parseFloat(amount) *
                        (inputToken.symbol === "SOL" ? LAMPORTS_PER_SOL : 1_000_000)
                    )
                );
                const rate = await getSwapRate(
                    inputToken.symbol,
                    outputToken.symbol,
                    amountIn
                );
                if (rate) {
                    setSwapRate(rate);
                }
            } catch (err) {
                log.error("Failed to fetch swap rate", err);
            } finally {
                setLoadingRate(false);
            }
        };

        const timeoutId = setTimeout(fetchRate, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [amount, inputToken, outputToken, selectedAction]);

    // Fetch yield rates when yield action is selected
    useEffect(() => {
        if (selectedAction !== "yield") return;

        const fetchRates = async () => {
            setLoadingRates(true);
            try {
                const rates = await getYieldRates();
                setYieldRates(rates.rates);
            } catch (err) {
                log.error("Failed to fetch yield rates", err);
            } finally {
                setLoadingRates(false);
            }
        };

        fetchRates();
    }, [selectedAction]);

    // Fetch lending rates when lend action is selected
    useEffect(() => {
        if (selectedAction !== "lend") return;

        const fetchRates = async () => {
            setLoadingRates(true);
            try {
                const rates = await getLendingRates();
                setLendingRates(rates);
            } catch (err) {
                log.error("Failed to fetch lending rates", err);
            } finally {
                setLoadingRates(false);
            }
        };

        fetchRates();
    }, [selectedAction]);

    const currentBalance =
        inputToken.symbol === "SOL" ? balanceSol : balanceUsdc;

    const handleMax = () => {
        if (currentBalance != null) {
            setAmount(currentBalance.toString());
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleSwapTokens = () => {
        const temp = inputToken;
        setInputToken(outputToken);
        setOutputToken(temp);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleConfirm = async () => {
        if (!user) {
            Alert.alert("Error", "User not found");
            return;
        }

        const val = parseFloat(amount);
        if (!amount || isNaN(val) || val <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount.");
            return;
        }

        if (currentBalance === null || val > currentBalance) {
            Alert.alert("Insufficient Balance", "You don't have enough funds.");
            return;
        }

        if (selectedAction === "swap" && !swapRate) {
            Alert.alert("Rate Error", "Please wait for the swap rate to load.");
            return;
        }

        setShowPINInput(true);
    };

    const executeDeFiAction = async () => {
        if (!pin || pin.length < 4) {
            Alert.alert("PIN Required", "Please enter your PIN.");
            return;
        }

        if (!user) return;

        setIsProcessing(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            const val = parseFloat(amount);
            const amountIn = BigInt(
                Math.floor(
                    val * (inputToken.symbol === "SOL" ? LAMPORTS_PER_SOL : 1_000_000)
                )
            );

            if (selectedAction === "swap") {
                if (!swapRate) {
                    throw new Error("Swap rate not available");
                }

                // Build swap intent
                const intent = buildSwapIntent({
                    sender: user.solanaPublicKey,
                    tokenIn: inputToken.symbol,
                    tokenOut: outputToken.symbol,
                    amountIn: amountIn,
                    minAmountOut: swapRate.amountOut,
                    slippageBps: 50, // 0.5% slippage
                });

                // Encrypt intent
                const encryptedPayload = await encryptIntent(intent);

                // Sign intent
                const signResult = await signIntentWithBiometric(intent, "Sign swap transaction");

                if (!signResult.success || !signResult.signedIntent) {
                    // Fallback to PIN signing
                    const { signIntentWithPin } = await import("@/lib/solana/biometric-signing");
                    const pinSignResult = await signIntentWithPin(intent, pin);

                    if (!pinSignResult.success || !pinSignResult.signedIntent) {
                        throw new Error(pinSignResult.error || "Failed to sign transaction");
                    }

                    // Queue transaction
                    await queueOfflineTransaction({
                        type: "swap_intent",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address", // Will be resolved at execution
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: pinSignResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: pinSignResult.signedIntent.signature,
                        nonce: pinSignResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "jupiter",
                        defiAction: "swap",
                    });
                } else {
                    // Queue transaction
                    await queueOfflineTransaction({
                        type: "swap_intent",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address",
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: signResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: signResult.signedIntent.signature,
                        nonce: signResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "jupiter",
                        defiAction: "swap",
                    });
                }

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                    "Swap Queued",
                    "Your swap has been queued and will execute when you come online.",
                    [{ text: "OK", onPress: () => router.back() }]
                );
            } else if (selectedAction === "yield") {
                // Yield deposit or withdraw
                const amountIn = BigInt(
                    Math.floor(
                        val * (inputToken.symbol === "SOL" ? LAMPORTS_PER_SOL : 1_000_000)
                    )
                );

                let intent;
                if (yieldAction === "deposit") {
                    intent = buildYieldDepositIntent({
                        sender: user.solanaPublicKey,
                        amount: amountIn,
                        token: inputToken.symbol,
                        protocol: "marinade", // Default protocol
                    });
                } else {
                    intent = buildYieldWithdrawIntent({
                        sender: user.solanaPublicKey,
                        amount: amountIn,
                        token: inputToken.symbol,
                        protocol: "marinade",
                    });
                }

                // Encrypt and sign intent
                const encryptedPayload = await encryptIntent(intent);
                const signResult = await signIntentWithBiometric(intent, `Sign yield ${yieldAction} transaction`);

                if (!signResult.success || !signResult.signedIntent) {
                    const { signIntentWithPin } = await import("@/lib/solana/biometric-signing");
                    const pinSignResult = await signIntentWithPin(intent, pin);

                    if (!pinSignResult.success || !pinSignResult.signedIntent) {
                        throw new Error(pinSignResult.error || "Failed to sign transaction");
                    }

                    await queueOfflineTransaction({
                        type: yieldAction === "deposit" ? "yield_deposit" : "yield_withdraw",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address",
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: pinSignResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: pinSignResult.signedIntent.signature,
                        nonce: pinSignResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "marinade",
                        defiAction: yieldAction,
                    });
                } else {
                    await queueOfflineTransaction({
                        type: yieldAction === "deposit" ? "yield_deposit" : "yield_withdraw",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address",
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: signResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: signResult.signedIntent.signature,
                        nonce: signResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "marinade",
                        defiAction: yieldAction,
                    });
                }

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                    "Yield Queued",
                    `Your yield ${yieldAction} has been queued and will execute when you come online.`,
                    [{ text: "OK", onPress: () => router.back() }]
                );
            } else if (selectedAction === "lend") {
                // Lending deposit, borrow, or repay
                const amountIn = BigInt(
                    Math.floor(
                        val * (inputToken.symbol === "SOL" ? LAMPORTS_PER_SOL : 1_000_000)
                    )
                );

                let intent;
                if (lendAction === "deposit") {
                    intent = buildLendIntent({
                        sender: user.solanaPublicKey,
                        amount: amountIn,
                        token: inputToken.symbol,
                        protocol: "solend", // Default protocol
                    });
                } else if (lendAction === "borrow") {
                    intent = buildBorrowIntent({
                        sender: user.solanaPublicKey,
                        amount: amountIn,
                        token: inputToken.symbol,
                        protocol: "solend",
                    });
                } else {
                    intent = buildRepayIntent({
                        sender: user.solanaPublicKey,
                        amount: amountIn,
                        token: inputToken.symbol,
                        protocol: "solend",
                    });
                }

                // Encrypt and sign intent
                const encryptedPayload = await encryptIntent(intent);
                const signResult = await signIntentWithBiometric(intent, `Sign ${lendAction} transaction`);

                if (!signResult.success || !signResult.signedIntent) {
                    const { signIntentWithPin } = await import("@/lib/solana/biometric-signing");
                    const pinSignResult = await signIntentWithPin(intent, pin);

                    if (!pinSignResult.success || !pinSignResult.signedIntent) {
                        throw new Error(pinSignResult.error || "Failed to sign transaction");
                    }

                    await queueOfflineTransaction({
                        type: lendAction === "deposit" ? "lend" : lendAction === "borrow" ? "borrow" : "repay",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address",
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: pinSignResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: pinSignResult.signedIntent.signature,
                        nonce: pinSignResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "solend",
                        defiAction: lendAction,
                    });
                } else {
                    await queueOfflineTransaction({
                        type: lendAction === "deposit" ? "lend" : lendAction === "borrow" ? "borrow" : "repay",
                        sender: user.solanaPublicKey,
                        recipient: "defi_protocol_address",
                        amount: amountIn,
                        token: inputToken.symbol,
                        encryptedPayload: signResult.signedIntent.encryptedPayload || encryptedPayload,
                        signature: signResult.signedIntent.signature,
                        nonce: signResult.signedIntent.nonce || "",
                        memo: intent.memo,
                        defiProtocol: "solend",
                        defiAction: lendAction,
                    });
                }

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                    "Lending Queued",
                    `Your ${lendAction} has been queued and will execute when you come online.`,
                    [{ text: "OK", onPress: () => router.back() }]
                );
            }
        } catch (err: any) {
            log.error("DeFi action failed", err);
            Alert.alert(
                "Transaction Failed",
                err.message || "Failed to process transaction. Please try again."
            );
        } finally {
            setIsProcessing(false);
            setShowPINInput(false);
            setPin("");
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
                        <Text className="text-2xl font-semibold ml-2">DeFi</Text>
                    </View>

                    {/* Action Selector */}
                    <View className="flex-row gap-3 mb-8">
                        {(["swap", "yield", "lend"] as DeFiAction[]).map((action) => (
                            <TouchableOpacity
                                key={action}
                                onPress={() => {
                                    setSelectedAction(action);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                className={`flex-1 rounded-full py-3 px-4 items-center ${selectedAction === action
                                    ? "bg-black dark:bg-primary"
                                    : "bg-black/5 dark:bg-black/20"
                                    }`}
                            >
                                <Text
                                    className={`font-semibold ${selectedAction === action
                                        ? "text-white dark:text-black"
                                        : "opacity-60 dark:text-white text-black"
                                        }`}
                                >
                                    {action === "swap" ? "Swap" : action === "yield" ? "Yield" : "Lend"}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Swap Interface */}
                    {selectedAction === "swap" && (
                        <View className="gap-6">
                            {/* Input Amount */}
                            <View>
                                <View className="flex-row justify-between items-end w-full mb-3 px-1">
                                    <Text className="text-lg font-semibold tracking-tight opacity-60 dark:text-white text-black">
                                        From
                                    </Text>
                                    <TouchableOpacity onPress={handleMax}>
                                        <Text className="text-sm font-bold text-black dark:text-emerald-500">
                                            Max: {currentBalance?.toFixed(3) || "0.000"} {inputToken.symbol}
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
                                            className="text-4xl tracking-tighter font-semibold flex-1 text-black dark:text-white"
                                        />
                                        <TouchableOpacity
                                            onPress={() => {
                                                setTokenModalType("input");
                                                setIsTokenModalVisible(true);
                                            }}
                                            className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2 flex-row items-center gap-2"
                                        >
                                            <Image
                                                source={inputToken.image}
                                                style={{ width: 20, height: 20 }}
                                            />
                                            <Text className="font-bold dark:text-white text-black">{inputToken.symbol}</Text>
                                            <Ionicons
                                                name="chevron-down"
                                                size={14}
                                                color={colorScheme === "dark" ? "white" : "black"}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* Swap Arrow */}
                            <TouchableOpacity
                                onPress={handleSwapTokens}
                                className="items-center -my-4 z-10"
                            >
                                <View className="bg-black dark:bg-primary rounded-full p-3">
                                    <Ionicons
                                        name="swap-vertical"
                                        size={24}
                                        color={colorScheme === "dark" ? "black" : "white"}
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Output Amount */}
                            <View>
                                <Text className="text-lg font-semibold tracking-tight opacity-60 mb-3 px-1 dark:text-white text-black">
                                    To
                                </Text>
                                <View className="bg-white/5 dark:bg-black/20 border border-white/10 rounded-3xl p-6">
                                    <View className="flex-row items-center justify-between">
                                        <View className="flex-1">
                                            {loadingRate ? (
                                                <ActivityIndicator size="small" />
                                            ) : swapRate ? (
                                                <Text className="text-4xl tracking-tighter font-semibold text-black dark:text-white">
                                                    {(
                                                        Number(swapRate.amountOut) /
                                                        (outputToken.symbol === "SOL" ? LAMPORTS_PER_SOL : 1_000_000)
                                                    ).toFixed(6)}
                                                </Text>
                                            ) : (
                                                <Text className="text-4xl tracking-tighter font-semibold opacity-30 text-black dark:text-white">
                                                    0.00
                                                </Text>
                                            )}
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setTokenModalType("output");
                                                setIsTokenModalVisible(true);
                                            }}
                                            className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2 flex-row items-center gap-2"
                                        >
                                            <Image
                                                source={outputToken.image}
                                                style={{ width: 20, height: 20 }}
                                            />
                                            <Text className="font-bold dark:text-white text-black">{outputToken.symbol}</Text>
                                            <Ionicons
                                                name="chevron-down"
                                                size={14}
                                                color={colorScheme === "dark" ? "white" : "black"}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                    {swapRate && swapRate.priceImpact && (
                                        <Text className="text-xs opacity-60 mt-2 dark:text-white text-black">
                                            Price impact: {swapRate.priceImpact.toFixed(2)}%
                                        </Text>
                                    )}
                                </View>
                            </View>

                            {/* Confirm Button */}
                            <TouchableOpacity
                                onPress={handleConfirm}
                                disabled={!amount || isProcessing || loadingRate}
                                className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
                            >
                                {isProcessing ? (
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
                                            className={`text-lg font-semibold tracking-tight ${colorScheme === "dark" ? "text-black" : "text-white"
                                                }`}
                                        >
                                            Confirm Swap
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <Text className="text-center text-xs opacity-40 px-6 dark:text-white text-black">
                                Swaps are queued offline and executed when you come online.
                            </Text>
                        </View>
                    )}

                    {/* Yield Interface */}
                    {selectedAction === "yield" && (
                        <View className="gap-6">
                            {/* Action Selector (Deposit/Withdraw) */}
                            <View className="flex-row gap-3">
                                {(["deposit", "withdraw"] as YieldAction[]).map((action) => (
                                    <TouchableOpacity
                                        key={action}
                                        onPress={() => {
                                            setYieldAction(action);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        className={`flex-1 rounded-full py-3 px-4 items-center ${yieldAction === action
                                            ? "bg-black dark:bg-primary"
                                            : "bg-black/5 dark:bg-black/20"
                                            }`}
                                    >
                                        <Text
                                            className={`font-semibold ${yieldAction === action
                                                ? "text-white dark:text-black"
                                                : "opacity-60 dark:text-white text-black"
                                                }`}
                                        >
                                            {action === "deposit" ? "Deposit" : "Withdraw"}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Amount Input */}
                            <View>
                                <View className="flex-row justify-between items-end w-full mb-3 px-1">
                                    <Text className="text-lg font-semibold tracking-tight opacity-60 dark:text-white text-black">
                                        Amount
                                    </Text>
                                    <TouchableOpacity onPress={handleMax}>
                                        <Text className="text-sm font-bold text-black dark:text-emerald-500">
                                            Max: {currentBalance?.toFixed(3) || "0.000"} {inputToken.symbol}
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
                                            className="text-4xl tracking-tighter font-semibold flex-1 text-black dark:text-white"
                                        />
                                        <TouchableOpacity
                                            onPress={() => {
                                                setTokenModalType("input");
                                                setIsTokenModalVisible(true);
                                            }}
                                            className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2 flex-row items-center gap-2"
                                        >
                                            <Image
                                                source={inputToken.image}
                                                style={{ width: 20, height: 20 }}
                                            />
                                            <Text className="font-bold dark:text-white text-black">{inputToken.symbol}</Text>
                                            <Ionicons
                                                name="chevron-down"
                                                size={14}
                                                color={colorScheme === "dark" ? "white" : "black"}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* Yield Rate Display */}
                            {loadingRates ? (
                                <View className="bg-black/5 dark:bg-black/20 rounded-2xl p-4 items-center">
                                    <ActivityIndicator size="small" />
                                </View>
                            ) : yieldRates[inputToken.symbol] ? (
                                <View className="bg-black/5 dark:bg-black/20 border border-white/10 rounded-2xl p-4">
                                    <Text className="text-sm opacity-60 dark:text-white text-black mb-1">
                                        Estimated APY
                                    </Text>
                                    <Text className="text-2xl font-bold dark:text-emerald-500 text-emerald-600">
                                        {yieldRates[inputToken.symbol].toFixed(2)}%
                                    </Text>
                                </View>
                            ) : null}

                            {/* Confirm Button */}
                            <TouchableOpacity
                                onPress={handleConfirm}
                                disabled={!amount || isProcessing}
                                className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
                            >
                                {isProcessing ? (
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
                                            className={`text-lg font-semibold tracking-tight ${colorScheme === "dark" ? "text-black" : "text-white"
                                                }`}
                                        >
                                            Confirm {yieldAction === "deposit" ? "Deposit" : "Withdraw"}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <Text className="text-center text-xs opacity-40 px-6 dark:text-white text-black">
                                Yield {yieldAction === "deposit" ? "deposits" : "withdrawals"} are queued offline and executed when you come online.
                            </Text>
                        </View>
                    )}

                    {/* Lending Interface */}
                    {selectedAction === "lend" && (
                        <View className="gap-6">
                            {/* Action Selector (Deposit/Borrow/Repay) */}
                            <View className="flex-row gap-2">
                                {(["deposit", "borrow", "repay"] as LendAction[]).map((action) => (
                                    <TouchableOpacity
                                        key={action}
                                        onPress={() => {
                                            setLendAction(action);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        className={`flex-1 rounded-full py-3 px-3 items-center ${lendAction === action
                                            ? "bg-black dark:bg-primary"
                                            : "bg-black/5 dark:bg-black/20"
                                            }`}
                                    >
                                        <Text
                                            className={`font-semibold text-xs ${lendAction === action
                                                ? "text-white dark:text-black"
                                                : "opacity-60 dark:text-white text-black"
                                                }`}
                                        >
                                            {action === "deposit" ? "Lend" : action === "borrow" ? "Borrow" : "Repay"}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Amount Input */}
                            <View>
                                <View className="flex-row justify-between items-end w-full mb-3 px-1">
                                    <Text className="text-lg font-semibold tracking-tight opacity-60 dark:text-white text-black">
                                        Amount
                                    </Text>
                                    <TouchableOpacity onPress={handleMax}>
                                        <Text className="text-sm font-bold text-black dark:text-emerald-500">
                                            Max: {currentBalance?.toFixed(3) || "0.000"} {inputToken.symbol}
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
                                            className="text-4xl tracking-tighter font-semibold flex-1 text-black dark:text-white"
                                        />
                                        <TouchableOpacity
                                            onPress={() => {
                                                setTokenModalType("input");
                                                setIsTokenModalVisible(true);
                                            }}
                                            className="bg-black/5 dark:bg-black/20 rounded-full px-4 py-2 flex-row items-center gap-2"
                                        >
                                            <Image
                                                source={inputToken.image}
                                                style={{ width: 20, height: 20 }}
                                            />
                                            <Text className="font-bold dark:text-white text-black">{inputToken.symbol}</Text>
                                            <Ionicons
                                                name="chevron-down"
                                                size={14}
                                                color={colorScheme === "dark" ? "white" : "black"}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* Lending Rates Display */}
                            {loadingRates ? (
                                <View className="bg-black/5 dark:bg-black/20 rounded-2xl p-4 items-center">
                                    <ActivityIndicator size="small" />
                                </View>
                            ) : (
                                <View className="gap-3">
                                    {lendAction === "deposit" && lendingRates.supplyRates[inputToken.symbol] && (
                                        <View className="bg-black/5 dark:bg-black/20 border border-white/10 rounded-2xl p-4">
                                            <Text className="text-sm opacity-60 dark:text-white text-black mb-1">
                                                Supply APY
                                            </Text>
                                            <Text className="text-2xl font-bold dark:text-emerald-500 text-emerald-600">
                                                {lendingRates.supplyRates[inputToken.symbol].toFixed(2)}%
                                            </Text>
                                        </View>
                                    )}
                                    {lendAction === "borrow" && lendingRates.borrowRates[inputToken.symbol] && (
                                        <View className="bg-black/5 dark:bg-black/20 border border-white/10 rounded-2xl p-4">
                                            <Text className="text-sm opacity-60 dark:text-white text-black mb-1">
                                                Borrow APR
                                            </Text>
                                            <Text className="text-2xl font-bold dark:text-orange-500 text-orange-600">
                                                {lendingRates.borrowRates[inputToken.symbol].toFixed(2)}%
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Confirm Button */}
                            <TouchableOpacity
                                onPress={handleConfirm}
                                disabled={!amount || isProcessing}
                                className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
                            >
                                {isProcessing ? (
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
                                            className={`text-lg font-semibold tracking-tight ${colorScheme === "dark" ? "text-black" : "text-white"
                                                }`}
                                        >
                                            Confirm {lendAction === "deposit" ? "Lend" : lendAction === "borrow" ? "Borrow" : "Repay"}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <Text className="text-center text-xs opacity-40 px-6 dark:text-white text-black">
                                Lending transactions are queued offline and executed when you come online.
                            </Text>
                        </View>
                    )}

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
                            {TOKENS.map((token) => {
                                const isSelected =
                                    tokenModalType === "input"
                                        ? inputToken.symbol === token.symbol
                                        : outputToken.symbol === token.symbol;
                                return (
                                    <TouchableOpacity
                                        key={token.symbol}
                                        onPress={() => {
                                            if (tokenModalType === "input") {
                                                setInputToken(token);
                                            } else {
                                                setOutputToken(token);
                                            }
                                            setIsTokenModalVisible(false);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        className={`flex-row items-center justify-between p-4 rounded-2xl border ${isSelected
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
                                        <Ionicons
                                            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                            size={24}
                                            color={isSelected ? "#05E28A" : "#888"}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* PIN Modal */}
            <Modal
                visible={showPINInput}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPINInput(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    className="flex-1 bg-black/80 justify-center items-center px-6"
                >
                    <View className="bg-neutral-900 w-full rounded-3xl p-6 border border-white/10">
                        <Text className="text-white text-xl font-bold mb-2">Enter PIN</Text>
                        <Text className="text-white/60 mb-6">
                            Enter your security PIN to authorize this transaction.
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
                                    setShowPINInput(false);
                                    setPin("");
                                }}
                                className="flex-1 bg-white/10 py-4 rounded-xl items-center"
                            >
                                <Text className="text-white font-semibold">Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={executeDeFiAction}
                                disabled={isProcessing || pin.length < 4}
                                className={`flex-1 py-4 rounded-xl items-center ${isProcessing || pin.length < 4 ? "bg-primary/50" : "bg-primary"
                                    }`}
                            >
                                {isProcessing ? (
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

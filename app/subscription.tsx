import {
    SafeAreaView,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import useUser from "@/hooks/useUser";
import { signTransactionWithBiometric } from "@/lib/solana/transaction-signer";
import {
    createSubscriptionPaymentTransaction,
    getSubscriptionPaymentInfo,
    processSubscriptionUpgrade,
} from "@/lib/subscription/payment-handler";
import {
    getTransactionCountInfo,
} from "@/lib/subscription/subscription-manager";
import { log } from "@/lib/utils/logger";
import { Ionicons } from "@expo/vector-icons";
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

export default function Subscription() {
    const colorScheme = useColorScheme();
    const router = useRouter();
    const { user, refresh } = useUser();
    const [subscriptionInfo, setSubscriptionInfo] = useState<{
        count: number;
        limit: number | "unlimited";
        tier: "basic" | "premium";
        remaining: number | "unlimited";
        resetDate: number;
    } | null>(null);
    const [paymentInfo, setPaymentInfo] = useState<{
        priceSol: number;
        priceUsd: number;
        recipient: string;
        currentTier: "basic" | "premium";
    } | null>(null);
    const [loading, setLoading] = useState(true);

    // PIN Modal State
    const [isPinModalVisible, setIsPinModalVisible] = useState(false);
    const [pin, setPin] = useState("");
    const [isSigning, setIsSigning] = useState(false);

    useEffect(() => {
        loadSubscriptionData();
    }, [user]);

    const loadSubscriptionData = async () => {
        setLoading(true);
        try {
            const info = await getTransactionCountInfo();
            setSubscriptionInfo(info);
            const payment = await getSubscriptionPaymentInfo();
            setPaymentInfo(payment);
        } catch (error) {
            log.error("Failed to load subscription data", error);
            Alert.alert("Error", "Failed to load subscription information.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpgrade = async () => {
        if (!paymentInfo) return;

        Alert.alert(
            "Upgrade to Premium",
            `Upgrade to Premium for ${paymentInfo.priceSol} SOL ($${paymentInfo.priceUsd.toFixed(2)})?\n\nYou'll get:\n• Unlimited offline transactions\n• Priority sync queue\n• Lower fees (0.1% vs 0.5%)`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Upgrade",
                    onPress: () => {
                        setIsPinModalVisible(true);
                    },
                },
            ]
        );
    };

    const executeUpgrade = async () => {
        if (!pin || pin.length < 4) {
            Alert.alert("PIN Required", "Please enter your PIN.");
            return;
        }

        if (!paymentInfo) return;

        setIsSigning(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            // Create payment transaction
            const { transaction } = await createSubscriptionPaymentTransaction();

            // Sign transaction with biometric (falls back to PIN)
            const signResult = await signTransactionWithBiometric(
                transaction,
                "Sign subscription payment"
            );

            if (!signResult.success || !signResult.signedTransaction) {
                // Fallback to PIN signing if biometric fails
                const { signTransactionWithPin } = await import("@/lib/solana/transaction-signer");
                const pinSignResult = await signTransactionWithPin(transaction, pin);

                if (!pinSignResult.success || !pinSignResult.signedTransaction) {
                    throw new Error(pinSignResult.error || "Failed to sign transaction");
                }

                // Send transaction
                const { Connection, clusterApiUrl } = await import("@solana/web3.js");
                const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
                const signedTx = pinSignResult.signedTransaction;
                const signature = await connection.sendRawTransaction(
                    signedTx.serialize(),
                    { skipPreflight: false, maxRetries: 3 }
                );

                // Wait for confirmation
                await connection.confirmTransaction(signature, "confirmed");

                // Process upgrade
                const result = await processSubscriptionUpgrade(signature);
                if (!result.success) {
                    throw new Error(result.error || "Upgrade processing failed");
                }
            } else {
                // Send transaction
                const { Connection, clusterApiUrl } = await import("@solana/web3.js");
                const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
                const signedTx = signResult.signedTransaction;
                const signature = await connection.sendRawTransaction(
                    signedTx.serialize(),
                    { skipPreflight: false, maxRetries: 3 }
                );

                // Wait for confirmation
                await connection.confirmTransaction(signature, "confirmed");

                // Process upgrade
                const result = await processSubscriptionUpgrade(signature);
                if (!result.success) {
                    throw new Error(result.error || "Upgrade processing failed");
                }
            }

            setIsSigning(false);
            setIsPinModalVisible(false);
            setPin("");

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refresh();
            await loadSubscriptionData();

            Alert.alert(
                "Upgrade Successful",
                "You have successfully upgraded to Premium!",
                [{ text: "OK", onPress: () => router.back() }]
            );
        } catch (err: any) {
            log.error("Subscription upgrade failed", err);
            setIsSigning(false);
            Alert.alert(
                "Upgrade Failed",
                err.message || "Failed to process upgrade. Please try again."
            );
        }
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 items-center justify-center dark:bg-black bg-white">
                <ActivityIndicator size="large" color={colorScheme === "dark" ? "#fff" : "#000"} />
                <Text className="text-lg mt-4 dark:text-white text-black">Loading subscription info...</Text>
            </SafeAreaView>
        );
    }

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
                        <Text className="text-2xl font-semibold ml-2">Subscription</Text>
                    </View>

                    {/* Current Tier Card */}
                    {subscriptionInfo && (
                        <View className="bg-black/5 dark:bg-black/20 border border-black/0 rounded-3xl py-6 px-6 mb-8">
                            <View className="flex-row items-center justify-between mb-4">
                                <View className="flex-row items-center gap-3">
                                    <View className="w-12 h-12 rounded-full bg-neutral-500/20 items-center justify-center">
                                        <IconSymbol
                                            name={subscriptionInfo.tier === "premium" ? "crown.fill" : "wallet.bifold.fill"}
                                            size={24}
                                            color={subscriptionInfo.tier === "premium" ? "#FFD700" : (colorScheme === "dark" ? "#05E28A" : "#000")}
                                        />
                                    </View>
                                    <View>
                                        <Text className="text-2xl font-bold dark:text-white text-black">
                                            {subscriptionInfo.tier === "premium" ? "Premium" : "Basic"} Tier
                                        </Text>
                                        {subscriptionInfo.tier === "basic" && (
                                            <Text className="text-sm opacity-60 dark:text-white text-black">
                                                {subscriptionInfo.count} / {subscriptionInfo.limit} transactions used
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                {subscriptionInfo.tier === "premium" && (
                                    <View className="bg-[#FFD700]/20 px-3 py-1.5 rounded-full">
                                        <Text className="text-[#FFD700] font-bold text-xs">PREMIUM</Text>
                                    </View>
                                )}
                            </View>

                            {subscriptionInfo.tier === "basic" ? (
                                <View className="mt-4 pt-4 border-t border-white/10">
                                    <Text className="text-sm opacity-60 dark:text-white text-black mb-2">
                                        Resets on {new Date(subscriptionInfo.resetDate + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                                    </Text>
                                    <View className="bg-black/5 dark:bg-black/20 rounded-2xl p-4">
                                        <View className="flex-row items-center justify-between mb-2">
                                            <Text className="text-sm opacity-80 dark:text-white text-black">Remaining</Text>
                                            <Text className="text-lg font-bold dark:text-emerald-500 text-emerald-600">
                                                {subscriptionInfo.remaining === "unlimited" ? "∞" : subscriptionInfo.remaining}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <Text className="text-base opacity-70 dark:text-white text-black mt-2">
                                    Unlimited transactions • Priority sync • Lower fees
                                </Text>
                            )}
                        </View>
                    )}

                    {/* Features Comparison */}
                    <View className="bg-black/5 dark:bg-black/20 border border-black/0 rounded-3xl py-6 px-6 mb-8">
                        <Text className="text-xl font-semibold mb-4 dark:text-white text-black">Features</Text>

                        <View className="gap-4">
                            <View className="flex-row justify-between items-center py-3 border-b border-white/10">
                                <Text className="text-base dark:text-white text-black">Offline Transactions</Text>
                                <Text className="text-base font-semibold dark:text-white text-black">
                                    {subscriptionInfo?.tier === "premium" ? "Unlimited" : "10/month"}
                                </Text>
                            </View>

                            <View className="flex-row justify-between items-center py-3 border-b border-white/10">
                                <Text className="text-base dark:text-white text-black">Broadcast Fee</Text>
                                <Text className="text-base font-semibold dark:text-white text-black">
                                    {subscriptionInfo?.tier === "premium" ? "0.1%" : "0.5%"}
                                </Text>
                            </View>

                            <View className="flex-row justify-between items-center py-3 border-b border-white/10">
                                <Text className="text-base dark:text-white text-black">Fee Cap</Text>
                                <Text className="text-base font-semibold dark:text-white text-black">
                                    {subscriptionInfo?.tier === "premium" ? "$0.10" : "$0.50"}
                                </Text>
                            </View>

                            <View className="flex-row justify-between items-center py-3">
                                <Text className="text-base dark:text-white text-black">Sync Priority</Text>
                                <Text className="text-base font-semibold dark:text-white text-black">
                                    {subscriptionInfo?.tier === "premium" ? "High" : "Standard"}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Upgrade Button */}
                    {subscriptionInfo && subscriptionInfo.tier === "basic" && (
                        <View className="mb-8">
                            {paymentInfo ? (
                                <>
                                    <TouchableOpacity
                                        onPress={handleUpgrade}
                                        className="bg-black dark:bg-primary rounded-full py-4 items-center justify-center flex-row gap-3"
                                    >
                                        <IconSymbol
                                            name="crown.fill"
                                            size={20}
                                            color={colorScheme === "dark" ? "black" : "white"}
                                        />
                                        <Text
                                            className={`text-lg font-semibold tracking-tight ${colorScheme === "dark" ? "text-black" : "text-white"
                                                }`}
                                        >
                                            Upgrade to Premium - {paymentInfo.priceSol} SOL
                                        </Text>
                                    </TouchableOpacity>
                                    <Text className="text-sm text-center mt-3 opacity-60 dark:text-white text-black">
                                        ${paymentInfo.priceUsd.toFixed(2)} USD equivalent
                                    </Text>
                                </>
                            ) : (
                                <View className="bg-black/5 dark:bg-black/20 rounded-2xl p-4 items-center">
                                    <ActivityIndicator size="small" color={colorScheme === "dark" ? "white" : "black"} />
                                    <Text className="text-sm opacity-60 mt-2 dark:text-white text-black">
                                        Loading upgrade options...
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

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
                            Enter your security PIN to authorize the subscription payment.
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
                                onPress={executeUpgrade}
                                disabled={isSigning || pin.length < 4}
                                className={`flex-1 py-4 rounded-xl items-center ${isSigning || pin.length < 4 ? "bg-primary/50" : "bg-primary"
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

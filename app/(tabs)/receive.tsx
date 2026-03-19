import { QRScanner } from "@/components/QRScanner";
import {
  SafeAreaView,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "@/components/ui";
import useUser from "@/hooks/useUser";
import { scanBLEDevices, type DeviceInfo } from "@/lib/solana/delivery-methods";
import {
  onTransactionReceived,
  startBLEAdvertising,
  startNFCListening,
  stopBLEAdvertising,
  stopNFCListening,
  type ReceivedTransaction,
} from "@/lib/solana/receive-listener";
import { queueOfflineTransaction } from "@/lib/storage/offline-queue";
import { markNonceAsUsed } from "@/lib/storage/nonce-tracker";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  TouchableOpacity,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

interface ScannedQRData {
  zyppUserId: string;
  solanaPublicKey: string;
  profileImage?: string;
}

export const Receive = () => {
  const colorScheme = useColorScheme();
  const { user, loading } = useUser();
  const [copied, setCopied] = useState(false);
  const [receivedTransaction, setReceivedTransaction] =
    useState<ReceivedTransaction | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const listenerSetupRef = useRef(false);

  // Scanning states
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<DeviceInfo[]>([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedQRData, setScannedQRData] = useState<ScannedQRData | null>(
    null
  );
  const [showSenderPreview, setShowSenderPreview] = useState(false);

  const handleCopyAddress = async () => {
    if (!user?.solanaPublicKey) return;

    try {
      await Clipboard.setStringAsync(user.solanaPublicKey);
      setCopied(true);
      Alert.alert("Copied!", "Wallet address copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Error", "Failed to copy address to clipboard.");
    }
  };

  const handleAcceptTransaction = async () => {
    if (!receivedTransaction) return;

    setIsProcessing(true);
    try {
      const intent = receivedTransaction.intent;

      // Queue the transaction for offline processing
      await queueOfflineTransaction({
        type: intent.type,
        sender: intent.sender,
        recipient: intent.recipient,
        amount: intent.amount,
        token: intent.token,
        encryptedPayload: intent.encryptedPayload,
        signature: intent.signature,
        nonce: intent.nonce,
        memo: intent.memo,
      });

      // Replay-protection: consume the nonce only after the transaction is
      // successfully queued for offline execution.
      if (intent.nonce) {
        await markNonceAsUsed(intent.nonce);
      }

      Alert.alert("Success", "Transaction received and queued for broadcast.", [
        {
          text: "OK",
          onPress: () => {
            setShowTransactionModal(false);
            setReceivedTransaction(null);
          },
        },
      ]);
    } catch (error) {
      Alert.alert("Error", "Failed to queue transaction: " + String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectTransaction = () => {
    setShowTransactionModal(false);
    setReceivedTransaction(null);
  };

  /**
   * Scan for nearby Zypp users via BLE
   */
  const handleScanNearby = async () => {
    setShowScanModal(true);
    setIsScanning(true);
    setScannedDevices([]);

    try {
      console.log("[Receive] Scanning for nearby devices...");
      const devices = await scanBLEDevices(5000); // Scan for 5 seconds

      // Filter Zypp devices (already have .zypp in name from scanBLEDevices)
      const zeppDevices = devices.filter(
        (d) => d.name && d.name.includes(".zypp")
      );

      console.log(`[Receive] Found ${zeppDevices.length} Zypp devices`);
      setScannedDevices(zeppDevices);
    } catch (err) {
      console.error("[Receive] Scan error:", err);
      Alert.alert(
        "Scan Error",
        "Failed to scan for nearby devices: " + String(err)
      );
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Handle QR code scan result
   */
  const handleQRCodeScanned = (data: string) => {
    try {
      console.log("[Receive] QR code scanned:", data);
      const parsed = JSON.parse(data);

      if (!parsed.zyppUserId || !parsed.solanaPublicKey) {
        throw new Error("Invalid QR code format");
      }

      setScannedQRData({
        zyppUserId: parsed.zyppUserId,
        solanaPublicKey: parsed.solanaPublicKey,
        profileImage: parsed.profileImage,
      });
      setShowQRScanner(false);
      setShowSenderPreview(true);
    } catch (err) {
      console.error("[Receive] QR parse error:", err);
      Alert.alert("Invalid QR Code", "This QR code is not a valid Zypp wallet");
    }
  };

  /**
   * Confirm sender from QR scan or nearby list
   */
  const handleConfirmSender = () => {
    // Close all modals
    setShowSenderPreview(false);
    setShowScanModal(false);
    setShowQRScanner(false);

    // Get sender name from whichever source we used
    const senderName = scannedQRData
      ? scannedQRData.zyppUserId
      : scannedDevices.length > 0
      ? scannedDevices[0].name.replace(".zypp", "")
      : "Sender";

    console.log("[Receive] Sender confirmed:", senderName);

    Alert.alert(
      "Sender Ready",
      `Waiting to receive transaction from ${senderName}...`
    );
  };

  useEffect(() => {
    if (!user || listenerSetupRef.current) return;

    const setupListeners = async () => {
      try {
        listenerSetupRef.current = true;

        console.log("[RECEIVE] Setting up transaction listeners...");

        // Start BLE advertising so senders can discover this device
        await startBLEAdvertising(user.zyppUserId);

        // Start NFC listening for tap-to-receive
        await startNFCListening();

        // Register callback for when transactions are received
        // This is called by the underlying BLE/NFC listeners
        const unsubscribe = onTransactionReceived((transaction) => {
          console.log("[RECEIVE] Transaction received, showing modal");
          setReceivedTransaction(transaction);
          setShowTransactionModal(true);
        });

        // Store unsubscribe function in ref for cleanup
        listenerSetupRef.current = true;
        return unsubscribe;
      } catch (error) {
        console.error("Failed to setup receive listeners:", error);
      }
    };

    let unsubscribe: (() => void) | void;

    setupListeners().then((unsub) => {
      unsubscribe = unsub;
    });

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      stopBLEAdvertising().catch((e) =>
        console.error("Failed to stop BLE advertising:", e)
      );
      stopNFCListening().catch((e) =>
        console.error("Failed to stop NFC listening:", e)
      );
    };
  }, [user]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center">
        <ActivityIndicator
          size="large"
          color={colorScheme === "dark" ? "#fff" : "#000"}
        />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center">
        <Text className="dark:text-white text-black">
          No user data available
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="relative flex-1 dark:bg-black bg-white">
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
        className="flex-1 pt-6 px-6 w-full"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-3xl font-medium tracking-tighter dark:text-white text-black">
            Receive
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/me")}
            className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20"
          >
            <Image
              source={
                user?.profileImageUrl || require("@/assets/images/user.png")
              }
              style={{ width: "100%", height: "100%" }}
            />
          </TouchableOpacity>
        </View>

        {/* User Info Card - Integrated */}
        <View className="items-start mb-8">
          <Text className="text-lg font-medium opacity-60 dark:text-white text-black">
            Your Zypp ID
          </Text>
          <Text className="text-2xl font-bold tracking-tight dark:text-white text-black">
            {user.zyppUserId}
          </Text>
        </View>
        {/* Wallet Address Section */}
        <View className="rounded-[32px] mb-5 py-6">
          <Text className="text-sm font-semibold opacity-60 dark:text-white text-black mb-4 tracking-tight">
            Wallet Address
          </Text>

          {/* Address Display */}
          <View className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text
                className="text-sm dark:text-white/80 text-black/80 font-mono"
                numberOfLines={1}
              >
                {user.solanaPublicKey}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleCopyAddress}
              className={`w-10 h-10 rounded-full items-center justify-center ${
                copied ? "bg-primary" : "bg-black/10 dark:bg-white/10"
              }`}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={18}
                color={
                  copied ? "#000" : colorScheme === "dark" ? "#fff" : "#000"
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* QR Code Section */}
        <View className="bg-white/10 dark:bg-black/20 rounded-[40px] p-8 mb-8 items-center border border-white/10">
          <Text className="text-sm font-semibold opacity-60 dark:text-white text-black mb-8 uppercase tracking-widest text-center">
            Your Payment QR
          </Text>
          <View className="bg-white p-6 rounded-[32px] shadow-2xl shadow-black/20">
            <QRCode
              value={JSON.stringify({
                zyppUserId: user.zyppUserId,
                solanaPublicKey: user.solanaPublicKey,
                profileImage: user?.profileImageUrl,
              })}
              size={200}
              color="#000000"
              backgroundColor="#ffffff"
              quietZone={10}
            />
          </View>
          <Text className="text-sm font-medium dark:text-white/40 text-black/40 mt-8 text-center max-w-[200px]">
            Scan this to send funds instantly to {user.zyppUserId}
          </Text>
        </View>

        {/* Scanning Options Section */}
        <View className="gap-3 mb-10">
          <Text className="text-sm font-semibold opacity-60 dark:text-white text-black mb-2 uppercase tracking-widest">
            Other Ways to Connect
          </Text>

          {/* Scan Nearby Users */}
          <TouchableOpacity
            onPress={handleScanNearby}
            disabled={isScanning}
            className="flex-row items-center justify-between bg-black/10 dark:bg-black/20 rounded-[24px] p-5 border border-white/5"
          >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-full bg-black/10 dark:bg-primary/20 items-center justify-center">
                <Ionicons name="bluetooth" size={20}  color={colorScheme === "dark" ? "#05E28A" : "#000"} />
              </View>
              <View>
                <Text className="text-lg font-bold dark:text-white text-black">
                  Scan Nearby
                </Text>
                <Text className="text-sm opacity-50 dark:text-white text-black">
                  Find users via Bluetooth
                </Text>
              </View>
            </View>
            {isScanning ? (
              <ActivityIndicator color="#05E28A" />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colorScheme === "dark" ? "#fff" : "#000"}
              />
            )}
          </TouchableOpacity>

          {/* Scan QR Code */}
          <TouchableOpacity
            onPress={() => setShowQRScanner(true)}
            className="flex-row items-center justify-between bg-black/10 dark:bg-black/20 rounded-[24px] p-5 border border-white/5"
        >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-full bg-black/10 dark:bg-primary/20 items-center justify-center">
                <Ionicons name="qr-code" size={20} color={colorScheme === "dark" ? "#05E28A" : "#000"} />
              </View>
              <View>
                <Text className="text-lg font-bold dark:text-white text-black">
                  Scan QR Code
                </Text>
                <Text className="text-sm opacity-50 dark:text-white text-black">
                  Identify sender&apos;s wallet
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Transaction Received Modal */}
      <Modal
        visible={showTransactionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTransactionModal(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white dark:bg-black rounded-3xl p-6 w-full max-w-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold dark:text-white text-black">
                Transaction Received
              </Text>
              <TouchableOpacity onPress={() => setShowTransactionModal(false)}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {receivedTransaction && (
              <View className="gap-5 bg-black/5 dark:bg-white/5 rounded-[24px] p-6 border border-white/5">
                {/* Sender */}
                <View className="flex-row items-center gap-4">
                  <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
                    <Ionicons name="person" size={20} color="#05E28A" />
                  </View>
                  <View>
                    <Text className="text-xs font-semibold opacity-50 dark:text-white text-black uppercase tracking-widest">
                      From
                    </Text>
                    <Text className="text-lg font-bold dark:text-white text-black">
                      {receivedTransaction.intent.sender.slice(0, 8)}...
                      {receivedTransaction.intent.sender.slice(-8)}
                    </Text>
                  </View>
                </View>

                {/* Amount */}
                <View className="flex-row items-center gap-4">
                  <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
                    <Ionicons name="cash-outline" size={20} color="#05E28A" />
                  </View>
                  <View>
                    <Text className="text-xs font-semibold opacity-50 dark:text-white text-black uppercase tracking-widest">
                      Amount
                    </Text>
                    <Text className="text-2xl font-bold dark:text-white text-black">
                      {typeof receivedTransaction.intent.amount === "string"
                        ? receivedTransaction.intent.amount
                        : (
                            Number(receivedTransaction.intent.amount) / 1e6
                          ).toFixed(2)}{" "}
                      {receivedTransaction.intent.token}
                    </Text>
                  </View>
                </View>

                {/* Memo */}
                {receivedTransaction.intent.memo && (
                  <View className="py-3 px-4 bg-black/5 dark:bg-white/5 rounded-xl border border-white/5">
                    <Text className="text-sm italic opacity-70 dark:text-white text-black">
                      &ldquo;{receivedTransaction.intent.memo}&rdquo;
                    </Text>
                  </View>
                )}

                <View className="h-[1px] bg-white/10 w-full" />

                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-semibold opacity-40 dark:text-white text-black uppercase tracking-widest">
                    via {receivedTransaction.source}
                  </Text>
                  <Text className="text-xs opacity-40 dark:text-white text-black">
                    {new Date(
                      receivedTransaction.receivedAt
                    ).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity
                onPress={handleRejectTransaction}
                className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-3 items-center"
              >
                <Text className="dark:text-white text-black font-semibold">
                  Reject
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAcceptTransaction}
                disabled={isProcessing}
                className="flex-1 bg-black dark:bg-white rounded-full py-3 items-center"
              >
                {isProcessing ? (
                  <ActivityIndicator
                    size="small"
                    color={colorScheme === "dark" ? "#000" : "#fff"}
                  />
                ) : (
                  <Text className="dark:text-black text-white font-semibold">
                    Accept
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nearby Devices Modal */}
      <Modal
        visible={showScanModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScanModal(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white dark:bg-black rounded-3xl p-6 w-full max-w-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold dark:text-white text-black">
                Nearby Users
              </Text>
              <TouchableOpacity onPress={() => setShowScanModal(false)}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {scannedDevices.length === 0 ? (
              <View className="py-8 items-center">
                <Ionicons
                  name="bluetooth"
                  size={48}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                  style={{ marginBottom: 12 }}
                />
                <Text className="text-sm dark:text-white/60 text-black/60 text-center">
                  No nearby users found. Make sure they have the Zypp app open.
                </Text>
              </View>
            ) : (
              <FlatList
                data={scannedDevices}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setShowSenderPreview(true);
                      setShowScanModal(false);
                    }}
                    className="flex-row items-center justify-between bg-black/5 dark:bg-white/5 rounded-[20px] p-4 mb-3 border border-white/5"
                  >
                    <View className="flex-row items-center gap-4">
                      <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                        <Ionicons name="person" size={24} color="#05E28A" />
                      </View>
                      <View>
                        <Text className="text-lg font-bold dark:text-white text-black">
                          {item.name.replace(".zypp", "")}
                        </Text>
                        <Text className="text-xs opacity-50 dark:text-white text-black uppercase tracking-tight">
                          Nearby via Bluetooth
                        </Text>
                      </View>
                    </View>
                    <View className="w-8 h-8 rounded-full bg-black/10 dark:bg-black/20 items-center justify-center">
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colorScheme === "dark" ? "#fff" : "#000"}
                      />
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
              />
            )}

            <TouchableOpacity
              onPress={() => setShowScanModal(false)}
              className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3 items-center mt-4"
            >
              <Text className="dark:text-white text-black font-semibold">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sender Preview Modal */}
      <Modal
        visible={showSenderPreview}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSenderPreview(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white dark:bg-black rounded-3xl p-6 w-full max-w-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold dark:text-white text-black">
                Receive from
              </Text>
              <TouchableOpacity onPress={() => setShowSenderPreview(false)}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {scannedQRData && (
              <View className="gap-6 items-center py-6 bg-black/5 dark:bg-white/5 rounded-[32px] border border-white/5">
                <View className="relative">
                  <Image
                    source={
                      scannedQRData.profileImage
                        ? { uri: scannedQRData.profileImage }
                        : require("@/assets/images/user.png")
                    }
                    className="w-24 h-24 rounded-full bg-black/10 border-4 border-primary/20"
                  />
                  <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary items-center justify-center border-2 border-white dark:border-black">
                    <Ionicons name="checkmark" size={16} color="black" />
                  </View>
                </View>
                <View className="items-center gap-2">
                  <Text className="text-2xl font-bold dark:text-white text-black tracking-tight">
                    {scannedQRData.zyppUserId}
                  </Text>
                  <View className="bg-black/10 dark:bg-black/20 px-4 py-2 rounded-full">
                    <Text className="text-xs font-mono opacity-60 dark:text-white text-black">
                      {scannedQRData.solanaPublicKey.slice(0, 12)}...
                      {scannedQRData.solanaPublicKey.slice(-12)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity
                onPress={() => setShowSenderPreview(false)}
                className="flex-1 bg-black/10 dark:bg-white/10 rounded-full py-3 items-center"
              >
                <Text className="dark:text-white text-black font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  handleConfirmSender();
                  setShowSenderPreview(false);
                }}
                className="flex-1 bg-black dark:bg-white rounded-full py-3 items-center"
              >
                <Text className="dark:text-black text-white font-semibold">
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal
        visible={showQRScanner}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQRScanner(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white dark:bg-black rounded-3xl p-6 w-full max-w-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold dark:text-white text-black">
                Scan QR Code
              </Text>
              <TouchableOpacity
                onPress={() => setShowQRScanner(false)}
                className="p-2"
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            <View className="overflow-hidden rounded-2xl h-[300px]">
              <QRScanner
                visible={showQRScanner}
                onQRCodeScanned={handleQRCodeScanned}
                onClose={() => setShowQRScanner(false)}
              />
            </View>

            <TouchableOpacity
              onPress={() => setShowQRScanner(false)}
              className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3 items-center mt-6"
            >
              <Text className="dark:text-white text-black font-semibold">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
export default Receive;

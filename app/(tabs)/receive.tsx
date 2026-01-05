import { QRScanner } from "@/components/QRScanner";
import {
  Button,
  Dialog,
  DialogContent,
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
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
        await startBLEAdvertising();

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
        className="flex-1 pt-6 px-6 w-full"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center mb-8">
          <Text className="text-2xl font-semibold dark:text-white text-black">
            Receive
          </Text>
        </View>

        {/* User Info Card */}
        <View className="bg-black/5 dark:bg-white/5 rounded-3xl p-6 mb-8">
          <View className="items-center mb-6">
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
            </TouchableOpacity>
            <Text className="text-xl font-semibold dark:text-white text-black">
              {user.zyppUserId}
            </Text>
          </View>
        </View>
        {/* Wallet Address Section */}
        <View className="bg-black/5 dark:bg-white/5 rounded-3xl p-6 mb-8">
          <Text className="text-lg font-semibold dark:text-white text-black mb-4">
            Wallet Address
          </Text>

          {/* Address Display */}
          <View className="bg-white dark:bg-white/5 rounded-2xl p-4 mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-sm dark:text-white/70 text-black/70 font-mono">
                {user.solanaPublicKey.substring(0, 16)}...
              </Text>
              <Text className="text-xs dark:text-white/50 text-black/50 font-mono mt-1">
                {user.solanaPublicKey.substring(16)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleCopyAddress}
              className={`px-4 py-2 rounded-full flex-row items-center gap-2 ${
                copied ? "bg-primary" : "bg-black/10 dark:bg-white/10"
              }`}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy"}
                size={16}
                color={
                  copied
                    ? colorScheme === "dark"
                      ? "#000"
                      : "#fff"
                    : colorScheme === "dark"
                      ? "#fff"
                      : "#000"
                }
              />
              <Text
                className={`text-sm font-semibold ${
                  copied
                    ? "text-white dark:text-black"
                    : "dark:text-white text-black"
                }`}
              >
                {copied ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR Code Section */}
        <View className="bg-black/5 dark:bg-white/5 rounded-3xl p-8 mb-8 items-center">
          <Text className="text-lg font-semibold dark:text-white text-black mb-6">
            Share Your QR Code
          </Text>
          <View className="bg-white dark:bg-white/10 p-6 rounded-2xl">
            <QRCode
              value={JSON.stringify({
                zyppUserId: user.zyppUserId,
                solanaPublicKey: user.solanaPublicKey,
                profileImage: user?.profileImageUrl,
              })}
              size={180}
              color="#000000"
              backgroundColor="#ffffff"
              quietZone={8}
            />
          </View>
          <Text className="text-xs dark:text-white/50 text-black/50 mt-6 text-center">
            Scan this QR code to send funds directly to your wallet
          </Text>
        </View>

        {/* Scanning Options Section */}
        <View className="bg-black/5 dark:bg-white/5 rounded-3xl p-6 mb-8">
          <Text className="text-lg font-semibold dark:text-white text-black mb-4">
            Or scan sender&apos;s details
          </Text>

          <View className="gap-3">
            {/* Scan Nearby Users */}
            <TouchableOpacity
              onPress={handleScanNearby}
              disabled={isScanning}
              className="flex-row items-center justify-between bg-white dark:bg-white/10 rounded-xl p-4"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="bluetooth"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
                <View>
                  <Text className="font-semibold dark:text-white text-black">
                    Scan Nearby
                  </Text>
                  <Text className="text-xs dark:text-white/60 text-black/60">
                    Find users via Bluetooth
                  </Text>
                </View>
              </View>
              {isScanning ? (
                <ActivityIndicator
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
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
              className="flex-row items-center justify-between bg-white dark:bg-white/10 rounded-xl p-4"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="qr-code"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
                <View>
                  <Text className="font-semibold dark:text-white text-black">
                    Scan QR Code
                  </Text>
                  <Text className="text-xs dark:text-white/60 text-black/60">
                    Scan sender&apos;s wallet QR
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
        </View>
      </ScrollView>

      {/* Transaction Received Modal */}
      <Dialog
        open={showTransactionModal}
        onOpenChange={setShowTransactionModal}
      >
        <DialogContent hideCloseButton={false}>
          <View className="gap-4">
            <Text className="text-xl font-bold dark:text-white text-black">
              Transaction Received
            </Text>

            {receivedTransaction && (
              <View className="gap-3 bg-black/5 dark:bg-white/5 rounded-xl p-4">
                {/* Sender */}
                <View className="gap-1">
                  <Text className="text-sm dark:text-white/70 text-black/70">
                    From
                  </Text>
                  <Text className="text-base font-semibold dark:text-white text-black">
                    {receivedTransaction.intent.sender}
                  </Text>
                </View>

                {/* Amount */}
                <View className="gap-1">
                  <Text className="text-sm dark:text-white/70 text-black/70">
                    Amount
                  </Text>
                  <Text className="text-base font-semibold dark:text-white text-black">
                    {typeof receivedTransaction.intent.amount === "string"
                      ? receivedTransaction.intent.amount
                      : receivedTransaction.intent.amount.toString()}{" "}
                    {receivedTransaction.intent.token}
                  </Text>
                </View>

                {/* Memo */}
                {receivedTransaction.intent.memo && (
                  <View className="gap-1">
                    <Text className="text-sm dark:text-white/70 text-black/70">
                      Memo
                    </Text>
                    <Text className="text-sm dark:text-white text-black">
                      {receivedTransaction.intent.memo}
                    </Text>
                  </View>
                )}

                {/* Received via */}
                <View className="gap-1">
                  <Text className="text-sm dark:text-white/70 text-black/70">
                    Received via
                  </Text>
                  <Text className="text-sm dark:text-white text-black capitalize">
                    {receivedTransaction.source === "bluetooth"
                      ? "Bluetooth"
                      : receivedTransaction.source === "nfc"
                        ? "NFC"
                        : receivedTransaction.source}
                  </Text>
                </View>

                {/* Timestamp */}
                <View className="gap-1">
                  <Text className="text-sm dark:text-white/70 text-black/70">
                    Received at
                  </Text>
                  <Text className="text-xs dark:text-white/50 text-black/50">
                    {new Date(receivedTransaction.receivedAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-3 mt-4">
              <Button
                onPress={handleRejectTransaction}
                variant="outline"
                className="flex-1"
              >
                <Text>Reject</Text>
              </Button>
              <Button
                onPress={handleAcceptTransaction}
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <ActivityIndicator
                    size="small"
                    color={colorScheme === "dark" ? "#000" : "#fff"}
                  />
                ) : (
                  <Text>Accept</Text>
                )}
              </Button>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* Nearby Devices Modal */}
      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
        <DialogContent>
          <View className="gap-4">
            <Text className="text-xl font-bold dark:text-white text-black">
              Nearby Users
            </Text>

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
                    className="flex-row items-center gap-3 bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-3"
                  >
                    <View className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 items-center justify-center">
                      <Ionicons name="person" size={20} color="white" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold dark:text-white text-black">
                        {item.name.replace(".zypp", "")}
                      </Text>
                      <Text className="text-xs dark:text-white/60 text-black/60">
                        Signal: {item.signal || -50} dBm
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colorScheme === "dark" ? "#fff" : "#000"}
                    />
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
              />
            )}

            <Button onPress={() => setShowScanModal(false)} variant="outline">
              <Text>Close</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* Sender Preview Modal */}
      <Dialog open={showSenderPreview} onOpenChange={setShowSenderPreview}>
        <DialogContent hideCloseButton={false}>
          <View className="gap-4">
            <Text className="text-xl font-bold dark:text-white text-black">
              Receive from
            </Text>

            {scannedQRData && (
              <View className="gap-4 items-center py-4">
                {scannedQRData.profileImage ? (
                  <Image
                    source={{ uri: scannedQRData.profileImage }}
                    className="w-24 h-24 rounded-full bg-black/10"
                  />
                ) : (
                  <View className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 items-center justify-center">
                    <Ionicons name="person" size={48} color="white" />
                  </View>
                )}
                <View className="items-center gap-1">
                  <Text className="text-lg font-bold dark:text-white text-black">
                    {scannedQRData.zyppUserId}
                  </Text>
                  <Text className="text-xs dark:text-white/60 text-black/60">
                    {scannedQRData.solanaPublicKey.slice(0, 8)}...
                    {scannedQRData.solanaPublicKey.slice(-8)}
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row gap-3">
              <Button
                onPress={() => setShowSenderPreview(false)}
                variant="outline"
                className="flex-1"
              >
                <Text>Cancel</Text>
              </Button>
              <Button
                onPress={() => {
                  handleConfirmSender();
                  setShowSenderPreview(false);
                }}
                className="flex-1"
              >
                <Text>Confirm</Text>
              </Button>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <Dialog open={showQRScanner} onOpenChange={setShowQRScanner}>
          <DialogContent hideCloseButton>
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
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

              <QRScanner
                visible={showQRScanner}
                onQRCodeScanned={handleQRCodeScanned}
                onClose={() => setShowQRScanner(false)}
              />
            </View>
          </DialogContent>
        </Dialog>
      )}
    </SafeAreaView>
  );
};
export default Receive;

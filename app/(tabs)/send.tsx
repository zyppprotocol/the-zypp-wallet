import PinInput from "@/components/PinInput";
import { QRScanner } from "@/components/QRScanner";
import {
  SafeAreaView,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useNetworkConnection } from "@/hooks/useNetworkConnection";
import {
  signIntentWithBiometric,
  signIntentWithPin,
} from "@/lib/solana/biometric-signing";
import {
  getAvailableDeliveryMethods,
  scanBLEDevices,
  sendViaBluetooth,
  writeIntentToNFC,
} from "@/lib/solana/delivery-methods";
import { buildTransactionIntent } from "@/lib/solana/intent-builder";
import { encryptIntent } from "@/lib/solana/intent-encryption";
import { queueOfflineTransaction } from "@/lib/storage/offline-queue";
import { SecureStorage } from "@/lib/storage/secure-storage";
import type { TransactionIntent } from "@/lib/storage/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  TextInput,
  TouchableOpacity,
} from "react-native";

interface NearbyUser {
  id: string;
  zyppUserId: string;
  profileImageUrl?: string;
  solanaPublicKey: string;
}

type ScanMode = "nearby" | "qr_code" | null;
type DeliveryMethod = "bluetooth" | "nfc" | null;

export const Send = () => {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { isConnected } = useNetworkConnection();

  // UI State
  const [amount, setAmount] = useState("");
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>(null); // "nearby" for nearby users, "qr_code" for QR scanning
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);

  // Delivery method selection
  const [showDeliveryOptions, setShowDeliveryOptions] = useState(false);
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] =
    useState<DeliveryMethod>(null);
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);

  // Transaction building & signing
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<TransactionIntent | null>(
    null
  );
  const [showPINInput, setShowPINInput] = useState(false);
  const [pin, setPin] = useState("");
  const [userPublicKey, setUserPublicKey] = useState<string>("");

  // QR code display
  const [qrCodeData, setQRCodeData] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [nearbyUsers] = useState<NearbyUser[]>([
    {
      id: "1",
      zyppUserId: "alice.zypp",
      profileImageUrl: "../../assets/images/user.png",
      solanaPublicKey: "12345678901234567890123456789012345678901",
    },
    {
      id: "2",
      zyppUserId: "bob.zypp",
      profileImageUrl: "../../assets/images/user.png",
      solanaPublicKey: "abcdefghijklmnopqrstuvwxyzabcdefghijklmno",
    },
    {
      id: "3",
      zyppUserId: "charlie.zypp",
      profileImageUrl: "../../assets/images/user.png",
      solanaPublicKey: "xyzabc1234567890xyzabc1234567890xyzabc12",
    },
  ]);

  // Load user public key on mount
  React.useEffect(() => {
    const loadUserPublicKey = async () => {
      try {
        const key = await SecureStorage.getPublicKey();
        const publicKey = Array.from(key)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .substring(0, 43); // Mock base58 format
        setUserPublicKey(publicKey);
      } catch (err) {
        console.warn("Failed to load public key:", err);
      }
    };
    loadUserPublicKey();
  }, []);

  // Load available delivery methods
  React.useEffect(() => {
    const loadDeliveryMethods = async () => {
      try {
        console.log("[Send] Loading delivery methods...");
        const methods = await getAvailableDeliveryMethods();
        console.log("[Send] Got methods:", methods);
        const enabledMethods = methods
          .filter((m) => m.enabled)
          .map((m) => m.method);
        console.log("[Send] Enabled methods:", enabledMethods);
        setAvailableMethods(enabledMethods);
      } catch (err) {
        console.error("[Send] Failed to load delivery methods:", err);
      }
    };
    loadDeliveryMethods();
  }, []);

  const handleStartScan = (mode: ScanMode) => {
    setScanMode(mode);
    setShowScanModal(true);

    // Only simulate scan for nearby users (not for QR code which uses real camera)
    if (mode === "nearby") {
      setTimeout(() => {
        setScanMode("nearby");
      }, 3000);
    }
  };

  /**
   * Build unsigned intent (9.2 Step 1)
   */
  const buildIntent = (): TransactionIntent => {
    if (!amount || !selectedUser) {
      throw new Error("Amount and recipient required");
    }

    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e9)); // Convert to lamports

    return buildTransactionIntent({
      type: "payment",
      sender: userPublicKey,
      recipient: selectedUser.solanaPublicKey,
      amount: amountBigInt,
      token: "USDC",
      connectivity:
        selectedDeliveryMethod === "bluetooth"
          ? "bluetooth"
          : selectedDeliveryMethod === "nfc"
            ? "nfc"
            : "mesh",
      memo: `Payment to ${selectedUser.zyppUserId}`,
    });
  };

  /**
   * Handle send button click - initiates full send flow
   */
  const handleSendClick = async () => {
    if (!amount || !selectedUser) {
      Alert.alert("Error", "Please enter amount and select recipient");
      return;
    }

    if (!selectedDeliveryMethod) {
      setShowDeliveryOptions(true);
      return;
    }

    setIsProcessing(true);
    try {
      // ====================================================================
      // 9.2: BUILD UNSIGNED INTENT
      // ====================================================================
      console.log("Building unsigned intent...");
      const intent = buildIntent();
      setCurrentIntent(intent);

      // ====================================================================
      // 9.2: ENCRYPT INTENT
      // ====================================================================
      console.log("Encrypting intent...");
      const encryptedPayload = await encryptIntent(intent);

      const intentWithEncryption: TransactionIntent = {
        ...intent,
        encryptedPayload,
      };

      setCurrentIntent(intentWithEncryption);

      // ====================================================================
      // 9.2: CHOOSE DELIVERY METHOD
      // ====================================================================
      console.log(`Delivering via: ${selectedDeliveryMethod}`);

      // BLE or NFC delivery - proceed to signing
      Alert.alert(
        "Ready to Deliver",
        `Ready to send via ${selectedDeliveryMethod === "bluetooth" ? "Bluetooth" : "NFC"}. Tap continue to proceed with biometric signing.`,
        [
          {
            text: "Cancel",
            onPress: () => setIsProcessing(false),
          },
          {
            text: "Continue",
            onPress: () => proceedToSigning(intentWithEncryption),
          },
        ]
      );
    } catch (err) {
      Alert.alert("Error", `Failed to prepare transaction: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Proceed to biometric signing (9.3)
   */
  const proceedToSigning = async (intentWithEncryption: TransactionIntent) => {
    // Check if biometric is available
    const config = await SecureStorage.getWalletConfig();

    if (config.pinEnabled && !config.biometricEnabled) {
      // Fallback to PIN
      setShowPINInput(true);
    } else {
      // Use biometric
      await signWithBiometric(intentWithEncryption);
    }
  };

  /**
   * Sign intent with biometric (9.3)
   */
  const signWithBiometric = async (intentWithEncryption: TransactionIntent) => {
    setIsProcessing(true);
    try {
      const result = await signIntentWithBiometric(
        intentWithEncryption,
        "Sign transaction to send funds"
      );

      if (!result.success) {
        // Biometric failed - show PIN modal instead
        console.log("Biometric failed, showing PIN input modal");
        setCurrentIntent(intentWithEncryption);
        setShowPINInput(true);
        setIsProcessing(false);
        return;
      }

      if (result.signedIntent) {
        await deliverSignedIntent(result.signedIntent);
      }
    } catch (err) {
      Alert.alert("Error", `Signing failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Sign intent with PIN fallback
   */
  const signWithPin = async (intentWithEncryption: TransactionIntent) => {
    if (!pin || pin.length < 4) {
      Alert.alert("Invalid PIN", "PIN must be at least 4 digits");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await signIntentWithPin(intentWithEncryption, pin);

      if (!result.success) {
        Alert.alert("Signing Failed", result.error || "PIN signing failed");
        return;
      }

      setPin("");
      setShowPINInput(false);

      if (result.signedIntent) {
        await deliverSignedIntent(result.signedIntent);
      }
    } catch (err) {
      Alert.alert("Error", `PIN signing failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Deliver signed intent via selected method
   */
  const deliverSignedIntent = async (signedIntent: TransactionIntent) => {
    setIsProcessing(true);
    try {
      // Queue the signed transaction locally (9.2: Store pending intent locally)
      await queueOfflineTransaction({
        type: "payment",
        sender: signedIntent.sender,
        recipient: signedIntent.recipient,
        amount: signedIntent.amount, // Keep as BigInt
        token: signedIntent.token,
        encryptedPayload: signedIntent.encryptedPayload,
        signature: signedIntent.signature,
        nonce: signedIntent.nonce,
        memo: signedIntent.memo,
      });

      // Deliver via selected method
      if (selectedDeliveryMethod === "bluetooth") {
        const devices = await scanBLEDevices(5000);
        const device = devices.find((d) => d.name === selectedUser?.zyppUserId);
        if (device) {
          const result = await sendViaBluetooth(
            device,
            signedIntent,
            signedIntent.encryptedPayload
          );
          if (result.success) {
            Alert.alert("Success", "Transaction delivered via Bluetooth");
          } else {
            Alert.alert("Delivery Failed", result.error);
          }
        }
      } else if (selectedDeliveryMethod === "nfc") {
        const result = await writeIntentToNFC(
          signedIntent,
          signedIntent.encryptedPayload
        );
        if (result.success) {
          Alert.alert("Success", "Transaction written to NFC tag");
        } else {
          Alert.alert("Delivery Failed", result.error);
        }
      }

      // If online, start broadcast
      if (isConnected) {
        console.log("Device online - transaction queued for broadcast");
      } else {
        console.log("Device offline - transaction queued for later broadcast");
      }

      // Reset form and navigate
      setAmount("");
      setSelectedUser(null);
      setSelectedDeliveryMethod(null);
      setCurrentIntent(null);
      router.push("/wallet");
    } catch (err) {
      Alert.alert("Error", `Failed to deliver transaction: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectUser = (user: NearbyUser) => {
    setSelectedUser(user);
    setShowScanModal(false);
    setScanMode(null);
  };

  const handleQRCodeScanned = (qrData: string) => {
    // Handle the scanned QR code data
    // This would typically contain the recipient's public key or username
    console.log("QR Code scanned:", qrData);

    // Mock: Find or create a user from QR data
    const scannedUser: NearbyUser = {
      id: "qr_" + Date.now(),
      zyppUserId: qrData.includes(".zypp") ? qrData : "user.zypp",
      solanaPublicKey: qrData.length > 43 ? qrData.substring(0, 43) : qrData,
    };

    handleSelectUser(scannedUser);
  };

  const renderUserCard = ({ item }: { item: NearbyUser }) => (
    <TouchableOpacity
      onPress={() => handleSelectUser(item)}
      className={`mr-3 rounded-2xl p-3 items-center ${
        selectedUser?.id === item.id
          ? "bg-green-500/20 border-2 border-green-500"
          : "bg-black/5 dark:bg-white/5"
      }`}
    >
      <Image
        source={{
          uri: item.profileImageUrl || "./assets/images/user.png",
        }}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          marginBottom: 8,
        }}
      />
      <Text className="text-xs font-semibold dark:text-white text-black text-center max-w-[80px]">
        {item.zyppUserId}
      </Text>
    </TouchableOpacity>
  );

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
      <ScrollView
        className="flex-1 pt-6 pb-10 px-6 w-full"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center mb-8">
          <Text className="text-2xl font-semibold dark:text-white text-black">
            Send
          </Text>
        </View>

        {/* Amount Input Section */}
        <View className="bg-black/5 dark:bg-white/5 p-4 h-32 flex flex-row items-center justify-between rounded-3xl mt-4 mb-8">
          <View className="flex flex-col items-start h-full justify-between">
            <Text className="font-medium dark:text-white text-black tracking-tighter ">
              From
            </Text>
            <TouchableOpacity className="flex-row justify-between items-center bg-white dark:bg-black rounded-full border border-white/10 px-2 pr-3 py-2">
              <Image
                source={require("@/assets/images/usdc-icon.png")}
                style={{
                  borderRadius: 16,
                  width: 20,
                  height: 20,
                }}
                className="w-5 h-5 mr-2 scale-50 rounded-full"
              />
              <Text className="dark:text-white text-black ml-2 font-medium text-md">
                USDC
              </Text>
              <Ionicons
                name="chevron-down-outline"
                size={14}
                color={colorScheme === "dark" ? "#fff" : "#000"}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>

          {/* Amount Field */}
          <View className="flex flex-col items-end h-full justify-between flex-1 ml-4">
            <Text className="font-medium dark:text-white text-black tracking-tight opacity-70">
              Balance: $1,365
            </Text>
            <View className="33">
              <TextInput
                placeholder="0"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholderTextColor={
                  colorScheme === "dark" ? "#ffffff60" : "#00000060"
                }
                className="text-4xl font-bold dark:text-white text-black tracking-tighter flex-1"
              />
            </View>
          </View>
        </View>

        {/* Recipient User Section */}
        <Text className="mt-4 font-medium dark:text-white text-black tracking-tighter text-lg mb-4">
          Recipient User
        </Text>

        {/* Scan Status & Users List */}
        <View className="mb-6">
          <View className="flex-row items-center mb-4 gap-2">
            {scanMode === "nearby" ? (
              <>
                <ActivityIndicator
                  size="small"
                  color={colorScheme === "dark" ? "#3b82f6" : "#2563eb"}
                />
                <Text className="text-sm dark:text-white text-black opacity-70">
                  Scanning for nearby users...
                </Text>
              </>
            ) : (
              <Text className="text-sm dark:text-white text-black opacity-70">
                {nearbyUsers.length} user{nearbyUsers.length !== 1 ? "s" : ""}{" "}
                found
              </Text>
            )}
          </View>

          {/* Users Horizontal List */}
          {nearbyUsers.length > 0 && (
            <FlatList
              data={nearbyUsers}
              renderItem={renderUserCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
              scrollEnabled={true}
            />
          )}

          {/* Scan Button */}
          <View className="flex-row gap-2 mt-4">
            <TouchableOpacity
              onPress={() => handleStartScan("nearby")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/30 rounded-full py-3"
            >
              <Ionicons
                name="radio"
                size={18}
                color={colorScheme === "dark" ? "#3b82f6" : "#2563eb"}
              />
              <Text className="dark:text-blue-400 text-blue-600 font-semibold">
                Nearby
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleStartScan("qr_code")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-green-500/10 dark:bg-green-500/10 border border-green-500/30 rounded-full py-3"
            >
              <Ionicons
                name="scan"
                size={18}
                color={colorScheme === "dark" ? "#10b981" : "#059669"}
              />
              <Text className="dark:text-green-400 text-green-600 font-semibold">
                QR Code
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected User Display */}
        {selectedUser && (
          <View className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-6">
            <Text className="text-xs font-medium dark:text-green-400 text-green-600 opacity-70 mb-2">
              Selected Recipient
            </Text>
            <View className="flex-row items-center gap-3">
              <Image
                source={{
                  uri:
                    selectedUser.profileImageUrl ||
                    "https://via.placeholder.com/40",
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                }}
              />
              <View>
                <Text className="font-semibold dark:text-white text-black">
                  {selectedUser.zyppUserId}
                </Text>
                <Text className="text-xs dark:text-white text-black opacity-60">
                  {selectedUser.solanaPublicKey.substring(0, 8)}...
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Offline Notice */}
        {!isConnected && (
          <View className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 mb-4 flex-row items-center gap-2">
            <Ionicons
              name="warning"
              size={16}
              color={colorScheme === "dark" ? "#fbbf24" : "#f59e0b"}
            />
            <Text className="text-xs dark:text-yellow-400 text-yellow-600">
              Offline mode: Transaction will be queued and broadcast when online
            </Text>
          </View>
        )}

        {/* Send Button */}
        <TouchableOpacity
          disabled={!amount || !selectedUser || isProcessing}
          className={`w-full rounded-full py-4 flex flex-row items-center justify-center ${
            !amount || !selectedUser || isProcessing
              ? "bg-neutral-400"
              : "bg-black dark:bg-primary"
          }`}
          onPress={handleSendClick}
        >
          {isProcessing ? (
            <ActivityIndicator
              size="small"
              color={colorScheme === "dark" ? "black" : "white"}
              style={{ marginRight: 8 }}
            />
          ) : (
            <IconSymbol
              name="arrow.up.right.bottomleft.rectangle.fill"
              size={20}
              color={colorScheme === "dark" ? "black" : "white"}
              style={{ marginBottom: 0 }}
            />
          )}
          <Text className="text-white dark:text-black text-lg font-semibold tracking-tight ml-3">
            {isProcessing ? "Processing..." : "Confirm and Send"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* QR Scanner - Always Modal */}
      <QRScanner
        visible={scanMode === "qr_code"}
        onQRCodeScanned={handleQRCodeScanned}
        onClose={() => {
          setShowScanModal(false);
          setScanMode(null);
        }}
      />

      {/* Delivery Method Selection Modal */}
      <Modal
        visible={showDeliveryOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeliveryOptions(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-end">
          <View className="w-full bg-white dark:bg-black rounded-t-3xl p-6">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-semibold dark:text-white text-black">
                Choose Delivery Method
              </Text>
              <TouchableOpacity onPress={() => setShowDeliveryOptions(false)}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {/* Delivery Methods */}
            <View className="gap-3 mb-6">
              {/* Bluetooth */}
              {availableMethods.includes("bluetooth") && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedDeliveryMethod("bluetooth");
                    setShowDeliveryOptions(false);
                    handleSendClick();
                  }}
                  className="border border-blue-500/30 rounded-2xl p-4 bg-blue-500/5"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="w-12 h-12 bg-blue-500/20 rounded-full items-center justify-center">
                      <Ionicons name="bluetooth" size={24} color="#3b82f6" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold dark:text-white text-black">
                        Bluetooth
                      </Text>
                      <Text className="text-xs dark:text-white/60 text-black/60">
                        Direct peer-to-peer transfer
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* NFC */}
              {availableMethods.includes("nfc") && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedDeliveryMethod("nfc");
                    setShowDeliveryOptions(false);
                    handleSendClick();
                  }}
                  className="border border-purple-500/30 rounded-2xl p-4 bg-purple-500/5"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="w-12 h-12 bg-purple-500/20 rounded-full items-center justify-center">
                      <Ionicons name="radio" size={24} color="#a855f7" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold dark:text-white text-black">
                        NFC
                      </Text>
                      <Text className="text-xs dark:text-white/60 text-black/60">
                        Tap devices together
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Cancel Button */}
              <TouchableOpacity
                onPress={() => setShowDeliveryOptions(false)}
                className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3"
              >
                <Text className="text-center dark:text-white text-black font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN Input Modal */}
      <Modal
        visible={showPINInput}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowPINInput(false);
          setPin("");
        }}
      >
        <View className="flex-1 bg-black/40 items-center justify-end">
          <View className="w-full bg-white dark:bg-black rounded-t-3xl p-6">
            {/* Header */}
            <View className="mb-6">
              <Text className="text-xl font-semibold dark:text-white text-black">
                Enter PIN
              </Text>
              <Text className="text-sm dark:text-white/60 text-black/60 mt-2">
                Enter your PIN to sign the transaction
              </Text>
            </View>

            {/* PIN Input with visibility toggle */}
            <View className="mb-6 flex items-start w-full">
              <View className="flex flex-row items-center gap-2 mb-4 w-full">
                <Text className="text-black dark:text-white/70 text-sm flex-1">
                  PIN Code
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    // Toggle to show/hide PIN
                    // For now, we'll keep it secure
                  }}
                >
                  <Ionicons
                    name="eye-off-outline"
                    size={16}
                    color={colorScheme === "dark" ? "white" : "black"}
                  />
                </TouchableOpacity>
              </View>
              <PinInput
                length={4}
                value={pin}
                onChange={(v) => setPin(v)}
                autoFocus
                secure={true}
              />
            </View>

            {/* Action Buttons */}
            <View className="gap-2">
              <TouchableOpacity
                disabled={isProcessing || pin.length < 4}
                onPress={() => signWithPin(currentIntent!)}
                className={`w-full rounded-full py-3 items-center ${
                  isProcessing || pin.length < 4
                    ? "bg-neutral-400"
                    : "bg-black dark:bg-white"
                }`}
              >
                {isProcessing ? (
                  <ActivityIndicator
                    size="small"
                    color={colorScheme === "dark" ? "white" : "black"}
                  />
                ) : (
                  <Text className="text-white dark:text-black font-semibold">
                    Sign Transaction
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                disabled={isProcessing}
                onPress={() => {
                  setShowPINInput(false);
                  setPin("");
                }}
                className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3"
              >
                <Text className="text-center dark:text-white text-black font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Code Display Modal */}
      <Modal
        visible={showQRModal && !!qrCodeData}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowQRModal(false);
          setQRCodeData(null);
        }}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white dark:bg-black rounded-3xl p-6 max-w-sm w-full">
            {/* Header */}
            <View className="mb-6">
              <Text className="text-xl font-semibold dark:text-white text-black">
                Share with Recipient
              </Text>
              <Text className="text-sm dark:text-white/60 text-black/60 mt-2">
                Show this QR code to {selectedUser?.zyppUserId}
              </Text>
            </View>

            {/* QR Code Display */}
            <View className="bg-white rounded-2xl p-4 mb-6 items-center justify-center">
              <Text className="text-sm dark:text-black text-black text-center mb-4">
                Amount: {amount} USDC
              </Text>
              <View className="w-64 h-64 bg-black/5 rounded-xl items-center justify-center">
                <Text className="text-xs dark:text-white text-black opacity-50 text-center px-4">
                  [QR Code: {qrCodeData?.substring(0, 50)}...]
                </Text>
              </View>
            </View>

            {/* Instructions */}
            <View className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-6">
              <Text className="text-xs dark:text-blue-400 text-blue-600">
                The recipient can scan this QR code with their Zypp wallet to
                accept the transaction.
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="gap-2">
              <TouchableOpacity
                onPress={() => {
                  Alert.alert("Copied", "QR code link copied to clipboard");
                  setShowQRModal(false);
                  setQRCodeData(null);
                  // Reset form
                  setAmount("");
                  setSelectedUser(null);
                  setSelectedDeliveryMethod(null);
                }}
                className="w-full bg-black dark:bg-white rounded-full py-3 items-center"
              >
                <Text className="text-white dark:text-black font-semibold">
                  Done
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowQRModal(false);
                  setQRCodeData(null);
                }}
                className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3"
              >
                <Text className="text-center dark:text-white text-black font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nearby Users Scanning Modal */}
      <Modal
        visible={showScanModal && scanMode === "nearby"}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowScanModal(false);
          setScanMode(null);
        }}
      >
        <View className="flex-1 bg-black/40 items-center justify-end">
          <View className="w-full bg-white dark:bg-black rounded-t-3xl p-6 max-h-[85%]">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-semibold dark:text-white text-black">
                {scanMode === "nearby"
                  ? "Scanning Nearby Users"
                  : "Scan Options"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowScanModal(false);
                  setScanMode(null);
                }}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colorScheme === "dark" ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {scanMode === "nearby" && nearbyUsers.length === 0 ? (
              <>
                {/* Scanning Animation */}
                <View className="items-center gap-4 mb-8">
                  <View className="w-16 h-16 bg-blue-500/10 rounded-full items-center justify-center">
                    <ActivityIndicator
                      size="large"
                      color={colorScheme === "dark" ? "#3b82f6" : "#2563eb"}
                    />
                  </View>
                  <Text className="dark:text-white text-black font-semibold text-center">
                    Scanning for nearby users...
                  </Text>
                  <Text className="dark:text-white/60 text-black/60 text-sm text-center">
                    Make sure nearby users have their wallets open
                  </Text>
                </View>

                {/* Cancel Button */}
                <TouchableOpacity
                  onPress={() => {
                    setShowScanModal(false);
                    setScanMode(null);
                  }}
                  className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3 items-center"
                >
                  <Text className="dark:text-white text-black font-semibold">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Results: Found Users */}
                {nearbyUsers.length > 0 && (
                  <View className="items-center gap-3 mb-6">
                    <View className="w-12 h-12 bg-green-500/10 rounded-full items-center justify-center">
                      <Ionicons
                        name="checkmark-circle"
                        size={32}
                        color="#10b981"
                      />
                    </View>
                    <Text className="dark:text-white text-black font-semibold">
                      Found {nearbyUsers.length} User
                      {nearbyUsers.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}

                {/* Users List */}
                <ScrollView
                  className="mb-6"
                  showsVerticalScrollIndicator={false}
                >
                  {nearbyUsers.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      onPress={() => handleSelectUser(user)}
                      className="flex-row items-center gap-3 bg-black/5 dark:bg-white/5 rounded-2xl p-4 mb-3"
                    >
                      <Image
                        source={{
                          uri:
                            user.profileImageUrl ||
                            "https://via.placeholder.com/50",
                        }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                        }}
                      />
                      <View className="flex-1">
                        <Text className="dark:text-white text-black font-semibold">
                          {user.zyppUserId}
                        </Text>
                        <Text className="dark:text-white/60 text-black/60 text-xs">
                          {user.solanaPublicKey.substring(0, 12)}...
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colorScheme === "dark" ? "#fff" : "#000"}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Action Buttons */}
                <View className="gap-2">
                  <TouchableOpacity
                    onPress={() => handleStartScan("nearby")}
                    className="w-full bg-black/10 dark:bg-white/10 rounded-full py-3 items-center flex-row justify-center gap-2"
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color={colorScheme === "dark" ? "#fff" : "#000"}
                    />
                    <Text className="dark:text-white text-black font-semibold">
                      Rescan Nearby
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setShowScanModal(false);
                      setScanMode(null);
                    }}
                    className="w-full bg-black dark:bg-white rounded-full py-3 items-center"
                  >
                    <Text className="text-white dark:text-black font-semibold">
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
export default Send;

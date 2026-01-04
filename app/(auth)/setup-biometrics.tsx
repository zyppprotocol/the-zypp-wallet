import PinInput from "@/components/PinInput";
import { SafeAreaView, Text, useColorScheme, View } from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol.ios";
import { SecureStorage } from "@/lib/storage/secure-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, TouchableOpacity } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";

export default function SetupBiometrics() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [mode, setMode] = useState<"biometrics" | "pin" | "confirm">(
    "biometrics"
  );

  async function enableBiometrics() {
    setLoading(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          "Biometrics unavailable",
          "No biometric hardware or enrollment detected on this device."
        );
        setLoading(false);
        return;
      }

      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm to enable biometric unlock",
      });

      if (!res.success) {
        Alert.alert(
          "Authentication failed",
          "Biometric verification failed or was cancelled."
        );
        setLoading(false);
        return;
      }

      const bioPin = await SecureStorage.getBiometricPin();
      if (!bioPin) {
        Alert.alert(
          "Biometric setup error",
          "No biometric PIN found. Please try setting up again or contact support."
        );
        setLoading(false);
        return;
      }

      try {
        const privateKey = await SecureStorage.unlockWithPin(bioPin);
        if (privateKey && (privateKey as any).fill) (privateKey as any).fill(0);
      } catch (err) {
        Alert.alert(
          "Biometric setup error",
          "Failed to verify biometric PIN. Please try again."
        );
        setLoading(false);
        return;
      }

      Alert.alert(
        "Success",
        "Biometric unlock enabled. You can now use your biometrics to unlock your wallet.",
        [{ text: "Continue", onPress: () => router.replace("/wallet") }]
      );
    } catch (err) {
      console.error("enableBiometrics failed:", err);
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="relative flex-1 px-8 py-6">
      <SystemBars
        style={{ statusBar: "dark", navigationBar: "dark" }}
        hidden={{ statusBar: false, navigationBar: false }}
      />

      <Image
        source={require("@/assets/images/top-gradient.png")}
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

      <View className="flex-1 z-1 justify-end">
        <View className="flex flex-row items-center mb-6 justify-start gap-2">
          <Image
            source={
              colorScheme === "dark"
                ? require("@/assets/images/zypp-icon-light.png")
                : require("@/assets/images/zypp-icon.png")
            }
            style={{ width: 20, height: 20 }}
            contentFit="contain"
          />
          <Text className="text-2xl text-white font-semibold tracking-tight">
            Zypp Labs
          </Text>
        </View>

        {mode === "biometrics" && (
          <>
            <Text
              variant="h1"
              className="tracking-[-1.3] font-semibold text-[38px]"
            >
              Enable biometric
            </Text>
            <Text
              variant="h1"
              className="tracking-[-1.3] -mt-2 mb-4 font-semibold text-[38px]"
            >
              unlock
            </Text>

            <Text variant="h4" className="font-medium text-base mb-6 w-md">
              Use Face ID / Touch ID to unlock the wallet quickly and securely.
              You can still set a PIN as a fallback.
            </Text>

            <View className="flex flex-col w-full gap-3">
              <TouchableOpacity
                disabled={loading}
                onPress={enableBiometrics}
                className={`w-full rounded-full py-4 ${loading ? "bg-neutral-400" : "bg-black dark:bg-primary"} flex flex-row items-center justify-center`}
              >
                <IconSymbol
                  name="faceid"
                  size={20}
                  color={colorScheme === "dark" ? "black" : "white"}
                  style={{ marginBottom: 0 }}
                />
                <Text className="text-white dark:text-black text-lg font-semibold tracking-tight ml-3">
                  Enable Biometrics
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={loading}
                onPress={() => {
                  setPin("");
                  setPinConfirm("");
                  setMode("pin");
                }}
                className={`w-full rounded-full py-4 bg-black/10 dark:bg-white/10 flex flex-row items-center justify-center`}
              >
                <IconSymbol
                  name="lock.fill"
                  size={20}
                  color={colorScheme === "dark" ? "white" : "black"}
                  style={{ marginBottom: 0 }}
                />
                <Text className="text-black dark:text-white text-lg font-semibold tracking-tight ml-3">
                  Use PIN
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {mode === "pin" && (
          <>
            <Text
              variant="h1"
              className="tracking-[-1.3] font-semibold text-[38px]"
            >
              Set a PIN
            </Text>

            <Text variant="h4" className="font-medium text-base mb-6 w-md">
              Create a 4-digit PIN to use as a secure fallback for unlocking
              your wallet.
            </Text>

            <View className="mb-6 flex items-start w-full">
              <View className="flex flex-row items-center gap-2 mb-4">
                <Text className="text-white/70 text-sm">Enter your PIN</Text>
                <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                  <Ionicons
                    name={showPin ? "eye-outline" : "eye-off-outline"}
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
                secure={!showPin}
                digitColor={colorScheme === "dark" ? "white" : "black"}
              />
            </View>

            <TouchableOpacity
              disabled={loading || pin.length < 4}
              onPress={() => {
                if (!pin || pin.length < 4) {
                  Alert.alert(
                    "Invalid PIN",
                    "Please enter a PIN of at least 4 digits."
                  );
                  return;
                }
                setMode("confirm");
              }}
              className={`w-full rounded-full py-4 ${loading || pin.length < 4 ? "bg-neutral-400" : "bg-black dark:bg-primary"} flex flex-row items-center justify-center`}
            >
              <IconSymbol
                name="arrow.up.right.bottomleft.rectangle.fill"
                size={20}
                color={colorScheme === "dark" ? "black" : "white"}
                style={{ marginBottom: 0 }}
              />
              <Text className="text-white dark:text-black text-lg font-semibold tracking-tight ml-3">
                Continue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode("biometrics")}
              className="mt-4 items-center"
            >
              <Text className="text-white/70">Back</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "confirm" && (
          <>
            <Text
              variant="h1"
              className="tracking-[-1.3] font-semibold text-[38px]"
            >
              Confirm your
            </Text>
            <Text
              variant="h1"
              className="tracking-[-1.3] -mt-2 mb-4 font-semibold text-[38px]"
            >
              PIN
            </Text>

            <Text variant="h4" className="font-medium text-base mb-6 w-md">
              Re-enter your PIN to confirm it&apos;s correct.
            </Text>

            {/* <View className="mb-4 flex items-start">
              <Text className="text-white/70 text-sm mb-4">Original PIN</Text>
              <PinInput
                length={4}
                value={pin}
                onChange={(v) => setPin(v)}
                digitColor={colorScheme === "dark" ? "white" : "black"}
              />
            </View> */}

            <View className="mb-6 flex items-start w-full">
              <View className="flex flex-row items-center gap-2 mb-4">
                <Text className="text-white/70 text-sm">Confirm PIN</Text>
                <TouchableOpacity
                  onPress={() => setShowConfirmPin(!showConfirmPin)}
                >
                  <Ionicons
                    name={showConfirmPin ? "eye-outline" : "eye-off-outline"}
                    size={16}
                    color={colorScheme === "dark" ? "white" : "black"}
                  />
                </TouchableOpacity>
              </View>
              <PinInput
                length={4}
                value={pinConfirm}
                onChange={(v) => setPinConfirm(v)}
                autoFocus
                secure={!showConfirmPin}
                digitColor={colorScheme === "dark" ? "white" : "black"}
              />
            </View>

            <TouchableOpacity
              disabled={loading || pinConfirm.length < 4}
              onPress={async () => {
                if (
                  !pin ||
                  pin.length < 4 ||
                  !pinConfirm ||
                  pinConfirm.length < 4
                ) {
                  Alert.alert(
                    "Invalid PIN",
                    "Please fill both PIN fields with at least 4 digits."
                  );
                  return;
                }
                if (pin !== pinConfirm) {
                  Alert.alert(
                    "PIN mismatch",
                    "PIN and confirmation do not match."
                  );
                  return;
                }

                setLoading(true);
                try {
                  const current = await SecureStorage.getBiometricPin();
                  if (!current) {
                    Alert.alert(
                      "Error",
                      "No existing PIN found to rotate. Please contact support."
                    );
                    setLoading(false);
                    return;
                  }
                  await SecureStorage.changePIN(current, pin);
                  Alert.alert(
                    "Success",
                    "PIN set successfully. You can use this PIN to unlock your wallet.",
                    [
                      {
                        text: "Continue",
                        onPress: () => router.replace("/wallet"),
                      },
                    ]
                  );
                } catch (err) {
                  console.error("PIN setup failed:", err);
                  Alert.alert(
                    "Error",
                    err instanceof Error ? err.message : String(err)
                  );
                } finally {
                  setLoading(false);
                }
              }}
              className={`w-full rounded-full py-4 ${loading || pinConfirm.length < 4 ? "bg-neutral-400" : "bg-black dark:bg-primary"} flex flex-row items-center justify-center`}
            >
              <IconSymbol
                name="checkmark.circle.fill"
                size={20}
                color={colorScheme === "dark" ? "black" : "white"}
                style={{ marginBottom: 0 }}
              />
              <Text className="text-white dark:text-black text-lg font-semibold tracking-tight ml-2">
                {loading ? "Confirming…" : "Confirm & Continue"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode("pin")}
              className="mt-4 items-center"
            >
              <Text className="text-white/70">Back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

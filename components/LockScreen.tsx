import PinInput from "@/components/PinInput";
import { isUserComplete } from "@/lib/auth";
import { useAppLock } from "@/lib/storage/app-lock";
import { SecureStorage } from "@/lib/storage/secure-storage";
import { BlurView } from "expo-blur";
import React, { useState, useEffect } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from "./ui";

export const LockScreen: React.FC = () => {
  const {
    isLocked,
    unlockWithBiometric,
    unlockWithPin,
    biometricAvailable,
    refreshBiometricAvailability,
  } = useAppLock();
  const colorScheme = useColorScheme();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  // Debug log
  console.log("LockScreen - biometricAvailable:", biometricAvailable);

  // Check if user is fully authenticated (wallet + zyppUserId + PIN/biometrics)
  const [userComplete, setUserComplete] = useState<boolean | null>(null);
  
  // Refresh biometric availability when the lockscreen mounts/becomes visible
  useEffect(() => {
    refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const complete = await isUserComplete();
        if (!mounted) return;
        setUserComplete(complete);
      } catch {
        setUserComplete(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Only render when the app is locked AND user is complete (not during auth flow)
  // We purposely don't show the lock screen while user completion is unknown (null)
  if (!isLocked || userComplete !== true) return null;

  const onBiometric = async () => {
    setLoading(true);
    try {
      await unlockWithBiometric();
      // Update lastUnlockedAt on successful unlock
      const user = await SecureStorage.getUser();
      if (user) {
        await SecureStorage.setUser({
          ...user,
          device: { ...(user.device || {}), lastUnlockedAt: Date.now() },
        });
      }
    } catch {
      Alert.alert("Unlock failed", "Biometric unlock failed");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitPin = async (providedPin?: string) => {
    const p = providedPin ?? pin;
    if (!p || p.length < 4) {
      Alert.alert("Invalid PIN", "Please enter your PIN");
      return;
    }
    setLoading(true);
    try {
      await unlockWithPin(p);
      const user = await SecureStorage.getUser();
      if (user) {
        await SecureStorage.setUser({
          ...user,
          device: { ...(user.device || {}), lastUnlockedAt: Date.now() },
        });
      }
    } catch {
      Alert.alert("Invalid PIN", "The PIN you entered is incorrect.");
    } finally {
      setLoading(false);
      setPin("");
    }
  };

  return (
    <View style={{ position: "absolute", inset: 0, zIndex: 9999 }}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={80} tint="dark" style={{ flex: 1, padding: 24 }}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {biometricAvailable ? (
              <>
                <Text
                  style={{
                    fontFamily: "semibold",
                    fontSize: 24,
                    color: "white",
                    marginBottom: 12,
                    letterSpacing: -0.5,
                  }}
                >
                  Unlock with Face ID
                </Text>

                <TouchableOpacity
                  onPress={onBiometric}
                  disabled={loading}
                  style={{
                    width: "100%",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: "#fff",
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 32,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "semibold",
                      fontWeight: "600",
                      fontSize: 18,
                      color: "#000",
                    }}
                  >
                    {loading ? "Unlocking…" : "Unlock"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: "semibold",
                    fontSize: 24,
                    color: "white",
                    marginBottom: 24,
                    letterSpacing: -0.5,
                  }}
                >
                  Enter your PIN
                </Text>

                <PinInput
                  length={4}
                  value={pin}
                  onChange={(v) => setPin(v)}
                  onComplete={(v) => onSubmitPin(v)}
                  autoFocus
                  secure
                  digitColor="white"
                />

                <TouchableOpacity
                  onPress={() => onSubmitPin(pin)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: "#fff",
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 32,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "semibold",
                      fontWeight: "600",
                      fontSize: 18,
                      color: "#000",
                    }}
                  >
                    {loading ? "Unlocking…" : "Unlock"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </BlurView>
      ) : (
        // Android: Use semi-transparent dark overlay with proper fonts
        <View
          style={{
            flex: 1,
            backgroundColor: colorScheme === "dark" ? "rgba(0, 0, 0, 0.97)" : "rgba(0, 0, 0, 0.97)",
            padding: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {biometricAvailable ? (
              <>
                {/* <Text
                  style={{
                    fontFamily: "semibold",
                    fontSize: 24,
                    color: "white",
                    marginBottom: 12,
                    letterSpacing: -0.5,
                  }}
                >
                  Unlock with Biometrics
                </Text> */}

                <TouchableOpacity
                  onPress={onBiometric}
                  disabled={loading}
                  style={{
                    width: "80%",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: "#fff",
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 32,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "semibold",
                      fontWeight: "600",
                      fontSize: 18,
                      color: "#000",
                    }}
                  >
                    {loading ? "Unlocking" : "Unlock with Biometrics"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: "semibold",
                    fontSize: 24,
                    color: "white",
                    marginBottom: 24,
                    letterSpacing: -0.5,
                  }}
                >
                  Enter your PIN
                </Text>

                <PinInput
                  length={4}
                  value={pin}
                  onChange={(v) => setPin(v)}
                  onComplete={(v) => onSubmitPin(v)}
                  autoFocus
                  secure
                  digitColor="white"
                />

                <TouchableOpacity
                  onPress={() => onSubmitPin(pin)}
                  disabled={loading}
                  style={{
                    width: "80%",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: "#fff",
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 32,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "semibold",
                      fontWeight: "600",
                      fontSize: 18,
                      color: "#000",
                    }}
                  >
                    {loading ? "Unlocking…" : "Unlock"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

export default LockScreen;

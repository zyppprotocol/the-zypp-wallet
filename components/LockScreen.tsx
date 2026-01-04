import PinInput from "@/components/PinInput";
import { useColorScheme } from "@/components/ui";
import { isUserComplete } from "@/lib/auth";
import { useAppLock } from "@/lib/storage/app-lock";
import { SecureStorage } from "@/lib/storage/secure-storage";
import { BlurView } from "expo-blur";
import React, { useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

export const LockScreen: React.FC = () => {
  const { isLocked, unlockWithBiometric, unlockWithPin, biometricAvailable } =
    useAppLock();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();

  // Check if user is fully authenticated (wallet + zyppUserId + PIN/biometrics)
  const [userComplete, setUserComplete] = useState<boolean | null>(null);
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
    }
  };

  return (
    <View style={{ position: "absolute", inset: 0, zIndex: 9999 }}>
      <BlurView intensity={80} tint="dark" style={{ flex: 1, padding: 24 }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text className="tracking-tight mb-3 font-semibold text-2xl text-white">
            Enter your PIN to unlock
          </Text>

          <PinInput
            length={4}
            value={pin}
            onChange={(v) => setPin(v)}
            onComplete={(v) => onSubmitPin(v)}
            autoFocus
            secure
            digitColor={colorScheme === "dark" ? "white" : "black"}
          />

          <View style={{ height: 12 }} />

          <TouchableOpacity
            onPress={onSubmitPin}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 20,
              backgroundColor: "#fff",
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontWeight: "600" }}>
              {loading ? "Unlocking…" : "Unlock"}
            </Text>
          </TouchableOpacity>

          {biometricAvailable ? (
            <TouchableOpacity
              onPress={onBiometric}
              style={{ padding: 8, marginTop: 8 }}
            >
              <Text style={{ color: "#fff" }}>
                {loading ? "…" : "Use biometrics"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </BlurView>
    </View>
  );
};

export default LockScreen;

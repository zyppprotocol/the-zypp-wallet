import { Text, View, useColorScheme } from "@/components/ui";
import useUser from "@/hooks/useUser";
import { authenticateWithBiometric } from "@/lib/storage/biometric";
import SecureStorage from "@/lib/storage/secure-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Switch,
  TouchableOpacity,
} from "react-native";

interface PrivacyCheckupProps {
  visible: boolean;
  onClose: () => void;
}

type Step =
  | "intro"
  | "biometrics"
  | "autolock"
  | "stealth"
  | "offline"
  | "done";

export default function PrivacyCheckup({
  visible,
  onClose,
}: PrivacyCheckupProps) {
  const { user, refresh } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [step, setStep] = useState<Step>("intro");
  const [updating, setUpdating] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  React.useEffect(() => {
    if (visible) {
      (async () => {
        try {
          const cfg = await SecureStorage.getWalletConfig();
          setBiometricEnabled(cfg.biometricEnabled);
        } catch {}
      })();
    }
  }, [visible, user]);

  const nextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "intro") setStep("biometrics");
    else if (step === "biometrics") setStep("autolock");
    else if (step === "autolock") setStep("stealth");
    else if (step === "stealth") setStep("offline");
    else if (step === "offline") setStep("done");
  };

  const handleToggleBiometrics = async (value: boolean) => {
    setUpdating(true);
    try {
      if (value) {
        const auth = await authenticateWithBiometric("Enable Biometric Unlock");
        if (!auth.success) return;
      }
      const cfg = await SecureStorage.getWalletConfig();
      await SecureStorage.setWalletConfig({ ...cfg, biometricEnabled: value });
      setBiometricEnabled(value);
      await refresh();
    } catch (err) {
      Alert.alert("Error", "Failed to update biometric settings");
    } finally {
      setUpdating(false);
    }
  };

  const setAutoLockTimeout = async (ms: number) => {
    setUpdating(true);
    try {
      const u = await SecureStorage.getUser();
      if (!u) return;
      const updated = {
        ...u,
        settings: { ...(u.settings || {}), autoLockTimeoutMs: ms },
      };
      await SecureStorage.setUser(updated);
      await refresh();
      nextStep();
    } catch (err) {
      console.warn(err);
    } finally {
      setUpdating(false);
    }
  };

  const setPrivacyMode = async (mode: "standard" | "private") => {
    setUpdating(true);
    try {
      const u = await SecureStorage.getUser();
      if (!u) return;
      const updated = {
        ...u,
        settings: { ...(u.settings || {}), defaultPrivacyMode: mode },
      };
      await SecureStorage.setUser(updated);
      await refresh();
      nextStep();
    } catch (err) {
      console.warn(err);
    } finally {
      setUpdating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "intro":
        return (
          <View className="items-center py-4">
            <View className="w-20 h-20 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
              <MaterialCommunityIcons
                name="shield-lock"
                size={40}
                color="#10b981"
              />
            </View>
            <Text className="text-2xl font-bold text-center mb-2 dark:text-white">
              Privacy Checkup
            </Text>
            <Text className="text-center opacity-60 mb-8 px-4 dark:text-white/60">
              Review your most important security settings to keep your wallet
              safe.
            </Text>
            <TouchableOpacity
              onPress={nextStep}
              className="w-full bg-black dark:bg-[#05E28A] py-4 rounded-full items-center"
            >
              <Text className="text-white dark:text-black font-semibold text-lg">
                Start Checkup
              </Text>
            </TouchableOpacity>
          </View>
        );

      case "biometrics":
        return (
          <View>
            <Text className="text-xl font-bold mb-2 dark:text-white">
              Biometric Unlock
            </Text>
            <Text className="opacity-60 mb-6 dark:text-white/60">
              Use Face ID or Touch ID for faster, secure access.
            </Text>
            <View className="bg-white/5 p-6 rounded-2xl flex-row items-center justify-between mb-8 border border-white/5">
              <View>
                <Text className="font-semibold dark:text-white">
                  Enable Biometrics
                </Text>
                <Text className="text-xs opacity-50 dark:text-white/40">
                  Recommended
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometrics}
                disabled={updating}
                trackColor={{ true: "#05E28A", false: "#ccc" }}
              />
            </View>
            <TouchableOpacity
              onPress={nextStep}
              className="w-full bg-black dark:bg-[#05E28A] py-4 rounded-full items-center"
            >
              <Text className="text-white dark:text-black font-semibold text-lg">
                Next Step
              </Text>
            </TouchableOpacity>
          </View>
        );

      case "autolock":
        return (
          <View>
            <Text className="text-xl font-bold mb-2 dark:text-white">
              Auto-Lock Timeout
            </Text>
            <Text className="opacity-60 mb-6 dark:text-white/60">
              How quickly should the app lock when not in use?
            </Text>
            <View className="gap-3">
              {[
                { label: "1 Minute", ms: 60000 },
                { label: "5 Minutes", ms: 300000 },
                { label: "15 Minutes", ms: 900000 },
                { label: "Never", ms: 0 },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.ms}
                  onPress={() => setAutoLockTimeout(opt.ms)}
                  className={`p-5 rounded-2xl border ${
                    user?.settings?.autoLockTimeoutMs === opt.ms
                      ? "bg-emerald-500/10 border-emerald-500"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      user?.settings?.autoLockTimeoutMs === opt.ms
                        ? "text-emerald-500"
                        : "dark:text-white"
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case "stealth":
        return (
          <View>
            <Text className="text-xl font-bold mb-2 dark:text-white">
              Privacy Mode
            </Text>
            <Text className="opacity-60 mb-6 dark:text-white/60">
              Hide your balances by default when opening the app.
            </Text>
            <View className="gap-3 mb-8">
              {[
                {
                  label: "Standard",
                  value: "standard",
                  desc: "Show balances on app start",
                },
                {
                  label: "Private",
                  value: "private",
                  desc: "Hide balances until you tap",
                },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() =>
                    setPrivacyMode(opt.value as "standard" | "private")
                  }
                  className={`p-5 rounded-2xl border ${
                    (user?.settings?.defaultPrivacyMode ?? "standard") ===
                    opt.value
                      ? "bg-emerald-500/10 border-emerald-500"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      (user?.settings?.defaultPrivacyMode ?? "standard") ===
                      opt.value
                        ? "text-emerald-500"
                        : "dark:text-white"
                    }`}
                  >
                    {opt.label}
                  </Text>
                  <Text className="text-xs opacity-50 dark:text-white/40">
                    {opt.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case "offline":
        return (
          <View>
            <Text className="text-xl font-bold mb-2 dark:text-white">
              Offline Security
            </Text>
            <Text className="opacity-60 mb-6 dark:text-white/60">
              Enable peer-to-peer offline transactions via BLE/NFC.
            </Text>
            <View className="bg-white/5 p-6 rounded-2xl flex-row items-center justify-between mb-8 border border-white/5">
              <View className="flex-1 mr-4">
                <Text className="font-semibold dark:text-white">
                  Offline Transactions
                </Text>
                <Text className="text-xs opacity-50 dark:text-white/40">
                  Send & receive with no internet
                </Text>
              </View>
              <Switch
                value={user?.settings?.allowOfflineTransactions ?? true}
                onValueChange={async (v) => {
                  setUpdating(true);
                  try {
                    const u = await SecureStorage.getUser();
                    if (!u) return;
                    const updated = {
                      ...u,
                      settings: {
                        ...(u.settings || {}),
                        allowOfflineTransactions: v,
                      },
                    };
                    await SecureStorage.setUser(updated);
                    await refresh();
                  } finally {
                    setUpdating(false);
                  }
                }}
                disabled={updating}
                trackColor={{ true: "#05E28A", false: "#ccc" }}
              />
            </View>
            <TouchableOpacity
              onPress={nextStep}
              className="w-full bg-black dark:bg-[#05E28A] py-4 rounded-full items-center"
            >
              <Text className="text-white dark:text-black font-semibold text-lg">
                Finish Checkup
              </Text>
            </TouchableOpacity>
          </View>
        );

      case "done":
        return (
          <View className="items-center py-4">
            <View className="w-20 h-20 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
              <Ionicons name="checkmark-circle" size={50} color="#10b981" />
            </View>
            <Text className="text-2xl font-bold text-center mb-2 dark:text-white">
              You're All Set!
            </Text>
            <Text className="text-center opacity-60 mb-8 px-4 dark:text-white/60">
              Your privacy settings have been updated and synced. Your wallet is
              now even more secure.
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-full bg-black dark:bg-[#05E28A] py-4 rounded-full items-center"
            >
              <Text className="text-white dark:text-black font-semibold text-lg">
                Return to Profile
              </Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/60 items-center justify-end">
        <View className="w-full bg-white dark:bg-[#1A1A1A] rounded-t-[40px] p-8 pb-12 max-h-[90%]">
          <View className="flex-row items-center justify-between mb-8">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              <Text className="text-xs font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                Step {step === "intro" ? 0 : step === "done" ? 5 : 1} of 5
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons
                name="close"
                size={28}
                color={isDark ? "#fff" : "#888"}
              />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {renderStep()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

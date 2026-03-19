import PinInput from "@/components/PinInput";
import PrivacyCheckup from "@/components/PrivacyCheckup";
import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useIsOnline } from "@/hooks/useNetworkConnection";
import useUser from "@/hooks/useUser";
import { updateUserProfileImage, updateZyppUserId } from "@/lib/auth";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
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
  Image as RNImage,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";

export default function Profile() {
  const { user, refresh } = useUser();
  const [uploading, setUploading] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [savingHandle, setSavingHandle] = useState(false);
  const isOnline = useIsOnline();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const [showCheckup, setShowCheckup] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"current" | "new" | "confirm">(
    "current"
  );
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    if (user?.zyppUserId) {
      // Initialize with the prefix only
      setNewHandle(user.zyppUserId.replace(".zypp", ""));
    }
  }, [user]);

  const handlePickImage = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      } as any);
      const uri = (res as any)?.assets?.[0]?.uri;
      if (!uri) return;

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setUploading(true);
      await updateUserProfileImage(uri);
      await refresh();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.warn(err);
      Alert.alert("Upload failed", String(err));
    } finally {
      setUploading(false);
    }
  };

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { SecureStorage } = await import("@/lib/storage/secure-storage");
        const cfg = await SecureStorage.getWalletConfig();
        setBiometricEnabled(cfg.biometricEnabled);
      } catch {}
    })();
  }, [user]);

  const handleUpdateHandle = async () => {
    const fullHandle = newHandle.trim().toLowerCase() + ".zypp";
    if (fullHandle === user?.zyppUserId) {
      setEditingHandle(false);
      return;
    }

    setSavingHandle(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateZyppUserId(fullHandle);
      await refresh();
      setEditingHandle(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", String(err));
    } finally {
      setSavingHandle(false);
    }
  };

  const handleWipeWallet = () => {
    Alert.prompt(
      "Confirm Wipe",
      'This will permanently delete your keys and profile from this device. Please type "WIPE" to confirm.',
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: async (val) => {
            if (val === "WIPE") {
              try {
                const { SecureStorage } = await import(
                  "@/lib/storage/secure-storage"
                );
                await SecureStorage.deleteUser();
                await SecureStorage.wipeWallet();
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Warning
                );
                router.replace("/welcome");
              } catch (err) {
                Alert.alert("Error", "Failed to wipe wallet");
              }
            } else {
              Alert.alert("Incorrect Phrase", 'Please type "WIPE" exactly.');
            }
          },
        },
      ]
    );
  };

  const validateCurrentPin = async () => {
    if (oldPin.length < 4) return;
    setSavingHandle(true); // Re-use saving state for loading
    setPinError("");
    try {
      const { SecureStorage } = await import("@/lib/storage/secure-storage");
      await SecureStorage.unlockWithPin(oldPin);
      setPinStep("new");
    } catch (err) {
      setPinError("Incorrect current PIN");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingHandle(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    if (newPin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }

    try {
      const { SecureStorage } = await import("@/lib/storage/secure-storage");
      await SecureStorage.changePIN(oldPin, newPin);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "PIN changed successfully");
      resetPinFlow();
    } catch (err) {
      setPinError("Invalid current PIN or update failed");
    }
  };

  const resetPinFlow = () => {
    setChangingPin(false);
    setOldPin("");
    setNewPin("");
    setConfirmPin("");
    setPinStep("current");
    setPinError("");
  };

  const handleCopy = async () => {
    if (!user?.solanaPublicKey) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setStringAsync(user.solanaPublicKey);
    Alert.alert("Copied", "Public key copied to clipboard");
  };

  const isDark = colorScheme === "dark";

  return (
    <SafeAreaView className="flex-1">
      <View className="absolute top-0 left-0 right-0 w-full h-[500px]">
        <Image
          source={
            isDark
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
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View className="px-6 py-6">
            <View className="flex-row items-center justify-start gap-5 mb-8">
              <TouchableOpacity
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full items-center justify-center"
              >
                <Ionicons
                  name="chevron-back"
                  size={24}
                  color={colorScheme === "dark" ? "white" : "black"}
                />
              </TouchableOpacity>
              <Text className="text-xl font-semibold tracking-tight">
                Manage Zypp Profile
              </Text>
              {/* <View className="w-10" /> */}
            </View>

            {/* Profile Card Section */}
            <View className="rounded-[40px] bg-white/10 dark:bg-black/30 border border-white/10 p-8 items-center mb-6 overflow-hidden">
              <View className="absolute inset-0 bg-white/5" />

              <TouchableOpacity
                onPress={handlePickImage}
                className="relative active:scale-95 transition-transform"
              >
                <View className="w-24 h-24 rounded-full border-2 border-emerald-500/30 p-1">
                  {user?.profileImageUrl ? (
                    <RNImage
                      source={{ uri: user.profileImageUrl }}
                      className="w-full h-full rounded-full"
                    />
                  ) : (
                    <View className="w-full h-full rounded-full bg-emerald-500/10 items-center justify-center">
                      <Text className="text-3xl font-bold text-[#05E28A]/80">
                        {user?.zyppUserId?.charAt(0)?.toUpperCase() ?? "U"}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-500 items-center justify-center border-2 border-primary">
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons
                      name="camera"
                      size={16}
                      color="#fff"
                    />
                  )}
                </View>
              </TouchableOpacity>

              <View className="mt-6 w-full items-center">
                {editingHandle ? (
                  <View className="w-full">
                    <View className="flex-row items-center justify-center border-b-2 border-[#05E28A]/50">
                      <TextInput
                        value={newHandle}
                        onChangeText={setNewHandle}
                        placeholder="Username"
                        placeholderTextColor={
                          isDark ? "#ffffff40" : "#00000040"
                        }
                        autoFocus
                        autoCapitalize="none"
                        className="text-2xl font-semibold text-right py-2 min-w-[50px]"
                        style={{ color: isDark ? "#fff" : "#000" }}
                      />
                      <Text className="text-2xl font-semibold opacity-40 py-2">
                        .zypp
                      </Text>
                    </View>
                    <View className="flex-row justify-center mt-4">
                      <TouchableOpacity
                        onPress={() => setEditingHandle(false)}
                        className="px-6 py-2 rounded-full bg-white/10 mr-2"
                      >
                        <Text className="font-semibold opacity-60">Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleUpdateHandle}
                        disabled={savingHandle}
                        className="px-6 py-2 rounded-full bg-black dark:bg-[#05E28A]"
                      >
                        {savingHandle ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="font-semibold text-white dark:text-black">
                            Save
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditingHandle(true);
                    }}
                    className="flex-row items-center space-x-2"
                  >
                    <Text className="text-2xl font-bold tracking-tight">
                      @{user?.zyppUserId}
                    </Text>
                    <MaterialCommunityIcons
                      name="pencil"
                      size={18}
                      color={isDark ? "#ffffff60" : "#00000060"}
                      className="ml-2"
                    />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={handleCopy}
                  className="mt-4 flex-row items-center bg-white/5 px-4 py-2 rounded-full border border-white/5 active:opacity-60"
                >
                  <Text
                    className="text-sm opacity-50 font-medium mr-2"
                    numberOfLines={1}
                  >
                    {user?.solanaPublicKey?.slice(0, 8)}...
                    {user?.solanaPublicKey?.slice(-8)}
                  </Text>
                  <Ionicons
                    name="copy-outline"
                    size={16}
                    color={isDark ? "#ffffff40" : "#00000060"}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Privacy Checkup Card */}
            <TouchableOpacity
              onPress={() => {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
                setShowCheckup(true);
              }}
              className="mb-6 rounded-[32px] overflow-hidden border border-emerald-500/20"
            >
              <View className="absolute inset-0 bg-emerald-500/10" />
              <View className="p-6 flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-emerald-500/20 items-center justify-center mr-4">
                  <MaterialCommunityIcons
                    name="shield-check"
                    size={24}
                    color="#10b981"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold">Privacy Checkup</Text>
                  <Text className="text-sm opacity-60">
                    3 minutes to complete • Guided setup
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={isDark ? "#ffffff40" : "#00000040"}
                />
              </View>
            </TouchableOpacity>

            {/* Settings Sections */}
            <View className="space-y-4">
              <View className="rounded-[30px] bg-white/5 border border-white/5 overflow-hidden">
                <TouchableOpacity
                  className="flex-row items-center p-5 active:bg-white/5"
                  onPress={handlePickImage}
                >
                  <View className="w-10 h-10 rounded-full bg-emerald-500/10 items-center justify-center mr-4">
                    <MaterialCommunityIcons
                      name="image-edit"
                      size={20}
                      color="#10b981"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-base">
                      Profile Image
                    </Text>
                    <Text className="text-xs opacity-50">
                      Upload a new avatar
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={16}
                    color={isDark ? "#ffffff20" : "#00000020"}
                  />
                </TouchableOpacity>

                <View className="h-[1px] bg-white/5 mx-5" />

                <TouchableOpacity
                  className="flex-row items-center p-5 active:bg-white/5"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditingHandle(true);
                  }}
                >
                  <View className="w-10 h-10 rounded-full bg-blue-500/10 items-center justify-center mr-4">
                    <MaterialCommunityIcons
                      name="at"
                      size={20}
                      color="#3b82f6"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-base">Username</Text>
                    <Text className="text-xs opacity-50">
                      Change your Zypp handle
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={16}
                    color={isDark ? "#ffffff20" : "#00000020"}
                  />
                </TouchableOpacity>

                <View className="h-[1px] bg-white/5 mx-5" />

                <TouchableOpacity
                  className="flex-row items-center p-5 active:bg-white/5"
                  onPress={() => setChangingPin(true)}
                >
                  <View className="w-10 h-10 rounded-full bg-orange-500/10 items-center justify-center mr-4">
                    <MaterialCommunityIcons
                      name="lock-reset"
                      size={20}
                      color="#f97316"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-base">Change PIN</Text>
                    <Text className="text-xs opacity-50">
                      Update your security PIN
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={16}
                    color={isDark ? "#ffffff20" : "#00000020"}
                  />
                </TouchableOpacity>

                <View className="h-[1px] bg-white/5 mx-5" />

                <TouchableOpacity
                  className="flex-row items-center p-5 active:bg-white/5"
                  onPress={handleWipeWallet}
                >
                  <View className="w-10 h-10 rounded-full bg-red-500/10 items-center justify-center mr-4">
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={20}
                      color="#ef4444"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-base text-red-500">
                      Wipe Wallet
                    </Text>
                    <Text className="text-xs text-red-500/50">
                      Delete all data on this device
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={16}
                    color={isDark ? "#ffffff20" : "#00000020"}
                  />
                </TouchableOpacity>
              </View>

              {!isOnline && (
                <View className="flex-row items-center bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 mt-4">
                  <IconSymbol name="info.circle" size={16} color="#f59e0b" />
                  <Text className="ml-2 text-xs text-amber-500/80 font-semibold flex-1">
                    You're offline. Changes will sync once you reconnect.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={changingPin}
        animationType="slide"
        transparent={true}
        onRequestClose={resetPinFlow}
      >
        <View className="flex-1 bg-black/60 items-center justify-end">
          <View className="w-full bg-white dark:bg-[#1A1A1A] rounded-t-[40px] p-8 pb-12">
            <View className="flex-row items-center justify-between mb-8">
              <Text className="text-2xl font-bold">Change PIN</Text>
              <TouchableOpacity onPress={resetPinFlow}>
                <Ionicons
                  name="close"
                  size={28}
                  color={isDark ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>

            {pinStep === "current" && (
              <View className="items-start">
                <Text className="text-lg font-semibold mb-6">
                  Enter Current PIN
                </Text>
                <PinInput
                  length={4}
                  value={oldPin}
                  onChange={setOldPin}
                  onComplete={validateCurrentPin}
                  autoFocus
                  secure
                />
                {pinError ? (
                  <Text className="text-red-500 mt-4">{pinError}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={validateCurrentPin}
                  disabled={oldPin.length < 4 || savingHandle}
                  className="w-full bg-black dark:bg-[#05E28A] mt-8 py-4 rounded-full items-center disabled:opacity-50"
                >
                  <Text className="text-white dark:text-black font-semibold text-lg">
                    {savingHandle ? "Verifying..." : "Next"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {pinStep === "new" && (
              <View className="items-start w-full">
                <Text className="text-lg font-semibold mb-6">
                  Enter New PIN
                </Text>
                <PinInput
                  length={4}
                  value={newPin}
                  onChange={setNewPin}
                  onComplete={() => setPinStep("confirm")}
                  autoFocus
                  secure
                />
                <TouchableOpacity
                  onPress={() => setPinStep("confirm")}
                  disabled={newPin.length < 4}
                  className="w-full bg-black dark:bg-[#05E28A] mt-8 py-4 rounded-full items-center disabled:opacity-50"
                >
                  <Text className="text-white dark:text-black font-semibold text-lg">
                    Next
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {pinStep === "confirm" && (
              <View className="items-start w-full">
                <Text className="text-lg font-semibold mb-6">
                  Confirm New PIN
                </Text>
                <PinInput
                  length={4}
                  value={confirmPin}
                  onChange={setConfirmPin}
                  onComplete={handleChangePin}
                  autoFocus
                  secure
                />
                {pinError ? (
                  <Text className="text-red-500 mt-4">{pinError}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={handleChangePin}
                  disabled={confirmPin.length < 4}
                  className="w-full bg-black dark:bg-[#05E28A] mt-8 py-4 rounded-full items-center disabled:opacity-50"
                >
                  <Text className="text-white dark:text-black font-semibold text-lg">
                    Change PIN
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <PrivacyCheckup
        visible={showCheckup}
        onClose={() => setShowCheckup(false)}
      />
    </SafeAreaView>
  );
}

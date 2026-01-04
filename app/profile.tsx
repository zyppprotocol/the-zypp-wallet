import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import useUser from "@/hooks/useUser";
import { updateUserProfileImage } from "@/lib/auth";
import { Ionicons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, TouchableOpacity } from "react-native";

export default function Profile() {
  const { user, refresh } = useUser();
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();

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
      setUploading(true);
      await updateUserProfileImage(uri);
      await refresh();
    } catch (err) {
      console.warn(err);
      Alert.alert("Upload failed", String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async () => {
    if (!user?.solanaPublicKey) return;
    await setStringAsync(user.solanaPublicKey);
    Alert.alert("Copied", "Public key copied to clipboard");
  };

  return (
    <SafeAreaView className="flex-1 px-6 py-6">
      <View className="flex-row items-center mb-4">
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
          <Ionicons
            name="chevron-back-outline"
            size={20}
            color={colorScheme === "dark" ? "#fff" : "#000"}
          />
        </TouchableOpacity>
        <Text className="text-2xl font-bold">Manage Zypp account</Text>
      </View>

      <View className="rounded-2xl bg-white/5 p-4 mb-4 items-center">
        {user?.profileImageUrl ? (
          <Image
            source={{ uri: user.profileImageUrl }}
            style={{ width: 96, height: 96, borderRadius: 48 }}
          />
        ) : (
          <View className="w-24 h-24 rounded-full bg-black/5 items-center justify-center">
            <Text className="text-xl font-semibold">
              {user?.zyppUserId?.charAt(0)?.toUpperCase() ?? "U"}
            </Text>
          </View>
        )}

        <Text className="mt-3 font-semibold">{user?.zyppUserId}</Text>
        <Text className="text-sm opacity-70 mt-1">{user?.solanaPublicKey}</Text>

        <View className="flex-row mt-4">
          <TouchableOpacity
            onPress={handlePickImage}
            className="mr-3 bg-white/5 rounded-2xl p-3"
          >
            <Text>{uploading ? "Uploading…" : "Change photo"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCopy}
            className="bg-white/5 rounded-2xl p-3"
          >
            <Text>Copy address</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

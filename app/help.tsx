import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, TouchableOpacity } from "react-native";

export default function Help() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const openMail = async () => {
    const url = "mailto:info@zypp.fun?subject=Support%20request";
    await Linking.openURL(url);
  };

  return (
    <SafeAreaView className="relative flex-1">
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
      <View className="px-6 py-6">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
            <Ionicons
              name="chevron-back-outline"
              size={20}
              color={colorScheme === "dark" ? "#fff" : "#000"}
            />
          </TouchableOpacity>
          <Text className="text-2xl font-semibold">Settings</Text>
        </View>
        <View>
          <Text className="text-2xl font-semibold mb-2">Help & Support</Text>
          <Text className="text-sm opacity-70 mb-4">
            Get in touch with Zypp support or browse help topics.
          </Text>

          <TouchableOpacity
            onPress={openMail}
            className="rounded-full bg-black dark:bg-primary px-4 py-3 items-center"
          >
            <Text className="font-semibold text-lg text-white dark:text-black">
              Email support
            </Text>
          </TouchableOpacity>

          <View className="mt-6">
            <Text className="font-semibold mb-2">Frequently asked</Text>
            <Text className="text-sm opacity-70">
              - How to create a wallet\n- How to send and receive SOL
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

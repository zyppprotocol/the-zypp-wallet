import { SafeAreaView, Text, View } from "@/components/ui";
import React from "react";
import { Linking, TouchableOpacity } from "react-native";

export default function Help() {
  const openMail = async () => {
    const url = "mailto:info@zypp.fun?subject=Support%20request";
    await Linking.openURL(url);
  };

  return (
    <SafeAreaView className="flex-1 px-6 py-6">
      <View>
        <Text className="text-2xl font-bold mb-2">Help & Support</Text>
        <Text className="text-sm opacity-70 mb-4">
          Get in touch with Zypp support or browse help topics.
        </Text>

        <TouchableOpacity
          onPress={openMail}
          className="rounded-full bg-black dark:bg-primary px-4 py-3 items-center"
        >
          <Text className="font-semibold text-lg text-white dark:text-black">Email support</Text>
        </TouchableOpacity>

        <View className="mt-6">
          <Text className="font-semibold mb-2">Frequently asked</Text>
          <Text className="text-sm opacity-70">
            - How to create a wallet\n- How to send and receive SOL
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

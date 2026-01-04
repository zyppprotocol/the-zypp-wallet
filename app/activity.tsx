import { SafeAreaView, Text, View, useColorScheme } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, TouchableOpacity } from "react-native";

export default function Activity() {
  const router = useRouter();
  const colorScheme = useColorScheme();

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
        <Text className="text-2xl font-bold">Activity</Text>
      </View>

      <ScrollView>
        <View className="rounded-2xl bg-white/5 p-4">
          <Text className="text-sm opacity-70">No activity yet.</Text>
          <Text className="mt-2 text-sm opacity-70">
            Once you send or receive SOL, your transactions will appear here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

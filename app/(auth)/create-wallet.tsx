import { SafeAreaView, Text, useColorScheme, View } from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol.ios";
import { createWallet } from "@/lib/solana";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React from "react";
import { Alert, TouchableOpacity } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";

export default function CreateWallet() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  const handleClick = async () => {
    try {
      const newWallet = await createWallet({ useBiometric: true });
      console.log("New wallet created:", newWallet);
      // Mark that this is a freshly created wallet so create-user can forward to biometric setup.
      try {
        await SecureStore.setItemAsync("zypp_new_wallet_flow", "1");
      } catch (e) {
        console.warn("Failed to set flow flag", e);
      }
      // Proceed to username screen
      router.push("/create-user");
    } catch (error) {
      console.error("Error creating wallet:", error, (error as any)?.stack);
      Alert.alert(
        "Error creating wallet",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

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

      <View className="flex-1 z-1 items-start justify-end">
        {/* <View className="flex items-center justify-center p-3 mb-5 rounded-2xl bg-white"> */}
        {colorScheme === "dark" ? (
          <View className="flex flex-row items-center mb-7 justify-start gap-2">
            <Image
              source={require("@/assets/images/zypp-icon-light.png")}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
            />
            <Text className="text-2xl text-white font-semibold tracking-tight">
              Zypp Labs
            </Text>
          </View>
        ) : (
          <View className="flex flex-row items-center mb-7 justify-start gap-2">
            <Image
              source={require("@/assets/images/zypp-icon.png")}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
            />
            <Text className="text-2xl dark:text-black font-semibold tracking-tight">
              Zypp Labs
            </Text>
          </View>
        )}
        {/* </View> */}
        <Text
          variant="h1"
          className="text-center tracking-[-1.3] font-semibold text-[38px]"
        >
          Create your
        </Text>
        <Text
          variant="h1"
          className="text-center tracking-[-1.3] -mt-2 mb-4 font-semibold text-[38px]"
        >
          secure wallet.
        </Text>
        <Text variant="h4" className="font-medium text-base mb-8 w-md">
          Lets setup your wallet to get started.
        </Text>
        <View className="flex flex-col w-full gap-2">
          <TouchableOpacity
            className="w-full rounded-full py-4 gap-2 dark:bg-primary bg-black flex flex-row items-center justify-center"
            onPress={() => {
              handleClick();
            }}
          >
            <IconSymbol
              name="wallet.bifold.fill"
              size={20}
              color={colorScheme === "dark" ? "black" : "white"}
              style={{ marginBottom: 0 }}
            />
            <Text className="text-white dark:text-black text-lg font-semibold tracking-tight">
              Create Wallet
            </Text>
          </TouchableOpacity>
          <Text className="text-sm text-neutral-500 mt-4">
            Recover an existing wallet
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

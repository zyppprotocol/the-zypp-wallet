import { SafeAreaView, Text, useColorScheme } from "@/components/ui";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { SystemBars } from "react-native-edge-to-edge";

const Success = () => {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/wallet");
    }, 1500);

    return () => clearTimeout(timer);
  }, []);
  const colorScheme = useColorScheme();
  return (
    <SafeAreaView className="flex-1 justify-center items-center">
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
      {colorScheme === "dark" ? (
        <Image
          source={require("@/assets/images/success-dark.png")}
          style={{
            width: 150,
            height: 150,
            shadowColor: "rgba(0,0,0,0.1)",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
          }}
        />
      ) : (
        <Image
          source={require("@/assets/images/success-light.png")}
          style={{
            width: 150,
            height: 150,
            shadowColor: "rgba(0,0,0,0.1)",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
          }}
        />
      )}
      <Text className="mt-6 text-2xl font-bold dark:text-white text-black">
        Transaction Successful!
      </Text>
      <Text className="mt-3 text-md font-medium dark:text-white text-black opacity-70">
        Redirecting to home page...
      </Text>
    </SafeAreaView>
  );
};

export default Success;

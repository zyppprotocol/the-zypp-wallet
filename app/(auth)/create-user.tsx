import { SafeAreaView, Text, useColorScheme, View } from "@/components/ui";
import { IconSymbol } from "@/components/ui/IconSymbol.ios";
import { createUser, finalizeUser, getUser, recoverUser } from "@/lib/auth";
import * as Solana from "@/lib/solana";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, TextInput, TouchableOpacity } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";

export default function CreateUser() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRecover = async () => {
    if (!username || username.trim().length < 3) {
      Alert.alert(
        "Invalid username",
        "Please enter a username to recover"
      );
      return;
    }

    setLoading(true);
    try {
      const fullHandle = `${username.trim()}.zypp`;
      const recovered = await recoverUser(fullHandle);
      console.log("Recovered user:", recovered);
      
      Alert.alert(
        "Welcome back!",
        `Successfully recovered ${recovered.zyppUserId}. Now let's set up your security.`
      );
      
      router.replace("/setup-biometrics");
    } catch (err) {
      console.error("Error recovering user:", err);
      Alert.alert("Recovery failed", "We couldn't find an account with that username. Please double check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!username || username.trim().length < 3) {
      Alert.alert(
        "Invalid username",
        "Please enter a username (at least 3 characters)"
      );
      return;
    }

    setLoading(true);

    try {
      // Double-check if user already exists
      const existing = await getUser();
      if (existing) {
        router.replace("/wallet");
        return;
      }

      // Append .zypp suffix to username
      const zyppUsername = `${username.trim()}.zypp`;

      // If a wallet already exists, finalize the ZyppUser binding
      try {
        await Solana.getPublicKeyBase58();
        // wallet exists
        const user = await finalizeUser(zyppUsername);
        console.log("Finalized user:", user);
        Alert.alert("Welcome", `Account ${user.zyppUserId} created`);

        // Always route to setup-biometrics to ensure security credentials (PIN/Bio) are properly established
        router.replace("/setup-biometrics");
        return;
      } catch (e) {
        // No wallet exists -> create user + wallet
        console.warn("No existing wallet detected, creating wallet+user", e);
        const user = await createUser({
          zyppUserId: zyppUsername,
          useBiometric: true,
        });
        console.log("Created user & wallet:", user);
        Alert.alert("Welcome", `Account ${user.zyppUserId} created`);
        router.replace("/setup-biometrics");
        return;
      }
    } catch (err) {
      console.error("Error creating user:", err);
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const colorScheme = useColorScheme();

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

      <View className="flex-1 z-1 justify-end">
        <View className="flex flex-row items-center mb-6 justify-start gap-2">
          <Image
            source={
              colorScheme === "dark"
                ? require("@/assets/images/zypp-icon-light.png")
                : require("@/assets/images/zypp-icon.png")
            }
            style={{ width: 20, height: 20 }}
            contentFit="contain"
          />
          <Text className="text-2xl text-white font-semibold tracking-tight">
            Zypp Labs
          </Text>
        </View>

        <Text
          variant="h1"
          className="tracking-[-1.3] font-semibold text-[38px]"
        >
          Create your
        </Text>
        <Text
          variant="h1"
          className="tracking-[-1.3] -mt-2 mb-4 font-semibold text-[38px]"
        >
          Zypp account.
        </Text>

        <Text variant="h4" className="font-medium text-base mb-6 w-md">
          Pick a username to get started.
        </Text>

        <View className="mb-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-4">
          <TextInput
            placeholder="Choose a username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderClassName="dark:text-white/50"
            className="dark:text-white text-base"
          />
          {username && (
            <Text className="text-xs opacity-60 mt-2">
              Your account:{" "}
              <Text className="font-semibold opacity-100">
                {username.trim()}.zypp
              </Text>
            </Text>
          )}
        </View>

        <TouchableOpacity
          disabled={loading}
          onPress={handleCreate}
          className={`w-full rounded-full py-4 mb-3 ${loading ? "bg-neutral-400" : "bg-black dark:bg-primary"} flex flex-row items-center justify-center`}
        >
          <IconSymbol
            name="wallet.bifold.fill"
            size={20}
            color={colorScheme === "dark" ? "black" : "white"}
            style={{ marginBottom: 0 }}
          />
          <Text className="text-white dark:text-black text-lg font-semibold tracking-tight ml-3">
            {loading ? "Creating…" : "Create Account"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={loading}
          onPress={handleRecover}
          className="w-full rounded-full py-4 border border-black/10 dark:border-white/20 flex flex-row items-center justify-center"
        >
          <IconSymbol
            name="arrow.counterclockwise"
            size={18}
            color={colorScheme === "dark" ? "white" : "black"}
            style={{ marginBottom: 0, opacity: 0.7 }}
          />
          <Text className="text-black dark:text-white text-lg font-semibold tracking-tight ml-3 opacity-70">
            {loading ? "Checking…" : "Recover existing"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

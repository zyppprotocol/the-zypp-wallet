import { Button, SafeAreaView, Text } from "@/components/ui";
import { isWalletInitialized } from "@/lib/storage/secure-storage";
import { Link, Stack, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

export default function NotFoundScreen() {
  const router = useRouter();

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initialized = await isWalletInitialized();
        if (!mounted) return;
        if (initialized) {
          router.replace("/(tabs)/wallet" as any);
        } else {
          router.replace("/welcome" as any);
        }
      } catch (err) {
        if (!mounted) return;
        router.replace("/welcome" as any);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-5">
          <Text variant="h1" className="mb-4">
            404
          </Text>
          <Text variant="h3" className="mb-2">
            Page not found
          </Text>
          <Text variant="muted" className="text-center mb-8">
            This screen does not exist.
          </Text>
          <Link href="/" asChild>
            <Button variant="default">
              <Text>Go to home screen</Text>
            </Button>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}

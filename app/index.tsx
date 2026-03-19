import { SafeAreaView, Spinner } from "@/components/ui";
import { getUser, isUserComplete } from "@/lib/auth";
import { SecureStorage } from "@/lib/storage/secure-storage";
import { router } from "expo-router";
import React from "react";

export default function RootRedirect() {
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const complete = await isUserComplete();
        if (!mounted) return;

        if (complete) {
          // User is fully authenticated: redirect to the wallet tab
          router.replace("/(tabs)/wallet" as any);
        } else {
          // User not complete: check if they have a wallet but need to finish setup
          const walletExists = await SecureStorage.isWalletInitialized();
          const user = await getUser();

          if (walletExists && user && user.zyppUserId) {
            console.log(
              "User partially complete, redirecting to setup-biometrics"
            );
            router.replace("/setup-biometrics");
          } else {
            // No wallet or no username: redirect to welcome
            console.log("User incomplete, redirecting to welcome");
            router.replace("/welcome" as any);
          }
        }
      } catch (err) {
        console.error("RootRedirect error:", err);
        router.replace("/welcome");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView className="flex-1 items-center justify-center">
      <Spinner size="small" color="white" />
    </SafeAreaView>
  );
}

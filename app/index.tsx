import { SafeAreaView, Spinner } from "@/components/ui";
import { getUser, isUserComplete } from "@/lib/auth";
import { router } from "expo-router";
import React from "react";

export default function RootRedirect() {
  const user = getUser()
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const complete = await isUserComplete();
        if (!mounted) return;
        if (complete) {
          // User is fully authenticated: redirect to the wallet tab
          router.replace("/(tabs)/wallet" as any);
          console.log(user);
        } else {
          // User not complete: redirect to welcome (auth flow)
          router.replace("/welcome" as any);
          console.log("No user found");
        }
      } catch {
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

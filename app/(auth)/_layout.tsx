import { Stack } from "expo-router";
import React from "react";

const Layout = () => {
  return (
    <Stack>
      <Stack.Screen name="create-wallet" options={{ headerShown: false }} />
      <Stack.Screen name="create-user" options={{ headerShown: false }} />
      <Stack.Screen name="setup-biometrics" options={{ headerShown: false }} />
    </Stack>
  );
};

export default Layout;

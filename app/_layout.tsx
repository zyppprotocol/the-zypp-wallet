import { ActivityDetector } from "@/components/ActivityDetector";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "../global.css";

import { ErrorBoundary } from "@/components/error-boundary";
import { LockScreen } from "@/components/LockScreen";
import { ThemeProvider as UIThemeProvider } from "@/components/ui/theme";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  startBLEAdvertising,
  stopBLEAdvertising,
} from "@/lib/solana/receive-listener";
import { AppLockProvider } from "@/lib/storage/app-lock";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useColorScheme();
  const [loaded] = useFonts({
    regular: require("../assets/fonts/Instrument_Sans/InstrumentSans-Regular.ttf"),
    medium: require("../assets/fonts/Instrument_Sans/InstrumentSans-Medium.ttf"),
    semibold: require("../assets/fonts/Instrument_Sans/InstrumentSans-SemiBold.ttf"),
    bold: require("../assets/fonts/Instrument_Sans/InstrumentSans-Bold.ttf"),
    italic: require("../assets/fonts/Instrument_Sans/InstrumentSans-Italic.ttf"),
    regular_italic: require("../assets/fonts/Instrument_Sans/InstrumentSans-Italic.ttf"),
    medium_italic: require("../assets/fonts/Instrument_Sans/InstrumentSans-MediumItalic.ttf"),
    semibold_italic: require("../assets/fonts/Instrument_Sans/InstrumentSans-SemiBoldItalic.ttf"),
    bold_italic: require("../assets/fonts/Instrument_Sans/InstrumentSans-BoldItalic.ttf"),
  });

  configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
});

  useEffect(() => {
    if (loaded) {
      // Hide the splash screen after fonts are loaded
      SplashScreen.hideAsync();

      // Start BLE advertising when app initializes so user is discoverable
      startBLEAdvertising().catch((error) => {
        console.error("Failed to start BLE advertising on app init:", error);
      });
    }
  }, [loaded]);

  // Cleanup BLE advertising when app unmounts
  useEffect(() => {
    return () => {
      stopBLEAdvertising().catch((error) => {
        console.error("Failed to stop BLE advertising on app unmount:", error);
      });
    };
  }, []);

  if (!loaded) {
    // Keep showing splash screen while loading
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <AppLockProvider>
            <ActivityDetector>
              <UIThemeProvider>
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="welcome"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="profile"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="settings"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="success"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen name="help" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="activity"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(auth)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <StatusBar style="auto" />
              </UIThemeProvider>

              {/* Lock screen overlay (renders when app is locked) */}
              <LockScreen />
            </ActivityDetector>
          </AppLockProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

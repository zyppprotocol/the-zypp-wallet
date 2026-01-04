import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CenterAction from "./CenterActionButton";

export default function TabBarBackground() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const backgroundColor = isDark
    ? "rgba(21,23,24,0.6)"
    : "rgba(255,255,255,0.8)";
  const separatorColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
  const height = 64 + insets.bottom; // base tab height + safe inset

  // Use blur on native platforms, fallback to opaque translucent view on web
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          styles.fallback,
          {
            height,
            paddingBottom: insets.bottom,
            backgroundColor,
            borderTopColor: separatorColor,
          },
        ]}
      />
    );
  }

  return (
    <BlurView
      intensity={90}
      tint={isDark ? "dark" : "light"}
      style={[
        styles.blur,
        {
          height,
          paddingBottom: insets.bottom,
          backgroundColor,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        },
      ]}
    >
      {/* subtle hairline separator at the top of the tab bar to give definition */}
      <View style={[styles.separator, { backgroundColor: separatorColor }]} />

      {/* Center floating action button */}
      <CenterAction />
    </BlurView>
  );
}

export function useBottomTabOverflow() {
  const insets = useSafeAreaInsets();
  return insets.bottom;
}

const styles = StyleSheet.create({
  blur: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "visible",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  separator: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 1,
  },
  fallback: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
});

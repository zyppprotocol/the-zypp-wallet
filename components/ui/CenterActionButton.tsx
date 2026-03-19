import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useBottomTabOverflow } from "./TabBarBackground";

export default function CenterActionButton() {
  const router = useRouter();
  const bottom = useBottomTabOverflow();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const tintColor = Colors[colorScheme ?? "light"].tint;
  const scale = React.useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  }
  function onPressOut() {
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }

  function onPress() {
    // Navigate to the add screen inside the tabs group
    router.push("add");
  }

  // On Android, hide the center button - use regular tab buttons instead
  if (Platform.OS === "android") {
    return null;
  }

  return (
    <View style={[styles.container, { bottom: 14 + bottom }]}>
      <Animated.View style={[styles.shadow, { transform: [{ scale }] }]}>
        <TouchableOpacity
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={onPress}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Add"
          style={[
            styles.button,
            {
              backgroundColor: tintColor,
              borderColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <IconSymbol name="plus" size={26} color={isDark ? "#000" : "#fff"} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#00ff6a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.06)",
  },
});

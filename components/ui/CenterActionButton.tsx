import { IconSymbol } from "@/components/ui/IconSymbol";
import { useRouter } from "expo-router";
import React from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { useBottomTabOverflow } from "./TabBarBackground";

export default function CenterActionButton() {
  const router = useRouter();
  const bottom = useBottomTabOverflow();
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
          style={styles.button}
        >
          <IconSymbol name="plus" size={26} color="#001" />
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

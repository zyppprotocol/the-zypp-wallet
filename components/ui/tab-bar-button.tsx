import { IconSymbol } from "@/components/ui/IconSymbol";
import React, { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { icons } from "./icons";

// Fallback icon component in case the icon is not found
const FallbackIcon = ({ color }: { color: string }) => (
  <IconSymbol size={22} name="questionmark.circle" color={color} />
);

const TabBarButton = (props: {
  isFocused: boolean;
  label: string;
  routeName: string; // Changed from keyof typeof icons to string
  color: string;
  onPress?: () => void;
  onLongPress?: () => void;
}) => {
  const { isFocused, label, routeName, color, onPress, onLongPress } = props;

  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0, {
      mass: 1,
      damping: 15,
      stiffness: 120,
      overshootClamping: false,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
    });
  }, [scale, isFocused]);

  // Get the icon component or use fallback
  const IconComponent = icons[routeName as keyof typeof icons] || FallbackIcon;

  const animatedIconStyle = useAnimatedStyle(() => {
    const scaleValue = interpolate(scale.value, [0, 1], [1, 1.15]);
    const translateY = interpolate(scale.value, [0, 1], [0, -6]);

    return {
      transform: [{ scale: scaleValue }, { translateY: translateY }] as any, // TODO: Fix type assertion
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scale.value, [0, 1], [1, 0]);

    return {
      opacity,
    };
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.container}
    >
      <Animated.View style={[animatedIconStyle]}>
        <IconComponent color={color} />
      </Animated.View>

      <Animated.Text
        style={[
          {
            color,
            fontSize: 11,
            marginTop: 2,
            fontWeight: isFocused ? "700" : "400",
          },
          animatedTextStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    minWidth: 64, // Minimum touch target size
    minHeight: 48, // Minimum touch target size
  },
});

export default TabBarButton;

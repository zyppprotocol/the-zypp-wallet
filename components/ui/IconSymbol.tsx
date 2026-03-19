// Fallback for using MaterialIcons on Android and web.

import { Ionicons } from "@expo/vector-icons";
import { SymbolView, SymbolViewProps, SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import {
  OpaqueColorValue,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type IconMapping = Record<
  SymbolViewProps["name"],
  ComponentProps<typeof Ionicons>["name"]
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  house: "home-outline",
  "paperplane.fill": "send",
  paperplane: "send-outline",
  "chevron.left.forwardslash.chevron.right": "code-slash",
  "chevron.right": "chevron-forward",
  "arrow.up.right": "arrow-redo-outline",
  "questionmark.circle": "help-circle-outline",
  "chart.bar.fill": "history",
  "arrow.down.circle.fill": "download",
  "arrow.down.circle": "download-outline",
  menucard: "menu-outline",
  checkmark: "checkmark",
  "delete.left": "backspace-outline",
  "checkmark.shield.fill": "shield-checkmark",
  "info.circle": "information-circle-outline",
  "person.circle.fill": "person",
  "person.circle": "person-outline",
  // Theme icons
  "moon.fill": "moon",
  "sun.max.fill": "sunny",
  "brightness.auto": "contrast",
  // Tab bar icons
  "wallet.bifold.fill": "wallet",
  "person.fill": "person",
  "arrow.up.backward.bottomtrailing.rectangle.fill": "share",
  "plus.circle": "add-circle-outline",
  "arrow.down.forward.topleading.rectangle.fill": "download",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 20,
  color,
  style,
  weight = "regular",
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        weight={weight}
        tintColor={color}
        resizeMode="scaleAspectFit"
        name={name}
        style={[
          {
            width: size,
            height: size,
          },
          style,
        ]}
      />
    );
  }

  return (
    <Ionicons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style as any}
    />
  );
}

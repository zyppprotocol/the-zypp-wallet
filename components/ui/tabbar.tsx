import { View } from "@/components/ui";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TabBarButton from "./tab-bar-button";

interface TabBarProps {
  state: {
    index: number;
    routes: {
      key: string;
      name: string;
      params?: Record<string, unknown>;
    }[];
  };
  descriptors: {
    [key: string]: {
      options: {
        tabBarLabel?: string;
        title?: string;
      };
    };
  };
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: Record<string, unknown>) => void;
  };
}

const TabBar = ({ state, descriptors, navigation }: TabBarProps) => {
  const activeColor = "#22C55E"; // Selected tint (full opacity)
  const inactiveColor = "rgba(255, 255, 255, 0.6)"; // Non-selected: white with reduced opacity
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabbarContainer, { paddingBottom: insets.bottom }]}>
      {/* Background */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={80}
          tint="systemChromeMaterialDark"
          style={styles.blurBackground}
        />
      ) : (
        <View
          style={[
            styles.blurBackground,
            { backgroundColor: "rgba(0, 0, 0, 0.9)" },
          ]}
        />
      )}

      {/* Border line */}
      <View style={styles.borderLine} />

      <View style={styles.tabbar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          if (["_sitemap", "+not-found"].includes(route.name)) return null;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TabBarButton
              key={route.name}
              onPress={onPress}
              onLongPress={onLongPress}
              isFocused={isFocused}
              routeName={route.name}
              color={isFocused ? activeColor : inactiveColor}
              label={label}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabbarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    elevation: 8, // Android shadow
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  blurBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  borderLine: {
    height: 1,
    backgroundColor: "#B7FFDC",
    opacity: 0.1,
    marginTop: Platform.OS === "ios" ? 0 : 1, // Prevent gap on Android
  },
  tabbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 16,
    minHeight: Platform.select({
      ios: 50,
      android: 56,
      default: 56,
    }),
    backgroundColor:
      Platform.OS === "ios" ? "transparent" : "rgba(0, 0, 0, 0.25)",
  },
});

export default TabBar;

import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  // Make inactive icons white with reduced opacity so they look softer but not neutral
  const inactiveColor = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.50)";

  return (
    <Tabs
      // tabBar={(props: any) => <TabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarInactiveTintColor: inactiveColor,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 12 },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: "absolute",
            borderTopWidth: 0,
            borderTopColor: "transparent",
            backgroundColor: "transparent",
            shadowOpacity: 0,
            elevation: 0,
            paddingTop: 6,
          },
          default: {
            borderTopWidth: 0,
            borderTopColor: "transparent",
            backgroundColor: Colors[colorScheme ?? "light"].background,
            shadowOpacity: 0,
            elevation: 0,
            paddingTop: 6,
          },
        }),
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={focused ? 26 : 24}
              name="wallet.bifold.fill"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="send"
        options={{
          title: "Send",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={25}
              name="arrow.up.backward.bottomtrailing.rectangle.fill"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: "Receive",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={25}
              name="arrow.down.forward.topleading.rectangle.fill"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Button } from "./button";
import { IconSymbol } from "./IconSymbol";

type ThemePref = "system" | "light" | "dark";
const STORAGE_KEY = "zypp:theme";

export function ThemeToggle({ className }: { className?: string }) {
  const system = useColorScheme();
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      if (
        Platform.OS === "web" &&
        typeof (globalThis as any)?.localStorage !== "undefined"
      ) {
        const v = (globalThis as any).localStorage.getItem(STORAGE_KEY);
        return (v as ThemePref) ?? "system";
      }
    } catch {
      // ignore
    }
    return "system";
  });

  const effectiveTheme = pref === "system" ? system : pref;
  const isDark = effectiveTheme === "dark";

  useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof (globalThis as any)?.document !== "undefined" &&
      typeof (globalThis as any)?.localStorage !== "undefined"
    ) {
      try {
        if (isDark)
          (globalThis as any).document.documentElement.classList.add("dark");
        else
          (globalThis as any).document.documentElement.classList.remove("dark");
        if (pref === "system")
          (globalThis as any).localStorage.removeItem(STORAGE_KEY);
        else (globalThis as any).localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        // ignore
      }
    }
  }, [isDark, pref]);

  const cycle = () => {
    try {
      const next: ThemePref =
        pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
      setPref(next);
    } catch (err) {
      console.warn("[ThemeToggle] Error cycling theme:", err);
    }
  };

  let label = "System";
  if (pref === "dark") label = "Dark";
  else if (pref === "light") label = "Light";

  const iconKey =
    pref === "system"
      ? "brightness.auto"
      : pref === "dark"
        ? "moon.fill"
        : "sun.max.fill";
  const themeKey = (effectiveTheme ?? "light") as "light" | "dark";
  const iconColor = Colors[themeKey].tint;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      accessibilityLabel={`Theme: ${label}`}
      onPress={cycle}
    >
      <IconSymbol name={iconKey as any} size={20} color={iconColor} />
    </Button>
  );
}

ThemeToggle.displayName = "ThemeToggle";

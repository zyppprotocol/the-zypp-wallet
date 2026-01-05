import * as React from "react";
import {
  View,
  type ViewProps,
  useColorScheme as useNativeColorScheme,
} from "react-native";
import { cn } from "./utils/cn";

interface ThemeProviderProps extends ViewProps {
  theme?: "light" | "dark" | "system";
}

const ThemeProvider = React.forwardRef<
  React.ElementRef<typeof View>,
  ThemeProviderProps
>(({ theme = "system", className, ...props }, ref) => {
  const colorScheme = useNativeColorScheme() ?? "light";
  const isDark = theme === "system" ? colorScheme === "dark" : theme === "dark";

  return (
    <View
      ref={ref}
      className={cn("flex-1 bg-background", isDark && "dark", className)}
      {...props}
    />
  );
});

ThemeProvider.displayName = "ThemeProvider";

export { ThemeProvider };

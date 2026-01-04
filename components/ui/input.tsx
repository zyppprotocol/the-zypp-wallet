import * as React from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";
import { cn } from "./utils/cn";

interface InputProps extends TextInputProps {}

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  ({ className, placeholderClassName, style, ...props }, ref) => {
    // Android-specific styles
    const androidStyles =
      Platform.OS === "android"
        ? {
            paddingVertical: 8,
            textAlignVertical: "center" as const,
          }
        : {};

    // Determine font family similarly to Text component
    const cls = `${className ?? ""}`;
    const isItalic = /\bitalic\b/.test(cls);
    let weight: "regular" | "medium" | "semibold" | "bold" = "regular";
    if (/\b(font-(extrabold|black|bold))\b/.test(cls)) weight = "bold";
    else if (/\bfont-semibold\b/.test(cls)) weight = "semibold";
    else if (/\bfont-medium\b/.test(cls)) weight = "medium";

    const styleFontWeight = Array.isArray(style)
      ? style.map((s) => (s && (s as any).fontWeight) || null).find(Boolean)
      : (style as any)?.fontWeight;
    if (styleFontWeight) {
      const w = parseInt(String(styleFontWeight), 10);
      if (!Number.isNaN(w)) {
        if (w >= 700) weight = "bold";
        else if (w >= 600) weight = "semibold";
        else if (w >= 500) weight = "medium";
      } else if (styleFontWeight === "bold") {
        weight = "bold";
      }
    }

    let fontKey: string = weight;
    if (isItalic) {
      if (weight === "regular") fontKey = "italic";
      else fontKey = `${weight}_italic`;
    }

    const nativeFontStyle =
      Platform.OS === "web" ? undefined : { fontFamily: fontKey };

    return (
      <TextInput
        ref={ref}
        className={cn(
          "native:h-12 h-10 w-full rounded-md border-2 border-input bg-background px-3 text-base placeholder:text-muted-foreground",
          "web:flex web:py-2 web:ring-offset-background file:border-0 file:bg-transparent file:font-medium",
          "web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
          "focus:border-primary",
          props.editable === false && "opacity-50 web:cursor-not-allowed",
          className
        )}
        placeholderClassName={cn("text-muted-foreground", placeholderClassName)}
        placeholderTextColor="#9ca3af"
        selectionColor="#6366f1"
        underlineColorAndroid="transparent"
        style={[androidStyles, nativeFontStyle, style]}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
export type { InputProps };

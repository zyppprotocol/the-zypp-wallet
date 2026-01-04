import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import {
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
} from "react-native";
import { cn } from "./utils/cn";
import { TextClassContext } from "./utils/text-context";

const textVariants = cva("text-base text-foreground", {
  variants: {
    variant: {
      h1: "web:select-text text-4xl font-extrabold tracking-tight lg:text-5xl",
      h2: "web:select-text text-3xl font-semibold tracking-tight",
      h3: "web:select-text text-2xl font-semibold tracking-tight",
      h4: "web:select-text text-xl font-semibold tracking-tight",
      h5: "web:select-text text-lg font-semibold tracking-tight",
      h6: "web:select-text text-base font-semibold",
      p: "web:select-text leading-7",
      blockquote: "web:select-text mt-6 border-l-2 pl-6 italic",
      code: "web:select-text relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
      lead: "web:select-text text-xl text-muted-foreground",
      large: "web:select-text text-lg font-semibold",
      small: "web:select-text text-sm font-medium leading-none",
      muted: "web:select-text text-sm text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "p",
  },
});

interface TextProps extends RNTextProps, VariantProps<typeof textVariants> {}

const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>(
  ({ className, variant, style, ...props }, ref) => {
    const textClass = React.useContext(TextClassContext);

    // Determine native font family based on tailwind-like classes or style.fontWeight
    const cls = `${textClass ?? ""} ${className ?? ""}`;
    const isItalic = /\bitalic\b/.test(cls);

    // derive font weight preference from class names
    let weight: "regular" | "medium" | "semibold" | "bold" = "regular";
    if (/\b(font-(extrabold|black|bold))\b/.test(cls)) weight = "bold";
    else if (/\bfont-semibold\b/.test(cls)) weight = "semibold";
    else if (/\bfont-medium\b/.test(cls)) weight = "medium";

    // Also consult style prop if it contains fontWeight
    const extractFontWeight = (s: any): string | undefined => {
      if (!s) return undefined;
      if (Array.isArray(s))
        return s.map(extractFontWeight).find(Boolean) as any;
      if (typeof s === "object" && s.fontWeight) return String(s.fontWeight);
      return undefined;
    };

    const styleFontWeight = extractFontWeight(style);
    if (styleFontWeight) {
      const w = parseInt(styleFontWeight as string, 10);
      if (!Number.isNaN(w)) {
        if (w >= 700) weight = "bold";
        else if (w >= 600) weight = "semibold";
        else if (w >= 500) weight = "medium";
      } else if (styleFontWeight === "bold") {
        weight = "bold";
      }
    }

    // Construct font key loaded in useFonts
    let fontKey: string = weight;
    if (isItalic) {
      if (weight === "regular")
        fontKey = "italic"; // uses the regular italic file
      else fontKey = `${weight}_italic`;
    }

    const nativeFontStyle =
      Platform.OS === "web" ? undefined : { fontFamily: fontKey };

    return (
      <RNText
        className={cn(textVariants({ variant }), textClass, className)}
        style={[nativeFontStyle, style]}
        ref={ref}
        {...props}
      />
    );
  }
);
Text.displayName = "Text";

export { Text, textVariants };
export type { TextProps };

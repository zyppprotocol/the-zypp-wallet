import React, { useEffect, useRef, useState } from "react";
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";

type PinInputProps = {
  length?: number;
  value?: string;
  onChange?: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  secure?: boolean;
  testID?: string;
  digitColor?: string;
};

export default function PinInput({
  length = 4,
  value = "",
  onChange,
  onComplete,
  autoFocus = false,
  secure = true,
  testID,
  digitColor,
}: PinInputProps) {
  const [digits, setDigits] = useState<string[]>(() => {
    const arr = Array.from({ length }).map((_, i) => value[i] ?? "");
    return arr;
  });
  const [masked, setMasked] = useState<boolean[]>(() =>
    Array.from({ length }).map(() => secure)
  );
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // Sync with external value changes
    if (value !== undefined) {
      setDigits((prev) => {
        const arr = Array.from({ length }).map((_, i) => value[i] ?? "");
        return arr;
      });
      setMasked(Array.from({ length }).map(() => secure));
    }
  }, [value, length, secure]);

  useEffect(() => {
    if (autoFocus && inputs.current[0]) inputs.current[0].focus();
  }, [autoFocus]);

  const focusIndex = (i: number) => {
    const target = inputs.current[i];
    if (target) target.focus();
  };

  const updateDigits = (newDigits: string[]) => {
    setDigits(newDigits);
    onChange?.(newDigits.join(""));
    if (newDigits.join("").length === length) {
      onComplete?.(newDigits.join(""));
    }
  };

  const handleChangeText = (index: number, t: string) => {
    if (!t) {
      // clearing current box
      const nd = [...digits];
      nd[index] = "";
      updateDigits(nd);
      return;
    }

    // If user pasted multiple characters
    if (t.length > 1) {
      const paste = t.replace(/\D/g, "").split("");
      const nd = [...digits];
      let k = index;
      for (let p of paste) {
        if (k >= length) break;
        nd[k] = p;
        k++;
      }
      updateDigits(nd);
      // briefly reveal pasted digits
      setMasked((m) => m.map((_, i) => false));
      setTimeout(() => setMasked((m) => m.map(() => secure)), 700);
      const next = Math.min(length - 1, index + paste.length - 1);
      focusIndex(next + 1 < length ? next + 1 : next);
      return;
    }

    // Single digit input
    const char = t.replace(/\D/g, "");
    if (!char) return;
    const nd = [...digits];
    nd[index] = char[0];
    updateDigits(nd);

    // reveal briefly
    setMasked((m) => m.map((prev, i) => (i === index ? false : prev)));
    setTimeout(() => {
      setMasked((m) => m.map((prev, i) => (i === index ? secure : prev)));
    }, 700);

    // move focus
    const nextIndex = index + 1;
    if (nextIndex < length) focusIndex(nextIndex);
  };

  const handleKeyPress = (
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (e.nativeEvent.key === "Backspace") {
      if (digits[index]) {
        const nd = [...digits];
        nd[index] = "";
        updateDigits(nd);
        focusIndex(index);
      } else if (index > 0) {
        const prev = index - 1;
        const nd = [...digits];
        nd[prev] = "";
        updateDigits(nd);
        focusIndex(prev);
      }
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      {Array.from({ length }).map((_, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.9}
          onPress={() => focusIndex(i)}
          style={[
            styles.box,
            i < length - 1 ? { marginRight: 12 } : undefined,
            digits[i] ? styles.boxFilled : undefined,
          ]}
        >
          <TextInput
            ref={(r) => (inputs.current[i] = r)}
            value={digits[i] ?? ""}
            onChangeText={(t) => handleChangeText(i, t)}
            onKeyPress={(e) => handleKeyPress(i, e)}
            keyboardType="number-pad"
            returnKeyType="done"
            textContentType="oneTimeCode"
            maxLength={length === 1 ? 1 : 1}
            selectionColor="transparent"
            style={styles.input}
            className="transition-all"
            secureTextEntry={masked[i]}
            accessible
            accessibilityLabel={`PIN digit ${i + 1} of ${length}`}
          />
          {/* Show visually masked or digit via Text overlay to have consistent visuals */}
          <View pointerEvents="none" style={styles.overlay}>
            <Text style={[styles.digit, { color: digitColor ?? "white" }]} className="transition-all">
              {digits[i] ? (masked[i] ? "•" : digits[i]) : ""}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  boxFilled: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  input: {
    position: "absolute",
    width: "100%",
    height: "100%",
    textAlign: "center",
    color: "transparent",
    opacity: 0,
  },
  overlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  digit: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
  },
});

If you don't want to see this message, you can disable the `strict` mode. Refer to:
https://docs.swmansion.com/react-native-reanimated/docs/debugging/logger-configuration for more details.
WARN [Reanimated] Reading from `value` during component render. Please ensure that you don't access the `value` property nor use `get` method of a shared value while React is rendering a component.

If you don't want to see this message, you can disable the `strict` mode. Refer to:
https://docs.swmansion.com/react-native-reanimated/docs/debugging/logger-configuration for more details.
WARN [Reanimated] Reading from `value` during component render. Please ensure that you don't access the `value` property nor use `get` method of a shared value while React is rendering a component.

If you don't want to see this message, you can disable the `strict` mode. Refer to:
https://docs.swmansion.com/react-native-reanimated/docs/debugging/logger-configuration for more details.

# Known Issues & Solutions

## 1. BLE "Bluetooth is not powered on" Warning in iOS Simulator

**Status:** ✅ Expected behavior (not a bug)

### The Issue

```
WARN  [BLE] Bluetooth is not powered on. Will retry when available.
```

### Why It Happens

iOS simulators **do not have real Bluetooth hardware**, so:

- BLE state will always return "Unknown" or "PoweredOff"
- Bluetooth scanning will not work in the simulator
- NFC operations will also be unavailable

### Solution

**For Development/Testing:**

- These warnings are harmless and can be ignored
- The app gracefully falls back when BLE is unavailable
- Test with a real iOS device for Bluetooth functionality

**For Production:**

- Real devices have full BLE/NFC support
- The app will work correctly on actual hardware

### Related Code

- [lib/solana/delivery-methods.ts](lib/solana/delivery-methods.ts#L107-L126): BLE state checking
- [lib/solana/receive-listener.ts](lib/solana/receive-listener.ts#L76-L89): BLE advertising with state check

---

## 2. Navigation Context Error When Switching Themes

**Status:** ✅ Fixed

### The Issue

```
Render Error: Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?
```

This occurred when switching themes (especially to dark mode) on certain screens.

### Root Cause

The provider hierarchy was causing navigation state issues when theme changes triggered re-renders before the Stack's navigation context was fully ready.

### Fix Applied

Restructured the provider order in [app/\_layout.tsx](app/_layout.tsx):

**Before (problematic):**

```
ErrorBoundary
  → GestureHandlerRootView
    → BottomSheetModalProvider
      → AppLockProvider
        → UIThemeProvider         ← Theme changes here
          → ActivityDetector
            → Stack              ← Navigation context here
```

**After (fixed):**

```
ErrorBoundary
  → GestureHandlerRootView
    → UIThemeProvider             ← Theme changes in safer position
      → BottomSheetModalProvider
        → AppLockProvider
          → ActivityDetector
            → Stack              ← Navigation context ready
```

This ensures the Stack (which provides navigation context) is initialized before theme state changes can affect child components.

### Additional Safety

Added error boundary to [components/ui/theme-toggle.tsx](components/ui/theme-toggle.tsx) to catch theme-related errors gracefully.

---

## Testing

### To Test Theme Switching

1. Start the app on a real device or simulator
2. Navigate to any screen with a theme toggle button
3. Click theme toggle button repeatedly
4. Switch between light/dark/system modes
5. ✅ Should work without "navigation context" errors

### To Test BLE (Real Device Only)

1. Run app on two real iOS devices with Bluetooth enabled
2. Go to Receive screen and tap "Scan Nearby Users"
3. Go to Send screen on another device and send transaction
4. Real devices will discover each other via Bluetooth
5. ✅ Transaction delivery should work via BLE

---

## Environment-Specific Behavior

| Feature         | iOS Simulator                   | Real iOS Device |
| --------------- | ------------------------------- | --------------- |
| BLE Scanning    | ⚠️ Not available (no hardware)  | ✅ Works        |
| NFC             | ⚠️ Not available                | ✅ Works        |
| Theme Switching | ✅ Works                        | ✅ Works        |
| QR Scanning     | ✅ Works (via camera simulator) | ✅ Works        |

---

## References

- React Navigation: https://reactnavigation.org/docs/getting-started
- React Native Bluetooth: https://github.com/dotintent/react-native-ble-plx
- Expo Router: https://expo.dev/routing

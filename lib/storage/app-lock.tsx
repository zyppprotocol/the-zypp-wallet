import * as ScreenCapture from "expo-screen-capture";
import React from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  authenticateWithBiometric,
  checkBiometricAvailability,
} from "./biometric";
import {
  getBiometricPin,
  getUser,
  getWalletConfig,
  isWalletInitialized,
  unlockWithPin,
} from "./secure-storage";

// Inactivity timeout: auto-lock after 5 minutes of no activity
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

interface AppLockContextValue {
  isLocked: boolean;
  lock: () => void;
  unlockWithPin: (pin: string) => Promise<void>;
  unlockWithBiometric: () => Promise<void>;
  biometricAvailable: boolean;
  refreshBiometricAvailability: () => Promise<void>;
  lastBackgroundAt?: number;
  recordActivity: () => void;
  inactivityTimeoutMs: number;
}

const AppLockContext = React.createContext<AppLockContextValue | undefined>(
  undefined
);

export const AppLockProvider: React.FC<React.PropsWithChildren<object>> = ({
  children,
}) => {
  const [isLocked, setIsLocked] = React.useState<boolean>(true);
  const [lastBackgroundAt, setLastBackgroundAt] = React.useState<number>();
  const [biometricAvailable, setBiometricAvailable] =
    React.useState<boolean>(false);
  const inactivityTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Record user activity and reset inactivity timer
  const recordActivity = React.useCallback(() => {
    // Clear existing timeout
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    // Set new timeout to lock after inactivity
    inactivityTimeoutRef.current = setTimeout(() => {
      setIsLocked(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  // Lock the app immediately (called on background)
  const lock = React.useCallback(async () => {
    // Try to prevent screenshots when locking (expo-screen-capture) if available
    try {
      // Dynamically import expo-screen-capture if available
      if (
        ScreenCapture &&
        typeof ScreenCapture.preventScreenCaptureAsync === "function"
      ) {
        await ScreenCapture.preventScreenCaptureAsync();
      }
    } catch {
      // Ignore if module not available
    }

    setIsLocked(true);
  }, []);

  // Attempt to unlock by checking the PIN against secure storage
  const unlockWithPinFn = React.useCallback(async (pin: string) => {
    // Verify wallet exists first
    const initialized = await isWalletInitialized();
    if (!initialized) {
      throw new Error("No wallet initialized");
    }

    // Attempt to derive MEK and decrypt private key (returns private key bytes)
    const privateKey = await unlockWithPin(pin);
    try {
      // If no error thrown, PIN is valid — immediately zero sensitive bytes
      if (privateKey && privateKey.length > 0) {
        // Zero the privateKey bytes immediately
        privateKey.fill(0);
      }
      setIsLocked(false);
      // Re-enable screen capture when unlocked (if supported)
      try {
        if (
          ScreenCapture &&
          typeof ScreenCapture.allowScreenCaptureAsync === "function"
        ) {
          await ScreenCapture.allowScreenCaptureAsync();
        }
      } catch {
        // ignore
      }
    } catch (err) {
      // Ensure buffer is zeroed even on error
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
      throw err;
    }
  }, []);

  // Attempt to unlock using biometric auth
  const unlockWithBiometricFn = React.useCallback(async () => {
    // Ensure wallet has biometric enabled
    const cfg = await getWalletConfig();
    if (!cfg.biometricEnabled) {
      throw new Error("Biometric unlock not enabled for this wallet");
    }

    const auth = await authenticateWithBiometric("Unlock your Zypp wallet");
    if (!auth.success) {
      throw new Error(auth.error || "Biometric authentication failed");
    }

    const biometricPin = await getBiometricPin();
    if (!biometricPin) {
      throw new Error(
        "Biometric PIN missing or wallet not configured for biometric unlock"
      );
    }

    // Use the biometric-only PIN to unlock
    const privateKey = await unlockWithPin(biometricPin);

    try {
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
      setIsLocked(false);
      // Re-enable screen capture when unlocked (if supported)
      try {
        if (
          ScreenCapture &&
          typeof ScreenCapture.allowScreenCaptureAsync === "function"
        ) {
          await ScreenCapture.allowScreenCaptureAsync();
        }
      } catch {
        // ignore
      }
    } catch (err) {
      if (privateKey && privateKey.length > 0) {
        privateKey.fill(0);
      }
      throw err;
    }
  }, []);

  // Callable method to refresh biometric availability on demand
  const refreshBiometricAvailability = React.useCallback(async () => {
    try {
      const status = await checkBiometricAvailability();
      const cfg = await getWalletConfig();
      setBiometricAvailable(
        status.available && status.enrolled && cfg.biometricEnabled
      );
    } catch {
      setBiometricAvailable(false);
    }
  }, []);

  // Compute biometric availability on mount and when explicitly refreshed
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status = await checkBiometricAvailability();
        const cfg = await getWalletConfig();
        if (!mounted) return;
        setBiometricAvailable(
          status.available && status.enrolled && cfg.biometricEnabled
        );
      } catch {
        if (!mounted) return;
        setBiometricAvailable(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refreshBiometricAvailability]);

  // Determine initial locked state based on presence of a wallet.
  // If no wallet is initialized, keep the app unlocked (no lock screen needed).
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initialized = await isWalletInitialized();
        // Also check whether a ZyppUser object exists (we treat wallet+user as a session)
        const u = await getUser();
        if (!mounted) return;
        // Lock only if both wallet and user exist
        setIsLocked(initialized && !!u ? true : false);
      } catch {
        if (!mounted) return;
        setIsLocked(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  // Listen to app state and lock when app backgrounds or becomes inactive
  React.useEffect(() => {
    const handleChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        setLastBackgroundAt(Date.now());
        lock();
      }
    };

    const sub = AppState.addEventListener("change", handleChange);
    return () => sub.remove();
  }, [lock]);

  const value = React.useMemo(
    () => ({
      isLocked,
      lock,
      unlockWithPin: unlockWithPinFn,
      unlockWithBiometric: unlockWithBiometricFn,
      biometricAvailable,
      refreshBiometricAvailability,
      lastBackgroundAt,
      recordActivity,
      inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS,
    }),
    [
      isLocked,
      lock,
      unlockWithPinFn,
      unlockWithBiometricFn,
      biometricAvailable,
      refreshBiometricAvailability,
      lastBackgroundAt,
      recordActivity,
    ]
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
};

export function useAppLock(): AppLockContextValue {
  const ctx = React.useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}

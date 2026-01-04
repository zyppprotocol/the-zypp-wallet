import useUser from "@/hooks/useUser";
import { useAppLock } from "@/lib/storage/app-lock";
import React from "react";
import { View } from "react-native";

interface Props {
  timeoutMs?: number | null; // optional override (ms); null => use user setting
  children?: React.ReactNode;
}

// Default inactivity timeout: 5 minutes
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

export const ActivityDetector: React.FC<Props> = ({
  timeoutMs = null,
  children,
}) => {
  const { lock } = useAppLock();
  const { user } = useUser();
  const timerRef = React.useRef<number | null>(null);
  const lastActivityRef = React.useRef<number>(Date.now());

  const resolvedTimeoutMs = React.useMemo<number | null>(() => {
    if (typeof timeoutMs === "number") return timeoutMs;
    const userTimeout = user?.settings?.autoLockTimeoutMs;
    if (typeof userTimeout === "number") return userTimeout;
    return DEFAULT_TIMEOUT;
  }, [timeoutMs, user?.settings?.autoLockTimeoutMs]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current as unknown as number);
      timerRef.current = null;
    }
  };

  const scheduleTimer = React.useCallback(() => {
    clearTimer();

    // If resolvedTimeoutMs is 0 => disabled
    if (resolvedTimeoutMs === 0 || resolvedTimeoutMs === null) return;

    timerRef.current = setTimeout(() => {
      // If timeout reached, lock the app
      lock();
    }, resolvedTimeoutMs) as unknown as number;
  }, [lock, resolvedTimeoutMs]);

  const handleActivity = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    scheduleTimer();
  }, [scheduleTimer]);

  React.useEffect(() => {
    // Start timer on mount or when the resolved timeout changes
    scheduleTimer();
    return () => clearTimer();
  }, [scheduleTimer]);

  return (
    <View
      style={{ flex: 1 }}
      // Capture touches at the top level
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => handleActivity()}
    >
      {children}
    </View>
  );
};

export default ActivityDetector;

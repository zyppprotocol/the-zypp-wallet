/**
 * Biometric Authentication Module
 *
 * Handles Face ID / Fingerprint integration for secure access
 * Biometric acts as a GATE to unlock stored PIN/key
 *
 * Flow:
 * 1. User presses "Authenticate"
 * 2. Device prompts biometric (Face ID / Fingerprint)
 * 3. If success → unlock wallet with stored PIN
 * 4. If failure → show retry or PIN fallback
 */

import * as LocalAuthentication from "expo-local-authentication";

// ============================================================================
// TYPES
// ============================================================================

export type BiometricType = "fingerprint" | "facial" | "iris" | "none";

export interface BiometricAuthStatus {
  available: boolean;
  enrolled: boolean;
  types: BiometricType[];
  securityLevel: "low" | "medium" | "high";
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometricUsed?: BiometricType;
}

// ============================================================================
// BIOMETRIC DETECTION
// ============================================================================

/**
 * Check biometric availability on device
 */
export async function checkBiometricAvailability(): Promise<BiometricAuthStatus> {
  try {
    // Check if biometric auth is available at all
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    // Get available types
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    // Map LocalAuthentication types to our types
    const biometricTypes: BiometricType[] = [];

    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricTypes.push("fingerprint");
    }
    if (
      types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ) {
      biometricTypes.push("facial");
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricTypes.push("iris");
    }

    return {
      available: compatible,
      enrolled: enrolled,
      types: biometricTypes,
      securityLevel: biometricTypes.length > 0 ? "high" : "low",
    };
  } catch (error) {
    console.error("Error checking biometric availability:", error);
    return {
      available: false,
      enrolled: false,
      types: [],
      securityLevel: "low",
    };
  }
}

/**
 * Authenticate user with biometric
 * Returns success/failure - actual wallet unlock happens elsewhere
 */
export async function authenticateWithBiometric(
  reason: string = "Unlock your wallet"
): Promise<BiometricAuthResult> {
  try {
    // Check if biometric is available
    const status = await checkBiometricAvailability();

    if (!status.available) {
      return {
        success: false,
        error: "Biometric authentication not available on this device",
      };
    }

    if (!status.enrolled) {
      return {
        success: false,
        error:
          "No biometric data enrolled. Please set up Face ID or Fingerprint.",
      };
    }

    // Attempt biometric authentication
    const authenticated = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: "Use PIN instead",
      disableDeviceFallback: false, // Allow fallback to PIN on device
    });

    if (authenticated.success) {
      // Determine which biometric was used (best guess based on device)
      let biometricUsed: BiometricType = "fingerprint";
      if (status.types.includes("facial")) {
        biometricUsed = "facial";
      }

      return {
        success: true,
        biometricUsed: biometricUsed,
      };
    } else {
      return {
        success: false,
        error: authenticated.error || "Biometric authentication failed",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown biometric error",
    };
  }
}

/**
 * Hook for using biometric auth in React components
 * (Placeholder - actual hook implementation depends on your state management)
 */
export function useBiometricAuth() {
  const authenticate = async () => {
    return authenticateWithBiometric("Authenticate to unlock wallet");
  };

  const checkAvailability = async () => {
    return checkBiometricAvailability();
  };

  return {
    authenticate,
    checkAvailability,
  };
}

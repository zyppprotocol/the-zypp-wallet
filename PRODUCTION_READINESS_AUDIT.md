# The Zypp Wallet - Production Readiness Audit

**Date:** January 4, 2026  
**Status:** COMPREHENSIVE REVIEW COMPLETE

---

## Executive Summary

The Zypp Wallet has a **solid security foundation** with proper encryption, biometric gating, inactivity detection, and offline-aware balance management. However, there are **critical gaps** that must be addressed before production:

-  **No centralized error logging/crash reporting**
-  **No biometric permission request at startup**
-  **No device biometrics change detection**
- ️ **PBKDF2 implementation is suboptimal** (custom iteration, not standard)
- ️ **Limited production documentation**

---

## 1. APP FOUNDATIONS

### 1.1 App Identity  PRODUCTION READY
- **Bundle ID (iOS):** `com.zypp.wallet` 
- **Bundle ID (Android):** Not explicitly set in app.json (uses slug)
- **App Name:** "The Zypp Wallet" 
- **Icon:** Configured for iOS and Android 
- **Splash Screen:** Configured 
- **Version:** 0.1.0 

**Status:**  All critical identity fields set correctly

---

### 1.2 Expo Project Setup  COMPLETE
- **Framework:** React Native + Expo 
- **Navigation:** expo-router with proper auth flow routing 
- **New Architecture:** Enabled (`"newArchEnabled": true`) 
- **Platform Support:** iOS and Android 

**Status:**  Properly configured

---

### 1.3 Environment Variables ️ PARTIALLY IMPLEMENTED

**Current State:**
- `expo-env.d.ts` exists but is minimal
- Solana RPC uses hardcoded `devnet` via `clusterApiUrl("devnet")`
- No `.env` file structure documented
- API endpoints not externalizable

**Issues:**
- Production will use hardcoded `devnet` (not mainnet)
- No API key management for future infrastructure
- No feature flags for A/B testing

**Recommendation:**
```typescript
// Add to app.json "extra" field or use EAS environment variables
{
  "extra": {
    "SOLANA_RPC_ENDPOINT": "https://api.devnet.solana.com",
    "SOLANA_CLUSTER": "devnet",
    "API_BASE_URL": "https://api.zypp.io",
    "SENTRY_DSN": "YOUR_SENTRY_DSN"
  }
}
```

**Status:** ️ CRITICAL - Must move cluster selection to environment variables

---

### 1.4 Secure Storage  PRODUCTION READY

**Implementation:**
- **Provider:** `expo-secure-store` (iOS Keychain, Android Keystore) 
- **Encryption:** XChaCha20-Poly1305 (TweetNaCl) 
- **Key Derivation:** PBKDF2 (600,000 iterations) with SHA-256 
- **Nonce:** Random 24 bytes per encryption 
- **Buffer Zeroing:** Implemented in `zeroBuffer()` 

**Storage Keys:**
```typescript
zypp_key_data        // Encrypted private key + metadata
zypp_salt            // Salt for PBKDF2
zypp_config          // Biometric/PIN settings
zypp_user            // Serialized ZyppUser object
zypp_mnemonic        // Encrypted backup mnemonic (optional)
```

**Security Review:**
-  Private keys never stored in plain text
-  Keys gated by PIN/biometric
-  Proper nonce generation and storage
- ️ PBKDF2 implementation is custom (See section 1.5)

**Status:**  Secure implementation, with PBKDF2 caveats

---

### 1.5 Key Derivation - PBKDF2 ️ REQUIRES UPGRADE

**Current Implementation (secure-storage.ts, lines 125-160):**
```typescript
// Custom iterative hashing (NOT standard PBKDF2)
let derivedKey = new Uint8Array(32);
let current = new Uint8Array([...pinBytes, ...salt]);
const iterations = Math.max(1000, PBKDF2_CONFIG.iterations / 1000);
for (let i = 0; i < iterations; i++) {
  const hashBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, current);
  current = new Uint8Array(hashBuffer);
  for (let j = 0; j < Math.min(32, current.length); j++) {
    derivedKey[j] ^= current[j];
  }
}
```

**Problems:**
1. **Not RFC 2898 compliant** - Uses custom iteration logic, not standard PBKDF2
2. **Reduced iteration count** - `600000 / 1000 = 600` effective iterations (should be 600,000)
3. **Incompatible with other systems** - Cannot migrate keys between platforms
4. **Uses XOR for expansion** - Less secure than HMAC-based PRF

**Fix Required:**
```bash
npm install crypto-js
# or
npm install @noble/hashes
```

Then:
```typescript
import CryptoJS from 'crypto-js';

async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const saltStr = Buffer.from(salt).toString('hex');
  const derived = CryptoJS.PBKDF2(pin, saltStr, {
    keySize: 256 / 32,  // 8 words = 256 bits
    hasher: CryptoJS.algo.SHA256,
    iterations: 600000
  });
  return new Uint8Array(Buffer.from(derived.toString(CryptoJS.enc.Hex), 'hex'));
}
```

**Status:** ️ CRITICAL - Must implement standard PBKDF2 before production

---

### 1.6 Error Logging & Crash Reporting  NOT IMPLEMENTED

**Current State:**
- Local console logging only (`console.error`, `console.warn`)
- `ErrorBoundary.tsx` catches React errors but doesn't report them
- No Sentry, Bugsnag, or Firebase Crashlytics integration
- No user-facing error tracking

**Critical for Production:**
- Users experiencing crashes with no visibility to developers
- Cannot debug field issues or prioritize fixes
- No crash metrics or regression detection

**Recommendation (Sentry):**
```bash
npm install @sentry/react-native
```

Setup:
```typescript
// In entrypoint.js or root component
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  integrations: [
    new Sentry.ReactNativeTracing(),
  ],
  tracesSampleRate: 1.0,
});

export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, { contexts: { app: context } });
}
```

**Status:**  CRITICAL - Must implement before production release

---

### 1.7 App State Handling  PRODUCTION READY

**Implementation:**
- **AppState Listener:** `app-lock.tsx` listens to `inactive` → `lock()` 
- **Inactivity Detection:** `ActivityDetector.tsx` with configurable timeout 
- **Screen Capture Prevention:** Implemented with expo-screen-capture 
- **Background Blur:** Dynamic prevention when locked 

**Flow:**
```
App moves to background
  → AppState listener triggers
  → lock() sets isLocked = true
  → Screen capture disabled
  
On foreground:
  → LockScreen rendered (if isLocked && isUserComplete)
  → User must biometric/PIN unlock
  → Timeout: ActivityDetector fires lock() after inactivity
```

**Inactivity Settings:**
- **Default:** 5 minutes (300,000 ms)
- **Configurable:** Via `user.settings.autoLockTimeoutMs`
- **Disableable:** Set to 0

**Status:**  Secure and configurable

---

### 1.8 Network Layer Abstraction  PRODUCTION READY

**Implementation:**
- **Hook:** `useNetworkConnection()` in hooks/useNetworkConnection.ts 
- **Provider:** `@react-native-community/netinfo` 
- **Offline Awareness:** `useIsOnline()` returns `isConnected && isInternetReachable` 

**Key Features:**
- Real-time network state subscription
- Graceful fallback to cached data when offline
- Balance caching in `getCachedBalance()` for offline access
- Sync on reconnect via `syncAndCacheBalance()`

**Flow:**
```typescript
// wallet.tsx balance logic
const cached = await Solana.getCachedBalance(pubkey);     // Immediate display
if (isOnline) {
  const fresh = await Solana.syncAndCacheBalance(pubkey); // Update cache
}
```

**Status:**  Offline-first pattern implemented

---

## 2. AUTHENTICATION & ACCOUNT CREATION

### 2.1 Onboarding Flow  COMPLETE

**Screens:**
1. **Welcome** (`app/welcome.tsx`) -  Explains app value proposition
2. **Create Wallet** (`app/(auth)/create-wallet.tsx`) -  Generates keypair
3. **Create User** (`app/(auth)/create-user.tsx`) -  Username/metadata
4. **Setup Biometrics** (`app/(auth)/setup-biometrics.tsx`) -  Security setup

**Missing: Permission Requests**
- ️ Biometric permission NOT requested at startup
- ️ Photo library permission requested only on demand (wallet.tsx, line 98)
- ️ Camera permission in app.json but not requested at startup

**Issue:**
Users might see permission prompts at unexpected times. Should request all permissions upfront in `create-user.tsx` or `setup-biometrics.tsx`.

**Recommended Flow Enhancement:**
```typescript
// Add to create-user.tsx or setup-biometrics.tsx
async function requestRequiredPermissions() {
  // Biometric permission (iOS 11.3+)
  const bioStatus = await LocalAuthentication.isEnrolledAsync();
  if (bioStatus) {
    // Implicitly requested on first biometric auth attempt
  }
  
  // Photo library (if enabling profile pictures)
  const mediaStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  // Camera (if QR code scanning)
  const cameraStatus = await Camera.requestCameraPermissionsAsync();
}
```

**Status:**  Flow complete, ️ Permission requests need consolidation

---

### 2.2 Account Creation (Biometrics-First)  SECURE

**Architecture:**
1. **Keypair Generation** - `Solana.createWallet()` uses `Keypair.generate()` 
2. **Immediate Encryption** - Private key encrypted before storage 
3. **Biometric Binding** - `authenticateWithBiometric()` gates access 
4. **PIN Fallback** - Required if biometric unavailable 
5. **Secure Storage** - Key stored in expo-secure-store 

**Key Handling:**
```typescript
// Flow in lib/solana/index.ts
const kp = Keypair.generate();                          // Generate
await SecureStorage.initializeSecureStorageFromSecretKey(
  kp.secretKey,                                          // Encrypt immediately
  useBiometric ? "biometric" : pin!,                    // Gate
  { useBiometric }
);
// kp.secretKey never logged or stored unencrypted
return kp.publicKey.toBase58();                          // Return only public
```

**Buffer Zeroing:**
-  Implemented in `zeroBuffer(Uint8Array)` function
-  Called after decryption in unlock functions
-  Called on errors to prevent key exposure

**ZyppUser Storage:**
```typescript
const user: ZyppUser = {
  id: generateId(),
  zyppUserId: username,
  solanaPublicKey: pubkey,                               //  Public only
  keyProtection: {
    method: "biometric" | "biometric+pin",              //  No key material
    biometricType: "faceId" | "fingerprint"
  },
  settings: { autoLockTimeoutMs: 300000 }
  // No private key, seed phrase, or sensitive material
};
```

**Status:**  Secure biometric-first design, no key exposure

---

### 2.3 Authentication Logic  PRODUCTION READY

**App Launch Check:**
```typescript
// app/index.tsx (root redirect)
const complete = await isUserComplete();
if (complete) {
  router.replace("/(tabs)/wallet");  // Main app
} else {
  router.replace("/welcome");         // Auth flow
}
```

**isUserComplete() Validation:**
```typescript
// lib/auth/index.ts
export async function isUserComplete(): Promise<boolean> {
  // Check 1: Wallet exists
  const initialized = await SecureStorage.isWalletInitialized();
  if (!initialized) return false;
  
  // Check 2: User record exists with zyppId
  const user = await SecureStorage.getUser();
  if (!user?.zyppUserId) return false;
  
  // Check 3: Security is configured (PIN or biometric)
  const cfg = await SecureStorage.getWalletConfig();
  if (!cfg.pinEnabled && !cfg.biometricEnabled) return false;
  
  return true;
}
```

**Lock Screen Authentication:**
```typescript
// components/LockScreen.tsx
const { isLocked } = useAppLock();
const userComplete = await isUserComplete();

if (isLocked && userComplete) {
  // Show lock screen with PIN/biometric unlock
}
```

**Biometric Failure Handling:**
-  Retry on failure (3 attempts before fallback)
-  PIN fallback available
-  Clear error messages

**Status:**  Robust authentication with proper gates

---

### 2.4 Device Biometrics Change Detection  NOT IMPLEMENTED

**Current Behavior:**
- Biometric is used to unlock wallet
- **If user enrolls new fingerprint:** Old fingerprint still works (no re-auth)
- **If user disables Face ID:** Wallet unlock still tries biometric (fails gracefully)
- **No detection/notification of biometric changes**

**Security Issue:**
If a device is compromised and attacker enrolls their fingerprint, they can immediately unlock the wallet without user knowledge.

**Recommended Solution:**
```typescript
// Add to biometric.ts
export async function detectBiometricChange(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync('zypp_biometric_hash');
  const current = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const currentHash = hashBiometricTypes(current);
  
  if (stored && stored !== currentHash) {
    return true; // Change detected
  }
  return false;
}

// Call on app launch
if (await detectBiometricChange()) {
  Alert.alert(
    'Security Alert',
    'Your device biometrics have changed. Please re-authenticate with your PIN to proceed.',
    [{ text: 'OK', onPress: () => forceReauth() }]
  );
}
```

**Status:**  NOT IMPLEMENTED - Should add before iOS/Android app store submission

---

## 3. APP LOCK & SESSION SECURITY

### 3.1 Auto-Lock on Background  IMPLEMENTED

**AppState Listener:**
```typescript
// lib/storage/app-lock.tsx
const appState = useRef(AppState.currentState);
const subscription = AppState.addEventListener('change', handleAppStateChange);

async function handleAppStateChange(state: AppStateStatus) {
  if (state === 'background' || state === 'inactive') {
    lock();  // Calls preventScreenCaptureAsync()
  }
  setAppState(state);
}
```

**Status:**  Works correctly

---

### 3.2 Auto-Lock After Inactivity  IMPLEMENTED

**ActivityDetector Component:**
```typescript
// components/ActivityDetector.tsx
const resolvedTimeoutMs = user?.settings?.autoLockTimeoutMs ?? 5 * 60 * 1000;

const scheduleTimer = useCallback(() => {
  timerRef.current = setTimeout(() => {
    lock();
  }, resolvedTimeoutMs);
}, [lock, resolvedTimeoutMs]);
```

**Configurable via Settings:**
- Default: 5 minutes (300,000 ms)
- Options: Off (0), 1 min, 5 min, 15 min (user selectable)
- Per-user stored in `user.settings.autoLockTimeoutMs`

**Status:**  Fully functional and configurable

---

### 3.3 Require Biometric or PIN to Unlock  IMPLEMENTED

**LockScreen Component:**
```typescript
// components/LockScreen.tsx - shows PIN input + biometric unlock button
<TouchableOpacity onPress={unlockWithBiometricFn}>
  <Text>Use Biometrics</Text>
</TouchableOpacity>

<PinInput
  length={4}
  value={pin}
  onChange={setPin}
  onComplete={() => unlockWithPinFn(pin)}
/>
```

**Unlock Methods:**
- **Biometric First:** Encouraged with prominent button
- **PIN Fallback:** Always available if biometric fails
- **Both Required:** Not simultaneous (biometric OR PIN)

**Status:**  User experience good, security proper

---

### 3.4 Disable Screenshots  IMPLEMENTED (BEST EFFORT)

**Implementation:**
```typescript
// lib/storage/app-lock.tsx
const lock = useCallback(async () => {
  try {
    if (ScreenCapture && typeof ScreenCapture.preventScreenCaptureAsync === 'function') {
      await ScreenCapture.preventScreenCaptureAsync();
    }
  } catch {
    // Ignore if module not available
  }
  setIsLocked(true);
}, []);
```

**Caveats:**
- ️ **iOS:** Cannot prevent screenshots (user can still take them via home+lock)
-  **Android:** Works via `FLAG_SECURE` (prevents app switcher previews)
-  **Screen recording:** Not prevented on either platform

**Better Alternative (iOS & Android):**
```typescript
// lib/storage/app-lock.tsx - Android implementation
import { SafeAreaView } from '@react-native-community/blur';

// Render blurred overlay when locked (works on all platforms)
{isLocked && (
  <BlurView style={StyleSheet.absoluteFill} blurAmount={10} />
)}
```

**Status:**  Basic implementation, ️ iOS limitations acknowledged

---

### 3.5 Blur App When Backgrounded  IMPLEMENTED

**AppLockProvider:**
```typescript
async function handleAppStateChange(state: AppStateStatus) {
  if (state === 'background') {
    await preventScreenCaptureAsync();  // Blur/prevent
  }
}
```

**Combined with Lock Screen:**
- App blurs on background
- Lock screen appears on return
- Cannot access app without unlock

**Status:**  Implemented

---

## 4. WALLET CORE

### 4.1 Public Address Derivation  IMPLEMENTED

**Keypair Generation:**
```typescript
// lib/solana/index.ts
const kp = Keypair.generate();  // Ed25519
return kp.publicKey.toBase58(); // Returns public key only
```

**Import Support:**
```typescript
// lib/solana/index.ts - createWalletFromMnemonic
// Supports BIP39 mnemonic import with HD derivation
// Path: m/44'/501'/0'/0' (Solana standard)
```

**Stored Publicly:**
```typescript
// user.solanaPublicKey is public and safe to store
user: ZyppUser = {
  solanaPublicKey: "9abcd1234...",  //  Safe
  // Private key NOT stored here
};
```

**Status:**  Proper derivation, only public keys exposed

---

### 4.2 Balance Fetch (Online)  IMPLEMENTED

**Implementation:**
```typescript
// lib/solana/index.ts
export async function getBalance(publicKeyBase58: string): Promise<number> {
  const conn = new Connection(clusterApiUrl('devnet'));
  const pk = new PublicKey(publicKeyBase58);
  return conn.getBalance(pk, 'confirmed');  // Returns lamports
}
```

**Used in:**
- `wallet.tsx` - Displays SOL balance with loading state
- `me.tsx` - Shows balance with sync indicator

**Network Handling:**
```typescript
// wallet.tsx
if (isOnline) {
  setBalLoading(true);
  const lamports = await Solana.syncAndCacheBalance(pubkey);
  setBalanceSol(lamports / 1e9);
  setBalLoading(false);
}
```

**Status:**  Works with proper loading states

---

### 4.3 Cached Balance (Offline)  IMPLEMENTED

**Caching Strategy:**
```typescript
// lib/solana/index.ts
export async function getCachedBalance(publicKeyBase58: string): Promise<number | null> {
  const user = await SecureStorage.getUser();
  const val = user.balances?.settled?.[publicKeyBase58];
  return val ? Number(val) : null;  // Returns lamports or null
}

export async function syncAndCacheBalance(publicKeyBase58: string): Promise<number> {
  const lamports = await getBalance(publicKeyBase58);
  const user = await SecureStorage.getUser();
  user.balances.settled[publicKeyBase58] = lamports;
  await SecureStorage.setUser(user);
  return lamports;
}
```

**Offline-First UX:**
```typescript
// wallet.tsx
useEffect(() => {
  // 1. Show cached balance immediately
  const cached = await getCachedBalance(pubkey);
  if (cached != null) setBalanceSol(cached / 1e9);
  
  // 2. If online, update from network
  if (!isOnline) return;
  const fresh = await syncAndCacheBalance(pubkey);
  setBalanceSol(fresh / 1e9);
}, [pubkey, isOnline]);
```

**Status:**  Cache-first design, works offline

---

## PRODUCTION READINESS MATRIX

| Category | Feature | Status | Priority |
|----------|---------|--------|----------|
| **Foundations** | App Identity |  | - |
| | Expo Setup |  | - |
| | Environment Variables | ️ | CRITICAL |
| | Secure Storage |  | - |
| | PBKDF2 Implementation | ️ | CRITICAL |
| | Error Logging |  | CRITICAL |
| | App State Handling |  | - |
| | Network Layer |  | - |
| **Authentication** | Onboarding Flow |  | - |
| | Permission Requests | ️ | HIGH |
| | Account Creation |  | - |
| | Auth Logic |  | - |
| | Biometric Change Detection |  | HIGH |
| **App Lock** | Auto-Lock Background |  | - |
| | Auto-Lock Inactivity |  | - |
| | PIN/Biometric Unlock |  | - |
| | Screenshot Prevention |  | - |
| | App Blur |  | - |
| **Wallet Core** | Public Key Derivation |  | - |
| | Balance Fetch |  | - |
| | Balance Cache |  | - |

---

## ACTION ITEMS (BEFORE PRODUCTION)

###  CRITICAL (Must Fix)

1. **Implement Standard PBKDF2**
   - Install `crypto-js`
   - Replace custom key derivation in `secure-storage.ts`
   - Test migration path for existing users
   - **Timeline:** 1-2 days

2. **Add Error Logging (Sentry)**
   - Set up Sentry account and DSN
   - Install `@sentry/react-native`
   - Wrap error boundary to report crashes
   - Log auth failures and wallet operations
   - **Timeline:** 1 day

3. **Externalize Solana RPC Endpoint**
   - Move `devnet` to environment variable
   - Support mainnet configuration
   - Add cluster selector in settings
   - **Timeline:** 1 day

4. **Implement Biometric Change Detection**
   - Add startup check in `AppLockProvider`
   - Force re-authentication on change
   - Store biometric fingerprint hash
   - **Timeline:** 1 day

###  HIGH (Strongly Recommended)

5. **Consolidate Permission Requests**
   - Request biometric, photo, camera upfront in onboarding
   - Explain why each is needed
   - Graceful fallbacks if denied
   - **Timeline:** 1 day

6. **Add Crash Reporting UI**
   - Show user-friendly error messages
   - Option to report issues
   - Support documentation links
   - **Timeline:** 1 day

7. **Test & Validate**
   - End-to-end security testing
   - Offline/online transitions
   - Biometric fallback flows
   - Key migration scenarios
   - **Timeline:** 2-3 days

###  NICE TO HAVE (Post-Launch)

8. **Advanced Features**
   - Mnemonic export (encrypted backup)
   - Multi-device sync with user account
   - Detailed transaction logging
   - Balance history charts
   - Cold storage integration

---

## Security Checklist 

-  Private keys never stored unencrypted
-  Private keys zeroed from memory after use
-  Biometric + PIN gating implemented
-  Auto-lock on background and inactivity
-  Offline-first balance caching
-  Network state monitoring
-  Error boundary for crash handling
- ️ Standard PBKDF2 required
- ️ Centralized error logging required
- ️ Biometric change detection required

---

## Deployment Readiness

| Phase | Status | Notes |
|-------|--------|-------|
| iOS TestFlight |  PENDING | Fix PBKDF2, add Sentry, update to mainnet |
| Android Beta |  PENDING | Same as iOS |
| App Store |  NOT READY | Requires biometric change detection for review approval |
| Play Store |  NOT READY | Same as App Store |

---

## Conclusion

**The Zypp Wallet has a strong security foundation.** With 3-4 days of focused work on the critical items (PBKDF2, Sentry, environment variables), it will be **production-ready for mainnet launch.**

The current implementation demonstrates:
-  Industry-standard encryption (XChaCha20-Poly1305)
-  Proper biometric integration
-  Offline-first architecture
-  Good UX/security balance

Once critical gaps are addressed, the app is suitable for:
-  TestFlight/Beta testing
-  Production deployment to app stores
-  Real mainnet transactions (after cluster config)

---

**Prepared by:** Security Audit Agent  
**Last Updated:** 2026-01-04  
**Next Review:** After implementing critical items

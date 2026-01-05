# Phase 10: Quick Reference

## What Was Implemented

✅ **BLE Advertising on App Init**: When user opens the app, device automatically starts advertising via Bluetooth so other devices can discover and send transactions to them.

✅ **Receive Transaction Modal**: When a transaction arrives via BLE or NFC, a modal pops up showing:

- Who sent it (sender's Zypp User ID)
- How much (amount + token, e.g., "100 USDC")
- When it arrived (timestamp)
- How it came (Bluetooth or NFC)
- Optional note from sender (memo)

✅ **Accept/Reject**: User can tap Accept (queues transaction for broadcast) or Reject (dismisses it)

✅ **Offline-First**: Transactions stored locally and broadcast when network becomes available

## Files Modified

### 1. app/\_layout.tsx

- **What**: Added BLE advertising on app startup
- **When**: Runs when fonts finish loading (app initializes)
- **How**: Calls `startBLEAdvertising()` automatically
- **Cleanup**: Calls `stopBLEAdvertising()` when app closes

### 2. app/(tabs)/receive.tsx

- **What**: Integrated receive flow into Receive screen
- **UI**: Shows address + QR code (unchanged) + new modal for incoming transactions
- **Modal**: Displays transaction details and Accept/Reject buttons
- **Handler**: Queues accepted transactions in offline storage

### 3. lib/solana/receive-listener.ts

- **Already created**: No changes needed
- **Provides**: Functions for BLE advertising and listening
- **Used by**: \_layout.tsx and receive.tsx

## How It Works (User's Perspective)

1. User opens Zypp app
   - App automatically starts advertising via BLE
   - Other users can now find this device

2. Another user sends transaction via Zypp
   - Sender finds this device in BLE list
   - Sender enters amount and chooses BLE/NFC as delivery method
   - Transaction is sent

3. This device receives transaction
   - Modal pops up showing transaction details
   - User reviews sender, amount, token, memo

4. User accepts transaction
   - Transaction is queued locally
   - Modal closes
   - Transaction broadcasts when network available

5. Transaction appears in activity/history
   - Shows pending → confirmed status

## Key Functions

```typescript
// In app/_layout.tsx - Automatic startup
startBLEAdvertising(); // Runs on app init
stopBLEAdvertising(); // Runs on app close

// In app/(tabs)/receive.tsx - Screen lifecycle
startBLEAdvertising(); // Starts when screen mounts
stopBLEAdvertising(); // Stops when screen unmounts
startNFCListening(); // Enables NFC tap detection
stopNFCListening(); // Disables NFC tap detection

// In app/(tabs)/receive.tsx - User actions
handleAcceptTransaction(); // Queues transaction
handleRejectTransaction(); // Dismisses modal
```

## Integration Points

### receive-listener.ts → receive.tsx

- Provides: `startBLEAdvertising()`, `stopBLEAdvertising()`, etc.
- Provides: `ReceivedTransaction` type

### receive.tsx → offline-queue.ts

- Calls: `queueOfflineTransaction()` when user accepts
- Passes: Transaction intent with all required fields

### receive-listener.ts → receive-validator.ts

- Uses: `validateReceivedIntent()` for security checks
- Ensures: Only valid transactions reach user

## Testing

### Manual Testing Checklist

- [ ] App opens and BLE advertising starts (check console logs)
- [ ] Receive screen shows address + QR code
- [ ] Navigate away from Receive screen - BLE advertising stops
- [ ] Navigate back to Receive screen - BLE advertising resumes
- [ ] Simulate incoming BLE transaction - modal appears
- [ ] Simulate incoming NFC transaction - modal appears
- [ ] Accept transaction - modal closes, transaction queued
- [ ] Reject transaction - modal closes, no transaction queued

### Console Logs to Look For

```
[BLE] Starting BLE advertising...
[BLE] Current state: PoweredOn
[BLE] BLE advertising active
[NFC] NFC listening active
[BLE] Received chunk: X bytes
[BLE] Received complete transaction
```

## Error Handling

- **BLE fails**: Error logged, app continues (doesn't crash)
- **NFC fails**: Error logged, app continues
- **Queue fails**: User sees alert "Failed to queue transaction"
- **Validation fails**: Transaction rejected silently, console logged

## What's NOT Done Yet (Phase 11)

- Activity screen showing transaction history
- Retry failed transactions
- Push notifications for incoming transactions
- Blockchain confirmation status tracking
- Cancel in-flight transactions

## Files to Check if Issues Arise

1. `lib/solana/receive-listener.ts` - Core receive infrastructure
2. `app/(tabs)/receive.tsx` - UI and accept/reject logic
3. `app/_layout.tsx` - App initialization
4. `lib/storage/offline-queue.ts` - Transaction storage
5. `lib/solana/receive-validator.ts` - Security validation

## Success Indicators

- ✅ No TypeScript errors in receive.tsx, \_layout.tsx, receive-listener.ts
- ✅ App opens without crashing
- ✅ BLE logs appear in console
- ✅ Receive screen still shows address + QR
- ✅ No unhandled promise rejections

## Notes

- BLE advertising defaults to "available" in dev mode (no real hardware needed)
- NFC listening defaults to "available" in dev mode
- Real BLE/NFC requires actual devices or iOS/Android simulators with BLE support
- Transactions validated through 20+ security checks before showing user
- All data encrypted and signed - validated before acceptance

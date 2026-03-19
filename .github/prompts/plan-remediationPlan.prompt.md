# Zypp Wallet Remediation Plan

## Whitepaper vs. Implementation Audit

---

## Executive Summary

**Current Status**: Phase 1 (95%) | Phase 2 (0%) | Phase 3 (0%)

The Zypp Wallet has solid offline-first infrastructure but **fails to deliver on Phase 2/3 promises** in the whitepaper. Critical gaps include missing relayer integration, iOS wallet adapter breakage, incomplete DeFi support, and devnet-only architecture.

---

## Critical Gaps Summary

### 🔴 Blocking Issues (Phase 2 & 3)

| Gap                     | Severity | Impact                                                           | Current     |
| ----------------------- | -------- | ---------------------------------------------------------------- | ----------- |
| **Relayer Integration** | CRITICAL | "Improved reliability" promised; requires relayer infrastructure | 0% done     |
| **iOS Wallet Adapter**  | CRITICAL | MWA v2.2.5 not supported; manual address entry only              | Broken stub |
| **Mainnet Support**     | CRITICAL | Devnet hardcoded; production impossibility                       | ~20% done   |
| **DeFi Execution**      | HIGH     | Yields/lending marked "not yet implemented"                      | 33% done    |
| **Phase 3 UX**          | MEDIUM   | "Advanced offline/online transitions" not started                | 0% done     |

---

## Detailed Remediation Plan

### Priority 1: Foundation (Blocks Everything Else)

#### 1.1 Mainnet Support Architecture

**Goal**: Remove devnet hardcoding; enable network selection

**Files to modify**:

- [lib/solana/index.ts](lib/solana/index.ts) — Add `NETWORK` config (mainnet/devnet/testnet)
- [lib/supabase.ts](lib/supabase.ts) — Network-aware environment URLs
- Create `lib/config/network.ts` — Centralized network configuration

**Implementation**:

```typescript
// lib/config/network.ts
export const NETWORK_CONFIG = {
  mainnet: { rpc: "...", cluster: "mainnet-beta" },
  devnet: { rpc: "...", cluster: "devnet" },
};
export const CURRENT_NETWORK = process.env.EXPO_PUBLIC_NETWORK || "devnet";
```

**Effort**: 4 hours

**Blockers**: None

**Testing**: Verify transactions work on devnet → mainnet testnet

---

#### 1.2 iOS Wallet Adapter Implementation

**Goal**: Restore iOS wallet connection; fallback to manual entry

**Current Problem**: Mobile Wallet Adapter v2.2.5 not supported on iOS (stuck at [lib/solana/wallet-adapter.ios.ts](lib/solana/wallet-adapter.ios.ts))

**Solution Options**:

1. **Option A (Recommended)**: Implement WalletConnect v2 bridge
   - Supports iOS/Android equally
   - Better UX (QR code scanning)
   - Effort: 8 hours
2. **Option B**: Use web3-modal (Reown stack)
   - More mature ecosystem
   - Non-custodial relayer
   - Effort: 6 hours

3. **Option C**: Continue manual entry + QR code recipient lookup
   - Status quo (interim)
   - Effort: 0 hours

**Recommend**: Option B (WalletConnect v2) + fallback to manual entry

**Files involved**:

- [lib/solana/wallet-adapter.ios.ts](lib/solana/wallet-adapter.ios.ts) — Replace Alert stub
- [lib/solana/wallet-adapter.tsx](lib/solana/wallet-adapter.tsx) — Unified adapter
- [app/(auth)/create-wallet.tsx](<app/(auth)/create-wallet.tsx>) — UX updates

**Effort**: 8 hours

**Blockers**: Requires WalletConnect v2 SDK research

---

### Priority 2: Phase 2 Relayer Infrastructure

#### 2.1 Relayer Service Design

**Goal**: Architect relayer integration for Phase 2 promise: "Optional integration with Zypp Relayer Network"

**Create**: `lib/relayer/` directory structure

**Components**:

```
lib/relayer/
  ├── relayer-client.ts       # API client for relayer network
  ├── relayer-types.ts        # Types & interfaces
  ├── relayer-fallback.ts     # Fallback routing logic
  ├── relayer-queue.ts        # Local queue for relayer-routed txs
  └── relayer-config.ts       # Endpoints & auth
```

**Key Decisions**:

- Single relayer or pool? (Recommend: Pool for redundancy)
- Fee model? (Recommend: Per-broadcast or subscription-based)
- Retry policy? (Recommend: 3 attempts across relayers with exponential backoff)
- Signature verification? (Recommend: Signed requests with HMAC)

**Effort**: 16 hours (design + implementation)

**Dependencies**:

- Define Relayer API spec first
- Require relayer infrastructure (out of scope here)

---

#### 2.2 Improve Transaction Broadcasting Reliability

**Goal**: Integrate relayer fallback into [lib/solana/transaction-broadcaster.ts](lib/solana/transaction-broadcaster.ts)

**Current Flow**:

```
Send to RPC → Retry 5x (exponential backoff) → Fail
```

**Desired Flow**:

```
Send to Primary RPC
  → Retry 3x
  → Fall back to Relayer Network (if configured)
    → Retry across 3 relayers in pool
  → Fall back to secondary RPC
  → Fail
```

**Code Changes**:

- Modify `broadcastTransaction()` to accept `useRelayer?: boolean`
- Add relayer retry loop with fee tracking
- Update [lib/sync/sync-manager.ts](lib/sync/sync-manager.ts) to sync relayer status
- Log broadcaster metrics (RPC vs relayer success rate)

**Effort**: 6 hours

---

#### 2.3 Relayer Fee Collection & Accounting

**Goal**: Track relayer fees separately from subscription fees

**Database Changes** (Supabase):

```sql
ALTER TABLE transactions ADD COLUMN (
  relayer_used BOOLEAN DEFAULT false,
  relayer_fee_amount BIGINT,
  relayer_endpoint TEXT,
  broadcaster_status TEXT
);
```

**Code**:

- [lib/subscription/index.ts](lib/subscription/index.ts) — Add relayer fee tracking
- [lib/sync/migration.sql](lib/sync/migration.sql) — Add relayer columns

**Effort**: 4 hours

---

### Priority 3: Complete DeFi Execution

#### 3.1 Yield Protocol Integration

**Goal**: Replace "not yet implemented" stub with actual Solend/Marinade integration

**Current Status**: [lib/defi/defi-executor.ts](lib/defi/defi-executor.ts) returns error for yields

**Options**:

1. **Solend** (Lending protocol) — Also covers yields via deposit interest
2. **Marinade** (Liquid staking) — Yield via SOL staking delegates
3. **Both** (Recommended) — More options for users

**Implementation**:

```typescript
// lib/defi/yield-executor.ts
export async function executeYieldDeposit(params) {
  if (params.protocol === "solend") {
    return await depositToSolend(params);
  } else if (params.protocol === "marinade") {
    return await depositToMarinade(params);
  }
  // ...
}
```

**Files to create**:

- `lib/defi/solend-executor.ts`
- `lib/defi/marinade-executor.ts`
- Update `lib/defi/defi-executor.ts` to call them

**Effort**: 12 hours (per protocol)

**Dependencies**: Protocol RPC endpoints, contract ABIs

---

#### 3.2 Lending Protocol Integration

**Goal**: Replace lending TODO stub with Margin Finance or Solend borrow/repay

**Current Status**: [lib/defi/defi-executor.ts](lib/defi/defi-executor.ts) marked "TODO: Integrate with Solend/MarginFi"

**Recommendation**: Solend (also covers lending + yields)

**Implementation**:

- `lib/defi/solend-borrow-executor.ts` — Borrow logic
- `lib/defi/solend-repay-executor.ts` — Repay logic
- Add collateral validation, LTV checks

**Effort**: 10 hours (both borrow + repay)

---

### Priority 4: Advanced UX & Phase 3 Features

#### 4.1 Phase 3: Advanced Offline/Online Transitions

**Goal**: Enhance UX for switching between offline and online states

**Current**: Basic network icon + pending queue display

**Enhancements**:

1. **Transaction Status Dashboard**
   - Real-time sync progress
   - Estimated confirmation time
   - Relayer status (if Phase 2 enabled)
   - Files: [app/activity.tsx](app/activity.tsx), [components/ActivityDetector.tsx](components/ActivityDetector.tsx)

2. **Offline Mode Indicators**
   - Persistent banner showing "You're offline"
   - Actions available while offline (create, sign)
   - Actions blocked (submit, confirm)
   - Files: Create `components/OfflineModeBanner.tsx`

3. **Smart Re-submission**
   - Auto-retry failed transactions with exponential backoff
   - User control (retry all, clear queue, etc.)
   - Files: [hooks/useSyncPendingTransactions.ts](hooks/useSyncPendingTransactions.ts)

**Effort**: 10 hours

---

#### 4.2 Developer SDK & Documentation

**Goal**: Publish Zypp Wallet integrations for third-party developers

**Deliverables**:

1. Export public API from [lib/wallet/index.ts](lib/wallet/index.ts)
2. Document:
   - Offline transaction creation
   - Local signing workflow
   - Integration with relay network
3. Create `sdk/` package with TypeScript types
4. Example apps (React Native, Next.js)

**Files to create**:

- `sdk/index.ts` — Public API
- `sdk/types.ts` — Exported types
- `README_SDK.md` — Developer guide
- `examples/react-native-integration.md`

**Effort**: 12 hours

---

## Implementation Roadmap

### Week 1: Foundation (Priority 1)

- **Mon–Tue**: Mainnet support architecture (4h)
- **Wed–Fri**: iOS Wallet Adapter fix (8–12h)

### Week 2: Phase 2 (Priority 2)

- **Mon–Wed**: Relayer design + API client (8h)
- **Thu–Fri**: Broadcasting reliability + fees (10h)

### Week 3: DeFi (Priority 3)

- **Mon–Tue**: Yield executor (Solend + Marinade) (12h)
- **Wed–Fri**: Lending executor (Solend borrow/repay) (10h)

### Week 4: UX & SDK (Priority 4)

- **Mon–Wed**: Phase 3 UX enhancements (10h)
- **Thu–Fri**: Developer SDK & docs (8h)

**Total Effort**: ~90–110 hours (~2.5 weeks at 40h/week)

---

## Risk Assessment

| Risk                                 | Likelihood | Impact              | Mitigation                                  |
| ------------------------------------ | ---------- | ------------------- | ------------------------------------------- |
| Relayer infrastructure unavailable   | HIGH       | Phase 2 blocked     | Build relayer mock; plan Phase 2 later      |
| iOS WalletConnect integration delays | MEDIUM     | iOS users stuck     | Keep manual entry as fallback               |
| Solend/Marinade API changes          | LOW        | DeFi broken         | Use versioned endpoints; add error handling |
| Devnet-mainnet data incompatibility  | MEDIUM     | Production failures | Test on testnet before mainnet deploy       |

---

## Success Criteria

| Criterion                          | Pass/Fail             |
| ---------------------------------- | --------------------- |
| Mainnet transactions working       | ✅ Required           |
| iOS wallet connection functional   | ✅ Required           |
| DeFi yields executable             | ✅ Required           |
| Relayer fallback responding        | ✅ Required (Phase 2) |
| Offline queue syncing on reconnect | ✅ Already working    |
| SDK published & documented         | ✅ Required (Phase 3) |

---

## Open Questions

1. **Relayer Infrastructure**: Will Zypp Labs operate the relayer network, or is it community-operated?
2. **Mainnet Timeline**: When should mainnet launch? (Affects Priority 1 urgency)
3. **DeFi Scope**: Which protocols are prioritized? (Solend, Lending, Marinade?)
4. **Phase 2/3 Commitment**: Are these phases being pursued, or deprioritized?
5. **iOS vs Android**: Equal support priority, or Android-first?

---

## Conclusion

The Zypp Wallet has a strong foundation for offline-first payments. Remediation is straightforward but requires:

- **4 weeks** to close major gaps (mainnet, iOS, relayer, DeFi)
- **Prioritization**: Phase 1 refinement → Phase 2 relayer → Phase 3 SDK
- **Clear product direction**: Commitment to Phase 2/3 or pivot to Phase 1 + selective DeFi

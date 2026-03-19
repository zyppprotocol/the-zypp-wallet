import NetInfo from '@react-native-community/netinfo';
import { OfflineTransactionQueue } from '../storage/offline-queue';
import { SecureStorage } from '../storage/secure-storage';
import type { ZyppUser } from '../storage/types';
import { supabase } from '../supabase';
import { log } from '../utils/logger';

/**
 * SyncManager
 * Orchestrates synchronization between local SecureStorage and remote Supabase.
 */
export class SyncManager {
  private static instance: SyncManager;
  private isSyncing: boolean = false;

  private constructor() {
    this.setupListeners();
    // Trigger initial sync to catch any pending data from previous sessions
    this.syncAll().catch((err) => {
      console.error("Initial sync failed:", err);
      log.error("Initial sync failed", err);
    });
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Listen for network changes to trigger sync.
   */
  private setupListeners() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        log.info('[SyncManager] Online - triggering sync...');
        this.syncAll();
      }
    });
  }

  /**
   * Check if network is available before syncing
   */
  private async isNetworkAvailable(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.isInternetReachable === true;
    } catch {
      return false;
    }
  }

  /**
   * Sync everything (User + Transactions)
   */
  public async syncAll() {
    if (this.isSyncing) return;
    
    // Check network before attempting sync
    const isOnline = await this.isNetworkAvailable();
    if (!isOnline) {
      log.info('[SyncManager] Offline - skipping sync');
      return;
    }
    
    this.isSyncing = true;
    
    try {
      await Promise.all([
        this.syncUser(),
        this.syncTransactions()
      ]);
    } catch (err) {
      log.error('[SyncManager] Sync failed', err);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Manual Sync Trigger
   */
  public async forceSync() {
    log.info('[SyncManager] manual sync triggered.');
    return this.syncAll();
  }

  /**
   * Push local user record to cloud.
   */
  public async syncUser() {
    try {
      // Double-check network before making request
      const isOnline = await this.isNetworkAvailable();
      if (!isOnline) {
        log.info('[SyncManager] User sync skipped - offline');
        return;
      }

      const user = await SecureStorage.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from('users')
        .upsert({
          zypp_user_id: user.zyppUserId,
          solana_public_key: user.solanaPublicKey,
          external_wallet_address: user.externalWalletAddress,
          profile_image_url: user.profileImageUrl,
          settings: user.settings,
          balances: user.balances,
          device_info: user.device,
          status: user.status,
          // Subscription data
          subscription_tier: user.subscription.tier,
          transaction_count: user.subscription.transactionCount,
          last_reset_date: user.subscription.lastResetDate,
          subscription_start_date: user.subscription.startDate,
          subscription_end_date: user.subscription.endDate || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'solana_public_key' });

      if (error) throw error;
      log.info('[SyncManager] User synced', { userId: user.zyppUserId });
    } catch (err) {
      // Check if it's a network error - log as warning instead of error
      const isNetworkError = err instanceof Error && 
        (err.message.includes('Network request failed') || 
         err.message.includes('network') ||
         err.message.includes('fetch'));
      
      if (isNetworkError) {
        log.warn('[SyncManager] User sync failed - network error (expected when offline)', err);
      } else {
        log.error('[SyncManager] User sync failed', err);
      }
    }
  }


  private async syncTransactions() {
    try {
      // Double-check network before making request
      const isOnline = await this.isNetworkAvailable();
      if (!isOnline) {
        log.info('[SyncManager] Transaction sync skipped - offline');
        return;
      }

      const user = await SecureStorage.getUser();
      if (!user) return;

      const txs = await OfflineTransactionQueue.getPendingTransactions();
      if (txs.length === 0) return;

      const records = txs.map(tx => ({
        zypp_user_id: user.zyppUserId,
        intent_id: tx.id,
        type: tx.type,
        sender: tx.sender,
        recipient: tx.recipient,
        amount: tx.amount.toString(),
        token: tx.token,
        status: tx.status,
        signature: tx.signature,
        onchain_signature: tx.onchainSignature,
        encrypted_payload: tx.encryptedPayload,
        // Fee fields
        fee_amount: tx.feeAmount?.toString() || null,
        fee_percentage: tx.feePercentage || null,
        fee_capped: tx.feeCapped || false,
        subscription_tier: tx.subscriptionTier || null,
        // DeFi fields
        defi_protocol: tx.defiProtocol || null,
        defi_action: tx.defiAction || null,
        created_at: new Date(tx.createdAt).toISOString(),
      }));

      const { error } = await supabase
        .from('transactions')
        .upsert(records, { onConflict: 'intent_id' });

      if (error) throw error;
      log.info(`[SyncManager] ${records.length} transactions synced.`);
    } catch (err) {
      // Check if it's a network error - log as warning instead of error
      const isNetworkError = err instanceof Error && 
        (err.message.includes('Network request failed') || 
         err.message.includes('network') ||
         err.message.includes('fetch'));
      
      if (isNetworkError) {
        log.warn('[SyncManager] Transaction sync failed - network error (expected when offline)', err);
      } else {
        log.error('[SyncManager] Transaction sync failed', err);
      }
    }
  }


  public async recoverProfile(zyppUserId: string) {
    log.info('[SyncManager] Attempting recovery', { zyppUserId });
    
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('zypp_user_id', zyppUserId)
        .single();

      if (userError || !userData) throw new Error('User not found in cloud.');


      const recoveredUser: ZyppUser = {
        id: userData.id,
        zyppUserId: userData.zypp_user_id,
        solanaPublicKey: userData.solana_public_key,
        externalWalletAddress: userData.external_wallet_address,
        profileImageUrl: userData.profile_image_url,
        settings: userData.settings,
        balances: userData.balances,
        device: userData.device_info,
        status: userData.status,
        keyProtection: {
          method: 'biometric+pin', // Fallback
          biometricType: 'unknown',
        },
        secureStorage: {
          provider: 'expo-secure-store',
          keyAlias: 'zypp_key_data',
          createdAt: Date.now(),
        },
      };

      return recoveredUser;
    } catch (err) {
      log.error('[SyncManager] Recovery failed', err, { zyppUserId });
      throw err;
    }
  }
}

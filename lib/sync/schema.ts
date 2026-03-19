import { jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * USERS TABLE
 * Mirrors the ZyppUser interface for cloud persistence and recovery.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  zyppUserId: text('zypp_user_id').notNull().unique(), // The username/handle for recovery
  solanaPublicKey: text('solana_public_key').notNull().unique(),
  externalWalletAddress: text('external_wallet_address'),
  profileImageUrl: text('profile_image_url'),
  
  // Storing complex objects as JSONB for flexibility
  settings: jsonb('settings').notNull(),
  balances: jsonb('balances').notNull(),
  deviceInfo: jsonb('device_info').notNull(),
  
  status: text('status', { enum: ['active', 'locked', 'suspended'] }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * TRANSACTIONS TABLE
 * Mirrors the TransactionIntent interface to keep a history of all user activities.
 */
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  
  intentId: text('intent_id').notNull(), // Local ID
  type: text('type').notNull(), // payment, swap, etc.
  sender: text('sender').notNull(),
  recipient: text('recipient').notNull(),
  amount: numeric('amount').notNull(),
  token: text('token').notNull(),
  
  status: text('status').notNull(),
  signature: text('signature'), // On-chain signature once confirmed
  onchainSignature: text('onchain_signature'),
  
  encryptedPayload: text('encrypted_payload'),
  metadata: jsonb('metadata'), // For extra logs or memo
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

-- USERS TABLE
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zypp_user_id TEXT NOT NULL UNIQUE,
  solana_public_key TEXT NOT NULL UNIQUE,
  external_wallet_address TEXT,
  profile_image_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  balances JSONB NOT NULL DEFAULT '{}',
  device_info JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active',
  -- Subscription fields
  subscription_tier TEXT DEFAULT 'basic',
  transaction_count INTEGER DEFAULT 0,
  last_reset_date BIGINT,
  subscription_start_date BIGINT,
  subscription_end_date BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRANSACTIONS TABLE
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zypp_user_id TEXT REFERENCES users(zypp_user_id),
  intent_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL,
  signature TEXT,
  onchain_signature TEXT,
  encrypted_payload TEXT,
  metadata JSONB DEFAULT '{}',
  -- Fee fields
  fee_amount TEXT,
  fee_percentage NUMERIC,
  fee_capped BOOLEAN,
  subscription_tier TEXT,
  -- DeFi fields
  defi_protocol TEXT,
  defi_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ENABLE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;

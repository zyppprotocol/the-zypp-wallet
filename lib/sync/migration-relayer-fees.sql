-- Migration: Add relayer fee tracking to transactions table
-- This migration adds columns to track relayer submissions and fees separately from app fees

-- Add relayer-specific columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS relayer_used BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS relayer_fee_amount TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS relayer_endpoint TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS relayer_request_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS broadcaster_status TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS submission_attempts INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_submission_time TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS first_submission_time TIMESTAMPTZ;

-- Create index for faster querying of relayer transactions
CREATE INDEX IF NOT EXISTS idx_transactions_relayer_used ON transactions(relayer_used);
CREATE INDEX IF NOT EXISTS idx_transactions_broadcaster_status ON transactions(broadcaster_status);
CREATE INDEX IF NOT EXISTS idx_transactions_relayer_endpoint ON transactions(relayer_endpoint);

-- Create relayer fees tracking table
CREATE TABLE IF NOT EXISTS relayer_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zypp_user_id TEXT REFERENCES users(zypp_user_id),
  transaction_id UUID REFERENCES transactions(id),
  relayer_endpoint TEXT NOT NULL,
  fee_amount TEXT NOT NULL,
  currency TEXT DEFAULT 'lamports',
  status TEXT DEFAULT 'pending', -- pending, confirmed, failed, refunded
  payment_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for relayer fees
CREATE INDEX IF NOT EXISTS idx_relayer_fees_user ON relayer_fees(zypp_user_id);
CREATE INDEX IF NOT EXISTS idx_relayer_fees_transaction ON relayer_fees(transaction_id);
CREATE INDEX IF NOT EXISTS idx_relayer_fees_status ON relayer_fees(status);
CREATE INDEX IF NOT EXISTS idx_relayer_fees_endpoint ON relayer_fees(relayer_endpoint);

-- Create monthly relayer cost analysis table for billing
CREATE TABLE IF NOT EXISTS relayer_cost_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zypp_user_id TEXT REFERENCES users(zypp_user_id),
  month DATE NOT NULL,
  relayer_endpoint TEXT,
  total_submissions INTEGER DEFAULT 0,
  successful_submissions INTEGER DEFAULT 0,
  failed_submissions INTEGER DEFAULT 0,
  total_fees_paid TEXT,
  average_fee_per_submission TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(zypp_user_id, month, relayer_endpoint)
);

-- Create index for cost summaries
CREATE INDEX IF NOT EXISTS idx_relayer_cost_user ON relayer_cost_summary(zypp_user_id);
CREATE INDEX IF NOT EXISTS idx_relayer_cost_month ON relayer_cost_summary(month);

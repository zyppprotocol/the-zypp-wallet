-- Migration V2: Add Subscription and DeFi Support
-- This migration adds subscription and DeFi-related columns to existing tables
-- Run this in Supabase SQL Editor if you already have users and transactions tables

-- Add subscription fields to users table (if they don't exist)
DO $$ 
BEGIN
    -- Add subscription_tier column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'subscription_tier') THEN
        ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'basic';
    END IF;

    -- Add transaction_count column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'transaction_count') THEN
        ALTER TABLE users ADD COLUMN transaction_count INTEGER DEFAULT 0;
    END IF;

    -- Add last_reset_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_reset_date') THEN
        ALTER TABLE users ADD COLUMN last_reset_date BIGINT;
    END IF;

    

    -- Add subscription_start_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'subscription_start_date') THEN
        ALTER TABLE users ADD COLUMN subscription_start_date BIGINT;
    END IF;

    -- Add subscription_end_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'subscription_end_date') THEN
        ALTER TABLE users ADD COLUMN subscription_end_date BIGINT;
    END IF;
END $$;

-- Add fee and DeFi fields to transactions table (if they don't exist)
DO $$ 
BEGIN
    -- Add fee_amount column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'fee_amount') THEN
        ALTER TABLE transactions ADD COLUMN fee_amount TEXT;
    END IF;

    -- Add fee_percentage column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'fee_percentage') THEN
        ALTER TABLE transactions ADD COLUMN fee_percentage NUMERIC;
    END IF;

    -- Add fee_capped column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'fee_capped') THEN
        ALTER TABLE transactions ADD COLUMN fee_capped BOOLEAN;
    END IF;

    -- Add subscription_tier column to transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'subscription_tier') THEN
        ALTER TABLE transactions ADD COLUMN subscription_tier TEXT;
    END IF;

    -- Add defi_protocol column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'defi_protocol') THEN
        ALTER TABLE transactions ADD COLUMN defi_protocol TEXT;
    END IF;

    -- Add defi_action column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'defi_action') THEN
        ALTER TABLE transactions ADD COLUMN defi_action TEXT;
    END IF;
END $$;

-- Update existing users to have default subscription values
UPDATE users 
SET 
    subscription_tier = COALESCE(subscription_tier, 'basic'),
    transaction_count = COALESCE(transaction_count, 0),
    last_reset_date = COALESCE(last_reset_date, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
WHERE subscription_tier IS NULL OR transaction_count IS NULL OR last_reset_date IS NULL;

/**
 * Environment Validation Tests
 */

import { validateEnvironment } from '../env-validation';

// Mock logger to avoid console output in tests
jest.mock('../logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate when all required env vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_KEY = 'test-key';

    const result = validateEnvironment();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.config.supabaseUrl).toBe('https://test.supabase.co');
    expect(result.config.supabaseKey).toBe('test-key');
  });

  it('should fail when Supabase URL is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_KEY = 'test-key';

    const result = validateEnvironment();

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('should fail when Supabase key is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.EXPO_PUBLIC_SUPABASE_KEY;

    const result = validateEnvironment();

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('EXPO_PUBLIC_SUPABASE_KEY');
  });

  it('should fail when Supabase URL has invalid format', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'invalid-url';
    process.env.EXPO_PUBLIC_SUPABASE_KEY = 'test-key';

    const result = validateEnvironment();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid Supabase URL'))).toBe(true);
  });

  it('should warn when optional env vars are missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_KEY = 'test-key';
    delete process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;

    const result = validateEnvironment();

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at app startup
 * Fails fast with clear error messages if critical config is missing
 */

import { logger } from './logger';

interface EnvConfig {
  supabaseUrl: string;
  supabaseKey: string;
  solanaRpcUrl?: string;
  sentryDsn?: string;
}

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = {
  EXPO_PUBLIC_SUPABASE_URL: 'Supabase URL',
  EXPO_PUBLIC_SUPABASE_KEY: 'Supabase API Key',
} as const;

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  config: EnvConfig;
  errors: string[];
  warnings: string[];
}

/**
 * Validate environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || '';

  if (!supabaseUrl || supabaseUrl.trim() === '') {
    errors.push(`Missing required environment variable: ${REQUIRED_ENV_VARS.EXPO_PUBLIC_SUPABASE_URL}`);
  } else if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    errors.push(`Invalid Supabase URL format: ${supabaseUrl}`);
  }

  if (!supabaseKey || supabaseKey.trim() === '') {
    errors.push(`Missing required environment variable: ${REQUIRED_ENV_VARS.EXPO_PUBLIC_SUPABASE_KEY}`);
  }

  // Check optional variables
  const solanaRpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
  if (!solanaRpcUrl) {
    warnings.push('EXPO_PUBLIC_SOLANA_RPC_URL not set, will use default devnet endpoint');
  }

  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!sentryDsn) {
    warnings.push('EXPO_PUBLIC_SENTRY_DSN not set, error tracking will be disabled in production');
  }

  const config: EnvConfig = {
    supabaseUrl: supabaseUrl.trim(),
    supabaseKey: supabaseKey.trim(),
    solanaRpcUrl: solanaRpcUrl?.trim(),
    sentryDsn: sentryDsn?.trim(),
  };

  return {
    valid: errors.length === 0,
    config,
    errors,
    warnings,
  };
}

/**
 * Initialize and validate environment on app startup
 * Call this in your root layout or entry point
 */
export function initializeEnvironment(): EnvConfig {
  const result = validateEnvironment();

  // Log warnings (non-critical)
  if (result.warnings.length > 0) {
    logger.warn('Environment validation warnings:', undefined, {
      warnings: result.warnings,
    });
  }

  // Log errors and throw if critical config is missing
  if (result.errors.length > 0) {
    const errorMessage = `Environment validation failed:\n${result.errors.join('\n')}`;
    logger.error('Environment validation failed', new Error(errorMessage), {
      errors: result.errors,
      warnings: result.warnings,
    });

    // In development, show helpful error
    if (__DEV__) {
      console.error('\n❌ ENVIRONMENT CONFIGURATION ERROR ❌');
      console.error(errorMessage);
      console.error('\nPlease check your .env file or environment variables.\n');
    }

    // In production, throw to prevent app from running with invalid config
    throw new Error(errorMessage);
  }

  logger.info('Environment validation passed', {
    hasSolanaRpc: !!result.config.solanaRpcUrl,
    hasSentry: !!result.config.sentryDsn,
  });

  return result.config;
}

/**
 * Get validated environment config (throws if not initialized)
 */
let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = initializeEnvironment();
  }
  return cachedConfig;
}

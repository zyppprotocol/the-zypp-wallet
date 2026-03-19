/**
 * Logger Utility
 * 
 * Provides unified logging that:
 * - Always logs to console in development
 * - Sends errors/warnings to Sentry in production
 * - Keeps console logs in production for debugging (can be disabled)
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const IS_DEV = __DEV__;
const IS_PRODUCTION = !IS_DEV;

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: any;
}

/**
 * Logger class that handles both console and Sentry logging
 */
class Logger {
  private sentryEnabled: boolean;

  constructor() {
    // Check if Sentry DSN is configured
    this.sentryEnabled = IS_PRODUCTION && !!Constants.expoConfig?.extra?.sentry?.dsn;
  }

  /**
   * Log debug messages (dev only)
   * ALWAYS logs to console, sends to Sentry in production
   */
  debug(message: string, context?: LogContext): void {
    // ALWAYS log to console
    console.log(`[DEBUG] ${message}`, context || '');
    
    // Send to Sentry in production (if enabled)
    if (this.sentryEnabled && !IS_DEV) {
      Sentry.addBreadcrumb({
        message,
        level: 'debug',
        data: context,
      });
    }
  }

  /**
   * Log info messages
   * ALWAYS logs to console, sends to Sentry in production
   */
  info(message: string, context?: LogContext): void {
    // ALWAYS log to console
    console.log(`[INFO] ${message}`, context || '');

    // Send to Sentry in production (if enabled)
    if (this.sentryEnabled && !IS_DEV) {
      Sentry.addBreadcrumb({
        message,
        level: 'info',
        data: context,
      });
    }
  }

  /**
   * Log warnings
   * ALWAYS logs to console, sends to Sentry in production
   */
  warn(message: string, error?: Error | unknown, context?: LogContext): void {
    // ALWAYS log to console
    if (error) {
      console.warn(`[WARN] ${message}`, error, context || '');
    } else {
      console.warn(`[WARN] ${message}`, context || '');
    }

    // Send to Sentry in production
    if (this.sentryEnabled) {
      Sentry.addBreadcrumb({
        message,
        level: 'warning',
        data: context,
      });

      if (error instanceof Error) {
        Sentry.captureException(error, {
          level: 'warning',
          tags: context,
        });
      } else if (error) {
        Sentry.captureMessage(`${message}: ${String(error)}`, {
          level: 'warning',
          tags: context,
        });
      }
    }
  }

  /**
   * Log errors
   * ALWAYS logs to console, sends to Sentry in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    // ALWAYS log to console
    if (error) {
      console.error(`[ERROR] ${message}`, error, context || '');
    } else {
      console.error(`[ERROR] ${message}`, context || '');
    }

    // Send to Sentry in production
    if (this.sentryEnabled) {
      Sentry.addBreadcrumb({
        message,
        level: 'error',
        data: context,
      });

      if (error instanceof Error) {
        Sentry.captureException(error, {
          level: 'error',
          tags: context,
          extra: {
            message,
            ...context,
          },
        });
      } else if (error) {
        Sentry.captureMessage(`${message}: ${String(error)}`, {
          level: 'error',
          tags: context,
        });
      } else {
        Sentry.captureMessage(message, {
          level: 'error',
          tags: context,
        });
      }
    }
  }

  /**
   * Set user context for Sentry
   */
  setUser(userId?: string, email?: string, username?: string): void {
    if (this.sentryEnabled) {
      Sentry.setUser({
        id: userId,
        email,
        username,
      });
    }
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    if (this.sentryEnabled) {
      Sentry.setUser(null);
    }
  }

  /**
   * Add breadcrumb for debugging
   * ALWAYS logs to console, sends to Sentry in production
   */
  breadcrumb(message: string, category?: string, data?: LogContext): void {
    // ALWAYS log to console (both dev and prod)
    console.log(`[BREADCRUMB] ${category || 'default'}: ${message}`, data || '');

    // Send to Sentry in production (if enabled)
    if (this.sentryEnabled) {
      Sentry.addBreadcrumb({
        message,
        category: category || 'default',
        data,
      });
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, error?: Error | unknown, context?: LogContext) => 
    logger.warn(message, error, context),
  error: (message: string, error?: Error | unknown, context?: LogContext) => 
    logger.error(message, error, context),
  setUser: (userId?: string, email?: string, username?: string) => 
    logger.setUser(userId, email, username),
  clearUser: () => logger.clearUser(),
  breadcrumb: (message: string, category?: string, data?: LogContext) => 
    logger.breadcrumb(message, category, data),
};

/**
 * Sentry Initialization
 * 
 * Configures Sentry for error tracking in production
 * Only initializes if DSN is provided
 */

import * as Sentry from '@sentry/react-native';

/**
 * Initialize Sentry for error tracking
 * 
 * NOTE: This must be called BEFORE importing logger to avoid circular dependencies
 */
export function initializeSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  // Only initialize in production and if DSN is provided
  if (__DEV__ || !dsn) {
    if (!dsn && __DEV__) {
      console.log('[Sentry] DSN not provided, error tracking disabled');
    } else if (__DEV__) {
      console.log('[Sentry] Disabled in development mode');
    }
    return;
  }

  try {
    Sentry.init({
      dsn,
      debug: false, // Set to true to see Sentry debug logs
      environment: __DEV__ ? 'development' : 'production',
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000, // 30 seconds
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      beforeSend(event, hint) {
        // Filter out non-critical errors in production
        // You can customize this to filter specific errors
        return event;
      },
      integrations: [
        new Sentry.ReactNativeTracing({
          // Configure tracing
          enableNativeFramesTracking: true,
          enableStallTracking: true,
        }),
      ],
    });

    if (__DEV__) {
      console.log('[Sentry] Initialized successfully');
    }
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
}

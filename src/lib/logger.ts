/**
 * Logger utility for conditional logging based on environment
 * Only logs in development mode to keep production console clean
 */

const isDev = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// Флаг для полного отключения debug логов (даже в dev)
// Установите VITE_ENABLE_DEBUG_LOGS=true в .env для включения
const isDebugEnabled = import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true';

export const logger = {
  /**
   * Debug logs - only in development and if explicitly enabled
   */
  debug: (...args: any[]) => {
    if (isDev && isDebugEnabled) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info logs - only in development
   */
  info: (...args: any[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Warning logs - only in development
   */
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Error logs - always logged (including production)
   * Should be used for actual errors that need to be tracked
   */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
    
    // In production, you could send to error tracking service
    if (isProduction) {
      // TODO: Send to Sentry/LogRocket/etc
      // sendToErrorTracking(...args);
    }
  },

  /**
   * Performance timing logs - only in development
   */
  time: (label: string) => {
    if (isDev) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (isDev) {
      console.timeEnd(label);
    }
  },
};

/**
 * Application constants
 */

export const CURRENCIES = {
  RUB: 'RUB',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  JPY: 'JPY',
  CNY: 'CNY',
  KRW: 'KRW',
  GEL: 'GEL',
  AMD: 'AMD',
} as const;

export type Currency = typeof CURRENCIES[keyof typeof CURRENCIES];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  GEL: '₾',
  AMD: '֏',
};

export const DEFAULT_CURRENCY: Currency = 'RUB';

/**
 * Allocation types for categories
 */
export const ALLOCATION_TYPES = {
  AMOUNT: 'amount',
  PERCENT: 'percent',
} as const;

export type AllocationType = typeof ALLOCATION_TYPES[keyof typeof ALLOCATION_TYPES];

/**
 * Category budget status
 */
export const BUDGET_STATUS = {
  EXCELLENT: 'excellent',  // < 50% used
  NORMAL: 'normal',        // 50-70% used
  WARNING: 'warning',      // 70-90% used
  CRITICAL: 'critical',    // > 90% used
  EXCEEDED: 'exceeded',    // Over budget
} as const;

export type BudgetStatus = typeof BUDGET_STATUS[keyof typeof BUDGET_STATUS];

/**
 * Transaction types
 */
export const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

/**
 * Date formats
 */
export const DATE_FORMATS = {
  DISPLAY: 'dd MMMM yyyy',
  ISO: 'yyyy-MM-dd',
  SHORT: 'dd.MM.yyyy',
} as const;

/**
 * Query keys for React Query
 */
export const QUERY_KEYS = {
  INCOMES: 'incomes',
  EXPENSES: 'expenses',
  CATEGORIES: 'categories',
  INCOME_SOURCES: 'income_sources',
  USER: 'user',
  FAMILY: 'family',
} as const;

/**
 * Cache times (in milliseconds)
 */
export const CACHE_TIMES = {
  SHORT: 30 * 1000,      // 30 seconds
  MEDIUM: 5 * 60 * 1000,  // 5 minutes
  LONG: 30 * 60 * 1000,   // 30 minutes
} as const;

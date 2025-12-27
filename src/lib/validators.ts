/**
 * Validation utilities for budget calculations
 */

/**
 * Validates if a number is a valid amount (positive, finite, not NaN)
 */
export const validateAmount = (amount: number): boolean => {
  return !isNaN(amount) && isFinite(amount) && amount >= 0;
};

/**
 * Safely converts a value to a number, returning 0 if invalid
 */
export const safeNumber = (value: any): number => {
  const num = Number(value);
  return validateAmount(num) ? num : 0;
};

/**
 * Validates if a percentage is valid (0-100)
 */
export const validatePercentage = (percentage: number): boolean => {
  return validateAmount(percentage) && percentage <= 100;
};

/**
 * Safely divides two numbers, returning 0 if division by zero
 */
export const safeDivide = (numerator: number, denominator: number): number => {
  if (denominator === 0 || !validateAmount(denominator)) {
    return 0;
  }
  const result = numerator / denominator;
  return validateAmount(result) ? result : 0;
};

/**
 * Calculates percentage safely
 */
export const safePercentage = (part: number, whole: number): number => {
  return safeDivide(part * 100, whole);
};

/**
 * Validates currency code
 */
export const validateCurrency = (currency: string): boolean => {
  const validCurrencies = ['RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'];
  return validCurrencies.includes(currency);
};

/**
 * Gets valid currency or default
 */
export const getValidCurrency = (currency: string | undefined, defaultCurrency: string = 'RUB'): string => {
  return currency && validateCurrency(currency) ? currency : defaultCurrency;
};

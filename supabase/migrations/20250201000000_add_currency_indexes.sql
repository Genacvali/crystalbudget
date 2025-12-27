-- Add indexes for currency fields to optimize multi-currency queries
-- This migration improves performance for currency-filtered queries

-- Incomes table indexes
CREATE INDEX IF NOT EXISTS idx_incomes_currency_user_date 
ON incomes(currency, user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_incomes_user_currency 
ON incomes(user_id, currency) 
WHERE currency IS NOT NULL;

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS idx_expenses_currency_user_date 
ON expenses(currency, user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_currency 
ON expenses(user_id, currency) 
WHERE currency IS NOT NULL;

-- Category allocations table indexes
CREATE INDEX IF NOT EXISTS idx_category_allocations_currency 
ON category_allocations(currency, category_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_incomes_user_source_currency 
ON incomes(user_id, source_id, currency, date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_category_currency 
ON expenses(user_id, category_id, currency, date DESC);

-- Add comments for documentation
COMMENT ON INDEX idx_incomes_currency_user_date IS 'Optimizes multi-currency income queries filtered by user and date';
COMMENT ON INDEX idx_expenses_currency_user_date IS 'Optimizes multi-currency expense queries filtered by user and date';
COMMENT ON INDEX idx_category_allocations_currency IS 'Optimizes category allocation queries by currency';
COMMENT ON INDEX idx_incomes_user_source_currency IS 'Optimizes income queries by user, source, and currency';
COMMENT ON INDEX idx_expenses_user_category_currency IS 'Optimizes expense queries by user, category, and currency';

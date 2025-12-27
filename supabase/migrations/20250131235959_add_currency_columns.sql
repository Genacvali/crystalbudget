-- CRITICAL: Add currency columns to incomes and expenses tables
-- This migration must be applied BEFORE other 202502* migrations
-- Otherwise new functions will fail

-- Add currency column to incomes
ALTER TABLE public.incomes 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RUB';

-- Add currency column to expenses
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RUB';

-- Add check constraints for valid currencies
ALTER TABLE public.incomes 
ADD CONSTRAINT check_incomes_currency 
CHECK (currency IN ('RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'));

ALTER TABLE public.expenses 
ADD CONSTRAINT check_expenses_currency 
CHECK (currency IN ('RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'));

-- Update existing records to have RUB currency (default)
UPDATE public.incomes SET currency = 'RUB' WHERE currency IS NULL;
UPDATE public.expenses SET currency = 'RUB' WHERE currency IS NULL;

-- Make currency NOT NULL (after setting defaults)
ALTER TABLE public.incomes ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN currency SET NOT NULL;

-- Comments
COMMENT ON COLUMN public.incomes.currency IS 'Currency code for this income (RUB, USD, EUR, etc.)';
COMMENT ON COLUMN public.expenses.currency IS 'Currency code for this expense (RUB, USD, EUR, etc.)';

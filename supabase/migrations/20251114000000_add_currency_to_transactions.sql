-- Add currency column to expenses and incomes tables
-- Default to RUB for existing records to maintain backward compatibility

-- Add currency to expenses
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB';

-- Add currency to incomes
ALTER TABLE public.incomes 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB';

-- Add check constraint to ensure valid currency codes
ALTER TABLE public.expenses 
ADD CONSTRAINT expenses_currency_check 
CHECK (currency IN ('RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'));

ALTER TABLE public.incomes 
ADD CONSTRAINT incomes_currency_check 
CHECK (currency IN ('RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'));

-- Create index for better query performance when filtering by currency
CREATE INDEX IF NOT EXISTS idx_expenses_currency ON public.expenses(currency);
CREATE INDEX IF NOT EXISTS idx_incomes_currency ON public.incomes(currency);

-- Add comment for documentation
COMMENT ON COLUMN public.expenses.currency IS 'Currency code for the expense amount (ISO 4217)';
COMMENT ON COLUMN public.incomes.currency IS 'Currency code for the income amount (ISO 4217)';


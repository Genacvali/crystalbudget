-- Add currency column to category_allocations table
ALTER TABLE public.category_allocations 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB';

-- Add check constraint to ensure valid currency codes
ALTER TABLE public.category_allocations 
ADD CONSTRAINT category_allocations_currency_check 
CHECK (currency IN ('RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'GEL', 'AMD'));

-- Add comment for documentation
COMMENT ON COLUMN public.category_allocations.currency IS 'Currency code for the allocation (ISO 4217)';


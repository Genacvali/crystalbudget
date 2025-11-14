-- Fix unique constraint in category_allocations to include currency
-- This allows multiple allocations from the same source in different currencies

-- Drop the old unique constraint
ALTER TABLE public.category_allocations 
DROP CONSTRAINT IF EXISTS category_allocations_category_id_income_source_id_key;

-- Add new unique constraint that includes currency
ALTER TABLE public.category_allocations 
ADD CONSTRAINT category_allocations_category_source_currency_key 
UNIQUE(category_id, income_source_id, currency);

-- Add comment for documentation
COMMENT ON CONSTRAINT category_allocations_category_source_currency_key 
ON public.category_allocations IS 
'Ensures unique allocation per category, source, and currency combination';


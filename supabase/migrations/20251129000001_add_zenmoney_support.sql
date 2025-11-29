-- Add zenmoney_id columns to support ZenMoney integration
-- This allows mapping ZenMoney categories and transactions to CrystalBudget entities

-- Add zenmoney_id to categories table
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS zenmoney_id TEXT;

-- Add zenmoney_id to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS zenmoney_id TEXT;

-- Add zenmoney_id to incomes table
ALTER TABLE public.incomes 
ADD COLUMN IF NOT EXISTS zenmoney_id TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_zenmoney_id ON public.categories(zenmoney_id) WHERE zenmoney_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_zenmoney_id ON public.expenses(zenmoney_id) WHERE zenmoney_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incomes_zenmoney_id ON public.incomes(zenmoney_id) WHERE zenmoney_id IS NOT NULL;

-- Create unique constraint to prevent duplicate zenmoney transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_zenmoney_unique 
ON public.expenses(user_id, zenmoney_id) 
WHERE zenmoney_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_incomes_user_zenmoney_unique 
ON public.incomes(user_id, zenmoney_id) 
WHERE zenmoney_id IS NOT NULL;


-- Make category_id nullable in expenses table to support uncategorized transactions
ALTER TABLE public.expenses ALTER COLUMN category_id DROP NOT NULL;

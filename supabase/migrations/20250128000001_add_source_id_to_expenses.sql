-- Add source_id column to expenses table
-- This allows tracking which income source was used for the expense
-- NULL means the expense should be distributed proportionally (default behavior)

ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.income_sources(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_source_id ON public.expenses(source_id);

-- Add comment for documentation
COMMENT ON COLUMN public.expenses.source_id IS 'Optional income source for the expense. If NULL, expense is distributed proportionally across all sources funding the category.';


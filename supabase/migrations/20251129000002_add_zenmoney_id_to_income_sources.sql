-- Add zenmoney_id to income_sources table to support mapping ZenMoney income categories/tags
ALTER TABLE public.income_sources 
ADD COLUMN IF NOT EXISTS zenmoney_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_income_sources_zenmoney_id ON public.income_sources(zenmoney_id) WHERE zenmoney_id IS NOT NULL;


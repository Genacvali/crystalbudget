-- Create category_allocations table for multiple income source allocations per category
CREATE TABLE public.category_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  income_source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('amount', 'percent')),
  allocation_value NUMERIC NOT NULL CHECK (allocation_value >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category_id, income_source_id)
);

-- Enable RLS
ALTER TABLE public.category_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for category_allocations
CREATE POLICY "Users can view allocations for their categories"
ON public.category_allocations
FOR SELECT
USING (
  category_id IN (
    SELECT id FROM public.categories WHERE user_id = auth.uid() OR is_family_member(auth.uid(), user_id)
  )
);

CREATE POLICY "Users can create allocations for their categories"
ON public.category_allocations
FOR INSERT
WITH CHECK (
  category_id IN (
    SELECT id FROM public.categories WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update allocations for their categories"
ON public.category_allocations
FOR UPDATE
USING (
  category_id IN (
    SELECT id FROM public.categories WHERE user_id = auth.uid() OR is_family_member(auth.uid(), user_id)
  )
);

CREATE POLICY "Users can delete allocations for their categories"
ON public.category_allocations
FOR DELETE
USING (
  category_id IN (
    SELECT id FROM public.categories WHERE user_id = auth.uid() OR is_family_member(auth.uid(), user_id)
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_category_allocations_updated_at
BEFORE UPDATE ON public.category_allocations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
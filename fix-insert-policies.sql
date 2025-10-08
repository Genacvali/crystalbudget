-- Fix INSERT policies to check user_id
-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can create their own income sources" ON public.income_sources;
DROP POLICY IF EXISTS "Users can create their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;

-- Recreate with proper WITH CHECK clause
CREATE POLICY "Users can create their own categories"
ON public.categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create their own income sources"
ON public.income_sources
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create their own incomes"
ON public.incomes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create their own expenses"
ON public.expenses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

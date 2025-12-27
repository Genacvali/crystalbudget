-- Fix RLS policies for incomes and expenses to support family access
-- Allows family members to view each other's transactions

-- ============================================
-- INCOMES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can create their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can update their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can delete their own incomes" ON public.incomes;

-- Create new policies with family support

-- SELECT: View own + family incomes
CREATE POLICY "Users can view their own and family incomes"
    ON public.incomes FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        -- Family owner can see member incomes
        user_id IN (
            SELECT fm.user_id 
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE f.owner_id = auth.uid()
        )
        OR
        -- Family members can see owner and other member incomes
        user_id IN (
            SELECT f.owner_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE fm.user_id = auth.uid()
            UNION
            SELECT fm2.user_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            JOIN family_members fm2 ON fm2.family_id = f.id
            WHERE fm.user_id = auth.uid()
        )
    );

-- INSERT: Can only create own incomes
CREATE POLICY "Users can create their own incomes"
    ON public.incomes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Can only update own incomes
CREATE POLICY "Users can update their own incomes"
    ON public.incomes FOR UPDATE
    USING (auth.uid() = user_id);

-- DELETE: Can only delete own incomes
CREATE POLICY "Users can delete their own incomes"
    ON public.incomes FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- EXPENSES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

-- CREATE new policies with family support

-- SELECT: View own + family expenses
CREATE POLICY "Users can view their own and family expenses"
    ON public.expenses FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        -- Family owner can see member expenses
        user_id IN (
            SELECT fm.user_id 
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE f.owner_id = auth.uid()
        )
        OR
        -- Family members can see owner and other member expenses
        user_id IN (
            SELECT f.owner_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE fm.user_id = auth.uid()
            UNION
            SELECT fm2.user_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            JOIN family_members fm2 ON fm2.family_id = f.id
            WHERE fm.user_id = auth.uid()
        )
    );

-- INSERT: Can only create own expenses
CREATE POLICY "Users can create their own expenses"
    ON public.expenses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Can only update own expenses
CREATE POLICY "Users can update their own expenses"
    ON public.expenses FOR UPDATE
    USING (auth.uid() = user_id);

-- DELETE: Can only delete own expenses
CREATE POLICY "Users can delete their own expenses"
    ON public.expenses FOR DELETE
    USING (auth.uid() = user_id);

-- Comments
COMMENT ON POLICY "Users can view their own and family incomes" ON public.incomes 
IS 'Allows users to view their own incomes and incomes of their family members';

COMMENT ON POLICY "Users can view their own and family expenses" ON public.expenses 
IS 'Allows users to view their own expenses and expenses of their family members';

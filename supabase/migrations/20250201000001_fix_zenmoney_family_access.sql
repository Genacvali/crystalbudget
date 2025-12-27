-- Fix RLS policies for zenmoney_accounts to support family access
-- Allow users to view ZenMoney accounts of their family members

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own zenmoney accounts" ON zenmoney_accounts;

-- Create new policy that allows family access
CREATE POLICY "Users can view their own and family zenmoney accounts"
    ON zenmoney_accounts FOR SELECT
    USING (
        -- User can see their own accounts
        auth.uid() = user_id
        OR
        -- User can see accounts of family members if they're family owner
        user_id IN (
            SELECT fm.user_id 
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE f.owner_id = auth.uid()
        )
        OR
        -- User can see accounts of family owner and other members if they're family member
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

COMMENT ON POLICY "Users can view their own and family zenmoney accounts" ON zenmoney_accounts IS 'Allows users to view their own ZenMoney accounts and accounts of their family members';


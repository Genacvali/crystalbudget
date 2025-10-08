-- Update SELECT policy for family_invite_codes to allow authenticated users to read invite codes
DROP POLICY IF EXISTS "Users can view codes for their family" ON public.family_invite_codes;

CREATE POLICY "Authenticated users can view valid invite codes"
ON public.family_invite_codes
FOR SELECT
TO authenticated
USING (
  -- Users can view codes if they are valid and not expired
  expires_at > now() AND used_by IS NULL
  -- Or if they are the creator or family member
  OR family_id IN (
    SELECT family_id FROM public.family_members WHERE user_id = auth.uid()
  )
  OR family_id IN (
    SELECT id FROM public.families WHERE owner_id = auth.uid()
  )
);
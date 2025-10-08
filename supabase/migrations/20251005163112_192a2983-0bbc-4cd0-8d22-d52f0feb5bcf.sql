-- Add policy to allow users to join family with valid invite code
CREATE POLICY "Users can join family with valid invite code"
ON public.family_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.family_invite_codes
    WHERE family_invite_codes.family_id = family_members.family_id
      AND family_invite_codes.used_by IS NULL
      AND family_invite_codes.expires_at > now()
  )
  AND auth.uid() = family_members.user_id
);
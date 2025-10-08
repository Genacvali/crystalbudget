-- Add policy for family owners to update family members
CREATE POLICY "Family owners can update members"
ON public.family_members
FOR UPDATE
USING (
  family_id IN (
    SELECT id FROM public.families WHERE owner_id = auth.uid()
  )
);
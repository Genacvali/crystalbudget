-- 1) Helper function to avoid recursive RLS on family_members
CREATE OR REPLACE FUNCTION public.has_family_access(_user_id uuid, _family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.families f WHERE f.id = _family_id AND f.owner_id = _user_id)
  ) OR (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.family_id = _family_id AND fm.user_id = _user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_family_access(uuid, uuid) TO authenticated;

-- 2) Replace the recursive SELECT policy on family_members
DROP POLICY IF EXISTS "Users can view members of their family" ON public.family_members;

CREATE POLICY "Users can view members of their family"
ON public.family_members
FOR SELECT
USING (public.has_family_access(auth.uid(), family_id));
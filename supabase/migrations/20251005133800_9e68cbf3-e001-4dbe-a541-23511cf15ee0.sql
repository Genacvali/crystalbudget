-- Recreate the function with proper security definer settings using CREATE OR REPLACE
CREATE OR REPLACE FUNCTION public.is_family_member(_user_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    WHERE fm1.user_id = _user_id AND fm2.user_id = _target_user_id
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) TO authenticated;
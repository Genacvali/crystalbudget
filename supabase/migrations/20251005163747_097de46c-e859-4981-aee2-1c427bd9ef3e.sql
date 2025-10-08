-- Update is_family_member function to include family owners
CREATE OR REPLACE FUNCTION public.is_family_member(_user_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Check if both users are in the same family as members
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    WHERE fm1.user_id = _user_id AND fm2.user_id = _target_user_id
  ) OR EXISTS (
    -- Check if _user_id is owner and _target_user_id is member
    SELECT 1
    FROM public.families f
    JOIN public.family_members fm ON f.id = fm.family_id
    WHERE f.owner_id = _user_id AND fm.user_id = _target_user_id
  ) OR EXISTS (
    -- Check if _target_user_id is owner and _user_id is member
    SELECT 1
    FROM public.families f
    JOIN public.family_members fm ON f.id = fm.family_id
    WHERE f.owner_id = _target_user_id AND fm.user_id = _user_id
  ) OR (
    -- Check if both are the same user (can see own data)
    _user_id = _target_user_id
  );
$$;
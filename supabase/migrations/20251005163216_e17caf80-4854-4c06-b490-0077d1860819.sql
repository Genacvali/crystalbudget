-- Create function to join family with invite code
CREATE OR REPLACE FUNCTION public.join_family_with_code(
  _invite_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code_data record;
  _result jsonb;
BEGIN
  -- Check if code exists and is valid
  SELECT family_id, expires_at, used_by
  INTO _code_data
  FROM public.family_invite_codes
  WHERE code = _invite_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Код не найден');
  END IF;

  IF _code_data.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Срок действия кода истек');
  END IF;

  IF _code_data.used_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Код уже использован');
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.family_members 
    WHERE family_id = _code_data.family_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Вы уже являетесь членом этой семьи');
  END IF;

  -- Add user to family
  INSERT INTO public.family_members (family_id, user_id)
  VALUES (_code_data.family_id, auth.uid());

  -- Mark code as used
  UPDATE public.family_invite_codes
  SET used_by = auth.uid(), used_at = now()
  WHERE code = _invite_code;

  RETURN jsonb_build_object('success', true, 'family_id', _code_data.family_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
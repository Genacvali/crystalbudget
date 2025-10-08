-- Add RLS policies for telegram_auth_codes table
-- Allow authenticated users to read unused, non-expired codes
CREATE POLICY "Authenticated users can read valid auth codes"
  ON public.telegram_auth_codes
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    used = false AND
    expires_at > now()
  );

-- Allow service role (edge functions) to manage all codes
CREATE POLICY "Service role can manage auth codes"
  ON public.telegram_auth_codes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to update codes they're using
CREATE POLICY "Authenticated users can mark codes as used"
  ON public.telegram_auth_codes
  FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND
    used = false AND
    expires_at > now()
  )
  WITH CHECK (used = true);

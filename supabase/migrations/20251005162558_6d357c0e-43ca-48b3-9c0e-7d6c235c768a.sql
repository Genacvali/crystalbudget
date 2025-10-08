-- Change invite code expiration to 5 minutes instead of 7 days
ALTER TABLE public.family_invite_codes 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '5 minutes');

-- Create function to delete expired invite codes
CREATE OR REPLACE FUNCTION public.delete_expired_invite_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.family_invite_codes
  WHERE expires_at < now();
END;
$$;

-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
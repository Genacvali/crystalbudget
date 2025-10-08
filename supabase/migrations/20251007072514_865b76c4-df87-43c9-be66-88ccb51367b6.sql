- Create table for temporary auth codes
CREATE TABLE IF NOT EXISTS public.telegram_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  auth_code text NOT NULL UNIQUE,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_auth_codes ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_code ON public.telegram_auth_codes(auth_code);
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_expires ON public.telegram_auth_codes(expires_at);

-- No RLS policies needed - this table is managed by edge functions only
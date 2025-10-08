-- Create table for telegram bot user sessions
CREATE TABLE IF NOT EXISTS public.telegram_bot_sessions (
  telegram_id bigint PRIMARY KEY,
  session_data jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role (edge functions) to manage all sessions
CREATE POLICY "Service role can manage sessions"
  ON public.telegram_bot_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_telegram_id ON public.telegram_bot_sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expires ON public.telegram_bot_sessions(expires_at);

-- Auto-update timestamp
CREATE TRIGGER update_telegram_bot_sessions_updated_at
  BEFORE UPDATE ON public.telegram_bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

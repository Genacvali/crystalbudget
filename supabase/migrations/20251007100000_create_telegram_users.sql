-- Create telegram_users table to link Telegram accounts with app users
CREATE TABLE IF NOT EXISTS public.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL UNIQUE,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own telegram connection"
  ON public.telegram_users
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram connection"
  ON public.telegram_users
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own telegram connection"
  ON public.telegram_users
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON public.telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_user_id ON public.telegram_users(user_id);

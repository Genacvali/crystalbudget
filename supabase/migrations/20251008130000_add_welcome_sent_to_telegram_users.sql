-- Add welcome_sent column to telegram_users table
ALTER TABLE public.telegram_users
ADD COLUMN IF NOT EXISTS welcome_sent BOOLEAN DEFAULT false;

-- Add reminder fields to user_preferences table
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_time TEXT DEFAULT '21:00';

-- Add comment
COMMENT ON COLUMN public.user_preferences.reminder_enabled IS 'Whether daily transaction reminders are enabled';
COMMENT ON COLUMN public.user_preferences.reminder_time IS 'Time for daily reminders in HH:MM format';


-- Create telegram_messages table to track messages sent by bot for interactive updates
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(expense_id, telegram_chat_id)
);

-- Enable RLS
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own telegram messages"
ON public.telegram_messages FOR SELECT
USING (
  expense_id IN (SELECT id FROM public.expenses WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert their own telegram messages"
ON public.telegram_messages FOR INSERT
WITH CHECK (
  expense_id IN (SELECT id FROM public.expenses WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their own telegram messages"
ON public.telegram_messages FOR UPDATE
USING (
  expense_id IN (SELECT id FROM public.expenses WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete their own telegram messages"
ON public.telegram_messages FOR DELETE
USING (
  expense_id IN (SELECT id FROM public.expenses WHERE user_id = auth.uid())
);

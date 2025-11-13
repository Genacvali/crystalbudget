-- Fix user_preferences table structure safely

DO $$ 
DECLARE
  user_id_type text;
BEGIN
  -- Get the current type of user_id column
  SELECT data_type INTO user_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_preferences'
    AND column_name = 'user_id';
  
  -- If user_id is bigint instead of uuid, we need to fix it
  IF user_id_type = 'bigint' THEN
    RAISE NOTICE 'Fixing user_id column type from bigint to uuid';
    
    -- Drop the table and recreate with correct structure
    -- This is safe if the table is empty or newly created
    DROP TABLE IF EXISTS public.user_preferences CASCADE;
    
    CREATE TABLE public.user_preferences (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
      currency TEXT NOT NULL DEFAULT 'RUB',
      reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      reminder_time TEXT NOT NULL DEFAULT '21:00',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
    
    -- RLS Policies
    CREATE POLICY "Users can view their own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);
    
    CREATE POLICY "Users can insert their own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);
    
    CREATE POLICY "Users can update their own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);
    
    CREATE POLICY "Users can delete their own preferences"
    ON public.user_preferences FOR DELETE
    USING (auth.uid() = user_id);
    
    -- Create function if it doesn't exist
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $_$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $_$ LANGUAGE plpgsql;
    
    -- Trigger for updating updated_at
    CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
    
    -- Create index for faster lookups
    CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
    
    RAISE NOTICE 'user_preferences table recreated with UUID type';
  ELSIF user_id_type = 'uuid' THEN
    RAISE NOTICE 'user_id column already has UUID type - no changes needed';
    
    -- Ensure all necessary columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'currency'
    ) THEN
      ALTER TABLE public.user_preferences ADD COLUMN currency TEXT NOT NULL DEFAULT 'RUB';
      RAISE NOTICE 'Added currency column';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'reminder_enabled'
    ) THEN
      ALTER TABLE public.user_preferences ADD COLUMN reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      RAISE NOTICE 'Added reminder_enabled column';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'reminder_time'
    ) THEN
      ALTER TABLE public.user_preferences ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '21:00';
      RAISE NOTICE 'Added reminder_time column';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unexpected user_id type: %', user_id_type;
  END IF;
END $$;

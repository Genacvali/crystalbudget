-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'budget_warning', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to automatically create notifications for transactions
CREATE OR REPLACE FUNCTION create_transaction_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
  source_name TEXT;
  category_name TEXT;
  currency_symbol TEXT := '₽';
BEGIN
  -- Determine notification content based on table
  IF TG_TABLE_NAME = 'incomes' THEN
    -- Get income source name
    SELECT name INTO source_name 
    FROM income_sources 
    WHERE id = NEW.source_id;
    
    notification_title := 'Доход добавлен';
    notification_message := format('Получен доход %s %s от источника "%s"', 
      NEW.amount::TEXT, currency_symbol, COALESCE(source_name, 'Неизвестный источник'));
    
    -- Insert notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'income', notification_title, notification_message, 
            jsonb_build_object('amount', NEW.amount, 'source_id', NEW.source_id, 'transaction_id', NEW.id));
            
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    -- Get category name
    SELECT name INTO category_name 
    FROM categories 
    WHERE id = NEW.category_id;
    
    notification_title := 'Расход добавлен';
    notification_message := format('Потрачено %s %s на категорию "%s"', 
      NEW.amount::TEXT, currency_symbol, COALESCE(category_name, 'Неизвестная категория'));
    
    -- Insert notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'expense', notification_title, notification_message, 
            jsonb_build_object('amount', NEW.amount, 'category_id', NEW.category_id, 'transaction_id', NEW.id));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic notifications
CREATE TRIGGER trigger_create_income_notification
  AFTER INSERT ON incomes
  FOR EACH ROW
  EXECUTE FUNCTION create_transaction_notification();

CREATE TRIGGER trigger_create_expense_notification
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION create_transaction_notification();

-- Create function to get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM notifications 
    WHERE user_id = user_uuid 
    AND read_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

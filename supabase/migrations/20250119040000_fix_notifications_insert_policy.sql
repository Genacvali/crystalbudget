-- Fix notifications table INSERT policy
-- The create_transaction_notification() function needs INSERT permissions

-- Add INSERT policy for notifications table
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT 
  WITH CHECK (true);

-- Also add DELETE policy for user cleanup
CREATE POLICY "Users can delete their own notifications" ON notifications
  FOR DELETE 
  USING (auth.uid() = user_id);

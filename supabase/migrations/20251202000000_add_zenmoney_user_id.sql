-- Add missing column zenmoney_user_id to zenmoney_connections table
-- This column stores the ZenMoney user ID for family account support

ALTER TABLE zenmoney_connections 
ADD COLUMN IF NOT EXISTS zenmoney_user_id INTEGER;

COMMENT ON COLUMN zenmoney_connections.zenmoney_user_id IS 'User ID from ZenMoney API (for family account support)';

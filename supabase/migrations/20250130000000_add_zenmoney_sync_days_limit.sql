-- Add sync_days_limit to zenmoney_connections table
ALTER TABLE zenmoney_connections 
ADD COLUMN IF NOT EXISTS sync_days_limit INTEGER DEFAULT NULL;

COMMENT ON COLUMN zenmoney_connections.sync_days_limit IS 
'Number of days to sync transactions (1, 7, 30, or NULL for all history)';

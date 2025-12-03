-- Add missing columns to zenmoney_sync_state table
-- These columns track sync statistics and metadata

-- Add statistics columns if they don't exist
ALTER TABLE zenmoney_sync_state 
ADD COLUMN IF NOT EXISTS total_syncs INTEGER DEFAULT 0;

ALTER TABLE zenmoney_sync_state 
ADD COLUMN IF NOT EXISTS last_sync_transactions_count INTEGER DEFAULT 0;

ALTER TABLE zenmoney_sync_state 
ADD COLUMN IF NOT EXISTS last_sync_accounts_count INTEGER DEFAULT 0;

ALTER TABLE zenmoney_sync_state 
ADD COLUMN IF NOT EXISTS last_sync_tags_count INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN zenmoney_sync_state.total_syncs IS 'Total number of successful syncs';
COMMENT ON COLUMN zenmoney_sync_state.last_sync_transactions_count IS 'Number of transactions synced in last sync';
COMMENT ON COLUMN zenmoney_sync_state.last_sync_accounts_count IS 'Number of accounts synced in last sync';
COMMENT ON COLUMN zenmoney_sync_state.last_sync_tags_count IS 'Number of tags synced in last sync';

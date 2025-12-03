-- Create zenmoney_sync_state table to track synchronization state and metadata
CREATE TABLE IF NOT EXISTS zenmoney_sync_state (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Sync state from ZenMoney Diff API
    server_timestamp BIGINT DEFAULT 0 NOT NULL,
    
    -- Current sync status
    sync_status TEXT DEFAULT 'idle' NOT NULL CHECK (sync_status IN ('idle', 'syncing', 'error')),
    
    -- Sync metadata
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Statistics
    total_syncs INTEGER DEFAULT 0,
    last_sync_transactions_count INTEGER DEFAULT 0,
    last_sync_accounts_count INTEGER DEFAULT 0,
    last_sync_tags_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One sync state per user
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_zenmoney_sync_state_user_id 
    ON zenmoney_sync_state(user_id);

CREATE INDEX IF NOT EXISTS idx_zenmoney_sync_state_status 
    ON zenmoney_sync_state(sync_status);

CREATE INDEX IF NOT EXISTS idx_zenmoney_sync_state_last_sync 
    ON zenmoney_sync_state(last_sync_at DESC);

-- Enable RLS
ALTER TABLE zenmoney_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sync state"
    ON zenmoney_sync_state FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync state"
    ON zenmoney_sync_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync state"
    ON zenmoney_sync_state FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync state"
    ON zenmoney_sync_state FOR DELETE
    USING (auth.uid() = user_id);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_zenmoney_sync_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_zenmoney_sync_state_timestamp
    BEFORE UPDATE ON zenmoney_sync_state
    FOR EACH ROW
    EXECUTE FUNCTION update_zenmoney_sync_state_updated_at();

-- Add comments
COMMENT ON TABLE zenmoney_sync_state IS 'Tracks ZenMoney synchronization state and metadata';
COMMENT ON COLUMN zenmoney_sync_state.server_timestamp IS 'Timestamp from ZenMoney Diff API for incremental sync';
COMMENT ON COLUMN zenmoney_sync_state.sync_status IS 'Current sync status: idle, syncing, or error';
COMMENT ON COLUMN zenmoney_sync_state.last_error IS 'Last error message if sync failed';
COMMENT ON COLUMN zenmoney_sync_state.total_syncs IS 'Total number of successful syncs';

-- Create zenmoney_connections table to store OAuth tokens and connection metadata
CREATE TABLE IF NOT EXISTS zenmoney_connections (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- OAuth tokens
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Sync settings
    sync_days_limit INTEGER DEFAULT NULL,
    
    -- ZenMoney user ID (from ZenMoney API response)
    zenmoney_user_id INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One connection per user
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_zenmoney_connections_user_id 
    ON zenmoney_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_zenmoney_connections_expires_at 
    ON zenmoney_connections(expires_at);

-- Enable RLS
ALTER TABLE zenmoney_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own connections"
    ON zenmoney_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections"
    ON zenmoney_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
    ON zenmoney_connections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
    ON zenmoney_connections FOR DELETE
    USING (auth.uid() = user_id);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_zenmoney_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_zenmoney_connections_timestamp
    BEFORE UPDATE ON zenmoney_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_zenmoney_connections_updated_at();

-- Add comment
COMMENT ON TABLE zenmoney_connections IS 'Stores ZenMoney OAuth connection tokens and settings';
COMMENT ON COLUMN zenmoney_connections.sync_days_limit IS 'Number of days to sync transactions (1, 7, 30, or NULL for all history)';
COMMENT ON COLUMN zenmoney_connections.zenmoney_user_id IS 'User ID from ZenMoney API (for family account support)';

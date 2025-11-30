-- Create table for ZenMoney accounts with balance tracking
CREATE TABLE IF NOT EXISTS zenmoney_accounts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    zenmoney_account_id TEXT NOT NULL,
    account_type TEXT,
    title TEXT NOT NULL,
    instrument_id INTEGER,
    balance DECIMAL(15, 2) DEFAULT 0,
    startBalance DECIMAL(15, 2) DEFAULT 0,
    creditLimit DECIMAL(15, 2) DEFAULT 0,
    archive BOOLEAN DEFAULT FALSE,
    
    -- Calculated balance from CrystalBudget transactions
    calculated_balance DECIMAL(15, 2),
    balance_diff DECIMAL(15, 2),
    last_balance_check_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, zenmoney_account_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_zenmoney_accounts_user_id ON zenmoney_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_zenmoney_accounts_zenmoney_id ON zenmoney_accounts(zenmoney_account_id);

-- Enable RLS
ALTER TABLE zenmoney_accounts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own zenmoney accounts"
    ON zenmoney_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own zenmoney accounts"
    ON zenmoney_accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own zenmoney accounts"
    ON zenmoney_accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own zenmoney accounts"
    ON zenmoney_accounts FOR DELETE
    USING (auth.uid() = user_id);

-- Function to calculate balance from transactions
CREATE OR REPLACE FUNCTION calculate_account_balance(p_user_id UUID, p_zenmoney_account_id TEXT)
RETURNS DECIMAL AS $$
DECLARE
    v_total_income DECIMAL;
    v_total_expense DECIMAL;
    v_start_balance DECIMAL;
    v_calculated DECIMAL;
BEGIN
    -- Get start balance from zenmoney_accounts
    SELECT COALESCE(startBalance, 0) INTO v_start_balance
    FROM zenmoney_accounts
    WHERE user_id = p_user_id AND zenmoney_account_id = p_zenmoney_account_id;
    
    -- Sum all incomes for this account
    -- (we would need to link transactions to accounts - for now just return start balance)
    v_total_income := 0;
    
    -- Sum all expenses for this account
    v_total_expense := 0;
    
    -- Calculate: start_balance + incomes - expenses
    v_calculated := COALESCE(v_start_balance, 0) + COALESCE(v_total_income, 0) - COALESCE(v_total_expense, 0);
    
    RETURN v_calculated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON TABLE zenmoney_accounts IS 'Stores ZenMoney account information with balance tracking and reconciliation';

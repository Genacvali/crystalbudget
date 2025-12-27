-- Multi-currency carry-over support
-- Store carry-over balance for each currency separately

CREATE TABLE IF NOT EXISTS user_monthly_balance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    currency TEXT NOT NULL DEFAULT 'RUB',
    
    -- Balance components
    total_income DECIMAL(15, 2) DEFAULT 0,
    total_expenses DECIMAL(15, 2) DEFAULT 0,
    balance DECIMAL(15, 2) DEFAULT 0,
    
    -- Carry-over from all previous months
    carry_over_from_past DECIMAL(15, 2) DEFAULT 0,
    
    -- Total balance including carry-over
    total_balance DECIMAL(15, 2) DEFAULT 0,
    
    -- Is month closed
    is_closed BOOLEAN DEFAULT FALSE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, month, currency)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_monthly_balance_user_month 
ON user_monthly_balance(user_id, month DESC, currency);

-- Enable RLS
ALTER TABLE user_monthly_balance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own monthly balances"
    ON user_monthly_balance FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own monthly balances"
    ON user_monthly_balance FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monthly balances"
    ON user_monthly_balance FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to calculate carry-over for all currencies
CREATE OR REPLACE FUNCTION calculate_multi_currency_carry_over(
    p_user_id UUID,
    p_before_month DATE
)
RETURNS TABLE(
    currency TEXT,
    carry_over DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(i.currency, 'RUB') as currency,
        COALESCE(SUM(i.amount), 0) - COALESCE(SUM(e.amount), 0) as carry_over
    FROM (
        -- All incomes before the month
        SELECT amount, currency
        FROM incomes
        WHERE user_id = p_user_id
          AND date < p_before_month
    ) i
    FULL OUTER JOIN (
        -- All expenses before the month
        SELECT amount, currency
        FROM expenses
        WHERE user_id = p_user_id
          AND date < p_before_month
    ) e ON COALESCE(i.currency, 'RUB') = COALESCE(e.currency, 'RUB')
    GROUP BY COALESCE(i.currency, 'RUB');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get or calculate monthly balance for specific currency
CREATE OR REPLACE FUNCTION get_monthly_balance(
    p_user_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    total_income DECIMAL,
    total_expenses DECIMAL,
    balance DECIMAL,
    carry_over_from_past DECIMAL,
    total_balance DECIMAL
) AS $$
DECLARE
    v_state RECORD;
    v_income DECIMAL;
    v_expenses DECIMAL;
    v_carry_over DECIMAL;
    v_month_end DATE;
BEGIN
    -- Check if we have cached state
    SELECT * INTO v_state
    FROM user_monthly_balance
    WHERE user_id = p_user_id
      AND month = p_month
      AND currency = p_currency
    LIMIT 1;
    
    IF v_state IS NOT NULL THEN
        -- Return cached data
        RETURN QUERY SELECT 
            v_state.total_income,
            v_state.total_expenses,
            v_state.balance,
            v_state.carry_over_from_past,
            v_state.total_balance;
    ELSE
        -- Calculate on the fly
        v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        
        -- Calculate income for month
        SELECT COALESCE(SUM(amount), 0) INTO v_income
        FROM incomes
        WHERE user_id = p_user_id
          AND date >= p_month
          AND date <= v_month_end
          AND COALESCE(currency, 'RUB') = p_currency;
        
        -- Calculate expenses for month
        SELECT COALESCE(SUM(amount), 0) INTO v_expenses
        FROM expenses
        WHERE user_id = p_user_id
          AND date >= p_month
          AND date <= v_month_end
          AND COALESCE(currency, 'RUB') = p_currency;
        
        -- Calculate carry-over
        SELECT carry_over INTO v_carry_over
        FROM calculate_multi_currency_carry_over(p_user_id, p_month)
        WHERE currency = p_currency;
        
        v_carry_over := COALESCE(v_carry_over, 0);
        
        RETURN QUERY SELECT 
            v_income,
            v_expenses,
            v_income - v_expenses,
            v_carry_over,
            v_income - v_expenses + v_carry_over;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to refresh materialized views for specific month
CREATE OR REPLACE FUNCTION refresh_month_cache(p_month DATE)
RETURNS void AS $$
BEGIN
    -- This is a simplified version - in production you'd refresh incrementally
    REFRESH MATERIALIZED VIEW CONCURRENTLY category_monthly_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY income_source_monthly_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON MATERIALIZED VIEW category_monthly_summary IS 'Cached monthly aggregations of expenses by category';
COMMENT ON MATERIALIZED VIEW income_source_monthly_summary IS 'Cached monthly aggregations of incomes by source';
COMMENT ON TABLE user_monthly_balance IS 'Stores monthly balance state including multi-currency carry-overs';
COMMENT ON FUNCTION calculate_multi_currency_carry_over IS 'Calculates carry-over balance for all currencies before specified month';
COMMENT ON FUNCTION get_monthly_balance IS 'Returns monthly balance for specific currency with carry-over';

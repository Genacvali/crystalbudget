-- Family budget aggregation for efficient multi-user calculations
-- Pre-calculates family totals instead of querying all members each time

CREATE TABLE IF NOT EXISTS family_monthly_budget (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    
    -- Aggregated data
    total_income DECIMAL(15, 2) DEFAULT 0,
    total_expenses DECIMAL(15, 2) DEFAULT 0,
    balance DECIMAL(15, 2) DEFAULT 0,
    
    -- Member breakdown
    members_count INTEGER DEFAULT 0,
    top_spender_id UUID,
    top_earner_id UUID,
    
    -- Version for optimistic locking
    version INTEGER DEFAULT 1,
    
    -- Last update info
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_by UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id, month, currency)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_monthly_budget_family_month 
ON family_monthly_budget(family_id, month DESC);

-- Enable RLS
ALTER TABLE family_monthly_budget ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Family members can view family budget"
    ON family_monthly_budget FOR SELECT
    USING (
        -- User is family owner
        family_id IN (
            SELECT id FROM families WHERE owner_id = auth.uid()
        )
        OR
        -- User is family member
        family_id IN (
            SELECT family_id FROM family_members WHERE user_id = auth.uid()
        )
    );

-- Function to calculate and update family budget aggregate
CREATE OR REPLACE FUNCTION update_family_budget_aggregate(
    p_family_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS void AS $$
DECLARE
    v_member_ids UUID[];
    v_total_income DECIMAL;
    v_total_expenses DECIMAL;
    v_month_end DATE;
    v_top_spender UUID;
    v_top_earner UUID;
BEGIN
    v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Get all family member IDs
    SELECT ARRAY_AGG(DISTINCT user_id) INTO v_member_ids
    FROM (
        SELECT owner_id as user_id FROM families WHERE id = p_family_id
        UNION
        SELECT user_id FROM family_members WHERE family_id = p_family_id
    ) members;
    
    -- Calculate total income
    SELECT COALESCE(SUM(amount), 0) INTO v_total_income
    FROM incomes
    WHERE user_id = ANY(v_member_ids)
      AND date >= p_month
      AND date <= v_month_end
      AND COALESCE(currency, 'RUB') = p_currency;
    
    -- Calculate total expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM expenses
    WHERE user_id = ANY(v_member_ids)
      AND date >= p_month
      AND date <= v_month_end
      AND COALESCE(currency, 'RUB') = p_currency;
    
    -- Find top spender
    SELECT user_id INTO v_top_spender
    FROM (
        SELECT user_id, SUM(amount) as total
        FROM expenses
        WHERE user_id = ANY(v_member_ids)
          AND date >= p_month
          AND date <= v_month_end
          AND COALESCE(currency, 'RUB') = p_currency
        GROUP BY user_id
        ORDER BY total DESC
        LIMIT 1
    ) top_spenders;
    
    -- Find top earner
    SELECT user_id INTO v_top_earner
    FROM (
        SELECT user_id, SUM(amount) as total
        FROM incomes
        WHERE user_id = ANY(v_member_ids)
          AND date >= p_month
          AND date <= v_month_end
          AND COALESCE(currency, 'RUB') = p_currency
        GROUP BY user_id
        ORDER BY total DESC
        LIMIT 1
    ) top_earners;
    
    -- Insert or update aggregate
    INSERT INTO family_monthly_budget (
        family_id,
        month,
        currency,
        total_income,
        total_expenses,
        balance,
        members_count,
        top_spender_id,
        top_earner_id,
        last_updated_at,
        last_updated_by,
        version
    ) VALUES (
        p_family_id,
        p_month,
        p_currency,
        v_total_income,
        v_total_expenses,
        v_total_income - v_total_expenses,
        array_length(v_member_ids, 1),
        v_top_spender,
        v_top_earner,
        NOW(),
        auth.uid(),
        1
    )
    ON CONFLICT (family_id, month, currency)
    DO UPDATE SET
        total_income = EXCLUDED.total_income,
        total_expenses = EXCLUDED.total_expenses,
        balance = EXCLUDED.balance,
        members_count = EXCLUDED.members_count,
        top_spender_id = EXCLUDED.top_spender_id,
        top_earner_id = EXCLUDED.top_earner_id,
        last_updated_at = NOW(),
        last_updated_by = auth.uid(),
        version = family_monthly_budget.version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get family budget (fast - uses cached aggregate)
CREATE OR REPLACE FUNCTION get_family_budget(
    p_family_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB',
    p_force_recalculate BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    total_income DECIMAL,
    total_expenses DECIMAL,
    balance DECIMAL,
    members_count INTEGER,
    top_spender_id UUID,
    top_earner_id UUID,
    last_updated TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_aggregate RECORD;
BEGIN
    -- Try to get cached aggregate
    SELECT * INTO v_aggregate
    FROM family_monthly_budget
    WHERE family_id = p_family_id
      AND month = p_month
      AND currency = p_currency
    LIMIT 1;
    
    -- If not found or force recalculate, update it
    IF v_aggregate IS NULL OR p_force_recalculate THEN
        PERFORM update_family_budget_aggregate(p_family_id, p_month, p_currency);
        
        -- Get updated data
        SELECT * INTO v_aggregate
        FROM family_monthly_budget
        WHERE family_id = p_family_id
          AND month = p_month
          AND currency = p_currency
        LIMIT 1;
    END IF;
    
    -- Return aggregate data
    RETURN QUERY SELECT 
        v_aggregate.total_income,
        v_aggregate.total_expenses,
        v_aggregate.balance,
        v_aggregate.members_count,
        v_aggregate.top_spender_id,
        v_aggregate.top_earner_id,
        v_aggregate.last_updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update family aggregate when transaction is added
CREATE OR REPLACE FUNCTION trigger_update_family_aggregate()
RETURNS TRIGGER AS $$
DECLARE
    v_family_id UUID;
    v_month DATE;
BEGIN
    v_month := DATE_TRUNC('month', COALESCE(NEW.date, OLD.date))::DATE;
    
    -- Get family_id for user
    SELECT f.id INTO v_family_id
    FROM families f
    WHERE f.owner_id = COALESCE(NEW.user_id, OLD.user_id)
    LIMIT 1;
    
    IF v_family_id IS NULL THEN
        SELECT fm.family_id INTO v_family_id
        FROM family_members fm
        WHERE fm.user_id = COALESCE(NEW.user_id, OLD.user_id)
        LIMIT 1;
    END IF;
    
    -- Update aggregate if user is in family
    IF v_family_id IS NOT NULL THEN
        PERFORM update_family_budget_aggregate(
            v_family_id, 
            v_month, 
            COALESCE(NEW.currency, OLD.currency, 'RUB')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers (commented - enable after testing)
-- CREATE TRIGGER after_expense_change_update_family
-- AFTER INSERT OR UPDATE OR DELETE ON expenses
-- FOR EACH ROW EXECUTE FUNCTION trigger_update_family_aggregate();

-- CREATE TRIGGER after_income_change_update_family
-- AFTER INSERT OR UPDATE OR DELETE ON incomes
-- FOR EACH ROW EXECUTE FUNCTION trigger_update_family_aggregate();

-- Comments
COMMENT ON TABLE family_monthly_budget IS 'Cached aggregations of family budget to avoid scanning all member transactions';
COMMENT ON FUNCTION update_family_budget_aggregate IS 'Recalculates and caches family budget aggregate for specified month';
COMMENT ON FUNCTION get_family_budget IS 'Returns family budget using cached aggregate (fast)';
COMMENT ON FUNCTION trigger_update_family_aggregate IS 'Automatically updates family aggregate when transactions change';

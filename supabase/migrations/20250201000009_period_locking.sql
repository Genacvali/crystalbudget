-- Period locking system to prevent editing closed months
-- Ensures data integrity for historical periods

CREATE TABLE IF NOT EXISTS closed_periods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the closed month
    
    -- Closure information
    is_closed BOOLEAN DEFAULT TRUE,
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_by UUID REFERENCES auth.users(id),
    
    -- Optional: Allow reopening
    can_reopen BOOLEAN DEFAULT TRUE,
    reopen_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_closed_periods_user_month 
ON closed_periods(user_id, month DESC);

-- Enable RLS
ALTER TABLE closed_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own closed periods"
    ON closed_periods FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can close their own periods"
    ON closed_periods FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own closed periods"
    ON closed_periods FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to check if period is closed
CREATE OR REPLACE FUNCTION is_period_closed(
    p_user_id UUID,
    p_date TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN AS $$
DECLARE
    v_month DATE;
    v_is_closed BOOLEAN;
BEGIN
    v_month := DATE_TRUNC('month', p_date)::DATE;
    
    SELECT is_closed INTO v_is_closed
    FROM closed_periods
    WHERE user_id = p_user_id
      AND month = v_month
    LIMIT 1;
    
    RETURN COALESCE(v_is_closed, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to close a period
CREATE OR REPLACE FUNCTION close_period(
    p_user_id UUID,
    p_month DATE
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    categories_processed INTEGER,
    total_balance DECIMAL
) AS $$
DECLARE
    v_already_closed BOOLEAN;
    v_cat_count INTEGER;
    v_balance DECIMAL;
BEGIN
    -- Check if already closed
    SELECT is_closed INTO v_already_closed
    FROM closed_periods
    WHERE user_id = p_user_id AND month = p_month
    LIMIT 1;
    
    IF v_already_closed THEN
        RETURN QUERY SELECT FALSE, 'Период уже закрыт'::TEXT, 0, 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Calculate and save state for all categories
    PERFORM close_month(p_user_id, p_month);
    
    -- Mark period as closed
    INSERT INTO closed_periods (user_id, month, closed_by, is_closed)
    VALUES (p_user_id, p_month, auth.uid(), TRUE)
    ON CONFLICT (user_id, month)
    DO UPDATE SET 
        is_closed = TRUE,
        closed_at = NOW(),
        closed_by = auth.uid(),
        updated_at = NOW();
    
    -- Get counts
    SELECT COUNT(*)::INTEGER INTO v_cat_count
    FROM category_monthly_state
    WHERE user_id = p_user_id AND month = p_month;
    
    -- Get balance
    SELECT balance INTO v_balance
    FROM get_monthly_balance(p_user_id, p_month, 'RUB');
    
    RETURN QUERY SELECT 
        TRUE,
        'Период успешно закрыт'::TEXT,
        v_cat_count,
        COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reopen a period
CREATE OR REPLACE FUNCTION reopen_period(
    p_user_id UUID,
    p_month DATE,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_can_reopen BOOLEAN;
BEGIN
    -- Check if period exists and can be reopened
    SELECT can_reopen INTO v_can_reopen
    FROM closed_periods
    WHERE user_id = p_user_id AND month = p_month
    LIMIT 1;
    
    IF v_can_reopen IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Период не найден'::TEXT;
        RETURN;
    END IF;
    
    IF NOT v_can_reopen THEN
        RETURN QUERY SELECT FALSE, 'Период нельзя открыть заново'::TEXT;
        RETURN;
    END IF;
    
    -- Reopen period
    UPDATE closed_periods
    SET 
        is_closed = FALSE,
        reopen_reason = p_reason,
        updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month;
    
    -- Also mark category states as not closed
    UPDATE category_monthly_state
    SET is_closed = FALSE, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month;
    
    RETURN QUERY SELECT TRUE, 'Период открыт для редактирования'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to prevent editing transactions in closed periods
CREATE OR REPLACE FUNCTION prevent_closed_period_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_is_closed BOOLEAN;
    v_month DATE;
BEGIN
    -- Get month from transaction date
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        v_month := DATE_TRUNC('month', NEW.date)::DATE;
        
        -- Check if period is closed
        SELECT is_closed INTO v_is_closed
        FROM closed_periods
        WHERE user_id = NEW.user_id AND month = v_month
        LIMIT 1;
        
        IF v_is_closed THEN
            RAISE EXCEPTION 'Период закрыт. Нельзя создавать или редактировать транзакции.';
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        v_month := DATE_TRUNC('month', OLD.date)::DATE;
        
        SELECT is_closed INTO v_is_closed
        FROM closed_periods
        WHERE user_id = OLD.user_id AND month = v_month
        LIMIT 1;
        
        IF v_is_closed THEN
            RAISE EXCEPTION 'Период закрыт. Нельзя удалять транзакции.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (commented out by default - enable when ready to use)
-- CREATE TRIGGER check_closed_period_expenses
-- BEFORE INSERT OR UPDATE OR DELETE ON expenses
-- FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_edit();

-- CREATE TRIGGER check_closed_period_incomes
-- BEFORE INSERT OR UPDATE OR DELETE ON incomes
-- FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_edit();

-- Comments
COMMENT ON TABLE closed_periods IS 'Tracks which months are closed for editing to ensure data integrity';
COMMENT ON FUNCTION is_period_closed IS 'Checks if a specific date falls within a closed period';
COMMENT ON FUNCTION close_period IS 'Closes a month, saves final state, and prevents further edits';
COMMENT ON FUNCTION reopen_period IS 'Reopens a closed period for corrections';
COMMENT ON FUNCTION prevent_closed_period_edit IS 'Trigger function to prevent editing transactions in closed periods';

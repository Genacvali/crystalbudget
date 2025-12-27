-- Smart income prediction based on historical data
-- Calculates average income for sources based on last N months

-- Function to get average income for source (last 3 months)
CREATE OR REPLACE FUNCTION get_source_average_income(
    p_source_id UUID,
    p_before_month DATE,
    p_months_count INTEGER DEFAULT 3,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS DECIMAL AS $$
DECLARE
    v_avg_income DECIMAL;
    v_start_date DATE;
BEGIN
    -- Calculate start date (N months ago)
    v_start_date := (p_before_month - (p_months_count || ' months')::INTERVAL)::DATE;
    
    -- Calculate average monthly income
    SELECT AVG(monthly_total) INTO v_avg_income
    FROM (
        SELECT 
            DATE_TRUNC('month', date)::DATE as month,
            SUM(amount) as monthly_total
        FROM incomes
        WHERE source_id = p_source_id
          AND date >= v_start_date
          AND date < p_before_month
          AND COALESCE(currency, 'RUB') = p_currency
        GROUP BY DATE_TRUNC('month', date)::DATE
    ) monthly_incomes;
    
    RETURN COALESCE(v_avg_income, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get predicted income for current month based on frequency
CREATE OR REPLACE FUNCTION get_predicted_income(
    p_source_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS DECIMAL AS $$
DECLARE
    v_source RECORD;
    v_avg_income DECIMAL;
    v_current_income DECIMAL;
    v_month_end DATE;
BEGIN
    -- Get source details
    SELECT * INTO v_source
    FROM income_sources
    WHERE id = p_source_id;
    
    -- Calculate month end
    v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Get actual income for current month so far
    SELECT COALESCE(SUM(amount), 0) INTO v_current_income
    FROM incomes
    WHERE source_id = p_source_id
      AND date >= p_month
      AND date <= v_month_end
      AND COALESCE(currency, 'RUB') = p_currency;
    
    -- If we already have income this month, return it
    IF v_current_income > 0 THEN
        RETURN v_current_income;
    END IF;
    
    -- Otherwise, predict based on historical average
    v_avg_income := get_source_average_income(p_source_id, p_month, 3, p_currency);
    
    -- If source has expected amount, use it if no historical data
    IF v_avg_income = 0 AND v_source.amount IS NOT NULL THEN
        RETURN v_source.amount;
    END IF;
    
    RETURN COALESCE(v_avg_income, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to update expected amounts for all sources based on history
CREATE OR REPLACE FUNCTION update_source_expected_amounts(
    p_user_id UUID
)
RETURNS void AS $$
DECLARE
    v_source RECORD;
    v_avg_income DECIMAL;
    v_current_month DATE;
BEGIN
    v_current_month := DATE_TRUNC('month', NOW())::DATE;
    
    FOR v_source IN 
        SELECT id FROM income_sources WHERE user_id = p_user_id
    LOOP
        -- Calculate 3-month average
        v_avg_income := get_source_average_income(
            v_source.id,
            v_current_month,
            3,
            'RUB'
        );
        
        -- Update source if average is reasonable
        IF v_avg_income > 0 THEN
            UPDATE income_sources
            SET amount = v_avg_income,
                updated_at = NOW()
            WHERE id = v_source.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION get_source_average_income IS 'Calculates average monthly income for a source over last N months';
COMMENT ON FUNCTION get_predicted_income IS 'Returns predicted income for current month based on actual or historical average';
COMMENT ON FUNCTION update_source_expected_amounts IS 'Updates expected amounts for all income sources based on 3-month average';

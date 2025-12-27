-- Fast aggregation functions for monthly data
-- Returns pre-calculated summaries instead of raw transactions

-- Get month aggregates for dashboard (single query)
CREATE OR REPLACE FUNCTION get_month_aggregates(
    p_user_ids UUID[],
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    total_income DECIMAL,
    total_expenses DECIMAL,
    balance DECIMAL,
    carry_over DECIMAL,
    total_balance DECIMAL,
    categories_data JSONB,
    sources_data JSONB
) AS $$
DECLARE
    v_month_end DATE;
    v_total_income DECIMAL;
    v_total_expenses DECIMAL;
    v_carry_over DECIMAL;
BEGIN
    v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Calculate total income for month
    SELECT COALESCE(SUM(i.amount), 0) INTO v_total_income
    FROM incomes i
    WHERE i.user_id = ANY(p_user_ids)
      AND i.date >= p_month
      AND i.date <= v_month_end
      AND COALESCE(i.currency, 'RUB') = p_currency;
    
    -- Calculate total expenses for month
    SELECT COALESCE(SUM(e.amount), 0) INTO v_total_expenses
    FROM expenses e
    WHERE e.user_id = ANY(p_user_ids)
      AND e.date >= p_month
      AND e.date <= v_month_end
      AND COALESCE(e.currency, 'RUB') = p_currency;
    
    -- Calculate carry-over (sum for all users)
    SELECT COALESCE(SUM(co.carry_over), 0) INTO v_carry_over
    FROM (
        SELECT 
            COALESCE(SUM(i.amount), 0) - COALESCE(SUM(e.amount), 0) as carry_over
        FROM incomes i
        FULL OUTER JOIN expenses e ON i.user_id = e.user_id
        WHERE COALESCE(i.user_id, e.user_id) = ANY(p_user_ids)
          AND COALESCE(i.date, e.date) < p_month
          AND COALESCE(i.currency, e.currency, 'RUB') = p_currency
        GROUP BY COALESCE(i.user_id, e.user_id)
    ) co;
    
    -- Aggregate by categories
    WITH category_agg AS (
        SELECT 
            c.id,
            c.name,
            c.icon,
            COALESCE(SUM(e.amount), 0) as spent,
            COUNT(e.id) as transaction_count
        FROM categories c
        LEFT JOIN expenses e ON e.category_id = c.id 
            AND e.date >= p_month 
            AND e.date <= v_month_end
            AND COALESCE(e.currency, 'RUB') = p_currency
        WHERE c.user_id = ANY(p_user_ids)
        GROUP BY c.id, c.name, c.icon
    )
    -- Aggregate by sources
    , source_agg AS (
        SELECT 
            ics.id,
            ics.name,
            ics.color,
            COALESCE(SUM(i.amount), 0) as received,
            COUNT(i.id) as transaction_count
        FROM income_sources ics
        LEFT JOIN incomes i ON i.source_id = ics.id 
            AND i.date >= p_month 
            AND i.date <= v_month_end
            AND COALESCE(i.currency, 'RUB') = p_currency
        WHERE ics.user_id = ANY(p_user_ids)
        GROUP BY ics.id, ics.name, ics.color
    )
    SELECT 
        v_total_income,
        v_total_expenses,
        v_total_income - v_total_expenses,
        v_carry_over,
        v_total_income - v_total_expenses + v_carry_over,
        (SELECT jsonb_agg(row_to_json(category_agg)) FROM category_agg),
        (SELECT jsonb_agg(row_to_json(source_agg)) FROM source_agg)
    INTO total_income, total_expenses, balance, carry_over, total_balance, categories_data, sources_data;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get category budget details for month
CREATE OR REPLACE FUNCTION get_category_budget_details(
    p_category_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    allocated DECIMAL,
    spent DECIMAL,
    remaining DECIMAL,
    debt DECIMAL,
    carry_over DECIMAL,
    is_over_budget BOOLEAN,
    transactions JSONB
) AS $$
DECLARE
    v_state RECORD;
    v_month_end DATE;
BEGIN
    v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Try to get from monthly state
    SELECT * INTO v_state
    FROM category_monthly_state
    WHERE category_id = p_category_id
      AND month = p_month
      AND currency = p_currency
    LIMIT 1;
    
    IF v_state IS NOT NULL THEN
        -- Return cached state
        RETURN QUERY
        SELECT 
            v_state.allocated,
            v_state.spent,
            v_state.remaining,
            v_state.debt,
            v_state.carry_over,
            v_state.spent > (v_state.allocated - v_state.debt),
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', e.id,
                        'amount', e.amount,
                        'date', e.date,
                        'description', e.description
                    )
                )
                FROM expenses e
                WHERE e.category_id = p_category_id
                  AND e.date >= p_month
                  AND e.date <= v_month_end
                  AND COALESCE(e.currency, 'RUB') = p_currency
                ORDER BY e.date DESC
            );
    ELSE
        -- Calculate on the fly
        RETURN QUERY
        WITH expense_sum AS (
            SELECT COALESCE(SUM(amount), 0) as spent
            FROM expenses
            WHERE category_id = p_category_id
              AND date >= p_month
              AND date <= v_month_end
              AND COALESCE(currency, 'RUB') = p_currency
        )
        SELECT 
            0::DECIMAL as allocated,
            es.spent,
            -es.spent as remaining,
            0::DECIMAL as debt,
            0::DECIMAL as carry_over,
            TRUE as is_over_budget,
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', e.id,
                        'amount', e.amount,
                        'date', e.date,
                        'description', e.description
                    )
                )
                FROM expenses e
                WHERE e.category_id = p_category_id
                  AND e.date >= p_month
                  AND e.date <= v_month_end
                  AND COALESCE(e.currency, 'RUB') = p_currency
                ORDER BY e.date DESC
            ) as transactions
        FROM expense_sum es;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION get_month_aggregates IS 'Returns all monthly aggregates in a single query for dashboard';
COMMENT ON FUNCTION check_duplicate_expense IS 'Checks if similar expense was created within last 2 minutes';
COMMENT ON FUNCTION check_duplicate_income IS 'Checks if similar income was created within last 2 minutes';
COMMENT ON FUNCTION get_category_budget_details IS 'Returns detailed budget info for category with transactions';

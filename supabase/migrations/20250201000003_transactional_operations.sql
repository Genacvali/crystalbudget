-- Atomic RPC functions for creating transactions
-- These functions ensure data consistency and automatically update related state

-- Function to create expense atomically with state update
CREATE OR REPLACE FUNCTION create_expense_atomic(
    p_user_id UUID,
    p_category_id UUID,
    p_amount DECIMAL,
    p_date TIMESTAMP WITH TIME ZONE,
    p_description TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    expense_id UUID,
    new_spent DECIMAL,
    new_remaining DECIMAL,
    is_over_budget BOOLEAN
) AS $$
DECLARE
    v_expense_id UUID;
    v_month DATE;
    v_state RECORD;
    v_allocated DECIMAL;
    v_spent DECIMAL;
    v_debt DECIMAL;
    v_available DECIMAL;
BEGIN
    -- Calculate month
    v_month := DATE_TRUNC('month', p_date)::DATE;
    
    -- Check if month is closed
    SELECT is_closed INTO v_state
    FROM category_monthly_state
    WHERE category_id = p_category_id
      AND month = v_month
      AND currency = p_currency
    LIMIT 1;
    
    IF v_state.is_closed THEN
        RAISE EXCEPTION 'Month is closed for editing';
    END IF;
    
    -- Start transaction
    -- Insert expense
    INSERT INTO expenses (user_id, category_id, amount, date, description, currency)
    VALUES (p_user_id, p_category_id, p_amount, p_date, p_description, p_currency)
    RETURNING id INTO v_expense_id;
    
    -- Get or create monthly state
    SELECT cms.* INTO v_state
    FROM category_monthly_state cms
    WHERE cms.category_id = p_category_id
      AND cms.month = v_month
      AND cms.currency = p_currency
    LIMIT 1;
    
    IF v_state IS NULL THEN
        -- Create initial state
        INSERT INTO category_monthly_state (
            category_id,
            user_id,
            month,
            currency,
            allocated,
            spent,
            carry_over,
            debt,
            remaining,
            version
        ) VALUES (
            p_category_id,
            p_user_id,
            v_month,
            p_currency,
            0, -- Will be calculated based on allocations
            p_amount,
            0,
            0,
            -p_amount,
            1
        )
        RETURNING allocated, spent, debt INTO v_allocated, v_spent, v_debt;
    ELSE
        -- Update existing state
        UPDATE category_monthly_state
        SET 
            spent = spent + p_amount,
            remaining = remaining - p_amount,
            version = version + 1,
            updated_at = NOW()
        WHERE category_id = p_category_id
          AND month = v_month
          AND currency = p_currency
        RETURNING allocated, spent, debt INTO v_allocated, v_spent, v_debt;
    END IF;
    
    v_available := v_allocated - v_debt;
    
    -- Return result
    RETURN QUERY SELECT 
        v_expense_id,
        v_spent,
        v_allocated - v_spent - v_debt,
        v_spent > v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create income atomically
CREATE OR REPLACE FUNCTION create_income_atomic(
    p_user_id UUID,
    p_source_id UUID,
    p_amount DECIMAL,
    p_date TIMESTAMP WITH TIME ZONE,
    p_description TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    income_id UUID,
    affected_categories INTEGER
) AS $$
DECLARE
    v_income_id UUID;
    v_month DATE;
    v_category RECORD;
    v_allocation RECORD;
BEGIN
    v_month := DATE_TRUNC('month', p_date)::DATE;
    
    -- Insert income
    INSERT INTO incomes (user_id, source_id, amount, date, description, currency)
    VALUES (p_user_id, p_source_id, p_amount, p_date, p_description, p_currency)
    RETURNING id INTO v_income_id;
    
    -- Update allocated budgets for affected categories
    FOR v_category IN 
        SELECT DISTINCT ca.category_id, c.user_id
        FROM category_allocations ca
        JOIN categories c ON c.id = ca.category_id
        WHERE ca.income_source_id = p_source_id
          AND COALESCE(ca.currency, 'RUB') = p_currency
    LOOP
        -- Get allocation details
        SELECT * INTO v_allocation
        FROM category_allocations
        WHERE category_id = v_category.category_id
          AND income_source_id = p_source_id
          AND COALESCE(currency, 'RUB') = p_currency
        LIMIT 1;
        
        IF v_allocation.allocation_type = 'percent' THEN
            -- Update allocated amount based on percentage
            INSERT INTO category_monthly_state (
                category_id,
                user_id,
                month,
                currency,
                allocated,
                spent,
                version
            ) VALUES (
                v_category.category_id,
                v_category.user_id,
                v_month,
                p_currency,
                p_amount * v_allocation.allocation_value / 100,
                0,
                1
            )
            ON CONFLICT (category_id, month, currency)
            DO UPDATE SET
                allocated = category_monthly_state.allocated + (p_amount * v_allocation.allocation_value / 100),
                remaining = category_monthly_state.remaining + (p_amount * v_allocation.allocation_value / 100),
                version = category_monthly_state.version + 1,
                updated_at = NOW();
        END IF;
    END LOOP;
    
    -- Return result
    RETURN QUERY SELECT v_income_id, COUNT(*)::INTEGER
    FROM category_allocations ca
    WHERE ca.income_source_id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION create_expense_atomic IS 'Creates expense and updates category monthly state atomically';
COMMENT ON FUNCTION create_income_atomic IS 'Creates income and updates affected category budgets atomically';

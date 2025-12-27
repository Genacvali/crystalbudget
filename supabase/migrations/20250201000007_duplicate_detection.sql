-- Duplicate transaction detection
-- Prevents accidental duplicate entries

-- Function to check for duplicate expenses
CREATE OR REPLACE FUNCTION check_duplicate_expense(
    p_user_id UUID,
    p_category_id UUID,
    p_amount DECIMAL,
    p_date TIMESTAMP WITH TIME ZONE,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    is_duplicate BOOLEAN,
    duplicate_id UUID,
    duplicate_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_duplicate RECORD;
    v_time_window INTERVAL := '2 minutes'; -- Check within 2 minutes
BEGIN
    -- Look for similar transaction within time window
    SELECT e.id, e.created_at INTO v_duplicate
    FROM expenses e
    WHERE e.user_id = p_user_id
      AND e.category_id = p_category_id
      AND e.amount = p_amount
      AND e.date = p_date
      AND (
          (p_description IS NULL AND e.description IS NULL) OR 
          (e.description = p_description)
      )
      AND e.created_at > (NOW() - v_time_window)
    ORDER BY e.created_at DESC
    LIMIT 1;
    
    IF v_duplicate IS NOT NULL THEN
        RETURN QUERY SELECT TRUE, v_duplicate.id, v_duplicate.created_at;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMP WITH TIME ZONE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for duplicate incomes
CREATE OR REPLACE FUNCTION check_duplicate_income(
    p_user_id UUID,
    p_source_id UUID,
    p_amount DECIMAL,
    p_date TIMESTAMP WITH TIME ZONE,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    is_duplicate BOOLEAN,
    duplicate_id UUID,
    duplicate_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_duplicate RECORD;
    v_time_window INTERVAL := '2 minutes';
BEGIN
    SELECT i.id, i.created_at INTO v_duplicate
    FROM incomes i
    WHERE i.user_id = p_user_id
      AND i.source_id = p_source_id
      AND i.amount = p_amount
      AND i.date = p_date
      AND (
          (p_description IS NULL AND i.description IS NULL) OR 
          (i.description = p_description)
      )
      AND i.created_at > (NOW() - v_time_window)
    ORDER BY i.created_at DESC
    LIMIT 1;
    
    IF v_duplicate IS NOT NULL THEN
        RETURN QUERY SELECT TRUE, v_duplicate.id, v_duplicate.created_at;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMP WITH TIME ZONE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced create_expense_atomic with duplicate check
CREATE OR REPLACE FUNCTION create_expense_atomic_safe(
    p_user_id UUID,
    p_category_id UUID,
    p_amount DECIMAL,
    p_date TIMESTAMP WITH TIME ZONE,
    p_description TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'RUB',
    p_check_duplicates BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    expense_id UUID,
    is_duplicate BOOLEAN,
    new_spent DECIMAL,
    new_remaining DECIMAL,
    is_over_budget BOOLEAN
) AS $$
DECLARE
    v_duplicate_check RECORD;
    v_result RECORD;
BEGIN
    -- Check for duplicates if enabled
    IF p_check_duplicates THEN
        SELECT * INTO v_duplicate_check
        FROM check_duplicate_expense(p_user_id, p_category_id, p_amount, p_date, p_description);
        
        IF v_duplicate_check.is_duplicate THEN
            RETURN QUERY SELECT 
                v_duplicate_check.duplicate_id,
                TRUE,
                NULL::DECIMAL,
                NULL::DECIMAL,
                NULL::BOOLEAN;
            RETURN;
        END IF;
    END IF;
    
    -- Create expense using atomic function
    SELECT * INTO v_result
    FROM create_expense_atomic(p_user_id, p_category_id, p_amount, p_date, p_description, p_currency);
    
    RETURN QUERY SELECT 
        v_result.expense_id,
        FALSE,
        v_result.new_spent,
        v_result.new_remaining,
        v_result.is_over_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION check_duplicate_expense IS 'Checks for duplicate expense within 2-minute window';
COMMENT ON FUNCTION check_duplicate_income IS 'Checks for duplicate income within 2-minute window';
COMMENT ON FUNCTION create_expense_atomic_safe IS 'Creates expense with duplicate detection and atomic state update';

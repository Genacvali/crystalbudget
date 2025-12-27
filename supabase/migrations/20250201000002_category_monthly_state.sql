-- Create table for storing monthly category state (debts, carry-overs, allocations)
-- This table stores the calculated state at the end of each month
CREATE TABLE IF NOT EXISTS category_monthly_state (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month (e.g., 2024-01-01)
    currency TEXT NOT NULL DEFAULT 'RUB',
    
    -- Budget allocation for the month
    allocated DECIMAL(15, 2) DEFAULT 0,
    
    -- Actual spending
    spent DECIMAL(15, 2) DEFAULT 0,
    
    -- Carry-over from previous month (positive)
    carry_over DECIMAL(15, 2) DEFAULT 0,
    
    -- Debt from previous month (positive number represents debt)
    debt DECIMAL(15, 2) DEFAULT 0,
    
    -- Remaining balance (allocated + carry_over - spent - debt)
    remaining DECIMAL(15, 2) DEFAULT 0,
    
    -- Version for optimistic locking
    version INTEGER DEFAULT 1,
    
    -- Is month closed for editing
    is_closed BOOLEAN DEFAULT FALSE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one state per category per month per currency
    UNIQUE(category_id, month, currency)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_category_monthly_state_category ON category_monthly_state(category_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_category_monthly_state_user_month ON category_monthly_state(user_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_category_monthly_state_month ON category_monthly_state(month DESC);
CREATE INDEX IF NOT EXISTS idx_category_monthly_state_currency ON category_monthly_state(currency, month DESC);

-- Enable RLS
ALTER TABLE category_monthly_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own category states"
    ON category_monthly_state FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        -- Family owner can see member states
        user_id IN (
            SELECT fm.user_id 
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE f.owner_id = auth.uid()
        )
        OR
        -- Family members can see owner and other member states
        user_id IN (
            SELECT f.owner_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            WHERE fm.user_id = auth.uid()
            UNION
            SELECT fm2.user_id
            FROM family_members fm
            JOIN families f ON f.id = fm.family_id
            JOIN family_members fm2 ON fm2.family_id = f.id
            WHERE fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own category states"
    ON category_monthly_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own category states"
    ON category_monthly_state FOR UPDATE
    USING (auth.uid() = user_id AND is_closed = FALSE);

CREATE POLICY "Users can delete their own category states"
    ON category_monthly_state FOR DELETE
    USING (auth.uid() = user_id AND is_closed = FALSE);

-- Function to calculate and save monthly state
CREATE OR REPLACE FUNCTION calculate_category_monthly_state(
    p_category_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    allocated DECIMAL,
    spent DECIMAL,
    carry_over DECIMAL,
    debt DECIMAL,
    remaining DECIMAL
) AS $$
DECLARE
    v_user_id UUID;
    v_allocated DECIMAL := 0;
    v_spent DECIMAL := 0;
    v_carry_over DECIMAL := 0;
    v_debt DECIMAL := 0;
    v_prev_month_state RECORD;
    v_month_end DATE;
BEGIN
    -- Get category owner
    SELECT user_id INTO v_user_id FROM categories WHERE id = p_category_id;
    
    -- Calculate month boundaries
    v_month_end := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Get previous month state
    SELECT cms.* INTO v_prev_month_state
    FROM category_monthly_state cms
    WHERE cms.category_id = p_category_id
      AND cms.month = (p_month - INTERVAL '1 month')::DATE
      AND cms.currency = p_currency
    LIMIT 1;
    
    -- Calculate spent for current month
    SELECT COALESCE(SUM(e.amount), 0) INTO v_spent
    FROM expenses e
    WHERE e.category_id = p_category_id
      AND e.date >= p_month
      AND e.date <= v_month_end
      AND COALESCE(e.currency, 'RUB') = p_currency;
    
    -- Calculate allocated budget for current month (from category allocations)
    -- This would need to join with incomes and calculate based on allocations
    -- For now, we'll use a simplified approach
    SELECT COALESCE(SUM(ca.allocation_value), 0) INTO v_allocated
    FROM category_allocations ca
    WHERE ca.category_id = p_category_id
      AND ca.allocation_type = 'amount'
      AND COALESCE(ca.currency, 'RUB') = p_currency;
    
    -- Handle previous month state
    IF v_prev_month_state IS NOT NULL THEN
        IF v_prev_month_state.remaining > 0 THEN
            -- Previous month had surplus -> carry over
            v_carry_over := v_prev_month_state.remaining;
        ELSE
            -- Previous month had deficit -> debt
            v_debt := ABS(v_prev_month_state.remaining);
        END IF;
    END IF;
    
    -- Calculate final values
    v_allocated := v_allocated + v_carry_over;
    
    -- Return calculated state
    RETURN QUERY SELECT 
        v_allocated,
        v_spent,
        v_carry_over,
        v_debt,
        v_allocated - v_spent - v_debt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to close a month and calculate final state
CREATE OR REPLACE FUNCTION close_month(
    p_user_id UUID,
    p_month DATE
)
RETURNS void AS $$
DECLARE
    v_category RECORD;
    v_state RECORD;
BEGIN
    -- Calculate and save state for each category
    FOR v_category IN 
        SELECT id FROM categories WHERE user_id = p_user_id
    LOOP
        -- Calculate state for RUB (extend for other currencies as needed)
        SELECT * INTO v_state FROM calculate_category_monthly_state(
            v_category.id,
            p_month,
            'RUB'
        );
        
        -- Insert or update state
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
            is_closed,
            closed_at
        ) VALUES (
            v_category.id,
            p_user_id,
            p_month,
            'RUB',
            v_state.allocated,
            v_state.spent,
            v_state.carry_over,
            v_state.debt,
            v_state.remaining,
            TRUE,
            NOW()
        )
        ON CONFLICT (category_id, month, currency)
        DO UPDATE SET
            allocated = EXCLUDED.allocated,
            spent = EXCLUDED.spent,
            carry_over = EXCLUDED.carry_over,
            debt = EXCLUDED.debt,
            remaining = EXCLUDED.remaining,
            is_closed = TRUE,
            closed_at = NOW(),
            updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE category_monthly_state IS 'Stores monthly state of each category including debts, carry-overs, and allocations';
COMMENT ON FUNCTION calculate_category_monthly_state IS 'Calculates monthly state for a category including carry-over and debt from previous month';
COMMENT ON FUNCTION close_month IS 'Closes a month and saves final state for all categories';

-- ============================================================================
-- OPTIMIZATION: SQL Functions for Telegram Bot Performance
-- ============================================================================
-- Created: 2025-01-14
-- Purpose: Reduce number of database queries and improve bot response time
-- ============================================================================

-- Function to get user context in a single query
-- Combines: effective_user_id, currency, family status
CREATE OR REPLACE FUNCTION get_user_context(p_user_id UUID)
RETURNS TABLE (
  effective_user_id UUID,
  currency TEXT,
  is_family_member BOOLEAN,
  is_family_owner BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(
      (SELECT owner_id FROM families WHERE owner_id = p_user_id),
      (SELECT f.owner_id FROM family_members fm 
       JOIN families f ON f.id = fm.family_id 
       WHERE fm.user_id = p_user_id),
      p_user_id
    ) as effective_user_id,
    COALESCE(up.currency, 'RUB') as currency,
    EXISTS(SELECT 1 FROM family_members WHERE user_id = p_user_id) as is_family_member,
    EXISTS(SELECT 1 FROM families WHERE owner_id = p_user_id) as is_family_owner
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get top N frequently used categories
-- Useful for showing most relevant categories first
CREATE OR REPLACE FUNCTION get_top_categories(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  usage_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.icon,
    COUNT(e.id) as usage_count
  FROM categories c
  LEFT JOIN expenses e ON e.category_id = c.id 
    AND e.created_at > NOW() - INTERVAL '30 days'
  WHERE c.user_id = p_user_id
  GROUP BY c.id, c.name, c.icon
  ORDER BY usage_count DESC, c.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get top N frequently used income sources
CREATE OR REPLACE FUNCTION get_top_income_sources(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  usage_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    COUNT(i.id) as usage_count
  FROM income_sources s
  LEFT JOIN incomes i ON i.source_id = s.id 
    AND i.created_at > NOW() - INTERVAL '30 days'
  WHERE s.user_id = p_user_id
  GROUP BY s.id, s.name
  ORDER BY usage_count DESC, s.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get balance summary in a single query
-- Combines: current month income/expenses, carry-over balance
CREATE OR REPLACE FUNCTION get_balance_summary(p_user_id UUID, p_start_date TIMESTAMP, p_end_date TIMESTAMP)
RETURNS TABLE (
  current_income NUMERIC,
  current_expenses NUMERIC,
  previous_income NUMERIC,
  previous_expenses NUMERIC,
  month_balance NUMERIC,
  total_balance NUMERIC
) AS $$
DECLARE
  v_family_user_ids UUID[];
BEGIN
  -- Get family user IDs if user is in a family
  SELECT ARRAY_AGG(DISTINCT user_id)
  INTO v_family_user_ids
  FROM (
    SELECT p_user_id as user_id
    UNION
    SELECT fm.user_id
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id
    WHERE f.owner_id = p_user_id
  ) users;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(i.amount) FILTER (WHERE i.date >= p_start_date AND i.date <= p_end_date), 0) as current_income,
    COALESCE(SUM(e.amount) FILTER (WHERE e.date >= p_start_date AND e.date <= p_end_date), 0) as current_expenses,
    COALESCE(SUM(i.amount) FILTER (WHERE i.date < p_start_date), 0) as previous_income,
    COALESCE(SUM(e.amount) FILTER (WHERE e.date < p_start_date), 0) as previous_expenses,
    COALESCE(SUM(i.amount) FILTER (WHERE i.date >= p_start_date AND i.date <= p_end_date), 0) - 
      COALESCE(SUM(e.amount) FILTER (WHERE e.date >= p_start_date AND e.date <= p_end_date), 0) as month_balance,
    COALESCE(SUM(i.amount), 0) - COALESCE(SUM(e.amount), 0) as total_balance
  FROM (SELECT unnest(v_family_user_ids) as user_id) u
  LEFT JOIN incomes i ON i.user_id = u.user_id
  LEFT JOIN expenses e ON e.user_id = u.user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Index optimizations for bot queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id, name);
CREATE INDEX IF NOT EXISTS idx_income_sources_user ON income_sources(user_id, name);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_telegram_id ON telegram_bot_sessions(telegram_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_families_owner ON families(owner_id);

-- Add comments for documentation
COMMENT ON FUNCTION get_user_context IS 'Returns user context including effective user ID, currency, and family status in a single query';
COMMENT ON FUNCTION get_top_categories IS 'Returns top N frequently used categories based on last 30 days usage';
COMMENT ON FUNCTION get_top_income_sources IS 'Returns top N frequently used income sources based on last 30 days usage';
COMMENT ON FUNCTION get_balance_summary IS 'Returns complete balance summary including current month and carry-over balance';


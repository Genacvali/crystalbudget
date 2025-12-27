-- Materialized views for caching expensive aggregations
-- These views are refreshed periodically or on-demand

-- Monthly category summary (cached aggregation)
CREATE MATERIALIZED VIEW IF NOT EXISTS category_monthly_summary AS
SELECT 
    e.category_id,
    c.user_id,
    DATE_TRUNC('month', e.date)::DATE as month,
    COALESCE(e.currency, 'RUB') as currency,
    COUNT(*) as transaction_count,
    SUM(e.amount) as total_spent,
    MIN(e.date) as first_transaction,
    MAX(e.date) as last_transaction,
    AVG(e.amount) as avg_amount
FROM expenses e
JOIN categories c ON c.id = e.category_id
GROUP BY e.category_id, c.user_id, DATE_TRUNC('month', e.date)::DATE, COALESCE(e.currency, 'RUB');

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_monthly_summary_unique 
ON category_monthly_summary(category_id, month, currency);

CREATE INDEX IF NOT EXISTS idx_category_monthly_summary_user 
ON category_monthly_summary(user_id, month DESC);

-- Monthly income source summary
CREATE MATERIALIZED VIEW IF NOT EXISTS income_source_monthly_summary AS
SELECT 
    i.source_id,
    ics.user_id,
    DATE_TRUNC('month', i.date)::DATE as month,
    COALESCE(i.currency, 'RUB') as currency,
    COUNT(*) as transaction_count,
    SUM(i.amount) as total_income,
    MIN(i.date) as first_transaction,
    MAX(i.date) as last_transaction,
    AVG(i.amount) as avg_amount
FROM incomes i
JOIN income_sources ics ON ics.id = i.source_id
GROUP BY i.source_id, ics.user_id, DATE_TRUNC('month', i.date)::DATE, COALESCE(i.currency, 'RUB');

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_source_monthly_summary_unique 
ON income_source_monthly_summary(source_id, month, currency);

CREATE INDEX IF NOT EXISTS idx_income_source_monthly_summary_user 
ON income_source_monthly_summary(user_id, month DESC);

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_monthly_summaries()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY category_monthly_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY income_source_monthly_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to refresh views after transaction insert/update/delete
CREATE OR REPLACE FUNCTION trigger_refresh_summaries()
RETURNS TRIGGER AS $$
BEGIN
    -- In production, you might want to debounce this or use a queue
    -- For now, refresh immediately (can be optimized with pg_cron)
    PERFORM refresh_monthly_summaries();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (commented out by default - enable if needed, but can be expensive)
-- CREATE TRIGGER after_expense_change
-- AFTER INSERT OR UPDATE OR DELETE ON expenses
-- FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_summaries();

-- CREATE TRIGGER after_income_change
-- AFTER INSERT OR UPDATE OR DELETE ON incomes
-- FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_summaries();

-- Function to get cached monthly data
CREATE OR REPLACE FUNCTION get_cached_month_data(
    p_user_id UUID,
    p_month DATE,
    p_currency TEXT DEFAULT 'RUB'
)
RETURNS TABLE(
    total_income DECIMAL,
    total_expenses DECIMAL,
    balance DECIMAL,
    categories_count INTEGER,
    sources_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(
            (SELECT SUM(isms.total_income) 
             FROM income_source_monthly_summary isms 
             WHERE isms.user_id = p_user_id 
               AND isms.month = p_month 
               AND isms.currency = p_currency),
            0
        ) as total_income,
        COALESCE(
            (SELECT SUM(cms.total_spent) 
             FROM category_monthly_summary cms 
             WHERE cms.user_id = p_user_id 
               AND cms.month = p_month 
               AND cms.currency = p_currency),
            0
        ) as total_expenses,
        COALESCE(
            (SELECT SUM(isms.total_income) 
             FROM income_source_monthly_summary isms 
             WHERE isms.user_id = p_user_id 
               AND isms.month = p_month 
               AND isms.currency = p_currency),
            0
        ) - COALESCE(
            (SELECT SUM(cms.total_spent) 
             FROM category_monthly_summary cms 
             WHERE cms.user_id = p_user_id 
               AND cms.month = p_month 
               AND cms.currency = p_currency),
            0
        ) as balance,
        (SELECT COUNT(DISTINCT cms.category_id)::INTEGER 
         FROM category_monthly_summary cms 
         WHERE cms.user_id = p_user_id 
           AND cms.month = p_month 
           AND cms.currency = p_currency) as categories_count,
        (SELECT COUNT(DISTINCT isms.source_id)::INTEGER 
         FROM income_source_monthly_summary isms 
         WHERE isms.user_id = p_user_id 
           AND isms.month = p_month 
           AND isms.currency = p_currency) as sources_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Comments
COMMENT ON MATERIALIZED VIEW category_monthly_summary IS 'Cached monthly aggregations for categories to improve query performance';
COMMENT ON MATERIALIZED VIEW income_source_monthly_summary IS 'Cached monthly aggregations for income sources to improve query performance';
COMMENT ON FUNCTION get_cached_month_data IS 'Returns cached monthly data without recalculating from all transactions';
COMMENT ON FUNCTION refresh_monthly_summaries IS 'Refreshes materialized views - call after batch operations';

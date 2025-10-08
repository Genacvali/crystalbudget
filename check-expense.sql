-- Check recent expenses for user
SELECT
  e.id,
  e.user_id,
  e.amount,
  e.description,
  e.date,
  to_char(e.date, 'YYYY-MM-DD HH24:MI:SS') as formatted_date,
  to_char(e.date, 'YYYY-MM') as year_month,
  c.name as category_name,
  c.icon as category_icon,
  e.created_at
FROM expenses e
LEFT JOIN categories c ON e.category_id = c.id
WHERE e.user_id = '5580e912-0a51-41a6-89d6-4330405a3e45'
ORDER BY e.created_at DESC
LIMIT 10;

-- Check if there's an expense for Boosty.to
SELECT
  e.id,
  e.amount,
  e.description,
  e.date,
  to_char(e.date, 'YYYY-MM-DD HH24:MI:SS') as formatted_date
FROM expenses e
WHERE e.user_id = '5580e912-0a51-41a6-89d6-4330405a3e45'
  AND e.description LIKE '%Boosty%'
ORDER BY e.created_at DESC
LIMIT 5;

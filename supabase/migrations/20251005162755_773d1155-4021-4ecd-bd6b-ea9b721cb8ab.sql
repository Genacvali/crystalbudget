-- Schedule cleanup job to run every minute
SELECT cron.schedule(
  'cleanup-expired-codes',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://tpecbskafbazzlgytbpf.supabase.co/functions/v1/cleanup-expired-codes',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZWNic2thZmJhenpsZ3l0YnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MzQ3MzcsImV4cCI6MjA3NTExMDczN30.Y0S40s0FZigfNBwmkIgBBloTjlBZdqCTnZK0cZxNwmc"}'::jsonb
  ) as request_id;
  $$
);
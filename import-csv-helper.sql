-- Временно отключаем foreign key constraints для импорта CSV
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_user_id_fkey;
ALTER TABLE public.income_sources DROP CONSTRAINT IF EXISTS income_sources_user_id_fkey;
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_user_id_fkey;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_linked_source_id_fkey;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_id_fkey;
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_source_id_fkey;

-- После импорта CSV выполните эту команду, заменив YOUR_USER_ID на ваш реальный user_id
-- Получить свой user_id можно так: SELECT auth.uid();

-- Обновляем все записи на текущего пользователя
UPDATE public.categories SET user_id = auth.uid() WHERE user_id IS NOT NULL;
UPDATE public.income_sources SET user_id = auth.uid() WHERE user_id IS NOT NULL;
UPDATE public.incomes SET user_id = auth.uid() WHERE user_id IS NOT NULL;
UPDATE public.expenses SET user_id = auth.uid() WHERE user_id IS NOT NULL;

-- Восстанавливаем foreign key constraints
ALTER TABLE public.categories
  ADD CONSTRAINT categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_linked_source_id_fkey
  FOREIGN KEY (linked_source_id) REFERENCES public.income_sources(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_source_id_fkey
  FOREIGN KEY (source_id) REFERENCES public.income_sources(id) ON DELETE CASCADE;

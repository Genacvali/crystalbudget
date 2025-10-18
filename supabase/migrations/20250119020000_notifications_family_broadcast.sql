-- Broadcast notifications to all family members (owner + members)
-- Updates create_transaction_notification() to insert notifications
-- for every user in the family of the actor, or only the actor if no family

CREATE OR REPLACE FUNCTION create_transaction_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
  source_name TEXT;
  category_name TEXT;
  currency_symbol TEXT := '₽';
  fam_id UUID;
  recipient_ids UUID[];
  recipient_id UUID;
  actor_name TEXT;
BEGIN
  -- Determine family of the actor (NEW.user_id)
  SELECT id INTO fam_id FROM families WHERE owner_id = NEW.user_id;
  IF fam_id IS NULL THEN
    SELECT family_id INTO fam_id FROM family_members WHERE user_id = NEW.user_id LIMIT 1;
  END IF;

  IF fam_id IS NOT NULL THEN
    -- Collect owner and all members
    SELECT array_agg(u_id) INTO recipient_ids FROM (
      SELECT owner_id AS u_id FROM families WHERE id = fam_id
      UNION
      SELECT user_id AS u_id FROM family_members WHERE family_id = fam_id
    ) AS ids;
  ELSE
    recipient_ids := ARRAY[NEW.user_id];
  END IF;

  -- Build content by table
  -- Resolve actor name
  SELECT full_name INTO actor_name FROM profiles WHERE user_id = NEW.user_id;

  IF TG_TABLE_NAME = 'incomes' THEN
    SELECT name INTO source_name FROM income_sources WHERE id = NEW.source_id;
    notification_title := 'Доход добавлен';
    notification_message := format('Получен доход %s %s от источника "%s"',
      NEW.amount::TEXT, currency_symbol, COALESCE(source_name, 'Неизвестный источник'));

    -- Insert for each recipient
    FOREACH recipient_id IN ARRAY recipient_ids LOOP
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        recipient_id,
        'income',
        notification_title,
        notification_message,
        jsonb_build_object(
          'amount', NEW.amount,
          'source_id', NEW.source_id,
          'transaction_id', NEW.id,
          'actor_id', NEW.user_id,
          'actor_name', COALESCE(actor_name, 'Участник семьи')
        )
      );
    END LOOP;

  ELSIF TG_TABLE_NAME = 'expenses' THEN
    SELECT name INTO category_name FROM categories WHERE id = NEW.category_id;
    notification_title := 'Расход добавлен';
    notification_message := format('Потрачено %s %s на категорию "%s"',
      NEW.amount::TEXT, currency_symbol, COALESCE(category_name, 'Неизвестная категория'));

    -- Insert for each recipient
    FOREACH recipient_id IN ARRAY recipient_ids LOOP
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        recipient_id,
        'expense',
        notification_title,
        notification_message,
        jsonb_build_object(
          'amount', NEW.amount,
          'category_id', NEW.category_id,
          'transaction_id', NEW.id,
          'actor_id', NEW.user_id,
          'actor_name', COALESCE(actor_name, 'Участник семьи')
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;



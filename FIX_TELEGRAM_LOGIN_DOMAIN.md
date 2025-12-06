# Исправление ошибки "Bot domain invalid"

## Проблема
Telegram Login Widget не может загрузиться, так как домен не зарегистрирован в настройках бота.

## Решение: Настройка домена через BotFather

### Шаг 1: Откройте BotFather в Telegram

1. Найдите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте команду `/mybots`
3. Выберите **CrystalBudget_bot** (или ваш бот)

### Шаг 2: Измените домен на основной (БЕЗ www)

**ВАЖНО:** Сейчас в BotFather зарегистрирован `www.crystalbudget.net`, но нужно использовать `crystalbudget.net` (без www)

1. Нажмите кнопку **"Bot Settings"**
2. Нажмите **"Domain"**
3. Нажмите **"Edit domain"** или **"Remove domain"**
4. Введите домен: `crystalbudget.net` (БЕЗ www)
5. Подтвердите

**Почему без www?**
- На сервере настроен редирект с `www.crystalbudget.net` на `crystalbudget.net`
- Все пользователи будут автоматически перенаправляться на основной домен
- Telegram Login Widget будет работать на основном домене

## Альтернативное решение: Редирект на один домен

Чтобы избежать проблем с несколькими доменами, настройте редирект в nginx:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.crystalbudget.net;
    return 301 $scheme://crystalbudget.net$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.crystalbudget.net;
    
    ssl_certificate     /etc/letsencrypt/live/crystalbudget.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crystalbudget.net/privkey.pem;
    
    return 301 $scheme://crystalbudget.net$request_uri;
}
```

Затем зарегистрируйте только `crystalbudget.net` в BotFather.

## Проверка после настройки

1. Откройте https://crystalbudget.net в браузере
2. Попробуйте войти через Telegram
3. Виджет должен загрузиться без ошибки "Bot domain invalid"

## Для мобильных устройств

На мобильных устройствах (iPhone, Android) рекомендуется:
- Открывать приложение через Telegram бота
- Использовать вход по email/паролю
- После настройки домена, виджет будет работать и на мобильных

## Важно

После регистрации домена в BotFather может потребоваться несколько минут для применения изменений.


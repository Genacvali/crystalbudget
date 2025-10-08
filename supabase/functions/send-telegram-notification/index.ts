import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendTelegramMessage(chatId: number, text: string, keyboard?: any) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
  };

  if (keyboard) {
    body.reply_markup = keyboard;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return await response.json();
}

function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: '💰 Финансы' }, { text: '📊 Отчёты' }],
      [{ text: '⚙️ Настройки' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Требуется авторизация');
    }

    // Verify user
    const supabaseClient = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Неверный токен авторизации');
    }

    // Get telegram_id for this user
    const { data: telegramUser, error: telegramError } = await supabase
      .from('telegram_users')
      .select('telegram_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (telegramError || !telegramUser) {
      throw new Error('Telegram не связан с аккаунтом');
    }

    // Send welcome message with quick guide
    await sendTelegramMessage(
      telegramUser.telegram_id,
      `🎉 <b>Добро пожаловать в CrystalBudget!</b>\n\n` +
      `Теперь вы можете управлять своими финансами прямо из Telegram!\n\n` +
      `<b>📱 Быстрый старт:</b>\n\n` +
      `💰 <b>Финансы</b>\n` +
      `• Быстро добавляйте доходы и расходы\n` +
      `• Сканируйте чеки с помощью AI\n` +
      `• Говорите голосом: "Купил продуктов на 500 рублей"\n\n` +
      `📊 <b>Отчёты</b>\n` +
      `• Смотрите баланс в реальном времени\n` +
      `• Анализируйте категории расходов\n` +
      `• Отслеживайте источники дохода\n\n` +
      `⚙️ <b>Настройки</b>\n` +
      `• Получите помощь по боту\n\n` +
      `💡 <b>Совет:</b> Создайте категории и источники дохода в веб-приложении, а затем используйте бота для быстрого добавления транзакций!\n\n` +
      `Используйте кнопки меню ниже 👇`,
      getMainKeyboard()
    );

    // Mark welcome as sent
    await supabase
      .from('telegram_users')
      .update({ welcome_sent: true })
      .eq('telegram_id', telegramUser.telegram_id);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Ошибка отправки уведомления'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

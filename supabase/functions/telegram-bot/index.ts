import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Примерные курсы валют к рублю (можно заменить на API)
const exchangeRates: Record<string, number> = {
  RUB: 1,
  USD: 0.01, // 1 USD = 100 RUB
  EUR: 0.011, // 1 EUR = 90 RUB
  GBP: 0.012, // 1 GBP = 85 RUB
  JPY: 0.067, // 1 JPY = 15 RUB
  CNY: 0.014, // 1 CNY = 70 RUB
  KRW: 0.0075, // 1 KRW = 130 RUB
  GEL: 0.033, // 1 GEL = 30 RUB
  AMD: 0.025, // 1 AMD = 40 RUB
};

// Currency symbols mapping
const currencySymbols: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  GEL: '₾',
  AMD: '֏',
};

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
  };
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size: number;
    width: number;
    height: number;
  }>;
  caption?: string;
}

interface CallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
  };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
}

// User session storage for multi-step operations (now in database)
async function getSession(telegramId: number) {
  const { data, error } = await supabase
    .from('telegram_bot_sessions')
    .select('session_data')
    .eq('telegram_id', telegramId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  return data?.session_data || null;
}

async function setSession(telegramId: number, sessionData: any) {
  const { error } = await supabase
    .from('telegram_bot_sessions')
    .upsert({
      telegram_id: telegramId,
      session_data: sessionData,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
    });

  if (error) {
    console.error('Error setting session:', error);
  }
}

async function deleteSession(telegramId: number) {
  await supabase
    .from('telegram_bot_sessions')
    .delete()
    .eq('telegram_id', telegramId);
}

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

  console.log(`Sending message to ${chatId}, has keyboard: ${!!keyboard}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`Telegram API error: ${JSON.stringify(result)}`);
    } else {
      console.log(`Message sent successfully`);
    }

    return result;
  } catch (error) {
    console.error(`Error sending message: ${error}`);
    throw error;
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`answerCallbackQuery failed: ${JSON.stringify(result)}`);
    } else {
      console.log(`answerCallbackQuery success for ${callbackQueryId}`);
    }

    return result;
  } catch (error) {
    console.error(`Error in answerCallbackQuery: ${error}`);
    throw error;
  }
}

async function getUserByTelegramId(telegramId: number) {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('user_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }

  return data?.user_id || null;
}

async function getUserCurrency(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('currency')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user currency:', error);
    return 'RUB'; // Default currency
  }

  return data?.currency || 'RUB';
}

function formatAmount(amountInRubles: number, currency: string): string {
  const rate = exchangeRates[currency] || 1;
  const convertedAmount = amountInRubles * rate;
  const symbol = currencySymbols[currency] || '₽';
  return `${convertedAmount.toLocaleString('ru-RU')} ${symbol}`;
}

// Конвертирует сумму из выбранной валюты в рубли
function convertToRubles(amount: number, currency: string): number {
  const rate = exchangeRates[currency] || 1;
  return amount / rate;
}

async function hasActiveSubscription(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('Error checking subscription:', error);
    return false;
  }

  return !!data;
}

async function getSubscriptionInfo(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('Error getting subscription:', error);
    return null;
  }

  return data;
}

function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: '💰 Финансы' }],
      [{ text: '⚙️ Настройки' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getFinanceKeyboard() {
  return {
    keyboard: [
      [{ text: '💸 Добавить расход' }, { text: '💰 Добавить доход' }],
      [{ text: '📸 Сканировать чек' }],
      [{ text: '🔙 Назад' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getReportsKeyboard() {
  return {
    keyboard: [
      [{ text: '📊 Баланс' }],
      [{ text: '📁 Категории' }, { text: '💵 Источники' }],
      [{ text: '🔙 Назад' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getSettingsKeyboard() {
  return {
    keyboard: [
      [{ text: '🌍 Валюта' }],
      [{ text: '❓ Помощь' }],
      [{ text: '🔙 Назад' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getCurrencyKeyboard() {
  // Supported currencies should match user_preferences.currency values
  const codes = ['RUB','USD','EUR','GBP','JPY','CNY','KRW','GEL','AMD'];
  // Build inline keyboard in 3 columns
  const rows: any[] = [];
  for (let i = 0; i < codes.length; i += 3) {
    rows.push(
      codes.slice(i, i + 3).map((code) => ({ text: `${currencySymbols[code] || ''} ${code}`, callback_data: `currency_${code}` }))
    );
  }
  // Use dedicated back callback for currency menu
  rows.push([{ text: '🔙 Назад', callback_data: 'currency_back' }]);
  return { inline_keyboard: rows };
}

async function generateCloudPaymentsLink(userId: string, planType: string, amount: number, email?: string): Promise<string> {
  const CLOUDPAYMENTS_PUBLIC_ID = Deno.env.get('CLOUDPAYMENTS_PUBLIC_ID');

  const orderId = `sub_${userId}_${planType}_${Date.now()}`;

  // Store payment info in session for webhook validation
  await supabase.from('telegram_bot_sessions').upsert({
    telegram_id: 0, // Using 0 as placeholder for payment sessions
    session_data: {
      type: 'payment_pending',
      orderId,
      userId,
      planType,
      amount
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  }, {
    onConflict: 'telegram_id'
  });

  // Create CloudPayments widget URL
  const paymentUrl = `https://widget.cloudpayments.ru/pay?publicId=${CLOUDPAYMENTS_PUBLIC_ID}&description=Подписка CrystalBudget&amount=${amount}&currency=RUB&accountId=${userId}&invoiceId=${orderId}&email=${email || ''}`;

  return paymentUrl;
}

async function handleStart(chatId: number, telegramId: number, firstName: string, lastName?: string, username?: string) {
  // Check if already linked
  const userId = await getUserByTelegramId(telegramId);

  if (userId) {
    await sendTelegramMessage(
      chatId,
      `👋 Привет, ${firstName}!\n\n` +
      `Ваш аккаунт связан с CrystalBudget.\n` +
      `Используйте кнопки меню для управления бюджетом.\n\n` +
      `💡 Нажмите ❓ Помощь для получения инструкций.`,
      getMainKeyboard()
    );
    return;
  }

  // Generate auth code
  const authCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { error } = await supabase
    .from('telegram_auth_codes')
    .insert({
      telegram_id: telegramId,
      auth_code: authCode,
      telegram_username: username,
      telegram_first_name: firstName,
      telegram_last_name: lastName,
    });

  if (error) {
    console.error('Error creating auth code:', error);
    await sendTelegramMessage(chatId, '❌ Ошибка создания кода авторизации. Попробуйте позже.');
    return;
  }

  await sendTelegramMessage(
    chatId,
    `👋 Привет, ${firstName}!\n\n` +
    `🔐 Ваш код авторизации:\n<code>${authCode}</code>\n\n` +
    `📱 Введите этот код на странице настроек в приложении CrystalBudget.\n\n` +
    `⏱ Код действителен 10 минут.`
  );
}

async function handleBalance(chatId: number, userId: string) {
  // Get user currency
  const currency = await getUserCurrency(userId);

  // Check if user has a family
  const { data: familyMember } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .maybeSingle();

  // Get current month boundaries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Get all family members if user has a family
  let familyUserIds = [userId];
  if (familyMember) {
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyMember.family_id);

    if (familyMembers) {
      familyUserIds = familyMembers.map(m => m.user_id);
    }
  }

  // Get current month income and expenses (for all family members)
  const { data: incomes } = await supabase
    .from('incomes')
    .select('amount')
    .in('user_id', familyUserIds)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth);

  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .in('user_id', familyUserIds)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth);

  // Get previous months for carry-over balance (for all family members)
  const { data: previousIncomes } = await supabase
    .from('incomes')
    .select('amount')
    .in('user_id', familyUserIds)
    .lt('date', startOfMonth);

  const { data: previousExpenses } = await supabase
    .from('expenses')
    .select('amount')
    .in('user_id', familyUserIds)
    .lt('date', startOfMonth);

  const currentMonthIncome = (incomes || []).reduce((sum, inc) => sum + Number(inc.amount), 0);
  const currentMonthExpenses = (expenses || []).reduce((sum, exp) => sum + Number(exp.amount), 0);
  const monthBalance = currentMonthIncome - currentMonthExpenses;

  const previousTotalIncome = (previousIncomes || []).reduce((sum, inc) => sum + Number(inc.amount), 0);
  const previousTotalExpenses = (previousExpenses || []).reduce((sum, exp) => sum + Number(exp.amount), 0);
  const carryOverBalance = previousTotalIncome - previousTotalExpenses;

  const totalBalance = monthBalance + carryOverBalance;

  const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(now);

  await sendTelegramMessage(
    chatId,
    `📊 <b>Баланс за ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>\n` +
    `${monthBalance > 0 ? '✅' : monthBalance < 0 ? '❌' : '➖'} <b>${formatAmount(monthBalance, currency)}</b>\n` +
    `${monthBalance > 0 ? 'Профицит' : monthBalance < 0 ? 'Дефицит' : 'Ноль'}\n\n` +
    `📉 <b>Общие расходы</b>\n` +
    `<b>${formatAmount(currentMonthExpenses, currency)}</b>\n` +
    (currentMonthIncome > 0 ? `${Math.round(currentMonthExpenses / currentMonthIncome * 100)}% от дохода\n\n` : '\n') +
    `💰 <b>Общий баланс</b>\n` +
    `<b>${formatAmount(totalBalance, currency)}</b>\n` +
    (carryOverBalance !== 0 ? `${formatAmount(monthBalance, currency)} + ${formatAmount(carryOverBalance, currency)} остаток` : `Только за ${monthName}`),
    getMainKeyboard()
  );
}

async function handleCategories(chatId: number, userId: string) {
  const { data: categories } = await supabase
    .from('categories')
    .select('name, icon')
    .eq('user_id', userId)
    .order('name');

  if (!categories || categories.length === 0) {
    await sendTelegramMessage(
      chatId,
      '📁 У вас пока нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.',
      getMainKeyboard()
    );
    return;
  }

  const categoryList = categories
    .map(cat => `${cat.icon} ${cat.name}`)
    .join('\n');

  await sendTelegramMessage(
    chatId,
    `📁 <b>Ваши категории (${categories.length}):</b>\n\n${categoryList}`,
    getMainKeyboard()
  );
}

async function handleSources(chatId: number, userId: string) {
  // Get user currency
  const currency = await getUserCurrency(userId);

  const { data: sources } = await supabase
    .from('income_sources')
    .select('name, color, amount')
    .eq('user_id', userId)
    .order('name');

  if (!sources || sources.length === 0) {
    await sendTelegramMessage(
      chatId,
      '💵 У вас пока нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.',
      getMainKeyboard()
    );
    return;
  }

  const sourceList = sources
    .map(src => {
      const amount = src.amount ? ` (${formatAmount(Number(src.amount), currency)})` : '';
      return `💵 ${src.name}${amount}`;
    })
    .join('\n');

  await sendTelegramMessage(
    chatId,
    `💵 <b>Ваши источники дохода (${sources.length}):</b>\n\n${sourceList}`,
    getMainKeyboard()
  );
}

async function handleSubscription(chatId: number, userId: string) {
  const subscription = await getSubscriptionInfo(userId);

  if (subscription) {
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const planNames: Record<string, string> = {
      trial: '🎁 Пробный период',
      monthly: '📅 Месячная подписка',
      quarterly: '📆 Подписка на 3 месяца',
      yearly: '📊 Годовая подписка'
    };

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 Продлить подписку', callback_data: 'sub_renew' }],
        [{ text: '🔙 Назад', callback_data: 'sub_back' }]
      ]
    };

    await sendTelegramMessage(
      chatId,
      `💎 <b>Информация о подписке</b>\n\n` +
      `${planNames[subscription.plan_type] || subscription.plan_type}\n` +
      `Статус: ${daysLeft > 0 ? '✅ Активна' : '❌ Истекла'}\n` +
      `Действует до: ${expiresAt.toLocaleDateString('ru-RU')}\n` +
      `Осталось дней: ${daysLeft}\n\n` +
      `<b>Доступные функции:</b>\n` +
      `✅ Сканирование чеков\n` +
      `✅ Голосовые сообщения\n` +
      `✅ Неограниченное использование`,
      keyboard
    );
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: '💳 Месяц - 99₽', callback_data: 'sub_monthly' }],
        [{ text: '💳 3 месяца - 256₽ (выгода 13%)', callback_data: 'sub_quarterly' }],
        [{ text: '💳 Год - 1200₽ (выгода 33%)', callback_data: 'sub_yearly' }],
        [{ text: '🔙 Назад', callback_data: 'sub_back' }]
      ]
    };

    await sendTelegramMessage(
      chatId,
      `💎 <b>Премиум подписка</b>\n\n` +
      `Получите доступ к:\n` +
      `✅ Сканированию чеков с AI\n` +
      `✅ Голосовым сообщениям\n` +
      `✅ Неограниченному использованию\n\n` +
      `<b>Планы подписки:</b>\n` +
      `💳 <b>Месяц</b> - 99₽\n` +
      `💳 <b>3 месяца</b> - 256₽ (выгода 13%)\n` +
      `💳 <b>Год</b> - 1200₽ (выгода 33%)\n\n` +
      `🎁 <b>Новым пользователям 5 дней бесплатно!</b>\n\n` +
      `Выберите план подписки:`,
      keyboard
    );
  }
}

async function startAddExpense(chatId: number, userId: string) {
  console.log(`startAddExpense called for user ${userId}`);

  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, icon')
      .eq('user_id', userId)
      .order('name')
      .limit(10);

    console.log(`Categories query result: ${categories?.length || 0} categories, error: ${error?.message || 'none'}`);

    if (error) {
      console.error('Error fetching categories:', error);
      await sendTelegramMessage(
        chatId,
        '❌ Ошибка получения категорий. Попробуйте позже.',
        getMainKeyboard()
      );
      return;
    }

    if (!categories || categories.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.',
        getMainKeyboard()
      );
      return;
    }

    // Create inline keyboard with categories
    const keyboard = {
      inline_keyboard: categories.map(cat => [{
        text: `${cat.icon} ${cat.name}`,
        callback_data: `exp_cat_${cat.id}`
      }])
    };

    console.log(`Sending expense keyboard with ${categories.length} categories`);
    await sendTelegramMessage(
      chatId,
      '💸 <b>Добавить расход</b>\n\nВыберите категорию:',
      keyboard
    );
  } catch (err) {
    console.error('Exception in startAddExpense:', err);
    await sendTelegramMessage(
      chatId,
      '❌ Произошла ошибка. Попробуйте позже.',
      getMainKeyboard()
    );
  }
}

async function startAddIncome(chatId: number, userId: string) {
  console.log(`startAddIncome called for user ${userId}`);

  try {
    const { data: sources, error } = await supabase
      .from('income_sources')
      .select('id, name')
      .eq('user_id', userId)
      .order('name')
      .limit(10);

    console.log(`Sources query result: ${sources?.length || 0} sources, error: ${error?.message || 'none'}`);

    if (error) {
      console.error('Error fetching sources:', error);
      await sendTelegramMessage(
        chatId,
        '❌ Ошибка получения источников дохода. Попробуйте позже.',
        getMainKeyboard()
      );
      return;
    }

    if (!sources || sources.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ У вас нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.',
        getMainKeyboard()
      );
      return;
    }

    // Create inline keyboard with sources
    const keyboard = {
      inline_keyboard: sources.map(src => [{
        text: `💵 ${src.name}`,
        callback_data: `inc_src_${src.id}`
      }])
    };

    console.log(`Sending income keyboard with ${sources.length} sources`);
    await sendTelegramMessage(
      chatId,
      '💰 <b>Добавить доход</b>\n\nВыберите источник:',
      keyboard
    );
  } catch (err) {
    console.error('Exception in startAddIncome:', err);
    await sendTelegramMessage(
      chatId,
      '❌ Произошла ошибка. Попробуйте позже.',
      getMainKeyboard()
    );
  }
}

async function handleCallbackQuery(query: CallbackQuery) {
  const chatId = query.message!.chat.id;
  const telegramId = query.from.id;
  const data = query.data!;

  console.log(`handleCallbackQuery: data="${data}", telegramId=${telegramId}`);

  const userId = await getUserByTelegramId(telegramId);
  console.log(`User ID from telegram: ${userId || 'not found'}`);

  if (!userId) {
    // answerCallbackQuery уже вызван в main handler
    await sendTelegramMessage(chatId, '❌ Вы не авторизованы. Используйте /start');
    return;
  }

  // Get user currency
  const currency = await getUserCurrency(userId);

  // Handle expense category selection
  if (data.startsWith('exp_cat_')) {
    console.log(`Handling expense category selection`);
    const categoryId = data.replace('exp_cat_', '');
    console.log(`Category ID: ${categoryId}`);

    await setSession(telegramId, { type: 'expense', categoryId });
    console.log(`Session set for expense with category ${categoryId}`);

    await sendTelegramMessage(
      chatId,
      '💸 Введите сумму расхода:\n\nНапример: <code>500</code> или <code>1500 Покупка продуктов</code>\n\nНажмите <b>🔙 Назад</b>, чтобы отменить'
    );
    return;
  }

  // Handle income source selection
  if (data.startsWith('inc_src_')) {
    console.log(`Handling income source selection`);
    const sourceId = data.replace('inc_src_', '');
    console.log(`Source ID: ${sourceId}`);

    await setSession(telegramId, { type: 'income', sourceId });
    console.log(`Session set for income with source ${sourceId}`);

    await sendTelegramMessage(
      chatId,
      '💰 Введите сумму дохода:\n\nНапример: <code>50000</code> или <code>50000 Зарплата за октябрь</code>\n\nНажмите <b>🔙 Назад</b>, чтобы отменить'
    );
    return;
  }

  // Handle receipt category confirmation
  if (data.startsWith('receipt_cat_')) {
    console.log(`Receipt category confirmation: categoryId from callback`);
    const categoryId = data.replace('receipt_cat_', '');

    // Get session with receipt data
    const session = await getSession(telegramId);
    console.log(`Session retrieved: ${JSON.stringify(session)}`);

    if (!session || session.type !== 'receipt_confirmation') {
      console.log('Session invalid or expired');
      await sendTelegramMessage(chatId, '❌ Сессия истекла. Отправьте чек заново.');
      return;
    }

    const receiptData = session.receiptData;
    console.log(`Receipt data: amount=${receiptData.amount}, store=${receiptData.store}`);

    // Get category info
    const { data: categoryData, error: catError } = await supabase
      .from('categories')
      .select('name, icon')
      .eq('id', categoryId)
      .single();

    console.log(`Category data: ${categoryData ? categoryData.name : 'not found'}, error: ${catError?.message || 'none'}`);

    if (catError || !categoryData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения категории');
      return;
    }

    // Create expense with proper date format
    let expenseDate: string;
    if (receiptData.date) {
      // If date is in YYYY-MM-DD format, convert to full ISO timestamp
      if (receiptData.date.length === 10) {
        expenseDate = new Date(receiptData.date + 'T12:00:00.000Z').toISOString();
      } else {
        expenseDate = new Date(receiptData.date).toISOString();
      }
    } else {
      expenseDate = new Date().toISOString();
    }

    console.log(`Creating expense: userId=${userId}, categoryId=${categoryId}, amount=${receiptData.amount}, date=${expenseDate}, originalDate=${receiptData.date}`);

    const { data: insertedExpense, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        category_id: categoryId,
        amount: convertToRubles(receiptData.amount, currency),
        description: receiptData.description || receiptData.store,
        date: expenseDate,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating expense:', error);
      await sendTelegramMessage(
        chatId,
        `❌ Ошибка сохранения расхода: ${error.message}`,
        getMainKeyboard()
      );
      return;
    }

    console.log('Expense created successfully:', JSON.stringify(insertedExpense));

    // Clear session
    await deleteSession(telegramId);

    await sendTelegramMessage(
      chatId,
      `✅ <b>Чек сохранён!</b>\n\n` +
      `💸 Сумма: <b>${formatAmount(receiptData.amount, currency)}</b>\n` +
      `📁 ${categoryData.icon} ${categoryData.name}\n` +
      `🏪 ${receiptData.store}\n` +
      (receiptData.description ? `📝 ${receiptData.description}` : ''),
      getMainKeyboard()
    );
    return;
  }

  // Handle voice expense confirmation
  if (data.startsWith('voice_exp_')) {
    const categoryId = data.replace('voice_exp_', '');
    const session = await getSession(telegramId);

    if (!session || session.type !== 'voice_expense_confirmation') {
      await sendTelegramMessage(chatId, '❌ Сессия истекла');
      return;
    }

    // Get category info
    const { data: categoryData, error: catError } = await supabase
      .from('categories')
      .select('name, icon')
      .eq('id', categoryId)
      .single();

    if (catError || !categoryData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения категории');
      return;
    }

    // Create expense
    const { error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        category_id: categoryId,
        amount: convertToRubles(session.amount, currency),
        description: session.description,
        date: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating voice expense:', error);
      await sendTelegramMessage(chatId, `❌ Ошибка: ${error.message}`);
      return;
    }

    await deleteSession(telegramId);

    await sendTelegramMessage(
      chatId,
      `✅ <b>Расход сохранён!</b>\n\n` +
      `🎤 "${session.transcribedText}"\n\n` +
      `💸 Сумма: <b>${formatAmount(session.amount, currency)}</b>\n` +
      `📁 ${categoryData.icon} ${categoryData.name}\n` +
      (session.description ? `📝 ${session.description}` : ''),
      getMainKeyboard()
    );
    return;
  }

  // Handle voice income confirmation
  if (data.startsWith('voice_inc_')) {
    const sourceId = data.replace('voice_inc_', '');
    const session = await getSession(telegramId);

    if (!session || session.type !== 'voice_income_confirmation') {
      await sendTelegramMessage(chatId, '❌ Сессия истекла');
      return;
    }

    // Get source info
    const { data: sourceData, error: srcError } = await supabase
      .from('income_sources')
      .select('name')
      .eq('id', sourceId)
      .single();

    if (srcError || !sourceData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения источника');
      return;
    }

    // Create income
    const { error } = await supabase
      .from('incomes')
      .insert({
        user_id: userId,
        source_id: sourceId,
        amount: convertToRubles(session.amount, currency),
        description: session.description,
        date: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating voice income:', error);
      await sendTelegramMessage(chatId, `❌ Ошибка: ${error.message}`);
      return;
    }

    await deleteSession(telegramId);

    await sendTelegramMessage(
      chatId,
      `✅ <b>Доход сохранён!</b>\n\n` +
      `🎤 "${session.transcribedText}"\n\n` +
      `💰 Сумма: <b>${formatAmount(session.amount, currency)}</b>\n` +
      `💵 ${sourceData.name}\n` +
      (session.description ? `📝 ${session.description}` : ''),
      getMainKeyboard()
    );
    return;
  }

  // Handle voice cancellation
  if (data === 'voice_cancel') {
    await deleteSession(telegramId);
    await sendTelegramMessage(
      chatId,
      '❌ Голосовая транзакция отменена',
      getMainKeyboard()
    );
    return;
  }

  // Handle subscription callbacks
  if (data.startsWith('sub_')) {
    console.log(`Subscription callback: ${data}`);
    await sendTelegramMessage(chatId, 'Эта функция пока в разработке');
    return;
  }

  // Currency menu back -> return to settings
  if (data === 'currency_back') {
    await sendTelegramMessage(
      chatId,
      '⚙️ <b>Настройки</b>\n\nВыберите раздел:',
      getSettingsKeyboard()
    );
    return;
  }

  // Handle currency selection
  if (data.startsWith('currency_')) {
    const newCurrency = data.replace('currency_', '');
    const valid = ['RUB','USD','EUR','GBP','JPY','CNY','KRW','GEL','AMD'].includes(newCurrency);
    if (!valid) {
      await sendTelegramMessage(chatId, '❌ Неверный код валюты');
      return;
    }

    // Try robust save: upsert -> update -> insert
    let saveError: any = null;
    try {
      const { data: upsertRow, error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, currency: newCurrency }, { onConflict: 'user_id' })
        .select()
        .single();
      saveError = error || null;
      if (!saveError) {
        await sendTelegramMessage(
          chatId,
          `✅ Валюта сохранена: <b>${newCurrency}</b>`
        );
        return;
      }
    } catch (e) {
      saveError = e;
    }

    if (saveError) {
      console.warn('Upsert failed, try update then insert', saveError);
      // Try update
      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({ currency: newCurrency })
        .eq('user_id', userId);
      if (!updateError) {
        await sendTelegramMessage(
          chatId,
          `✅ Валюта сохранена: <b>${newCurrency}</b>`
        );
        return;
      }
      // Try insert
      const { error: insertError } = await supabase
        .from('user_preferences')
        .insert({ user_id: userId, currency: newCurrency });
      if (!insertError) {
        await sendTelegramMessage(
          chatId,
          `✅ Валюта сохранена: <b>${newCurrency}</b>`
        );
        return;
      }

      console.error('Error saving currency (insert):', insertError);
      await sendTelegramMessage(chatId, `❌ Не удалось сохранить валюту. ${insertError?.message ? 'Ошибка: ' + insertError.message : 'Попробуйте позже.'}`);
      return;
    }
  }

  // Unknown callback data
  console.log(`Unknown callback data: ${data}`);
  await sendTelegramMessage(chatId, '❓ Неизвестная команда');
}

async function handleTextMessage(message: TelegramMessage, userId: string) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;
  const text = message.text!.trim();

  console.log(`handleTextMessage: text="${text}", userId=${userId}`);

  // Get user currency
  const currency = await getUserCurrency(userId);

  // Check if user is in a session (adding expense/income)
  const session = await getSession(telegramId);
  console.log(`Session state: ${session ? JSON.stringify(session) : 'none'}`);

  if (session) {
    // Allow cancel
    if (text === '🔙 Назад' || text === '/cancel') {
      await deleteSession(telegramId);
      await sendTelegramMessage(
        chatId,
        '❌ Ввод суммы отменен',
        getMainKeyboard()
      );
      return;
    }

    const parts = text.split(' ');
    const amount = parseFloat(parts[0]);

    if (isNaN(amount) || amount <= 0) {
      await sendTelegramMessage(chatId, '❌ Неверная сумма. Введите положительное число или нажмите <b>🔙 Назад</b> для отмены.');
      return;
    }

    const description = parts.slice(1).join(' ') || null;

    if (session.type === 'expense') {
      const { error } = await supabase
        .from('expenses')
        .insert({
          user_id: userId,
          amount: convertToRubles(amount, currency),
          category_id: session.categoryId,
          description: description,
          date: new Date().toISOString(),
        });

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления расхода.');
      } else {
        await sendTelegramMessage(
          chatId,
          `✅ <b>Расход добавлен!</b>\n\n` +
          `💸 Сумма: <b>${formatAmount(amount, currency)}</b>\n` +
          (description ? `📝 ${description}` : ''),
          getMainKeyboard()
        );
      }
    } else if (session.type === 'income') {
      const { error } = await supabase
        .from('incomes')
        .insert({
          user_id: userId,
          amount: convertToRubles(amount, currency),
          source_id: session.sourceId,
          description: description,
          date: new Date().toISOString(),
        });

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления дохода.');
      } else {
        await sendTelegramMessage(
          chatId,
          `✅ <b>Доход добавлен!</b>\n\n` +
          `💰 Сумма: <b>${formatAmount(amount, currency)}</b>\n` +
          (description ? `📝 ${description}` : ''),
          getMainKeyboard()
        );
      }
    }

    await deleteSession(telegramId);
    return;
  }

  // Handle button presses
  switch (text) {
    case '🔙 Назад':
      await sendTelegramMessage(
        chatId,
        '🏠 Главное меню',
        getMainKeyboard()
      );
      break;
    case '💰 Финансы':
      await sendTelegramMessage(
        chatId,
        '💰 <b>Финансы</b>\n\nВыберите действие:',
        getFinanceKeyboard()
      );
      break;
    case '📊 Отчёты':
      await sendTelegramMessage(
        chatId,
        '📊 <b>Отчёты и аналитика</b>\n\nВыберите раздел:',
        getReportsKeyboard()
      );
      break;
    case '⚙️ Настройки':
      await sendTelegramMessage(
        chatId,
        '⚙️ <b>Настройки</b>\n\n' +
        'Управление ботом и подпиской.\n\n' +
        'Выберите раздел:',
        getSettingsKeyboard()
      );
      break;
    case '🌍 Валюта':
      await sendTelegramMessage(
        chatId,
        '🌍 <b>Выбор валюты</b>\n\nВыберите предпочитаемую валюту для отображения сумм:',
        getCurrencyKeyboard()
      );
      break;
    case '💸 Добавить расход':
      await startAddExpense(chatId, userId);
      break;
    case '💰 Добавить доход':
      await startAddIncome(chatId, userId);
      break;
    case '📊 Баланс':
      await handleBalance(chatId, userId);
      break;
    case '📁 Категории':
      await handleCategories(chatId, userId);
      break;
    case '💵 Источники':
      await handleSources(chatId, userId);
      break;
    case '📸 Сканировать чек':
      await sendTelegramMessage(
        chatId,
        '📸 <b>Сканирование чека</b>\n\n' +
        'Отправьте фото чека, и я автоматически:\n' +
        '✅ Распознаю сумму\n' +
        '✅ Определю категорию\n' +
        '✅ Создам транзакцию\n\n' +
        '📷 Просто отправьте фото чека в чат!',
        getFinanceKeyboard()
      );
      break;
    case '❓ Помощь':
      await sendTelegramMessage(
        chatId,
        `📱 <b>CrystalBudget Bot</b>\n\n` +
        `<b>Главное меню:</b>\n\n` +
        `💰 <b>Финансы</b> - управление доходами и расходами\n` +
        `  • Добавить расход/доход\n` +
        `  • Сканировать чек\n` +
        `  • Голосовые сообщения\n\n` +
        `📊 <b>Отчёты</b> - аналитика и статистика\n` +
        `  • Баланс\n` +
        `  • Категории и источники\n\n` +
        `⚙️ <b>Настройки</b>\n` +
        `  • ❓ Помощь\n` +
        `  • 🌍 Валюта\n\n` +
        `💡 <b>Совет:</b> Запишите голосовое "Купил продуктов на 500 рублей" и бот создаст транзакцию автоматически!`,
        getSettingsKeyboard()
      );
      break;
    default:
      await sendTelegramMessage(
        chatId,
        '❓ Используйте кнопки меню или команду /help',
        getMainKeyboard()
      );
  }
}

async function handleVoiceMessage(message: TelegramMessage, userId: string) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;

  console.log('Voice message received, processing...');

  // Get user currency
  const currency = await getUserCurrency(userId);

  await sendTelegramMessage(chatId, '🎤 Распознаю голос...');

  try {
    // Get voice file
    const voice = message.voice!;

    // Get file path from Telegram
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${voice.file_id}`
    );
    const fileData = await fileResponse.json();

    if (!fileData.ok) {
      throw new Error('Не удалось получить голосовое сообщение');
    }

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Get user's categories and income sources
    const [categoriesRes, sourcesRes] = await Promise.all([
      supabase.from('categories').select('id, name, icon').eq('user_id', userId).order('name'),
      supabase.from('income_sources').select('id, name').eq('user_id', userId).order('name'),
    ]);

    const categories = categoriesRes.data || [];
    const sources = sourcesRes.data || [];

    if (categories.length === 0 && sources.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ У вас нет категорий и источников.\n\nСоздайте их в приложении CrystalBudget сначала.',
        getMainKeyboard()
      );
      return;
    }

    // Call transcribe-voice function
    const transcribeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/transcribe-voice`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userId: userId,
          audioUrl: fileUrl,
          categories: categories,
          sources: sources,
        }),
      }
    );

    if (!transcribeResponse.ok) {
      throw new Error('Ошибка распознавания голоса');
    }

    const voiceData = await transcribeResponse.json();

    if (voiceData.error) {
      throw new Error(voiceData.error);
    }

    console.log('Voice data:', voiceData);

    // Handle expense
    if (voiceData.type === 'expense') {
      // Try to find suggested category (optional)
      const suggestedCategory = categories.find(
        (cat: any) => cat.name.toLowerCase().includes(voiceData.category.toLowerCase()) ||
                      voiceData.category.toLowerCase().includes(cat.name.toLowerCase())
      );

      // Store in session for confirmation
      await setSession(telegramId, {
        type: 'voice_expense_confirmation',
        amount: convertToRubles(voiceData.amount, currency),
        description: voiceData.description,
        transcribedText: voiceData.transcribedText,
        suggestedCategory: voiceData.category,
      });

      // Sort categories: suggested first, then alphabetically
      const sortedCategories = [...categories].sort((a: any, b: any) => {
        if (suggestedCategory) {
          if (a.id === suggestedCategory.id) return -1;
          if (b.id === suggestedCategory.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Show all categories (up to 10)
      const keyboard = {
        inline_keyboard: [
          ...sortedCategories.slice(0, 10).map((cat: any) => [{
            text: `${cat.icon} ${cat.name}${suggestedCategory?.id === cat.id ? ' ✅' : ''}`,
            callback_data: `voice_exp_${cat.id}`
          }]),
          [{ text: '❌ Отмена', callback_data: 'voice_cancel' }]
        ]
      };

      await sendTelegramMessage(
        chatId,
        `🎤 <b>Распознано:</b> "${voiceData.transcribedText}"\n\n` +
        `💸 Сумма: <b>${formatAmount(voiceData.amount, currency)}</b>\n` +
        (voiceData.description ? `📝 ${voiceData.description}\n` : '') +
        (suggestedCategory ? `\n💡 Предложенная категория: ${suggestedCategory.icon} ${suggestedCategory.name}` : '') +
        `\n\n<b>Выберите категорию:</b>`,
        keyboard
      );
    }
    // Handle income
    else if (voiceData.type === 'income') {
      // Try to find suggested source (optional)
      const suggestedSource = sources.find(
        (src: any) => src.name.toLowerCase().includes(voiceData.category.toLowerCase()) ||
                      voiceData.category.toLowerCase().includes(src.name.toLowerCase())
      );

      // Store in session for confirmation
      await setSession(telegramId, {
        type: 'voice_income_confirmation',
        amount: convertToRubles(voiceData.amount, currency),
        description: voiceData.description,
        transcribedText: voiceData.transcribedText,
        suggestedSource: voiceData.category,
      });

      // Sort sources: suggested first, then alphabetically
      const sortedSources = [...sources].sort((a: any, b: any) => {
        if (suggestedSource) {
          if (a.id === suggestedSource.id) return -1;
          if (b.id === suggestedSource.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Show all sources (up to 10)
      const keyboard = {
        inline_keyboard: [
          ...sortedSources.slice(0, 10).map((src: any) => [{
            text: `💵 ${src.name}${suggestedSource?.id === src.id ? ' ✅' : ''}`,
            callback_data: `voice_inc_${src.id}`
          }]),
          [{ text: '❌ Отмена', callback_data: 'voice_cancel' }]
        ]
      };

      await sendTelegramMessage(
        chatId,
        `🎤 <b>Распознано:</b> "${voiceData.transcribedText}"\n\n` +
        `💰 Сумма: <b>${formatAmount(voiceData.amount, currency)}</b>\n` +
        (voiceData.description ? `📝 ${voiceData.description}\n` : '') +
        (suggestedSource ? `\n💡 Предложенный источник: ${suggestedSource.name}` : '') +
        `\n\n<b>Выберите источник:</b>`,
        keyboard
      );
    }

  } catch (error: any) {
    console.error('Voice processing error:', error);
    await sendTelegramMessage(
      chatId,
      `❌ Не удалось распознать голосовое сообщение.\n\n` +
      `Попробуйте:\n` +
      `• Говорить чётче\n` +
      `• Указать сумму и категорию\n` +
      `• Использовать кнопки для ручного ввода`,
      getMainKeyboard()
    );
  }
}

async function handlePhotoMessage(message: TelegramMessage, userId: string) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;

  console.log('Photo received, processing receipt...');

  // Get user currency
  const currency = await getUserCurrency(userId);

  await sendTelegramMessage(chatId, '📸 Сканирую чек...');

  try {
    // Get the largest photo
    const photo = message.photo![message.photo!.length - 1];

    // Get file path from Telegram
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`
    );
    const fileData = await fileResponse.json();

    if (!fileData.ok) {
      throw new Error('Не удалось получить фото');
    }

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Get user's categories
    const { data: categories } = await supabase
      .from('categories')
      .select('name, icon')
      .eq('user_id', userId);

    if (!categories || categories.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget сначала.',
        getMainKeyboard()
      );
      return;
    }

    // Call scan-receipt function
    const scanResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/scan-receipt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userId: userId,
          imageUrl: fileUrl,
          categories: categories,
        }),
      }
    );

    if (!scanResponse.ok) {
      throw new Error('Ошибка распознавания чека');
    }

    const receiptData = await scanResponse.json();

    if (receiptData.error) {
      throw new Error(receiptData.error);
    }

    console.log('Receipt data:', receiptData);

    // Store receipt data in session for confirmation
    await setSession(telegramId, {
      type: 'receipt_confirmation',
      receiptData: receiptData,
    });

    // Get all categories with IDs
    const { data: allCategories } = await supabase
      .from('categories')
      .select('id, name, icon')
      .eq('user_id', userId)
      .order('name');

    if (!allCategories || allCategories.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ У вас нет категорий расходов.',
        getMainKeyboard()
      );
      return;
    }

    // Find suggested category
    const suggestedCategory = allCategories.find(
      (c: any) => c.name.toLowerCase() === receiptData.category.toLowerCase()
    );

    // Create keyboard with all categories, suggested one first
    let sortedCategories = allCategories;
    if (suggestedCategory) {
      sortedCategories = [
        suggestedCategory,
        ...allCategories.filter((c: any) => c.id !== suggestedCategory.id)
      ];
    }

    const keyboard = {
      inline_keyboard: sortedCategories.slice(0, 10).map((cat: any) => [{
        text: `${cat.icon} ${cat.name}${cat.id === suggestedCategory?.id ? ' ✅' : ''}`,
        callback_data: `receipt_cat_${cat.id}`
      }])
    };

    await sendTelegramMessage(
      chatId,
      `📸 <b>Чек распознан!</b>\n\n` +
      `💰 Сумма: <b>${formatAmount(receiptData.amount, currency)}</b>\n` +
      `🏪 ${receiptData.store}\n` +
      (receiptData.description ? `📝 ${receiptData.description}\n` : '') +
      `\n<b>Выберите категорию:</b>`,
      keyboard
    );

  } catch (error) {
    console.error('Error processing receipt:', error);
    await sendTelegramMessage(
      chatId,
      '❌ Не удалось распознать чек.\n\n' +
      'Попробуйте:\n' +
      '• Сделать фото более четким\n' +
      '• Убедиться что виден весь чек\n' +
      '• Добавить расход вручную',
      getMainKeyboard()
    );
  }
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const telegramId = message.from.id;
  const firstName = message.from.first_name;
  const lastName = message.from.last_name;
  const username = message.from.username;

  // Handle photos (receipts)
  if (message.photo) {
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(
        chatId,
        '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.'
      );
      return;
    }

    await handlePhotoMessage(message, userId);
    return;
  }

  // Handle voice messages
  if (message.voice) {
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(
        chatId,
        '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.'
      );
      return;
    }

    await handleVoiceMessage(message, userId);
    return;
  }

  if (!message.text) return;

  const text = message.text;
  console.log(`Received message from ${telegramId}: ${text}`);

  // Handle commands
  if (text.startsWith('/')) {
    if (text === '/start') {
      await handleStart(chatId, telegramId, firstName, lastName, username);
      return;
    }

    // Check authorization for other commands
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(
        chatId,
        '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.'
      );
      return;
    }

    if (text === '/balance') {
      await handleBalance(chatId, userId);
    } else if (text === '/help') {
      await sendTelegramMessage(
        chatId,
        `📱 <b>CrystalBudget Bot</b>\n\n` +
        `Используйте кнопки для быстрого доступа к функциям или команды:\n\n` +
        `/start - начать работу\n` +
        `/balance - показать баланс\n` +
        `/help - эта справка`,
        getMainKeyboard()
      );
    }
    return;
  }

  // For non-command messages, check authorization
  const userId = await getUserByTelegramId(telegramId);
  if (!userId) {
    await sendTelegramMessage(
      chatId,
      '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.'
    );
    return;
  }

  await handleTextMessage(message, userId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let update: TelegramUpdate;
  try {
    const raw = await req.text();
    console.log('RAW UPDATE:', raw);
    update = JSON.parse(raw);
    console.log('Type:', update.callback_query ? 'callback_query' : update.message ? 'message' : 'other');
  } catch (error) {
    console.error('Failed to parse update:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Обработка с таймаутом для защиты от зависаний
  const handler = (async () => {
    try {
      if (update.callback_query) {
        console.log('🔘 callback_query | data:', update.callback_query.data, '| user:', update.callback_query.from.id);

        // ВАЖНО: Сначала отвечаем на callback, потом всё остальное
        await answerCallbackQuery(update.callback_query.id);

        // Теперь можем спокойно делать sendMessage и т.д.
        await handleCallbackQuery(update.callback_query);
      } else if (update.message) {
        console.log('💬 message | text:', update.message.text || '[no text]', '| user:', update.message.from.id);
        await handleMessage(update);
      } else {
        console.log('❓ unknown update:', JSON.stringify(update).substring(0, 200));
      }
    } catch (error) {
      console.error('Handler error:', error);
    }
  })();

  // Таймаут 8 секунд - защита от долгой обработки
  const timeout = new Promise((resolve) =>
    setTimeout(() => {
      console.log('⏱️ Handler timeout reached (8s)');
      resolve('timeout');
    }, 8000)
  );

  const result = await Promise.race([handler, timeout]);

  // Всегда быстрый ACK для Telegram
  return new Response(JSON.stringify({ ok: true, result: result === 'timeout' ? 'timeout' : 'processed' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

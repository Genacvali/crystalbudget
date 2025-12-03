import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// Diagnostics toggle (set DEBUG_BALANCE=true in env to enable)
const DEBUG_BALANCE = (Deno.env.get('DEBUG_BALANCE') || '').toLowerCase() === 'true';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ============================================================================
// OPTIMIZATION: Caching System
// ============================================================================
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATES_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface UserContextCache {
  effectiveUserId: string;
  currency: string;
  categories: any[];
  sources: any[];
}

const userContextCache = new Map<string, CachedData<UserContextCache>>();
const sessionCache = new Map<string, CachedData<any>>();

// ============================================================================
// OPTIMIZATION: Rate Limiting
// ============================================================================
const rateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimits = rateLimits.get(userId) || [];

  // Remove old requests
  const recentRequests = userLimits.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }

  recentRequests.push(now);
  rateLimits.set(userId, recentRequests);
  return true;
}

// ============================================================================
// OPTIMIZATION: Metrics System
// ============================================================================
const metrics = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimitHits: 0,
  avgResponseTime: [] as number[],
  lastReset: Date.now()
};

function trackMetric(type: 'request' | 'error' | 'cacheHit' | 'cacheMiss' | 'rateLimitHit', duration?: number) {
  metrics[type === 'request' ? 'requests' : type === 'error' ? 'errors' : type === 'cacheHit' ? 'cacheHits' : type === 'cacheMiss' ? 'cacheMisses' : 'rateLimitHits']++;

  if (duration !== undefined) {
    metrics.avgResponseTime.push(duration);
  }

  // Log metrics every 100 requests
  if (metrics.requests % 100 === 0) {
    const avgTime = metrics.avgResponseTime.length > 0
      ? metrics.avgResponseTime.reduce((a, b) => a + b, 0) / metrics.avgResponseTime.length
      : 0;
    console.log('📊 Metrics:', {
      requests: metrics.requests,
      errors: metrics.errors,
      cacheHitRate: ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(2) + '%',
      rateLimitHits: metrics.rateLimitHits,
      avgResponseTime: avgTime.toFixed(2) + 'ms',
      uptime: ((Date.now() - metrics.lastReset) / 1000 / 60).toFixed(2) + 'min'
    });
    // Reset avgResponseTime to prevent memory leak
    metrics.avgResponseTime = [];
  }
}

// ============================================================================
// OPTIMIZATION: Exchange Rates with API
// ============================================================================
let cachedExchangeRates: any = null;
let ratesTimestamp = 0;

// Fallback rates
const exchangeRates = {
  RUB: 1,
  USD: 0.01,
  EUR: 0.011,
  GBP: 0.012,
  JPY: 0.067,
  CNY: 0.014,
  KRW: 0.0075,
  GEL: 0.033,
  AMD: 0.025
};

async function getExchangeRates() {
  const now = Date.now();

  // Return cached rates if still valid
  if (cachedExchangeRates && (now - ratesTimestamp) < RATES_CACHE_TTL) {
    return cachedExchangeRates;
  }

  try {
    // Try to fetch from API
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/RUB', {
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      cachedExchangeRates = data.rates;
      ratesTimestamp = now;
      console.log('✅ Exchange rates updated from API');
      return cachedExchangeRates;
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch exchange rates, using fallback:', error.message);
  }

  // Fallback to hardcoded rates
  return exchangeRates;
}
// Currency symbols mapping
const currencySymbols = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  GEL: '₾',
  AMD: '֏'
};
// ============================================================================
// OPTIMIZATION: Cached Session Management
// ============================================================================
async function getSession(telegramId) {
  const cacheKey = `session_${telegramId}`;
  const cached = sessionCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    trackMetric('cacheHit');
    return cached.data;
  }

  trackMetric('cacheMiss');
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

  const sessionData = data?.session_data || null;
  if (sessionData) {
    sessionCache.set(cacheKey, { data: sessionData, timestamp: Date.now() });
  }

  return sessionData;
}

async function setSession(telegramId, sessionData) {
  const cacheKey = `session_${telegramId}`;

  // Update cache immediately
  sessionCache.set(cacheKey, { data: sessionData, timestamp: Date.now() });

  // Update database
  const { error } = await supabase.from('telegram_bot_sessions').upsert({
    telegram_id: telegramId,
    session_data: sessionData,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });

  if (error) {
    console.error('Error setting session:', error);
    sessionCache.delete(cacheKey); // Invalidate cache on error
  }
}

async function deleteSession(telegramId) {
  const cacheKey = `session_${telegramId}`;
  sessionCache.delete(cacheKey);
  await supabase.from('telegram_bot_sessions').delete().eq('telegram_id', telegramId);
}
async function sendTelegramMessage(chatId, text, keyboard) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  console.log(`Sending message to ${chatId}, has keyboard: ${!!keyboard}`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
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
async function answerCallbackQuery(callbackQueryId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      })
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
// ============================================================================
// OPTIMIZATION: Cached User Context (combines multiple DB queries)
// ============================================================================
async function getUserContext(userId: string) {
  const cacheKey = `user_context_${userId}`;
  const cached = userContextCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    trackMetric('cacheHit');
    return cached.data;
  }

  trackMetric('cacheMiss');

  // First get effectiveUserId to determine which user's categories/sources to fetch
  const effectiveUserIdResult = await getEffectiveUserIdUncached(userId);

  // Now fetch categories and sources for the effective user (family owner for members)
  const [
    currencyResult,
    categoriesResult,
    sourcesResult
  ] = await Promise.all([
    getUserCurrencyUncached(userId),
    supabase.from('categories').select('id, name, icon').eq('user_id', effectiveUserIdResult).order('name'),
    supabase.from('income_sources').select('id, name').eq('user_id', effectiveUserIdResult).order('name')
  ]);

  const context: UserContextCache = {
    effectiveUserId: effectiveUserIdResult,
    currency: currencyResult,
    categories: categoriesResult.data || [],
    sources: sourcesResult.data || []
  };

  userContextCache.set(cacheKey, { data: context, timestamp: Date.now() });
  return context;
}

function invalidateUserCache(userId: string) {
  const cacheKey = `user_context_${userId}`;
  userContextCache.delete(cacheKey);
}

async function getUserByTelegramId(telegramId) {
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

async function getUserCurrencyUncached(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('currency')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user currency:', error);
    return 'RUB';
  }
  return data?.currency || 'RUB';
}

async function getUserCurrency(userId) {
  const context = await getUserContext(userId);
  return context.currency;
}

// Get currency from category allocations (first currency found)
async function getCategoryCurrency(categoryId) {
  try {
    const { data: allocations, error } = await supabase
      .from('category_allocations')
      .select('currency')
      .eq('category_id', categoryId);

    if (error || !allocations || allocations.length === 0) {
      return null;
    }

    // Get unique currencies
    const currencies = new Set();
    allocations.forEach(alloc => {
      if (alloc.currency) {
        currencies.add(alloc.currency);
      }
    });

    // Return first currency or null
    return currencies.size > 0 ? Array.from(currencies)[0] : null;
  } catch (error) {
    console.error('Error getting category currency:', error);
    return null;
  }
}

// Get currency from income source (not implemented yet, placeholder for future)
async function getSourceCurrency(sourceId) {
  // For now, sources don't have a specific currency
  // This is a placeholder for future enhancement
  return null;
}

async function getEffectiveUserIdUncached(userId) {
  // Check if user is a family owner
  const { data: ownedFamily } = await supabase
    .from('families')
    .select('id, owner_id')
    .eq('owner_id', userId)
    .maybeSingle();

  if (ownedFamily) {
    return userId;
  }

  // Check if user is a family member
  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id, families!inner(owner_id)')
    .eq('user_id', userId)
    .maybeSingle();

  if (membership && membership.families) {
    return membership.families.owner_id;
  }

  return userId;
}

async function getEffectiveUserId(userId) {
  const context = await getUserContext(userId);
  return context.effectiveUserId;
}
function formatAmount(amountInRubles, currency) {
  // Use cached rates or fallback to static rates
  const rates = cachedExchangeRates || exchangeRates;
  const rate = rates[currency] || exchangeRates[currency] || 1;
  const convertedAmount = amountInRubles * rate;
  const symbol = currencySymbols[currency] || '₽';
  return `${convertedAmount.toLocaleString('ru-RU')} ${symbol}`;
}

async function convertToRubles(amount, currency) {
  const rates = await getExchangeRates();
  const rate = rates[currency] || exchangeRates[currency] || 1;
  return amount / rate;
}
async function hasActiveSubscription(userId) {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
  return !!data;
}
async function getSubscriptionInfo(userId) {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
  return data;
}


// Убираем клавиатуру
function removeKeyboard() {
  return {
    remove_keyboard: true
  };
}
function getCurrencyKeyboard() {
  // Supported currencies should match user_preferences.currency values
  const codes = [
    'RUB',
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CNY',
    'KRW',
    'GEL',
    'AMD'
  ];
  // Build inline keyboard in 3 columns
  const rows = [];
  for (let i = 0; i < codes.length; i += 3) {
    rows.push(codes.slice(i, i + 3).map((code) => ({
      text: `${currencySymbols[code] || ''} ${code}`,
      callback_data: `currency_${code}`
    })));
  }
  // Use dedicated back callback for currency menu
  rows.push([
    {
      text: '🔙 Назад',
      callback_data: 'currency_back'
    }
  ]);
  return {
    inline_keyboard: rows
  };
}
async function generateCloudPaymentsLink(userId, planType, amount, email) {
  const CLOUDPAYMENTS_PUBLIC_ID = Deno.env.get('CLOUDPAYMENTS_PUBLIC_ID');
  const orderId = `sub_${userId}_${planType}_${Date.now()}`;
  // Store payment info in session for webhook validation
  await supabase.from('telegram_bot_sessions').upsert({
    telegram_id: 0,
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
async function handleStart(chatId, telegramId, firstName, lastName, username, param = null) {
  console.log(`handleStart called: telegramId=${telegramId}, param=${param}`);

  // Check if already linked
  const userId = await getUserByTelegramId(telegramId);
  if (userId) {
    // User already exists
    // If came from website (param='auth'), show "already linked" message
    if (param === 'auth') {
      const webAppKeyboard = {
        inline_keyboard: [
          [
            {
              text: '🌐 Открыть веб-приложение',
              web_app: { url: 'https://crystalbudget.net' }
            }
          ],
          [
            {
              text: '❓ Помощь',
              callback_data: 'help'
            }
          ]
        ]
      };

      await sendTelegramMessage(
        chatId,
        `✅ <b>Вы уже авторизованы!</b>\n\n` +
        `Ваш Telegram уже связан с аккаунтом CrystalBudget.\n\n` +
        `📱 <b>Telegram бот</b> — удобный инструмент для быстрого добавления транзакций:\n\n` +
        `💸 <b>Добавить расход:</b>\n` +
        `   • Напишите: <code>500 продукты</code>\n` +
        `   • Голосовое сообщение\n` +
        `   • Фото чека\n\n` +
        `💰 <b>Добавить доход:</b>\n` +
        `   • Напишите: <code>доход 50000 зарплата</code>\n` +
        `   • Голосовое сообщение\n\n` +
        `⚙️ <b>Основная настройка</b> происходит в веб-приложении:\n` +
        `   • Создание категорий и источников дохода\n` +
        `   • Настройка бюджета\n` +
        `   • Аналитика и отчеты\n` +
        `   • Управление семьей\n\n` +
        `💡 Нажмите кнопку ниже, чтобы открыть веб-приложение`,
        webAppKeyboard
      );
      return;
    }

    // Regular /start - show welcome with balance
    const effectiveUserId = await getEffectiveUserId(userId);
    const currency = await getUserCurrency(effectiveUserId);
    const symbol = currencySymbols[currency] || '₽';

    // Resolve family scope: owner + members; if no family — only owner
    let familyUserIds = [effectiveUserId];
    const { data: family } = await supabase
      .from('families')
      .select('id')
      .eq('owner_id', effectiveUserId)
      .maybeSingle();
    if (family?.id) {
      const { data: members } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('family_id', family.id);
      if (members && members.length > 0) {
        familyUserIds = [effectiveUserId, ...members.map(m => m.user_id)];
      }
    }

    // Get current month data for family
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .in('user_id', familyUserIds)
      .gte('date', startOfMonth.toISOString())
      .lte('date', endOfMonth.toISOString());

    const { data: incomes } = await supabase
      .from('incomes')
      .select('amount')
      .in('user_id', familyUserIds)
      .gte('date', startOfMonth.toISOString())
      .lte('date', endOfMonth.toISOString());

    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
    const totalIncomes = incomes?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const balance = totalIncomes - totalExpenses;

    const balanceEmoji = balance > 0 ? '💚' : balance < 0 ? '❤️' : '💛';
    const balanceText = balance > 0
      ? `+${balance.toLocaleString('ru-RU')} ${symbol}`
      : `${balance.toLocaleString('ru-RU')} ${symbol}`;

    await sendTelegramMessage(
      chatId,
      `👋 <b>Добро пожаловать, ${firstName}!</b>\n\n` +
      `📱 <b>Как пользоваться ботом:</b>\n\n` +
      `💸 <b>Добавить расход:</b>\n` +
      `   ✍️ Текст: <code>500 продукты</code>\n` +
      `   🎤 Голос: "купил продуктов на 500 рублей"\n` +
      `   📸 Фото: отправьте фото чека\n\n` +
      `💰 <b>Добавить доход:</b>\n` +
      `   ✍️ Текст: <code>доход 50000 зарплата</code>\n` +
      `   🎤 Голос: "получил зарплату 50000"\n\n` +
      `✏️ <b>Редактирование:</b>\n` +
      `   После добавления транзакции используйте кнопки под сообщением для редактирования или удаления\n\n` +
      `💡 <b>Совет:</b> Используйте /help для подробной инструкции`,
      removeKeyboard()
    );
    return;
  }

  // New user - offer two options: create new account or link existing
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✨ Создать новый аккаунт', callback_data: 'auth_create_new' }
      ],
      [
        { text: '🔗 Связать с существующим', callback_data: 'auth_link_existing' }
      ]
    ]
  };

  await sendTelegramMessage(
    chatId,
    `👋 <b>Привет, ${firstName}!</b>\n\n` +
    `Добро пожаловать в <b>CrystalBudget</b> — умный помощник для управления личными финансами.\n\n` +
    `Выберите способ авторизации:\n\n` +
    `✨ <b>Создать новый аккаунт</b>\n` +
    `Начните использовать бот прямо сейчас. Можно добавить email позже для доступа через веб-приложение.\n\n` +
    `🔗 <b>Связать с существующим</b>\n` +
    `Если у вас уже есть аккаунт в CrystalBudget (авторизация через email), получите код для связывания.`,
    keyboard
  );
}
// Handle creating new account via Telegram
async function handleAuthCreateNew(chatId, telegramId, firstName, lastName, username) {
  try {
    // Check if already linked
    const existingUserId = await getUserByTelegramId(telegramId);
    if (existingUserId) {
      await sendTelegramMessage(
        chatId,
        `✅ <b>Ваш аккаунт уже связан!</b>\n\n` +
        `Вы уже можете пользоваться ботом для учета расходов и доходов.\n\n` +
        `💡 Просто напишите сумму и описание, например: <code>500 продукты</code>`,
        removeKeyboard()
      );
      return;
    }

    // Create new user account via Supabase Auth
    const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`;

    // Generate a temporary email for Telegram-only users
    const tempEmail = `telegram_${telegramId}@crystalbudget.temp`;
    const tempPassword = crypto.randomUUID(); // Random secure password

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        full_name: fullName,
        telegram_only: true
      }
    });

    if (authError || !authData.user) {
      console.error('Error creating auth user:', authError);
      await sendTelegramMessage(chatId, '❌ Ошибка создания аккаунта. Попробуйте позже.');
      return;
    }

    const newUser = authData.user;

    // Link Telegram account
    const { error: telegramError } = await supabase
      .from('telegram_users')
      .insert({
        user_id: newUser.id,
        telegram_id: telegramId.toString(),
        telegram_username: username,
        telegram_first_name: firstName,
        telegram_last_name: lastName
      });

    if (telegramError) {
      console.error('Error linking telegram:', telegramError);
      // Clean up auth user if telegram link failed
      await supabase.auth.admin.deleteUser(newUser.id);
      await sendTelegramMessage(chatId, '❌ Ошибка связывания с Telegram. Попробуйте позже.');
      return;
    }

    // Create default user preferences
    await supabase.from('user_preferences').insert({
      user_id: newUser.id,
      currency: 'RUB',
      reminder_enabled: false,
      reminder_time: '21:00'
    });

    // Send welcome message
    const webAppKeyboard = {
      inline_keyboard: [
        [
          {
            text: '🌐 Открыть веб-приложение',
            web_app: { url: 'https://crystalbudget.net' }
          }
        ],
        [
          {
            text: '❓ Помощь',
            callback_data: 'help'
          }
        ]
      ]
    };

    // Send welcome message in parts to avoid text overflow
    await sendTelegramMessage(
      chatId,
      `🎉 <b>Аккаунт успешно создан!</b>\n\n` +
      `Добро пожаловать в CrystalBudget, ${firstName}!`,
      webAppKeyboard
    );

    // Wait a bit before sending next message
    await new Promise(resolve => setTimeout(resolve, 500));

    await sendTelegramMessage(
      chatId,
      `⚙️ <b>Сначала настройте аккаунт в веб-приложении:</b>\n\n` +
      `• Создайте категории расходов\n` +
      `• Добавьте источники дохода\n` +
      `• Настройте бюджет\n\n` +
      `💡 Нажмите кнопку "🌐 Открыть веб-приложение" для настройки`,
      undefined
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    await sendTelegramMessage(
      chatId,
      `📱 <b>Telegram бот</b> — для быстрого добавления транзакций:\n\n` +
      `💸 <b>Добавить расход:</b>\n` +
      `• Напишите: <code>500 продукты</code>\n` +
      `• Голосовое сообщение\n` +
      `• Фото чека\n\n` +
      `💰 <b>Добавить доход:</b>\n` +
      `• Напишите: <code>доход 50000 зарплата</code>\n` +
      `• Голосовое сообщение`,
      undefined
    );

  } catch (error) {
    console.error('Exception in handleAuthCreateNew:', error);
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Handle linking existing email account
async function handleAuthLinkExisting(chatId, telegramId, firstName, lastName, username) {
  // Check if already linked
  const existingUserId = await getUserByTelegramId(telegramId);
  if (existingUserId) {
    await sendTelegramMessage(
      chatId,
      `✅ <b>Ваш аккаунт уже связан!</b>\n\n` +
      `Telegram уже подключен к вашему аккаунту CrystalBudget.\n\n` +
      `💡 Можете сразу начинать добавлять транзакции:\n` +
      `   • Напишите: <code>500 продукты</code>\n` +
      `   • Отправьте голосовое сообщение\n` +
      `   • Сфотографируйте чек`,
      removeKeyboard()
    );
    return;
  }

  // Generate auth code for linking
  const authCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const { error } = await supabase.from('telegram_auth_codes').insert({
    telegram_id: telegramId,
    auth_code: authCode,
    telegram_username: username,
    telegram_first_name: firstName,
    telegram_last_name: lastName
  });

  if (error) {
    console.error('Error creating auth code:', error);
    await sendTelegramMessage(chatId, '❌ Ошибка создания кода авторизации. Попробуйте позже.');
    return;
  }

  await sendTelegramMessage(
    chatId,
    `🔗 <b>Связывание с существующим аккаунтом</b>\n\n` +
    `Ваш код авторизации:\n` +
    `<code>${authCode}</code>\n\n` +
    `📱 <b>Как связать:</b>\n\n` +
    `1️⃣ Войдите в веб-приложение CrystalBudget через email\n` +
    `2️⃣ Перейдите в Настройки → Telegram\n` +
    `3️⃣ Введите этот код\n\n` +
    `⏱ <b>Код действителен 10 минут</b>\n\n` +
    `💡 После связывания вы сможете использовать бот для учета транзакций, а веб-приложение для аналитики и настроек.`
  );
}

// Handle /unlink command - allow users to disconnect Telegram from their account
async function handleUnlinkCommand(chatId, telegramId) {
  const userId = await getUserByTelegramId(telegramId);

  if (!userId) {
    await sendTelegramMessage(
      chatId,
      '❌ Ваш Telegram не связан с аккаунтом CrystalBudget.\\n\\n' +
      'Используйте /start для создания аккаунта.',
      removeKeyboard()
    );
    return;
  }

  // Send confirmation message with inline keyboard
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Да, отвязать', callback_data: 'unlink_confirm' }
      ],
      [
        { text: '❌ Отмена', callback_data: 'unlink_cancel' }
      ]
    ]
  };

  await sendTelegramMessage(
    chatId,
    '⚠️ <b>Подтверждение отвязки</b>\\n\\n' +
    'Вы уверены, что хотите отвязать Telegram от вашего аккаунта CrystalBudget?\\n\\n' +
    '❗️ После отвязки:\\n' +
    '• Вы потеряете доступ к боту\\n' +
    '• Ваши данные останутся в системе\\n' +
    '• Вы сможете связать другой Telegram аккаунт\\n' +
    '• Вход через веб-приложение останется доступен\\n\\n' +
    '💡 Если у вас только Telegram-аккаунт (без email), после отвязки вы не сможете войти в систему.',
    keyboard
  );
}

// Handle unlink confirmation
async function handleUnlinkConfirm(chatId, telegramId, callbackQueryId) {
  try {
    // Get userId before deleting for cache invalidation
    const userId = await getUserByTelegramId(telegramId);

    // Delete from telegram_users table
    const { error } = await supabase
      .from('telegram_users')
      .delete()
      .eq('telegram_id', telegramId.toString());

    if (error) {
      console.error('Error unlinking telegram:', error);
      await answerCallbackQuery(callbackQueryId, 'Ошибка отвязки');
      await sendTelegramMessage(
        chatId,
        '❌ Произошла ошибка при отвязке.\\n\\nПопробуйте позже или обратитесь в поддержку.',
        undefined
      );
      return;
    }

    // Clear session
    await deleteSession(telegramId);

    // Clear user context cache if we have userId
    if (userId) {
      invalidateUserCache(userId);
    }

    await answerCallbackQuery(callbackQueryId, 'Аккаунт успешно отвязан');

    // Send success message with options
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✨ Создать новый аккаунт', callback_data: 'auth_create_new' }
        ],
        [
          { text: '🔗 Связать с существующим', callback_data: 'auth_link_existing' }
        ]
      ]
    };

    await sendTelegramMessage(
      chatId,
      '✅ <b>Telegram успешно отвязан</b>\\n\\n' +
      'Ваш Telegram больше не связан с аккаунтом CrystalBudget.\\n\\n' +
      'Что дальше?\\n' +
      '• Используйте /start для создания нового аккаунта\\n' +
      '• Или свяжитесь с существующим аккаунтом\\n' +
      '• Доступ через веб-приложение сохранен (если был email)',
      keyboard
    );
  } catch (error) {
    console.error('Exception in handleUnlinkConfirm:', error);
    await answerCallbackQuery(callbackQueryId, 'Ошибка');
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}


async function handleBalance(chatId, userId) {
  // Get user currency (use effectiveUserId for currency settings)
  const effectiveUserId = await getEffectiveUserId(userId);
  const currency = await getUserCurrency(effectiveUserId);
  // Get current month boundaries using local time (to match web app behaviour)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Resolve family scope: owner + members; if no family — only owner
  let familyUserIds = [effectiveUserId];

  // Check if user is a family owner
  const { data: ownedFamily } = await supabase
    .from('families')
    .select('id')
    .eq('owner_id', effectiveUserId)
    .maybeSingle();

  let familyId: string | null = null;

  if (ownedFamily?.id) {
    familyId = ownedFamily.id;
  } else {
    // Check if user is a family member
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (membership?.family_id) {
      familyId = membership.family_id;
    }
  }

  if (familyId) {
    // Get family owner
    const { data: familyData } = await supabase
      .from('families')
      .select('owner_id')
      .eq('id', familyId)
      .single();

    // Get all family members
    const { data: members } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId);

    // Include owner and all members
    if (familyData?.owner_id) {
      familyUserIds = [familyData.owner_id];
      if (members && members.length > 0) {
        familyUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
      }
    }
  }

  // Get current month income and expenses (family scope) with currency
  const { data: incomes } = await supabase.from('incomes').select('amount, currency').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
  const { data: expenses } = await supabase.from('expenses').select('amount, currency').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
  // Get previous months for carry-over balance (family scope) with currency
  const { data: previousIncomes } = await supabase.from('incomes').select('amount, currency').in('user_id', familyUserIds).lt('date', startOfMonth);
  const { data: previousExpenses } = await supabase.from('expenses').select('amount, currency').in('user_id', familyUserIds).lt('date', startOfMonth);

  // Group by currency
  const incomeByCurrency: Record<string, number> = {};
  const expenseByCurrency: Record<string, number> = {};
  const prevIncomeByCurrency: Record<string, number> = {};
  const prevExpenseByCurrency: Record<string, number> = {};

  (incomes || []).forEach(inc => {
    const curr = inc.currency || currency || 'RUB';
    incomeByCurrency[curr] = (incomeByCurrency[curr] || 0) + Number(inc.amount);
  });

  (expenses || []).forEach(exp => {
    const curr = exp.currency || currency || 'RUB';
    expenseByCurrency[curr] = (expenseByCurrency[curr] || 0) + Number(exp.amount);
  });

  (previousIncomes || []).forEach(inc => {
    const curr = inc.currency || currency || 'RUB';
    prevIncomeByCurrency[curr] = (prevIncomeByCurrency[curr] || 0) + Number(inc.amount);
  });

  (previousExpenses || []).forEach(exp => {
    const curr = exp.currency || currency || 'RUB';
    prevExpenseByCurrency[curr] = (prevExpenseByCurrency[curr] || 0) + Number(exp.amount);
  });

  // Calculate balances by currency
  const allCurrencies = new Set([
    ...Object.keys(incomeByCurrency),
    ...Object.keys(expenseByCurrency),
    ...Object.keys(prevIncomeByCurrency),
    ...Object.keys(prevExpenseByCurrency)
  ]);

  const balancesByCurrency: Array<{
    currency: string;
    monthIncome: number;
    monthExpenses: number;
    monthBalance: number;
    totalBalance: number;
  }> = [];

  allCurrencies.forEach(curr => {
    const monthIncome = incomeByCurrency[curr] || 0;
    const monthExpenses = expenseByCurrency[curr] || 0;
    const monthBalance = monthIncome - monthExpenses;
    const prevIncome = prevIncomeByCurrency[curr] || 0;
    const prevExpenses = prevExpenseByCurrency[curr] || 0;
    const carryOver = prevIncome - prevExpenses;
    const totalBalance = monthIncome + carryOver - monthExpenses;

    balancesByCurrency.push({
      currency: curr,
      monthIncome,
      monthExpenses,
      monthBalance,
      totalBalance
    });
  });

  // For backward compatibility, calculate primary currency totals
  const currentMonthIncome = incomeByCurrency[currency] || 0;
  const currentMonthExpenses = expenseByCurrency[currency] || 0;
  const monthBalance = currentMonthIncome - currentMonthExpenses;
  const previousTotalIncome = prevIncomeByCurrency[currency] || 0;
  const previousTotalExpenses = prevExpenseByCurrency[currency] || 0;
  const carryOverBalance = previousTotalIncome - previousTotalExpenses;
  const totalBalance = currentMonthIncome + carryOverBalance - currentMonthExpenses;
  const monthName = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric'
  }).format(now);
  // Capitalize month (DateTimeFormat already includes "г.")
  const formattedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  let diagnostics = '';
  if (DEBUG_BALANCE) {
    diagnostics = `\n\n🛠️ Диагностика:\n` +
      `• Диапазон: ${new Date(startOfMonth).toLocaleString('ru-RU')} — ${new Date(endOfMonth).toLocaleString('ru-RU')}\n` +
      `• Режим: Семейный\n` +
      `• Пользователи: ${familyUserIds.join(', ')}\n` +
      `• Доходов: ${(incomes || []).length} на сумму ${formatAmount(currentMonthIncome, currency)}\n` +
      `• Расходов: ${(expenses || []).length} на сумму ${formatAmount(currentMonthExpenses, currency)}`;
  }
  // Format balance message
  let balanceText = `📊 <b>Баланс за ${formattedMonthName}</b>\n\n`;

  if (balancesByCurrency.length > 1) {
    // Multiple currencies - show each separately
    balancesByCurrency.forEach(bal => {
      const currSymbol = currencySymbols[bal.currency] || bal.currency;
      balanceText += `<b>${bal.currency} ${currSymbol}:</b>\n`;
      balanceText += `${bal.monthBalance > 0 ? '✅' : bal.monthBalance < 0 ? '❌' : '➖'} <b>${bal.monthBalance.toLocaleString('ru-RU')} ${currSymbol}</b>\n`;
      balanceText += `${bal.monthBalance > 0 ? 'Профицит' : bal.monthBalance < 0 ? 'Дефицит' : 'Ноль'}\n`;
      balanceText += `📉 Расходы: <b>${bal.monthExpenses.toLocaleString('ru-RU')} ${currSymbol}</b>\n`;
      if (bal.monthIncome > 0) {
        balanceText += `${Math.round(bal.monthExpenses / bal.monthIncome * 100)}% от дохода\n`;
      }
      balanceText += `💰 Общий баланс: <b>${bal.totalBalance.toLocaleString('ru-RU')} ${currSymbol}</b>\n\n`;
    });
  } else {
    // Single currency - show standard view
    balanceText += `${monthBalance > 0 ? '✅' : monthBalance < 0 ? '❌' : '➖'} <b>${formatAmount(monthBalance, currency)}</b>\n`;
    balanceText += `${monthBalance > 0 ? 'Профицит' : monthBalance < 0 ? 'Дефицит' : 'Ноль'}\n\n`;
    balanceText += `📉 <b>Общие расходы</b>\n`;
    balanceText += `<b>${formatAmount(currentMonthExpenses, currency)}</b>\n`;
    if (currentMonthIncome > 0) {
      balanceText += `${Math.round(currentMonthExpenses / currentMonthIncome * 100)}% от дохода\n\n`;
    } else {
      balanceText += '\n';
    }
    balanceText += `💰 <b>Общий баланс</b>\n`;
    balanceText += `<b>${formatAmount(totalBalance, currency)}</b>\n`;
    balanceText += `Только за ${formattedMonthName}`;
  }

  await sendTelegramMessage(
    chatId,
    balanceText + diagnostics,
    undefined
  );
}
async function handleCategories(chatId, userId) {
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  const { data: categories } = await supabase.from('categories').select('name, icon').eq('user_id', effectiveUserId).order('name');
  if (!categories || categories.length === 0) {
    await sendTelegramMessage(chatId, '📁 У вас пока нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.', removeKeyboard());
    return;
  }
  // Split categories into chunks to avoid Telegram message length limit (4096 chars)
  const chunkSize = 30; // ~30 categories per message
  const chunks = [];
  for (let i = 0; i < categories.length; i += chunkSize) {
    chunks.push(categories.slice(i, i + chunkSize));
  }
  // Send first chunk with header
  const firstChunk = chunks[0];
  const firstList = firstChunk.map((cat) => `${cat.icon} ${cat.name}`).join('\n');
  await sendTelegramMessage(chatId, `📁 <b>Ваши категории (${categories.length}):</b>\n\n${firstList}${chunks.length > 1 ? '\n\n⬇️ Продолжение...' : ''}`, removeKeyboard());
  // Send remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const list = chunk.map((cat) => `${cat.icon} ${cat.name}`).join('\n');
    await sendTelegramMessage(chatId, `${list}${i < chunks.length - 1 ? '\n\n⬇️ Продолжение...' : ''}`, i === chunks.length - 1 ? undefined : undefined);
  }
}
async function handleSources(chatId, userId) {
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  const { data: sources } = await supabase.from('income_sources').select('name, color, amount').eq('user_id', effectiveUserId).order('name');
  if (!sources || sources.length === 0) {
    await sendTelegramMessage(chatId, '💵 У вас пока нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.', removeKeyboard());
    return;
  }
  // Split sources into chunks to avoid Telegram message length limit (4096 chars)
  const chunkSize = 30; // ~30 sources per message
  const chunks = [];
  for (let i = 0; i < sources.length; i += chunkSize) {
    chunks.push(sources.slice(i, i + chunkSize));
  }
  // Send first chunk with header
  const firstChunk = chunks[0];
  const firstList = firstChunk.map((src) => {
    const amount = src.amount ? ` (${formatAmount(Number(src.amount), currency)})` : '';
    return `💵 ${src.name}${amount}`;
  }).join('\n');
  await sendTelegramMessage(chatId, `💵 <b>Ваши источники дохода (${sources.length}):</b>\n\n${firstList}${chunks.length > 1 ? '\n\n⬇️ Продолжение...' : ''}`, chunks.length === 1 ? undefined : undefined);
  // Send remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const list = chunk.map((src) => {
      const amount = src.amount ? ` (${formatAmount(Number(src.amount), currency)})` : '';
      return `💵 ${src.name}${amount}`;
    }).join('\n');
    await sendTelegramMessage(chatId, `${list}${i < chunks.length - 1 ? '\n\n⬇️ Продолжение...' : ''}`, i === chunks.length - 1 ? undefined : undefined);
  }
}

// Handle transaction history
async function handleHistory(chatId, userId) {
  const effectiveUserId = await getEffectiveUserId(userId);
  const currency = await getUserCurrency(effectiveUserId);
  const symbol = currencySymbols[currency] || '₽';

  // Resolve family scope: owner + members; if no family — only owner
  let familyUserIds = [effectiveUserId];

  // Check if user is a family owner
  const { data: ownedFamily } = await supabase
    .from('families')
    .select('id')
    .eq('owner_id', effectiveUserId)
    .maybeSingle();

  let familyId: string | null = null;

  if (ownedFamily?.id) {
    familyId = ownedFamily.id;
  } else {
    // Check if user is a family member
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (membership?.family_id) {
      familyId = membership.family_id;
    }
  }

  if (familyId) {
    // Get family owner
    const { data: familyData } = await supabase
      .from('families')
      .select('owner_id')
      .eq('id', familyId)
      .single();

    // Get all family members
    const { data: members } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId);

    // Include owner and all members
    if (familyData?.owner_id) {
      familyUserIds = [familyData.owner_id];
      if (members && members.length > 0) {
        familyUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
      }
    }
  }

  // Get last 10 transactions (expenses + incomes) for family
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [expensesResult, incomesResult, categoriesResult, sourcesResult] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, amount, description, date, category_id, currency')
      .in('user_id', familyUserIds)
      .gte('date', startOfMonth)
      .order('date', { ascending: false })
      .limit(10),
    supabase
      .from('incomes')
      .select('id, amount, description, date, source_id, currency')
      .in('user_id', familyUserIds)
      .gte('date', startOfMonth)
      .order('date', { ascending: false })
      .limit(10),
    supabase
      .from('categories')
      .select('id, name, icon')
      .eq('user_id', effectiveUserId),
    supabase
      .from('income_sources')
      .select('id, name')
      .eq('user_id', effectiveUserId)
  ]);

  const expenses = expensesResult.data || [];
  const incomes = incomesResult.data || [];
  const categories = categoriesResult.data || [];
  const sources = sourcesResult.data || [];

  // Create lookup maps
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  const sourceMap = new Map(sources.map(s => [s.id, s]));

  // Combine and sort by date
  const allTransactions = [
    ...expenses.map(e => {
      const cat = categoryMap.get(e.category_id);
      return {
        id: e.id,
        type: 'expense',
        amount: Number(e.amount),
        currency: e.currency || currency || 'RUB',
        description: e.description,
        date: e.date,
        category: cat ? `${cat.icon} ${cat.name}` : 'Категория',
        source: null
      };
    }),
    ...incomes.map(i => {
      const src = sourceMap.get(i.source_id);
      return {
        id: i.id,
        type: 'income',
        amount: Number(i.amount),
        currency: i.currency || currency || 'RUB',
        description: i.description,
        date: i.date,
        category: null,
        source: src ? src.name : 'Источник'
      };
    })
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

  if (allTransactions.length === 0) {
    await sendTelegramMessage(chatId, '📜 <b>История транзакций</b>\n\nУ вас пока нет транзакций за этот месяц.', removeKeyboard());
    return;
  }

  // Format transactions with action buttons
  const transactionsText = allTransactions.map((t, index) => {
    const date = new Date(t.date);
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const emoji = t.type === 'expense' ? '💸' : '💰';
    const info = t.type === 'expense' ? t.category : t.source;
    const tCurrency = t.currency || currency || 'RUB';
    const tSymbol = currencySymbols[tCurrency] || '₽';
    const amountStr = `${t.amount.toLocaleString('ru-RU')} ${tSymbol}`;
    const desc = t.description ? `\n   ${t.description}` : '';
    return `${index + 1}. ${emoji} <b>${amountStr}</b> ${t.type === 'expense' ? '' : '+'}\n   ${info}${desc}\n   <i>${dateStr}</i>`;
  }).join('\n\n');

  // Create keyboard with transaction action buttons (first 5 transactions)
  const transactionButtons = allTransactions.slice(0, 5).map(t => {
    const tCurrency = t.currency || currency || 'RUB';
    const tSymbol = currencySymbols[tCurrency] || '₽';
    const amountStr = `${t.amount.toLocaleString('ru-RU')} ${tSymbol}`;
    return [{
      text: `${t.type === 'expense' ? '💸' : '💰'} ${amountStr}`,
      callback_data: t.type === 'expense' ? `edit_exp_${t.id}` : `edit_inc_${t.id}`
    }];
  });

  const keyboard = {
    inline_keyboard: [
      ...transactionButtons,
      [
        { text: '💸 Только расходы', callback_data: 'history_expenses' },
        { text: '💰 Только доходы', callback_data: 'history_incomes' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'history_back' }
      ]
    ]
  };

  await sendTelegramMessage(
    chatId,
    `📜 <b>Последние транзакции (${allTransactions.length})</b>\n\n${transactionsText}\n\n💡 Нажмите на транзакцию для редактирования:`,
    keyboard
  );
}

// Handle reminders settings
async function handleReminders(chatId, userId) {
  // Get user's reminder preferences
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('reminder_enabled, reminder_time')
    .eq('user_id', userId)
    .maybeSingle();

  const enabled = preferences?.reminder_enabled || false;
  const time = preferences?.reminder_time || '21:00';

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: enabled ? '✅ Напоминания включены' : '❌ Напоминания выключены',
          callback_data: `reminder_toggle_${enabled ? 'off' : 'on'}`
        }
      ],
      [
        { text: '⏰ Изменить время', callback_data: 'reminder_time' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'reminders_back' }
      ]
    ]
  };

  await sendTelegramMessage(
    chatId,
    `🔔 <b>Напоминания о транзакциях</b>\n\n` +
    `Статус: ${enabled ? '✅ Включены' : '❌ Выключены'}\n` +
    `Время: <b>${time}</b>\n\n` +
    `Бот будет напоминать вам вечером, если вы не добавили транзакции за день.`,
    keyboard
  );
}

// Check budget limits and send notifications
async function checkBudgetLimits(userId, categoryId, amount) {
  const effectiveUserId = await getEffectiveUserId(userId);
  const currency = await getUserCurrency(effectiveUserId);

  // Get category budget info
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Get category with allocations
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, icon, allocation_amount, allocation_percent, linked_source_id')
    .eq('id', categoryId)
    .eq('user_id', effectiveUserId)
    .single();

  if (!category) return;

  // Calculate allocated budget
  let allocated = 0;
  if (category.allocation_amount) {
    allocated = Number(category.allocation_amount);
  } else if (category.allocation_percent && category.linked_source_id) {
    const { data: source } = await supabase
      .from('income_sources')
      .select('amount')
      .eq('id', category.linked_source_id)
      .single();
    if (source?.amount) {
      allocated = (Number(source.amount) * Number(category.allocation_percent)) / 100;
    }
  }

  // Also check category_allocations
  const { data: allocations } = await supabase
    .from('category_allocations')
    .select('allocation_type, allocation_value, income_source_id')
    .eq('category_id', categoryId);

  if (allocations && allocations.length > 0) {
    allocated = 0;
    for (const alloc of allocations) {
      if (alloc.allocation_type === 'amount') {
        allocated += Number(alloc.allocation_value);
      } else if (alloc.allocation_type === 'percent') {
        const { data: sourceIncomes } = await supabase
          .from('incomes')
          .select('amount')
          .eq('source_id', alloc.income_source_id)
          .gte('date', startOfMonth)
          .lte('date', endOfMonth);
        const actualTotal = sourceIncomes?.reduce((sum, inc) => sum + Number(inc.amount), 0) || 0;
        const { data: source } = await supabase
          .from('income_sources')
          .select('amount')
          .eq('id', alloc.income_source_id)
          .single();
        const base = actualTotal > 0 ? actualTotal : (Number(source?.amount) || 0);
        allocated += (base * Number(alloc.allocation_value)) / 100;
      }
    }
  }

  if (allocated === 0) return; // No budget set

  // Resolve family scope for expenses
  let familyUserIds = [effectiveUserId];

  // Check if user is a family owner
  const { data: ownedFamily } = await supabase
    .from('families')
    .select('id')
    .eq('owner_id', effectiveUserId)
    .maybeSingle();

  let familyId: string | null = null;

  if (ownedFamily?.id) {
    familyId = ownedFamily.id;
  } else {
    // Check if user is a family member
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (membership?.family_id) {
      familyId = membership.family_id;
    }
  }

  if (familyId) {
    // Get family owner
    const { data: familyData } = await supabase
      .from('families')
      .select('owner_id')
      .eq('id', familyId)
      .single();

    // Get all family members
    const { data: members } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId);

    // Include owner and all members
    if (familyData?.owner_id) {
      familyUserIds = [familyData.owner_id];
      if (members && members.length > 0) {
        familyUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
      }
    }
  }

  // Get current month expenses for this category (family scope)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('category_id', categoryId)
    .in('user_id', familyUserIds)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth);

  const spent = (expenses || []).reduce((sum, exp) => sum + Number(exp.amount), 0);
  const newSpent = spent + amount;
  const percentage = (newSpent / allocated) * 100;

  // Get user's telegram_id for notification
  const { data: telegramUser } = await supabase
    .from('telegram_users')
    .select('telegram_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!telegramUser) return;

  // Send notifications at thresholds
  if (percentage >= 100 && spent < allocated) {
    // Just exceeded
    await sendTelegramMessage(
      telegramUser.telegram_id,
      `⚠️ <b>Бюджет превышен!</b>\n\n` +
      `${category.icon} <b>${category.name}</b>\n` +
      `Потрачено: <b>${formatAmount(newSpent, currency)}</b> из ${formatAmount(allocated, currency)}\n` +
      `Превышение: <b>${formatAmount(newSpent - allocated, currency)}</b>`
    );
  } else if (percentage >= 90 && percentage < 100) {
    // Approaching limit
    await sendTelegramMessage(
      telegramUser.telegram_id,
      `🔔 <b>Бюджет почти исчерпан</b>\n\n` +
      `${category.icon} <b>${category.name}</b>\n` +
      `Потрачено: <b>${formatAmount(newSpent, currency)}</b> из ${formatAmount(allocated, currency)}\n` +
      `Осталось: <b>${formatAmount(allocated - newSpent, currency)}</b> (${Math.round(100 - percentage)}%)`
    );
  } else if (percentage >= 80 && percentage < 90) {
    // Warning threshold
    await sendTelegramMessage(
      telegramUser.telegram_id,
      `💡 <b>Бюджет на ${Math.round(percentage)}%</b>\n\n` +
      `${category.icon} <b>${category.name}</b>\n` +
      `Потрачено: <b>${formatAmount(newSpent, currency)}</b> из ${formatAmount(allocated, currency)}\n` +
      `Осталось: <b>${formatAmount(allocated - newSpent, currency)}</b>`
    );
  }
}
async function handleSubscription(chatId, userId) {
  const subscription = await getSubscriptionInfo(userId);
  if (subscription) {
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const planNames = {
      trial: '🎁 Пробный период',
      monthly: '📅 Месячная подписка',
      quarterly: '📆 Подписка на 3 месяца',
      yearly: '📊 Годовая подписка'
    };
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔄 Продлить подписку',
            callback_data: 'sub_renew'
          }
        ],
        [
          {
            text: '🔙 Назад',
            callback_data: 'sub_back'
          }
        ]
      ]
    };
    await sendTelegramMessage(chatId, `💎 <b>Информация о подписке</b>\n\n` + `${planNames[subscription.plan_type] || subscription.plan_type}\n` + `Статус: ${daysLeft > 0 ? '✅ Активна' : '❌ Истекла'}\n` + `Действует до: ${expiresAt.toLocaleDateString('ru-RU')}\n` + `Осталось дней: ${daysLeft}\n\n` + `<b>Доступные функции:</b>\n` + `✅ Сканирование чеков\n` + `✅ Голосовые сообщения\n` + `✅ Неограниченное использование`, keyboard);
  } else {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '💳 Месяц - 99₽',
            callback_data: 'sub_monthly'
          }
        ],
        [
          {
            text: '💳 3 месяца - 256₽ (выгода 13%)',
            callback_data: 'sub_quarterly'
          }
        ],
        [
          {
            text: '💳 Год - 1200₽ (выгода 33%)',
            callback_data: 'sub_yearly'
          }
        ],
        [
          {
            text: '🔙 Назад',
            callback_data: 'sub_back'
          }
        ]
      ]
    };
    await sendTelegramMessage(chatId, `💎 <b>Премиум подписка</b>\n\n` + `Получите доступ к:\n` + `✅ Сканированию чеков с AI\n` + `✅ Голосовым сообщениям\n` + `✅ Неограниченному использованию\n\n` + `<b>Планы подписки:</b>\n` + `💳 <b>Месяц</b> - 99₽\n` + `💳 <b>3 месяца</b> - 256₽ (выгода 13%)\n` + `💳 <b>Год</b> - 1200₽ (выгода 33%)\n\n` + `🎁 <b>Новым пользователям 5 дней бесплатно!</b>\n\n` + `Выберите план подписки:`, keyboard);
  }
}
async function startAddExpense(chatId, userId) {
  console.log(`startAddExpense called for user ${userId}`);
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  try {
    const { data: categories, error } = await supabase.from('categories').select('id, name, icon').eq('user_id', effectiveUserId).order('name');
    console.log(`Categories query result: ${categories?.length || 0} categories, error: ${error?.message || 'none'}`);
    if (error) {
      console.error('Error fetching categories:', error);
      await sendTelegramMessage(chatId, '❌ Ошибка получения категорий. Попробуйте позже.', removeKeyboard());
      return;
    }
    if (!categories || categories.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.', removeKeyboard());
      return;
    }
    // Create inline keyboard with categories
    const keyboard = {
      inline_keyboard: categories.map((cat) => [
        {
          text: `${cat.icon} ${cat.name}`,
          callback_data: `exp_cat_${cat.id}`
        }
      ])
    };
    console.log(`Sending expense keyboard with ${categories.length} categories`);
    await sendTelegramMessage(chatId, '💸 <b>Добавить расход</b>\n\nВыберите категорию:', keyboard);
  } catch (err) {
    console.error('Exception in startAddExpense:', err);
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', removeKeyboard());
  }
}
async function startAddIncome(chatId, userId) {
  console.log(`startAddIncome called for user ${userId}`);
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  try {
    const { data: sources, error } = await supabase.from('income_sources').select('id, name').eq('user_id', effectiveUserId).order('name');
    console.log(`Sources query result: ${sources?.length || 0} sources, error: ${error?.message || 'none'}`);
    if (error) {
      console.error('Error fetching sources:', error);
      await sendTelegramMessage(chatId, '❌ Ошибка получения источников дохода. Попробуйте позже.', removeKeyboard());
      return;
    }
    if (!sources || sources.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.', removeKeyboard());
      return;
    }
    // Create inline keyboard with sources
    const keyboard = {
      inline_keyboard: sources.map((src) => [
        {
          text: `💵 ${src.name}`,
          callback_data: `inc_src_${src.id}`
        }
      ])
    };
    console.log(`Sending income keyboard with ${sources.length} sources`);
    await sendTelegramMessage(chatId, '💰 <b>Добавить доход</b>\n\nВыберите источник:', keyboard);
  } catch (err) {
    console.error('Exception in startAddIncome:', err);
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', removeKeyboard());
  }
}
async function handleCallbackQuery(callbackQuery: any) {
  const { id: callbackId, from, data, message } = callbackQuery;
  const chatId = message?.chat.id;
  const messageId = message?.message_id;

  if (!data) return;

  console.log(`Callback received: ${data} from user ${from.id}`);

  // Handle auth callbacks first
  if (data === 'auth_create_new') {
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const username = from.username || '';
    await handleAuthCreateNew(chatId, from.id, firstName, lastName, username);
    await answerCallbackQuery(callbackId, '✅ Создание нового аккаунта...');
    return;
  }

  if (data === 'auth_link_existing') {
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const username = from.username || '';
    await handleAuthLinkExisting(chatId, from.id, firstName, lastName, username);
    await answerCallbackQuery(callbackId, '✅ Получение кода...');
    return;
  }

  // Handle unlink callbacks
  if (data === 'unlink_confirm') {
    await handleUnlinkConfirm(chatId, from.id, callbackId);
    return;
  }

  if (data === 'unlink_cancel') {
    await answerCallbackQuery(callbackId, 'Отвязка отменена');
    await sendTelegramMessage(
      chatId,
      '✅ Отвязка отменена.\\n\\nВаш аккаунт остается связанным.',
      removeKeyboard()
    );
    return;
  }

  // Handle ZenMoney categorization callbacks (zen_cat_, zen_ai_, zen_ignore_, zen_close_)
  if (data.startsWith('zen_')) {
    try {
      // Get user ID first
      const userId = await getUserByTelegramId(from.id);
      if (!userId) {
        await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
        return;
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

      // Handle category selection (zen_cat_{expenseId}_{categoryId})
      if (data.startsWith('zen_cat_')) {
        const parts = data.split('_'); // [ 'zen', 'cat', expenseId, categoryId ]
        if (parts.length !== 4) {
          await answerCallbackQuery(callbackId, 'Неверный формат.');
          return;
        }

        const expenseId = parts[2];
        const categoryId = parts[3];

        // Update expense with category
        const { error } = await adminSupabase
          .from('expenses')
          .update({ category_id: categoryId })
          .eq('id', expenseId)
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating expense:', error);
          await answerCallbackQuery(callbackId, 'Ошибка обновления.');
          return;
        }

        // Get category name for confirmation
        const { data: category } = await adminSupabase
          .from('categories')
          .select('name')
          .eq('id', categoryId)
          .single();

        // Edit message to show success
        try {
          await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ Транзакция категоризирована как \"${category?.name || 'неизвестно'}\"!`,
              parse_mode: 'HTML',
            }),
          });
        } catch (e) {
          console.log('Could not edit message:', e);
        }

        await answerCallbackQuery(callbackId, `✅ Категория: ${category?.name || 'установлена'}`);
        console.log(`✅ Categorized expense ${expenseId} as ${categoryId} for user ${userId}`);
      }
      // Handle AI recommendation (zen_ai_{expenseId}_{categoryId})
      else if (data.startsWith('zen_ai_')) {
        const parts = data.split('_'); // [ 'zen', 'ai', expenseId, categoryId ]
        if (parts.length !== 4) {
          await answerCallbackQuery(callbackId, 'Неверный формат.');
          return;
        }

        const expenseId = parts[2];
        const categoryId = parts[3];

        // Update expense with AI recommended category
        const { error } = await adminSupabase
          .from('expenses')
          .update({ category_id: categoryId })
          .eq('id', expenseId)
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating expense:', error);
          await answerCallbackQuery(callbackId, 'Ошибка обновления.');
          return;
        }

        // Get category name
        const { data: category } = await adminSupabase
          .from('categories')
          .select('name')
          .eq('id', categoryId)
          .single();

        // Edit message
        try {
          await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ 🤖 Транзакция категоризирована как \"${category?.name || 'неизвестно'}\" (рекомендация ИИ)`,
              parse_mode: 'HTML',
            }),
          });
        } catch (e) {
          console.log('Could not edit message:', e);
        }

        await answerCallbackQuery(callbackId, `✅ ИИ рекомендация применена: ${category?.name || 'категория установлена'}`);
        console.log(`✅ AI categorized expense ${expenseId} as ${categoryId} for user ${userId}`);
      }
      // Handle ignore (zen_ignore_{expenseId})
      else if (data.startsWith('zen_ignore_')) {
        const parts = data.split('_'); // [ 'zen', 'ignore', expenseId ]
        if (parts.length !== 3) {
          await answerCallbackQuery(callbackId, 'Неверный формат.');
          return;
        }

        const expenseId = parts[2];

        // Just delete the message - no need to track ignored transactions for now
        try {
          await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
            }),
          });
        } catch (e) {
          console.log('Could not delete message:', e);
        }

        await answerCallbackQuery(callbackId, '⏭️ Транзакция пропущена');
        console.log(`⏭️ Ignored expense ${expenseId} for user ${userId}`);
      }
      // Handle close (zen_close_{expenseId})
      else if (data.startsWith('zen_close_')) {
        // Just delete the message
        try {
          await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
            }),
          });
        } catch (e) {
          console.log('Could not delete message:', e);
        }

        await answerCallbackQuery(callbackId, '❌ Закрыто');
      }

    } catch (error) {
      console.error('Error handling zen_ callback:', error);
      await answerCallbackQuery(callbackId, 'Произошла ошибка.');
    }

    return; // Stop further processing for zen_ callbacks
  }

  // ==========================================================================
  // Text expense confirmation callbacks (after free-text parsing)
  // ==========================================================================
  if (data === 'text_cancel') {
    // Cancel text-based expense creation
    await deleteSession(from.id);
    await answerCallbackQuery(callbackId, 'Операция отменена');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '❌ Добавление расхода отменено.',
        removeKeyboard()
      );
    }
    return;
  }

  if (data.startsWith('text_exp_')) {
    const parts = data.split('_'); // [ 'text', 'exp', categoryId ]
    if (parts.length !== 3) {
      await answerCallbackQuery(callbackId, 'Неверный формат данных.');
      return;
    }

    const categoryId = parts[2];

    // Load session created in handleFreeTextExpense
    const session = await getSession(from.id);
    if (!session || session.type !== 'text_expense_confirmation') {
      console.warn('No active text_expense_confirmation session for user', from.id, 'session:', session);
      await answerCallbackQuery(callbackId, 'Сессия не найдена или устарела.');
      return;
    }

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      if (chatId) {
        await sendTelegramMessage(
          chatId,
          '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.',
          removeKeyboard()
        );
      }
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);

    // Choose currency: detected from text → category currency → user currency
    const detectedCurrency = session.detectedCurrency || null;
    const categoryCurrency = await getCategoryCurrency(categoryId);
    const userCurrency = await getUserCurrency(effectiveUserId);
    const currency = detectedCurrency || categoryCurrency || userCurrency || 'RUB';

    // Create expense
    const { data: expenseData, error } = await supabase
      .from('expenses')
      .insert({
        user_id: effectiveUserId,
        amount: session.amount,
        category_id: categoryId,
        description: session.description,
        date: new Date().toISOString(),
        currency
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating expense from text_exp_ callback:', error);
      await answerCallbackQuery(callbackId, 'Ошибка добавления расхода.');
      if (chatId) {
        await sendTelegramMessage(
          chatId,
          '❌ Ошибка добавления расхода. Попробуйте ещё раз.',
          removeKeyboard()
        );
      }
      return;
    }

    // Get category info for display
    const { data: category } = await supabase
      .from('categories')
      .select('name, icon')
      .eq('id', categoryId)
      .single();

    const symbol = currencySymbols[currency] || '₽';
    const categoryInfo = category ? `${category.icon} ${category.name}` : 'Категория';

    // Check budget limits asynchronously
    checkBudgetLimits(userId, categoryId, session.amount).catch(err => {
      console.error('Error checking budget limits (text_exp_):', err);
    });

    // Keyboard with edit / delete for the created expense
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Редактировать', callback_data: `edit_exp_${expenseData.id}` },
          { text: '🗑️ Удалить', callback_data: `del_exp_${expenseData.id}` }
        ]
      ]
    };

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `✅ <b>Расход добавлен!</b>\n\n` +
        `💸 Сумма: <b>${session.amount.toLocaleString('ru-RU')} ${symbol}</b>\n` +
        `📁 Категория: ${categoryInfo}\n` +
        (session.description ? `📝 ${session.description}\n` : '') +
        `\n⏰ ${new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
        keyboard
      );
    }

    await deleteSession(from.id);
    await answerCallbackQuery(callbackId, '✅ Расход добавлен');
    return;
  }

  // ==========================================================================
  // Expense edit/delete callbacks
  // ==========================================================================

  // Start editing expense amount
  if (data.startsWith('edit_exp_amount_')) {
    const expenseId = data.replace('edit_exp_amount_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    // Ensure expense belongs to this user (or their effective user scope)
    const effectiveUserId = await getEffectiveUserId(userId);
    const { data: expense } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (!expense) {
      await answerCallbackQuery(callbackId, 'Расход не найден.');
      return;
    }

    await setSession(from.id, {
      type: 'edit_expense_amount',
      expenseId
    });

    await answerCallbackQuery(callbackId, 'Введите новую сумму');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '✏️ Введите новую сумму для этого расхода (или /cancel для отмены).',
        removeKeyboard()
      );
    }
    return;
  }

  // Start editing expense description
  if (data.startsWith('edit_exp_desc_')) {
    const expenseId = data.replace('edit_exp_desc_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);
    const { data: expense } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (!expense) {
      await answerCallbackQuery(callbackId, 'Расход не найден.');
      return;
    }

    await setSession(from.id, {
      type: 'edit_expense_description',
      expenseId
    });

    await answerCallbackQuery(callbackId, 'Введите новое описание');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '📝 Введите новое описание для этого расхода.\nЕсли хотите удалить описание, отправьте "-".\nДля отмены используйте /cancel.',
        removeKeyboard()
      );
    }
    return;
  }

  // Main "Редактировать" button for expenses – show submenu
  if (data.startsWith('edit_exp_')) {
    const expenseId = data.replace('edit_exp_', '');

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Сумма', callback_data: `edit_exp_amount_${expenseId}` },
          { text: '📝 Описание', callback_data: `edit_exp_desc_${expenseId}` }
        ],
        [
          { text: '🗑️ Удалить', callback_data: `del_exp_${expenseId}` }
        ]
      ]
    };

    await answerCallbackQuery(callbackId, 'Выберите действие');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        'Что вы хотите изменить в этом расходе?',
        keyboard
      );
    }
    return;
  }

  // Delete expense
  if (data.startsWith('del_exp_')) {
    const expenseId = data.replace('del_exp_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('user_id', effectiveUserId);

    if (error) {
      console.error('Error deleting expense:', error);
      await answerCallbackQuery(callbackId, 'Ошибка удаления расхода.');
      return;
    }

    // Try to delete the original message with buttons
    if (chatId && messageId) {
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId
          })
        });
      } catch (e) {
        console.log('Could not delete expense message:', e);
      }
    }

    await answerCallbackQuery(callbackId, '✅ Расход удалён');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '✅ Расход успешно удалён.',
        undefined
      );
    }
    return;
  }

  // ==========================================================================
  // Income edit/delete callbacks
  // ==========================================================================

  if (data.startsWith('edit_inc_amount_')) {
    const incomeId = data.replace('edit_inc_amount_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);
    const { data: income } = await supabase
      .from('incomes')
      .select('id')
      .eq('id', incomeId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (!income) {
      await answerCallbackQuery(callbackId, 'Доход не найден.');
      return;
    }

    await setSession(from.id, {
      type: 'edit_income_amount',
      incomeId
    });

    await answerCallbackQuery(callbackId, 'Введите новую сумму');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '✏️ Введите новую сумму для этого дохода (или /cancel для отмены).',
        removeKeyboard()
      );
    }
    return;
  }

  if (data.startsWith('edit_inc_desc_')) {
    const incomeId = data.replace('edit_inc_desc_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);
    const { data: income } = await supabase
      .from('incomes')
      .select('id')
      .eq('id', incomeId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (!income) {
      await answerCallbackQuery(callbackId, 'Доход не найден.');
      return;
    }

    await setSession(from.id, {
      type: 'edit_income_description',
      incomeId
    });

    await answerCallbackQuery(callbackId, 'Введите новое описание');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '📝 Введите новое описание для этого дохода.\nЕсли хотите удалить описание, отправьте "-".\nДля отмены используйте /cancel.',
        removeKeyboard()
      );
    }
    return;
  }

  if (data.startsWith('edit_inc_')) {
    const incomeId = data.replace('edit_inc_', '');

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Сумма', callback_data: `edit_inc_amount_${incomeId}` },
          { text: '📝 Описание', callback_data: `edit_inc_desc_${incomeId}` }
        ],
        [
          { text: '🗑️ Удалить', callback_data: `del_inc_${incomeId}` }
        ]
      ]
    };

    await answerCallbackQuery(callbackId, 'Выберите действие');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        'Что вы хотите изменить в этом доходе?',
        keyboard
      );
    }
    return;
  }

  if (data.startsWith('del_inc_')) {
    const incomeId = data.replace('del_inc_', '');

    const userId = await getUserByTelegramId(from.id);
    if (!userId) {
      await answerCallbackQuery(callbackId, 'Ошибка авторизации.');
      return;
    }

    const effectiveUserId = await getEffectiveUserId(userId);
    const { error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', incomeId)
      .eq('user_id', effectiveUserId);

    if (error) {
      console.error('Error deleting income:', error);
      await answerCallbackQuery(callbackId, 'Ошибка удаления дохода.');
      return;
    }

    if (chatId && messageId) {
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId
          })
        });
      } catch (e) {
        console.log('Could not delete income message:', e);
      }
    }

    await answerCallbackQuery(callbackId, '✅ Доход удалён');

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        '✅ Доход успешно удалён.',
        undefined
      );
    }
    return;
  }

  // TODO: handle other callbacks (history_*, voice_*, receipt_*, reminders, subscription, etc.)
}

async function handleTextMessage(message, userId) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;
  const text = message.text.trim();
  console.log(`handleTextMessage: text="${text}", userId=${userId}`);
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  // Check if user is in a session (adding expense/income or editing)
  const session = await getSession(telegramId);
  console.log(`Session state: ${session ? JSON.stringify(session) : 'none'}`);
  if (session) {
    // Allow cancel
    if (text === '🔙 Назад' || text === '/cancel') {
      await deleteSession(telegramId);
      await sendTelegramMessage(chatId, '❌ Операция отменена', removeKeyboard());
      return;
    }

    // Handle edit expense amount
    if (session.type === 'edit_expense_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await sendTelegramMessage(chatId, '❌ Неверная сумма. Введите положительное число.');
        return;
      }

      const { error } = await supabase
        .from('expenses')
        .update({ amount: amount })
        .eq('id', session.expenseId)
        .eq('user_id', effectiveUserId);

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка обновления суммы', removeKeyboard());
      } else {
        await deleteSession(telegramId);
        await sendTelegramMessage(chatId, `✅ Сумма обновлена: <b>${formatAmount(amount, currency)}</b>`, removeKeyboard());
      }
      return;
    }

    // Handle edit expense description
    if (session.type === 'edit_expense_description') {
      const newDescription = text === '-' ? null : text;

      const { error } = await supabase
        .from('expenses')
        .update({ description: newDescription })
        .eq('id', session.expenseId)
        .eq('user_id', effectiveUserId);

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка обновления описания', removeKeyboard());
      } else {
        await deleteSession(telegramId);
        await sendTelegramMessage(chatId, newDescription ? `✅ Описание обновлено: <b>${newDescription}</b>` : '✅ Описание удалено', removeKeyboard());
      }
      return;
    }

    // Handle edit income amount
    if (session.type === 'edit_income_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await sendTelegramMessage(chatId, '❌ Неверная сумма. Введите положительное число.');
        return;
      }

      const { error } = await supabase
        .from('incomes')
        .update({ amount: amount })
        .eq('id', session.incomeId)
        .eq('user_id', effectiveUserId);

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка обновления суммы', removeKeyboard());
      } else {
        await deleteSession(telegramId);
        await sendTelegramMessage(chatId, `✅ Сумма обновлена: <b>${formatAmount(amount, currency)}</b>`, removeKeyboard());
      }
      return;
    }

    // Handle edit income description
    if (session.type === 'edit_income_description') {
      const newDescription = text === '-' ? null : text;

      const { error } = await supabase
        .from('incomes')
        .update({ description: newDescription })
        .eq('id', session.incomeId)
        .eq('user_id', effectiveUserId);

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка обновления описания', removeKeyboard());
      } else {
        await deleteSession(telegramId);
        await sendTelegramMessage(chatId, newDescription ? `✅ Описание обновлено: <b>${newDescription}</b>` : '✅ Описание удалено', removeKeyboard());
      }
      return;
    }

    // Handle reminder time setting
    if (session.type === 'reminder_time_setting') {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(text)) {
        await sendTelegramMessage(chatId, '❌ Неверный формат времени. Используйте ЧЧ:ММ (например: 21:00)');
        return;
      }

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          reminder_time: text
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка сохранения времени', removeKeyboard());
      } else {
        await deleteSession(telegramId);
        await sendTelegramMessage(chatId, `✅ Время напоминания установлено: <b>${text}</b>`, removeKeyboard());
      }
      return;
    }

    // Handle adding expense/income (existing logic)
    const parts = text.split(' ');
    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      await sendTelegramMessage(chatId, '❌ Неверная сумма. Введите положительное число или нажмите <b>🔙 Назад</b> для отмены.');
      return;
    }
    const description = parts.slice(1).join(' ') || null;
    if (session.type === 'expense') {
      // Use category currency if available, otherwise user default
      const categoryCurrency = await getCategoryCurrency(session.categoryId);
      const currency = categoryCurrency || (await getUserCurrency(userId));
      const { data: expenseData, error } = await supabase.from('expenses').insert({
        user_id: effectiveUserId,
        amount: amount,
        category_id: session.categoryId,
        description: description,
        date: new Date().toISOString(),
        currency: currency
      }).select().single();
      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления расхода.');
      } else {
        const symbol = currencySymbols[currency] || '₽';

        // Get category name for display
        const { data: category } = await supabase
          .from('categories')
          .select('name, icon')
          .eq('id', session.categoryId)
          .single();

        const categoryInfo = category ? `${category.icon} ${category.name}` : 'Категория';

        // Check budget limits (async, don't wait)
        checkBudgetLimits(userId, session.categoryId, amount).catch(err => {
          console.error('Error checking budget limits:', err);
        });

        // Create inline keyboard with action buttons
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Редактировать', callback_data: `edit_exp_${expenseData.id}` },
              { text: '🗑️ Удалить', callback_data: `del_exp_${expenseData.id}` }
            ]
          ]
        };

        await sendTelegramMessage(
          chatId,
          `✅ <b>Расход добавлен!</b>\n\n` +
          `💸 Сумма: <b>${amount.toLocaleString('ru-RU')} ${symbol}</b>\n` +
          `📁 Категория: ${categoryInfo}\n` +
          (description ? `📝 ${description}\n` : '') +
          `\n⏰ ${new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
          keyboard
        );
      }
    } else if (session.type === 'income') {
      // Use source currency if available, otherwise user default
      const sourceCurrency = await getSourceCurrency(session.sourceId);
      const currency = sourceCurrency || (await getUserCurrency(userId));
      const { data: incomeData, error } = await supabase.from('incomes').insert({
        user_id: effectiveUserId,
        amount: amount,
        source_id: session.sourceId,
        description: description,
        date: new Date().toISOString(),
        currency: currency
      }).select().single();
      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления дохода.');
      } else {
        const symbol = currencySymbols[currency] || '₽';

        // Get source name for display
        const { data: source } = await supabase
          .from('income_sources')
          .select('name')
          .eq('id', session.sourceId)
          .single();

        const sourceName = source ? source.name : 'Источник';

        // Create inline keyboard with action buttons
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Редактировать', callback_data: `edit_inc_${incomeData.id}` },
              { text: '🗑️ Удалить', callback_data: `del_inc_${incomeData.id}` }
            ]
          ]
        };

        await sendTelegramMessage(
          chatId,
          `✅ <b>Доход добавлен!</b>\n\n` +
          `💰 Сумма: <b>${amount.toLocaleString('ru-RU')} ${symbol}</b>\n` +
          `💵 Источник: ${sourceName}\n` +
          (description ? `📝 ${description}\n` : '') +
          `\n⏰ ${new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
          keyboard
        );
      }
    }
    await deleteSession(telegramId);
    return;
  }
  // Обработка кнопки Помощь
  if (text === '❓ Помощь' || text === '/help') {
    await sendTelegramMessage(
      chatId,
      `📖 <b>Справка по использованию CrystalBudget</b>\n\n` +
      `💸 <b>ДОБАВЛЕНИЕ РАСХОДОВ</b>\n\n` +
      `Бот понимает расходы в свободной форме. Просто напишите сумму и описание:\n\n` +
      `✅ <code>500 продукты</code>\n` +
      `✅ <code>такси 250</code>\n` +
      `✅ <code>1500 обед в ресторане</code>\n` +
      `✅ <code>3000 заправка</code>\n\n` +
      `🎤 <b>Голосовые сообщения:</b>\n` +
      `Произнесите: "купил продуктов на 500 рублей" или "потратил 1500 на обед"\n\n` +
      `📸 <b>Фото чека:</b>\n` +
      `Отправьте фото чека - бот автоматически распознает сумму, магазин и дату\n\n` +
      `💰 <b>ДОБАВЛЕНИЕ ДОХОДОВ</b>\n\n` +
      `Начните сообщение со слова "доход":\n\n` +
      `✅ <code>доход 50000 зарплата</code>\n` +
      `✅ <code>доход 10000 подработка</code>\n` +
      `✅ <code>доход 5000 возврат долга</code>\n\n` +
      `🎤 <b>Голосовые сообщения:</b>\n` +
      `Произнесите: "получил зарплату 50000" или "доход 10000 подработка"\n\n` +
      `✏️ <b>РЕДАКТИРОВАНИЕ ТРАНЗАКЦИЙ</b>\n\n` +
      `После добавления транзакции под сообщением появятся кнопки:\n\n` +
      `✏️ <b>Редактировать</b> - изменить сумму, описание или категорию\n` +
      `🗑️ <b>Удалить</b> - удалить транзакцию\n\n` +
      `Вы можете изменить:\n` +
      `• Сумму транзакции\n` +
      `• Описание\n` +
      `• Категорию (для расходов)\n` +
      `• Источник дохода (для доходов)\n\n` +
      `💡 <b>СОВЕТЫ</b>\n\n` +
      `• Бот автоматически определяет категорию по описанию\n` +
      `• Если категория не найдена, вам предложат выбрать из списка\n` +
      `• Для мультивалютных категорий бот попросит выбрать валюту\n` +
      `• Все транзакции синхронизируются с веб-приложением\n` +
      `• Если вы в семье, видны транзакции всех членов семьи\n\n` +
      `❓ <b>Вопросы? Предложения? Ошибки?</b> Пиши @gena12M.`,
      removeKeyboard()
    );
    return;
  }

  // Все остальные текстовые сообщения обрабатываются как потенциальные расходы
  await handleFreeTextExpense(chatId, userId, text);
}

// Parse free text input and create expense
async function handleFreeTextExpense(chatId, userId, text) {
  console.log(`handleFreeTextExpense called with text: "${text}"`);
  const effectiveUserId = await getEffectiveUserId(userId);

  // Normalize text: remove extra spaces, trim
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  console.log(`Normalized text: "${normalizedText}"`);

  // Try to parse patterns like:
  // "500 рублей продукты"
  // "500р продукты"
  // "500 продукты"
  // "1500 такси"
  // "продукты 500" (reverse order)
  const patterns = [
    // Standard: amount + optional currency + description
    /^(\d+(?:[.,]\d{1,2})?)\s*(?:руб(?:лей|ля|ль)?|₽|р\.?|usd|uah|eur|€|\$)?\s+(.+)$/i,
    // Reverse: description + amount + optional currency
    /^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:руб(?:лей|ля|ль)?|₽|р\.?|usd|uah|eur|€|\$)?$/i,
  ];

  let amount = null;
  let description = null;
  let detectedCurrency = null; // Currency detected from text (if any)

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = normalizedText.match(pattern);
    console.log(`Pattern ${i} match:`, match ? `amount=${match[1]}, desc=${match[2]}` : 'no match');
    if (match) {
      if (i === 0) {
        // Standard order: amount first
        amount = parseFloat(match[1].replace(',', '.'));
        description = match[2].trim();
        // Check if currency was mentioned in the pattern
        const currencyMatch = normalizedText.match(/руб(?:лей|ля|ль)?|₽|р\.?|usd|\$|uah|eur|€/i);
        if (currencyMatch) {
          const curr = currencyMatch[0].toLowerCase();
          if (curr.includes('руб') || curr.includes('₽') || curr === 'р' || curr === 'р.') detectedCurrency = 'RUB';
          else if (curr.includes('usd') || curr === '$') detectedCurrency = 'USD';
          else if (curr.includes('eur') || curr === '€') detectedCurrency = 'EUR';
          else if (curr.includes('uah')) detectedCurrency = 'UAH';
        }
      } else {
        // Reverse order: description first
        description = match[1].trim();
        amount = parseFloat(match[2].replace(',', '.'));
        // Check if currency was mentioned
        const currencyMatch = normalizedText.match(/руб(?:лей|ля|ль)?|₽|р\.?|usd|\$|uah|eur|€/i);
        if (currencyMatch) {
          const curr = currencyMatch[0].toLowerCase();
          if (curr.includes('руб') || curr.includes('₽') || curr === 'р' || curr === 'р.') detectedCurrency = 'RUB';
          else if (curr.includes('usd') || curr === '$') detectedCurrency = 'USD';
          else if (curr.includes('eur') || curr === '€') detectedCurrency = 'EUR';
          else if (curr.includes('uah')) detectedCurrency = 'UAH';
        }
      }
      console.log(`Parsed: amount=${amount}, description="${description}", detectedCurrency=${detectedCurrency}`);
      break;
    }
  }

  if (!amount || amount <= 0 || !description) {
    console.log(`Parsing failed: amount=${amount}, description=${description}`);
    await sendTelegramMessage(
      chatId,
      `💬 <b>Как добавить расход:</b>\n\n` +
      `✍️ Напишите текстом:\n` +
      `<code>500 продукты</code>\n` +
      `<code>1000 рублей такси</code>\n` +
      `<code>кофе 250</code>\n\n` +
      `🎤 Запишите голосовое:\n` +
      `"купил продуктов на 500 рублей"\n\n` +
      `📸 Отправьте фото чека\n\n` +
      `📋 Команды: /help`,
      undefined
    );
    return;
  }

  // Get user categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, icon')
    .eq('user_id', effectiveUserId)
    .order('name');

  if (!categories || categories.length === 0) {
    await sendTelegramMessage(chatId, '📁 Сначала создайте категории в приложении CrystalBudget', removeKeyboard());
    return;
  }

  // Simple keyword matching for common categories
  const lowerDesc = description.toLowerCase();
  let suggestedCategory = null;

  const categoryKeywords = {
    'продукты': ['продукт', 'еда', 'еды', 'магазин', 'супермаркет', 'пятёрочка', 'магнит', 'перекрёсток'],
    'транспорт': ['такси', 'бензин', 'топливо', 'проезд', 'метро', 'автобус', 'яндекс', 'uber', 'bolt'],
    'кафе': ['кафе', 'ресторан', 'coffee', 'кофе', 'кофейня', 'макдоналдс', 'бургер'],
    'развлечения': ['кино', 'театр', 'концерт', 'игр', 'развлечен'],
    'здоровье': ['аптека', 'лекарств', 'врач', 'клиника', 'больница'],
    'одежда': ['одежд', 'обувь', 'zara', 'h&m'],
    'дом': ['дом', 'квартира', 'ремонт', 'мебель', 'коммунальн'],
    'связь': ['интернет', 'телефон', 'связь', 'мегафон', 'мтс'],
  };

  // First, try exact category name match
  suggestedCategory = categories.find(cat =>
    lowerDesc.includes(cat.name.toLowerCase()) ||
    cat.name.toLowerCase().includes(lowerDesc)
  );

  // If no exact match, try keyword matching
  if (!suggestedCategory) {
    for (const cat of categories) {
      const catNameLower = cat.name.toLowerCase();
      const keywords = categoryKeywords[catNameLower] || [];

      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        suggestedCategory = cat;
        break;
      }
    }
  }

  console.log(`Suggested category: ${suggestedCategory ? suggestedCategory.name : 'none'}`);

  // Store in session for confirmation (like voice input)
  const telegramId = await getTelegramIdByUserId(userId);
  if (!telegramId) {
    await sendTelegramMessage(chatId, '❌ Ошибка получения Telegram ID', removeKeyboard());
    return;
  }

  // Get default currency for display (will be corrected after category selection)
  const defaultCurrency = detectedCurrency || await getUserCurrency(effectiveUserId);
  const symbol = currencySymbols[defaultCurrency] || '₽';

  await setSession(telegramId, {
    type: 'text_expense_confirmation',
    amount: amount,
    description: description,
    originalText: text,
    detectedCurrency: detectedCurrency // Store detected currency if any
  });

  // Sort categories: suggested first, then alphabetically
  const sortedCategories = [...categories].sort((a, b) => {
    if (suggestedCategory) {
      if (a.id === suggestedCategory.id) return -1;
      if (b.id === suggestedCategory.id) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Create inline keyboard with categories
  const keyboard = {
    inline_keyboard: [
      ...sortedCategories.map(cat => [{
        text: `${cat.icon} ${cat.name}${cat.id === suggestedCategory?.id ? ' ✅' : ''}`,
        callback_data: `text_exp_${cat.id}`
      }]),
      [{
        text: '❌ Отмена',
        callback_data: 'text_cancel'
      }]
    ]
  };

  await sendTelegramMessage(
    chatId,
    `💸 <b>Добавить расход</b>\n\n` +
    `💰 Сумма: <b>${amount.toLocaleString('ru-RU')} ${symbol}</b>\n` +
    `📝 Описание: ${description}\n\n` +
    `Выберите категорию:${suggestedCategory ? '\n✅ - рекомендуемая' : ''}`,
    keyboard
  );
}

// Helper function to get telegram_id from user_id
async function getTelegramIdByUserId(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('telegram_id')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Error getting telegram_id:', error);
    return null;
  }

  return data.telegram_id;
}
async function handleVoiceMessage(message, userId) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;
  console.log('Voice message received, processing...');

  // OPTIMIZATION: Use cached user context (single call instead of 4 DB queries)
  const context = await getUserContext(userId);
  const { effectiveUserId, currency, categories, sources } = context;

  await sendTelegramMessage(chatId, '🎤 Распознаю голос...');
  try {
    // Get voice file
    const voice = message.voice;
    // Get file path from Telegram
    const fileResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${voice.file_id}`);
    const fileData = await fileResponse.json();
    if (!fileData.ok) {
      throw new Error('Не удалось получить голосовое сообщение');
    }
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    if (categories.length === 0 && sources.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет категорий и источников.\n\nСоздайте их в приложении CrystalBudget сначала.', removeKeyboard());
      return;
    }
    // Call transcribe-voice function
    const transcribeResponse = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        userId: effectiveUserId,
        audioUrl: fileUrl,
        categories: categories,
        sources: sources
      })
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('Transcribe-voice error:', errorText);
      throw new Error(`Ошибка распознавания голоса: ${transcribeResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const voiceData = await transcribeResponse.json();
    if (voiceData.error) {
      console.error('Voice data error:', voiceData.error);
      throw new Error(voiceData.error);
    }
    console.log('Voice data:', voiceData);
    // Handle expense
    if (voiceData.type === 'expense') {
      // Try to find suggested category (optional)
      const suggestedCategory = categories.find((cat) => cat.name.toLowerCase().includes(voiceData.category.toLowerCase()) || voiceData.category.toLowerCase().includes(cat.name.toLowerCase()));
      // Store in session for confirmation
      await setSession(telegramId, {
        type: 'voice_expense_confirmation',
        amount: voiceData.amount,
        description: voiceData.description,
        transcribedText: voiceData.transcribedText,
        suggestedCategory: voiceData.category
      });
      // Sort categories: suggested first, then alphabetically
      const sortedCategories = [
        ...categories
      ].sort((a, b) => {
        if (suggestedCategory) {
          if (a.id === suggestedCategory.id) return -1;
          if (b.id === suggestedCategory.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });
      // Show ALL categories (no limit)
      const keyboard = {
        inline_keyboard: [
          ...sortedCategories.map((cat) => [
            {
              text: `${cat.icon} ${cat.name}${suggestedCategory?.id === cat.id ? ' ✅' : ''}`,
              callback_data: `voice_exp_${cat.id}`
            }
          ]),
          [
            {
              text: '❌ Отмена',
              callback_data: 'voice_cancel'
            }
          ]
        ]
      };
      await sendTelegramMessage(chatId, `🎤 <b>Распознано:</b> "${voiceData.transcribedText}"\n\n` + `💸 Сумма: <b>${formatAmount(voiceData.amount, currency)}</b>\n` + (voiceData.description ? `📝 ${voiceData.description}\n` : '') + (suggestedCategory ? `\n💡 Предложенная категория: ${suggestedCategory.icon} ${suggestedCategory.name}` : '') + `\n\n<b>Выберите категорию:</b>`, keyboard);
    } else if (voiceData.type === 'income') {
      // Try to find suggested source (optional)
      const suggestedSource = sources.find((src) => src.name.toLowerCase().includes(voiceData.category.toLowerCase()) || voiceData.category.toLowerCase().includes(src.name.toLowerCase()));
      // Store in session for confirmation
      await setSession(telegramId, {
        type: 'voice_income_confirmation',
        amount: voiceData.amount,
        description: voiceData.description,
        transcribedText: voiceData.transcribedText,
        suggestedSource: voiceData.category
      });
      // Sort sources: suggested first, then alphabetically
      const sortedSources = [
        ...sources
      ].sort((a, b) => {
        if (suggestedSource) {
          if (a.id === suggestedSource.id) return -1;
          if (b.id === suggestedSource.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });
      // Show ALL sources (no limit)
      const keyboard = {
        inline_keyboard: [
          ...sortedSources.map((src) => [
            {
              text: `💵 ${src.name}${suggestedSource?.id === src.id ? ' ✅' : ''}`,
              callback_data: `voice_inc_${src.id}`
            }
          ]),
          [
            {
              text: '❌ Отмена',
              callback_data: 'voice_cancel'
            }
          ]
        ]
      };
      await sendTelegramMessage(chatId, `🎤 <b>Распознано:</b> "${voiceData.transcribedText}"\n\n` + `💰 Сумма: <b>${formatAmount(voiceData.amount, currency)}</b>\n` + (voiceData.description ? `📝 ${voiceData.description}\n` : '') + (suggestedSource ? `\n💡 Предложенный источник: ${suggestedSource.name}` : '') + `\n\n<b>Выберите источник:</b>`, keyboard);
    }
  } catch (error) {
    console.error('Voice processing error:', error);
    await sendTelegramMessage(chatId, `❌ Не удалось распознать голосовое сообщение.\n\n` + `Попробуйте:\n` + `• Говорить чётче\n` + `• Указать сумму и категорию\n` + `• Использовать кнопки для ручного ввода`, removeKeyboard());
  }
}
async function handlePhotoMessage(message, userId) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;
  console.log('Photo received, processing receipt...');

  // OPTIMIZATION: Use cached user context (single call instead of 3 DB queries)
  const context = await getUserContext(userId);
  const { effectiveUserId, currency, categories } = context;

  await sendTelegramMessage(chatId, '📸 Сканирую чек...');
  try {
    if (categories.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget сначала.', removeKeyboard());
      return;
    }

    // Get the largest photo
    const photo = message.photo[message.photo.length - 1];
    // Get file path from Telegram
    const fileResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`);
    const fileData = await fileResponse.json();
    if (!fileData.ok) {
      throw new Error('Не удалось получить фото');
    }
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Call scan-receipt function
    const scanResponse = await fetch(`${SUPABASE_URL}/functions/v1/scan-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        userId: effectiveUserId,
        imageUrl: fileUrl,
        categories: categories.map(c => ({ name: c.name, icon: c.icon }))
      })
    });

    if (!scanResponse.ok) {
      const errorText = await scanResponse.text();
      console.error('Scan-receipt error:', errorText);
      throw new Error(`Ошибка распознавания чека: ${scanResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const receiptData = await scanResponse.json();
    if (receiptData.error) {
      console.error('Receipt data error:', receiptData.error);
      throw new Error(receiptData.error);
    }
    console.log('Receipt data:', receiptData);

    // Store receipt data in session for confirmation
    await setSession(telegramId, {
      type: 'receipt_confirmation',
      receiptData: receiptData
    });
    // Find suggested category (use cached categories)
    const suggestedCategory = categories.find((c) => c.name.toLowerCase() === receiptData.category.toLowerCase());
    // Create keyboard with all categories, suggested one first
    let sortedCategories = categories;
    if (suggestedCategory) {
      sortedCategories = [
        suggestedCategory,
        ...categories.filter((c) => c.id !== suggestedCategory.id)
      ];
    }
    // Create keyboard with ALL categories (no limit) and cancel button
    const keyboard = {
      inline_keyboard: [
        ...sortedCategories.map((cat) => [
          {
            text: `${cat.icon} ${cat.name}${cat.id === suggestedCategory?.id ? ' ✅' : ''}`,
            callback_data: `receipt_cat_${cat.id}`
          }
        ]),
        [
          {
            text: '❌ Отмена',
            callback_data: 'receipt_cancel'
          }
        ]
      ]
    };
    await sendTelegramMessage(chatId, `📸 <b>Чек распознан!</b>\n\n` + `💰 Сумма: <b>${formatAmount(receiptData.amount, currency)}</b>\n` + `🏪 ${receiptData.store}\n` + (receiptData.description ? `📝 ${receiptData.description}\n` : '') + `\n<b>Выберите категорию:</b>`, keyboard);
  } catch (error) {
    console.error('Error processing receipt:', error);
    await sendTelegramMessage(chatId, '❌ Не удалось распознать чек.\n\n' + 'Попробуйте:\n' + '• Сделать фото более четким\n' + '• Убедиться что виден весь чек\n' + '• Добавить расход вручную', removeKeyboard());
  }
}
async function handleMessage(update) {
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
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.', removeKeyboard());
      return;
    }
    await handlePhotoMessage(message, userId);
    return;
  }
  // Handle voice messages
  if (message.voice) {
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.', removeKeyboard());
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
    if (text.startsWith('/start')) {
      // Extract parameter from /start command (e.g., /start auth)
      const parts = text.split(' ');
      const param = parts.length > 1 ? parts[1] : null;
      await handleStart(chatId, telegramId, firstName, lastName, username, param);
      return;
    }
    if (text === '/unlink') {
      await handleUnlinkCommand(chatId, telegramId);
      return;
    }
    // Check authorization for other commands
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.', removeKeyboard());
      return;
    }
    // Команды обрабатываются в handleTextMessage
    return;
  }
  // For non-command messages, check authorization
  const userId = await getUserByTelegramId(telegramId);
  if (!userId) {
    await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.', removeKeyboard());
    return;
  }
  await handleTextMessage(message, userId);
}

// Serve the webhook
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request received (CORS preflight)');
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    console.log(`Non-POST method: ${req.method}, returning 405`);
    return new Response('Method not allowed', { status: 405 });
  }

  let update;
  try {
    // Read body as text first to log raw content
    const rawBody = await req.text();
    console.log('Raw body received:', rawBody ? rawBody.substring(0, 200) + (rawBody.length > 200 ? '...' : '') : 'EMPTY');

    if (!rawBody || rawBody.trim() === '') {
      console.log('Empty body received, returning 200 (webhook verification)');
      return new Response('OK', { status: 200 });
    }

    update = JSON.parse(rawBody);
    console.log('Successfully parsed update:', JSON.stringify(update, null, 2).substring(0, 200) + '...');
  } catch (error) {
    console.error('Failed to parse update:', error);
    console.error('Raw body that caused error:', await req.text());
    return new Response('Invalid JSON', { status: 400 });
  }

  // Process the update
  try {
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return new Response('OK', { status: 200 });
    }

    // Handle messages
    if (update.message) {
      await handleMessage(update);
      return new Response('OK', { status: 200 });
    }

    // Unknown update type
    console.log('Unknown update type:', JSON.stringify(update, null, 2));
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error processing update:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

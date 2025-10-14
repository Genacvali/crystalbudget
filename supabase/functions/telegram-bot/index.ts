import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  
  // Parallel queries for better performance
  const [
    effectiveUserIdResult,
    currencyResult,
    categoriesResult,
    sourcesResult
  ] = await Promise.all([
    getEffectiveUserIdUncached(userId),
    getUserCurrencyUncached(userId),
    supabase.from('categories').select('id, name, icon').eq('user_id', userId).order('name'),
    supabase.from('income_sources').select('id, name').eq('user_id', userId).order('name')
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
function getMainKeyboard() {
  return {
    keyboard: [
      [
        {
          text: '💰 Финансы'
        }
      ],
      [
        {
          text: '⚙️ Настройки'
        }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}
function getFinanceKeyboard() {
  return {
    keyboard: [
      [
        {
          text: '💸 Добавить расход'
        },
        {
          text: '💰 Добавить доход'
        }
      ],
      [
        {
          text: '📸 Сканировать чек'
        }
      ],
      [
        {
          text: '🔙 Назад'
        }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}
function getReportsKeyboard() {
  return {
    keyboard: [
      [
        {
          text: '📊 Баланс'
        }
      ],
      [
        {
          text: '📁 Категории'
        },
        {
          text: '💵 Источники'
        }
      ],
      [
        {
          text: '🔙 Назад'
        }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}
function getSettingsKeyboard() {
  return {
    keyboard: [
      [
        {
          text: '🌍 Валюта'
        }
      ],
      [
        {
          text: '❓ Помощь'
        }
      ],
      [
        {
          text: '🔙 Назад'
        }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
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
  for(let i = 0; i < codes.length; i += 3){
    rows.push(codes.slice(i, i + 3).map((code)=>({
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
async function handleStart(chatId, telegramId, firstName, lastName, username) {
  // Check if already linked
  const userId = await getUserByTelegramId(telegramId);
  if (userId) {
    await sendTelegramMessage(chatId, `👋 Привет, ${firstName}!\n\n` + `Ваш аккаунт связан с CrystalBudget.\n` + `Используйте кнопки меню для управления бюджетом.\n\n` + `💡 Нажмите ❓ Помощь для получения инструкций.`, getMainKeyboard());
    return;
  }
  // Generate auth code
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
  await sendTelegramMessage(chatId, `👋 Привет, ${firstName}!\n\n` + `🔐 Ваш код авторизации:\n<code>${authCode}</code>\n\n` + `📱 Введите этот код на странице настроек в приложении CrystalBudget.\n\n` + `⏱ Код действителен 10 минут.`);
}
async function handleBalance(chatId, userId) {
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  // Check if user has a family
  const { data: familyMember } = await supabase.from('family_members').select('family_id').eq('user_id', userId).maybeSingle();
  // Get current month boundaries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  // Get all family members if user has a family
  let familyUserIds = [
    userId
  ];
  if (familyMember) {
    const { data: familyMembers } = await supabase.from('family_members').select('user_id').eq('family_id', familyMember.family_id);
    if (familyMembers) {
      familyUserIds = familyMembers.map((m)=>m.user_id);
    }
  }
  // Get current month income and expenses (for all family members)
  const { data: incomes } = await supabase.from('incomes').select('amount').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
  const { data: expenses } = await supabase.from('expenses').select('amount').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
  // Get previous months for carry-over balance (for all family members)
  const { data: previousIncomes } = await supabase.from('incomes').select('amount').in('user_id', familyUserIds).lt('date', startOfMonth);
  const { data: previousExpenses } = await supabase.from('expenses').select('amount').in('user_id', familyUserIds).lt('date', startOfMonth);
  const currentMonthIncome = (incomes || []).reduce((sum, inc)=>sum + Number(inc.amount), 0);
  const currentMonthExpenses = (expenses || []).reduce((sum, exp)=>sum + Number(exp.amount), 0);
  const monthBalance = currentMonthIncome - currentMonthExpenses;
  const previousTotalIncome = (previousIncomes || []).reduce((sum, inc)=>sum + Number(inc.amount), 0);
  const previousTotalExpenses = (previousExpenses || []).reduce((sum, exp)=>sum + Number(exp.amount), 0);
  const carryOverBalance = previousTotalIncome - previousTotalExpenses;
  const totalBalance = monthBalance + carryOverBalance;
  const monthName = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric'
  }).format(now);
  await sendTelegramMessage(chatId, `📊 <b>Баланс за ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>\n` + `${monthBalance > 0 ? '✅' : monthBalance < 0 ? '❌' : '➖'} <b>${formatAmount(monthBalance, currency)}</b>\n` + `${monthBalance > 0 ? 'Профицит' : monthBalance < 0 ? 'Дефицит' : 'Ноль'}\n\n` + `📉 <b>Общие расходы</b>\n` + `<b>${formatAmount(currentMonthExpenses, currency)}</b>\n` + (currentMonthIncome > 0 ? `${Math.round(currentMonthExpenses / currentMonthIncome * 100)}% от дохода\n\n` : '\n') + `💰 <b>Общий баланс</b>\n` + `<b>${formatAmount(totalBalance, currency)}</b>\n` + (carryOverBalance !== 0 ? `${formatAmount(monthBalance, currency)} + ${formatAmount(carryOverBalance, currency)} остаток` : `Только за ${monthName}`), getMainKeyboard());
}
async function handleCategories(chatId, userId) {
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  const { data: categories } = await supabase.from('categories').select('name, icon').eq('user_id', effectiveUserId).order('name');
  if (!categories || categories.length === 0) {
    await sendTelegramMessage(chatId, '📁 У вас пока нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.', getMainKeyboard());
    return;
  }
  // Split categories into chunks to avoid Telegram message length limit (4096 chars)
  const chunkSize = 30; // ~30 categories per message
  const chunks = [];
  for(let i = 0; i < categories.length; i += chunkSize){
    chunks.push(categories.slice(i, i + chunkSize));
  }
  // Send first chunk with header
  const firstChunk = chunks[0];
  const firstList = firstChunk.map((cat)=>`${cat.icon} ${cat.name}`).join('\n');
  await sendTelegramMessage(chatId, `📁 <b>Ваши категории (${categories.length}):</b>\n\n${firstList}${chunks.length > 1 ? '\n\n⬇️ Продолжение...' : ''}`, chunks.length === 1 ? getMainKeyboard() : undefined);
  // Send remaining chunks
  for(let i = 1; i < chunks.length; i++){
    const chunk = chunks[i];
    const list = chunk.map((cat)=>`${cat.icon} ${cat.name}`).join('\n');
    await sendTelegramMessage(chatId, `${list}${i < chunks.length - 1 ? '\n\n⬇️ Продолжение...' : ''}`, i === chunks.length - 1 ? getMainKeyboard() : undefined);
  }
}
async function handleSources(chatId, userId) {
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  const { data: sources } = await supabase.from('income_sources').select('name, color, amount').eq('user_id', effectiveUserId).order('name');
  if (!sources || sources.length === 0) {
    await sendTelegramMessage(chatId, '💵 У вас пока нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.', getMainKeyboard());
    return;
  }
  // Split sources into chunks to avoid Telegram message length limit (4096 chars)
  const chunkSize = 30; // ~30 sources per message
  const chunks = [];
  for(let i = 0; i < sources.length; i += chunkSize){
    chunks.push(sources.slice(i, i + chunkSize));
  }
  // Send first chunk with header
  const firstChunk = chunks[0];
  const firstList = firstChunk.map((src)=>{
    const amount = src.amount ? ` (${formatAmount(Number(src.amount), currency)})` : '';
    return `💵 ${src.name}${amount}`;
  }).join('\n');
  await sendTelegramMessage(chatId, `💵 <b>Ваши источники дохода (${sources.length}):</b>\n\n${firstList}${chunks.length > 1 ? '\n\n⬇️ Продолжение...' : ''}`, chunks.length === 1 ? getMainKeyboard() : undefined);
  // Send remaining chunks
  for(let i = 1; i < chunks.length; i++){
    const chunk = chunks[i];
    const list = chunk.map((src)=>{
      const amount = src.amount ? ` (${formatAmount(Number(src.amount), currency)})` : '';
      return `💵 ${src.name}${amount}`;
    }).join('\n');
    await sendTelegramMessage(chatId, `${list}${i < chunks.length - 1 ? '\n\n⬇️ Продолжение...' : ''}`, i === chunks.length - 1 ? getMainKeyboard() : undefined);
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
      await sendTelegramMessage(chatId, '❌ Ошибка получения категорий. Попробуйте позже.', getMainKeyboard());
      return;
    }
    if (!categories || categories.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget.', getMainKeyboard());
      return;
    }
    // Create inline keyboard with categories
    const keyboard = {
      inline_keyboard: categories.map((cat)=>[
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
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', getMainKeyboard());
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
      await sendTelegramMessage(chatId, '❌ Ошибка получения источников дохода. Попробуйте позже.', getMainKeyboard());
      return;
    }
    if (!sources || sources.length === 0) {
      await sendTelegramMessage(chatId, '❌ У вас нет источников дохода.\n\nСоздайте их в приложении CrystalBudget.', getMainKeyboard());
      return;
    }
    // Create inline keyboard with sources
    const keyboard = {
      inline_keyboard: sources.map((src)=>[
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
    await sendTelegramMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', getMainKeyboard());
  }
}
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;
  const data = query.data;
  console.log(`handleCallbackQuery: data="${data}", telegramId=${telegramId}`);
  const userId = await getUserByTelegramId(telegramId);
  console.log(`User ID from telegram: ${userId || 'not found'}`);
  if (!userId) {
    // answerCallbackQuery уже вызван в main handler
    await sendTelegramMessage(chatId, '❌ Вы не авторизованы. Используйте /start');
    return;
  }
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  // Handle expense category selection
  if (data.startsWith('exp_cat_')) {
    console.log(`Handling expense category selection`);
    const categoryId = data.replace('exp_cat_', '');
    console.log(`Category ID: ${categoryId}`);
    await setSession(telegramId, {
      type: 'expense',
      categoryId
    });
    console.log(`Session set for expense with category ${categoryId}`);
    await sendTelegramMessage(chatId, '💸 Введите сумму расхода:\n\nНапример: <code>500</code> или <code>1500 Покупка продуктов</code>\n\nНажмите <b>🔙 Назад</b>, чтобы отменить');
    return;
  }
  // Handle income source selection
  if (data.startsWith('inc_src_')) {
    console.log(`Handling income source selection`);
    const sourceId = data.replace('inc_src_', '');
    console.log(`Source ID: ${sourceId}`);
    await setSession(telegramId, {
      type: 'income',
      sourceId
    });
    console.log(`Session set for income with source ${sourceId}`);
    await sendTelegramMessage(chatId, '💰 Введите сумму дохода:\n\nНапример: <code>50000</code> или <code>50000 Зарплата за октябрь</code>\n\nНажмите <b>🔙 Назад</b>, чтобы отменить');
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
    const { data: categoryData, error: catError } = await supabase.from('categories').select('name, icon').eq('id', categoryId).single();
    console.log(`Category data: ${categoryData ? categoryData.name : 'not found'}, error: ${catError?.message || 'none'}`);
    if (catError || !categoryData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения категории');
      return;
    }
    // Create expense with proper date format
    let expenseDate;
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
    const { data: insertedExpense, error } = await supabase.from('expenses').insert({
      user_id: userId,
      category_id: categoryId,
      amount: receiptData.amount,
      description: receiptData.description || receiptData.store,
      date: expenseDate
    }).select().single();
    if (error) {
      console.error('Error creating expense:', error);
      await sendTelegramMessage(chatId, `❌ Ошибка сохранения расхода: ${error.message}`, getMainKeyboard());
      return;
    }
    console.log('Expense created successfully:', JSON.stringify(insertedExpense));
    // Clear session
    await deleteSession(telegramId);
    await sendTelegramMessage(chatId, `✅ <b>Чек сохранён!</b>\n\n` + `💸 Сумма: <b>${formatAmount(receiptData.amount, currency)}</b>\n` + `📁 ${categoryData.icon} ${categoryData.name}\n` + `🏪 ${receiptData.store}\n` + (receiptData.description ? `📝 ${receiptData.description}` : ''), getMainKeyboard());
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
    const { data: categoryData, error: catError } = await supabase.from('categories').select('name, icon').eq('id', categoryId).single();
    if (catError || !categoryData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения категории');
      return;
    }
    // Create expense
    const { error } = await supabase.from('expenses').insert({
      user_id: userId,
      category_id: categoryId,
      amount: session.amount,
      description: session.description,
      date: new Date().toISOString()
    });
    if (error) {
      console.error('Error creating voice expense:', error);
      await sendTelegramMessage(chatId, `❌ Ошибка: ${error.message}`);
      return;
    }
    await deleteSession(telegramId);
    await sendTelegramMessage(chatId, `✅ <b>Расход сохранён!</b>\n\n` + `🎤 "${session.transcribedText}"\n\n` + `💸 Сумма: <b>${formatAmount(session.amount, currency)}</b>\n` + `📁 ${categoryData.icon} ${categoryData.name}\n` + (session.description ? `📝 ${session.description}` : ''), getMainKeyboard());
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
    const { data: sourceData, error: srcError } = await supabase.from('income_sources').select('name').eq('id', sourceId).single();
    if (srcError || !sourceData) {
      await sendTelegramMessage(chatId, '❌ Ошибка получения источника');
      return;
    }
    // Create income
    const { error } = await supabase.from('incomes').insert({
      user_id: userId,
      source_id: sourceId,
      amount: session.amount,
      description: session.description,
      date: new Date().toISOString()
    });
    if (error) {
      console.error('Error creating voice income:', error);
      await sendTelegramMessage(chatId, `❌ Ошибка: ${error.message}`);
      return;
    }
    await deleteSession(telegramId);
    await sendTelegramMessage(chatId, `✅ <b>Доход сохранён!</b>\n\n` + `🎤 "${session.transcribedText}"\n\n` + `💰 Сумма: <b>${formatAmount(session.amount, currency)}</b>\n` + `💵 ${sourceData.name}\n` + (session.description ? `📝 ${session.description}` : ''), getMainKeyboard());
    return;
  }
  // Handle voice cancellation
  if (data === 'voice_cancel') {
    await deleteSession(telegramId);
    await sendTelegramMessage(chatId, '❌ Голосовая транзакция отменена', getMainKeyboard());
    return;
  }
  // Handle receipt cancellation
  if (data === 'receipt_cancel') {
    await deleteSession(telegramId);
    await sendTelegramMessage(chatId, '❌ Сканирование чека отменено', getMainKeyboard());
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
    await sendTelegramMessage(chatId, '⚙️ <b>Настройки</b>\n\nВыберите раздел:', getSettingsKeyboard());
    return;
  }
  // Handle currency selection
  if (data.startsWith('currency_')) {
    const newCurrency = data.replace('currency_', '');
    const valid = [
      'RUB',
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CNY',
      'KRW',
      'GEL',
      'AMD'
    ].includes(newCurrency);
    if (!valid) {
      await sendTelegramMessage(chatId, '❌ Неверный код валюты');
      return;
    }
    // Try robust save: upsert -> update -> insert
    let saveError = null;
    try {
      const { data: upsertRow, error } = await supabase.from('user_preferences').upsert({
        user_id: userId,
        currency: newCurrency
      }, {
        onConflict: 'user_id'
      }).select().single();
      saveError = error || null;
      if (!saveError) {
        await sendTelegramMessage(chatId, `✅ Валюта сохранена: <b>${newCurrency}</b>`);
        return;
      }
    } catch (e) {
      saveError = e;
    }
    if (saveError) {
      console.warn('Upsert failed, try update then insert', saveError);
      // Try update
      const { error: updateError } = await supabase.from('user_preferences').update({
        currency: newCurrency
      }).eq('user_id', userId);
      if (!updateError) {
        await sendTelegramMessage(chatId, `✅ Валюта сохранена: <b>${newCurrency}</b>`);
        return;
      }
      // Try insert
      const { error: insertError } = await supabase.from('user_preferences').insert({
        user_id: userId,
        currency: newCurrency
      });
      if (!insertError) {
        await sendTelegramMessage(chatId, `✅ Валюта сохранена: <b>${newCurrency}</b>`);
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
async function handleTextMessage(message, userId) {
  const chatId = message.chat.id;
  const telegramId = message.from.id;
  const text = message.text.trim();
  console.log(`handleTextMessage: text="${text}", userId=${userId}`);
  // Get effective user ID (family owner if in family)
  const effectiveUserId = await getEffectiveUserId(userId);
  // Get user currency
  const currency = await getUserCurrency(effectiveUserId);
  // Check if user is in a session (adding expense/income)
  const session = await getSession(telegramId);
  console.log(`Session state: ${session ? JSON.stringify(session) : 'none'}`);
  if (session) {
    // Allow cancel
    if (text === '🔙 Назад' || text === '/cancel') {
      await deleteSession(telegramId);
      await sendTelegramMessage(chatId, '❌ Ввод суммы отменен', getMainKeyboard());
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
      const { error } = await supabase.from('expenses').insert({
        user_id: userId,
        amount: amount,
        category_id: session.categoryId,
        description: description,
        date: new Date().toISOString()
      });
      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления расхода.');
      } else {
        const symbol = currencySymbols[currency] || '₽';
        await sendTelegramMessage(chatId, `✅ <b>Расход добавлен!</b>\n\n` + `💸 Сумма: <b>${amount.toLocaleString('ru-RU')} ${symbol}</b>\n` + (description ? `📝 ${description}` : ''), getMainKeyboard());
      }
    } else if (session.type === 'income') {
      const { error} = await supabase.from('incomes').insert({
        user_id: userId,
        amount: amount,
        source_id: session.sourceId,
        description: description,
        date: new Date().toISOString()
      });
      if (error) {
        await sendTelegramMessage(chatId, '❌ Ошибка добавления дохода.');
      } else {
        const symbol = currencySymbols[currency] || '₽';
        await sendTelegramMessage(chatId, `✅ <b>Доход добавлен!</b>\n\n` + `💰 Сумма: <b>${amount.toLocaleString('ru-RU')} ${symbol}</b>\n` + (description ? `📝 ${description}` : ''), getMainKeyboard());
      }
    }
    await deleteSession(telegramId);
    return;
  }
  // Handle button presses
  switch(text){
    case '🔙 Назад':
      await sendTelegramMessage(chatId, '🏠 Главное меню', getMainKeyboard());
      break;
    case '💰 Финансы':
      await sendTelegramMessage(chatId, '💰 <b>Финансы</b>\n\nВыберите действие:', getFinanceKeyboard());
      break;
    case '📊 Отчёты':
      await sendTelegramMessage(chatId, '📊 <b>Отчёты и аналитика</b>\n\nВыберите раздел:', getReportsKeyboard());
      break;
    case '⚙️ Настройки':
      await sendTelegramMessage(chatId, '⚙️ <b>Настройки</b>\n\n' + 'Управление ботом и подпиской.\n\n' + 'Выберите раздел:', getSettingsKeyboard());
      break;
    case '🌍 Валюта':
      await sendTelegramMessage(chatId, '🌍 <b>Выбор валюты</b>\n\nВыберите предпочитаемую валюту для отображения сумм:', getCurrencyKeyboard());
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
      await sendTelegramMessage(chatId, '📸 <b>Сканирование чека</b>\n\n' + 'Отправьте фото чека, и я автоматически:\n' + '✅ Распознаю сумму\n' + '✅ Определю категорию\n' + '✅ Создам транзакцию\n\n' + '📷 Просто отправьте фото чека в чат!', getFinanceKeyboard());
      break;
    case '❓ Помощь':
      await sendTelegramMessage(chatId, `📱 <b>CrystalBudget Bot</b>\n\n` + `<b>Главное меню:</b>\n\n` + `💰 <b>Финансы</b> - управление доходами и расходами\n` + `  • Добавить расход/доход\n` + `  • Сканировать чек\n` + `  • Голосовые сообщения\n\n` + `📊 <b>Отчёты</b> - аналитика и статистика\n` + `  • Баланс\n` + `  • Категории и источники\n\n` + `⚙️ <b>Настройки</b>\n` + `  • ❓ Помощь\n` + `  • 🌍 Валюта\n\n` + `💡 <b>Совет:</b> Запишите голосовое "Купил продуктов на 500 рублей" и бот создаст транзакцию автоматически!`, getSettingsKeyboard());
      break;
    default:
      await sendTelegramMessage(chatId, '❓ Используйте кнопки меню или команду /help', getMainKeyboard());
  }
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
      await sendTelegramMessage(chatId, '❌ У вас нет категорий и источников.\n\nСоздайте их в приложении CrystalBudget сначала.', getMainKeyboard());
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
        userId: userId,
        audioUrl: fileUrl,
        categories: categories,
        sources: sources
      })
    });
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
      const suggestedCategory = categories.find((cat)=>cat.name.toLowerCase().includes(voiceData.category.toLowerCase()) || voiceData.category.toLowerCase().includes(cat.name.toLowerCase()));
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
      ].sort((a, b)=>{
        if (suggestedCategory) {
          if (a.id === suggestedCategory.id) return -1;
          if (b.id === suggestedCategory.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });
      // Show ALL categories (no limit)
      const keyboard = {
        inline_keyboard: [
          ...sortedCategories.map((cat)=>[
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
      const suggestedSource = sources.find((src)=>src.name.toLowerCase().includes(voiceData.category.toLowerCase()) || voiceData.category.toLowerCase().includes(src.name.toLowerCase()));
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
      ].sort((a, b)=>{
        if (suggestedSource) {
          if (a.id === suggestedSource.id) return -1;
          if (b.id === suggestedSource.id) return 1;
        }
        return a.name.localeCompare(b.name);
      });
      // Show ALL sources (no limit)
      const keyboard = {
        inline_keyboard: [
          ...sortedSources.map((src)=>[
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
    await sendTelegramMessage(chatId, `❌ Не удалось распознать голосовое сообщение.\n\n` + `Попробуйте:\n` + `• Говорить чётче\n` + `• Указать сумму и категорию\n` + `• Использовать кнопки для ручного ввода`, getMainKeyboard());
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
      await sendTelegramMessage(chatId, '❌ У вас нет категорий расходов.\n\nСоздайте их в приложении CrystalBudget сначала.', getMainKeyboard());
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
        userId: userId,
        imageUrl: fileUrl,
        categories: categories.map(c => ({ name: c.name, icon: c.icon }))
      })
    });
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
      receiptData: receiptData
    });
    // Find suggested category (use cached categories)
    const suggestedCategory = categories.find((c)=>c.name.toLowerCase() === receiptData.category.toLowerCase());
    // Create keyboard with all categories, suggested one first
    let sortedCategories = categories;
    if (suggestedCategory) {
      sortedCategories = [
        suggestedCategory,
        ...categories.filter((c)=>c.id !== suggestedCategory.id)
      ];
    }
    // Create keyboard with ALL categories (no limit) and cancel button
    const keyboard = {
      inline_keyboard: [
        ...sortedCategories.map((cat)=>[
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
    await sendTelegramMessage(chatId, '❌ Не удалось распознать чек.\n\n' + 'Попробуйте:\n' + '• Сделать фото более четким\n' + '• Убедиться что виден весь чек\n' + '• Добавить расход вручную', getMainKeyboard());
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
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.');
      return;
    }
    await handlePhotoMessage(message, userId);
    return;
  }
  // Handle voice messages
  if (message.voice) {
    const userId = await getUserByTelegramId(telegramId);
    if (!userId) {
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.');
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
      await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.');
      return;
    }
    if (text === '/balance') {
      await handleBalance(chatId, userId);
    } else if (text === '/help') {
      await sendTelegramMessage(chatId, `📱 <b>CrystalBudget Bot</b>\n\n` + `Используйте кнопки для быстрого доступа к функциям или команды:\n\n` + `/start - начать работу\n` + `/balance - показать баланс\n` + `/help - эта справка`, getMainKeyboard());
    }
    return;
  }
  // For non-command messages, check authorization
  const userId = await getUserByTelegramId(telegramId);
  if (!userId) {
    await sendTelegramMessage(chatId, '❌ Вы не авторизованы.\n\nИспользуйте /start для получения кода авторизации.');
    return;
  }
  await handleTextMessage(message, userId);
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  let update;
  try {
    const raw = await req.text();
    console.log('RAW UPDATE:', raw);
    update = JSON.parse(raw);
    console.log('Type:', update.callback_query ? 'callback_query' : update.message ? 'message' : 'other');
  } catch (error) {
    console.error('Failed to parse update:', error);
    return new Response(JSON.stringify({
      ok: false
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  // OPTIMIZATION: Track request start time
  const requestStart = Date.now();
  trackMetric('request');
  
  // OPTIMIZATION: Rate Limiting
  const userId = update.callback_query?.from?.id || update.message?.from?.id;
  if (userId && !checkRateLimit(userId.toString())) {
    trackMetric('rateLimitHit');
    console.warn(`⚠️ Rate limit exceeded for user ${userId}`);
    
    const chatId = update.callback_query?.message?.chat?.id || update.message?.chat?.id;
    if (chatId) {
      await sendTelegramMessage(
        chatId, 
        '⏱️ Слишком много запросов. Пожалуйста, подождите немного.'
      );
    }
    
    return new Response(JSON.stringify({
      ok: true
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Обработка с таймаутом для защиты от зависаний
  const handler = (async ()=>{
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
      trackMetric('error');
    }
  })();
  
  // OPTIMIZATION: Reduced timeout from 8s to 5s
  const timeout = new Promise((resolve)=>setTimeout(()=>{
      console.log('⏱️ Handler timeout reached (5s)');
      resolve('timeout');
    }, 5000));
  
  const result = await Promise.race([
    handler,
    timeout
  ]);
  
  // OPTIMIZATION: Track response time
  const duration = Date.now() - requestStart;
  trackMetric('request', duration);
  
  // Всегда быстрый ACK для Telegram
  return new Response(JSON.stringify({
    ok: true,
    result: result === 'timeout' ? 'timeout' : 'processed'
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
});

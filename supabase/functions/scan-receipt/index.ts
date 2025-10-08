import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Требуется авторизация');
    }

    // Create Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    // Check if it's service role key (from Telegram bot) or user token
    const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY!);
    
    let supabase;
    let userId;
    
    // Get request data first
    const requestData = await req.json();
    
    if (isServiceRole) {
      // Service role call from Telegram bot - get userId from request body
      supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      userId = requestData.userId;
      
      if (!userId) {
        throw new Error('Требуется userId в теле запроса');
      }
    } else {
      // User token call - validate token
      const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
      supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
        global: {
          headers: { Authorization: authHeader },
        },
      });

      // Get user from token
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Неверный токен авторизации');
      }
      userId = user.id;
    }

    // Check if user has active subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!subscription) {
      return new Response(
        JSON.stringify({
          error: 'Требуется активная подписка',
          code: 'SUBSCRIPTION_REQUIRED'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Extract data from request
    const { imageUrl, categories } = requestData;

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Scanning receipt from image');

    // Create prompt with user's categories for better matching
    const categoriesText = categories.map((c: any) => `${c.icon} ${c.name}`).join(', ');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Ты - эксперт по распознаванию чеков. Твоя задача:
1. Проанализировать изображение чека
2. Извлечь ОБЩУЮ сумму покупки (итого к оплате)
3. Определить наиболее подходящую категорию из списка пользователя
4. Создать краткое описание покупки

Доступные категории: ${categoriesText}

Текущая дата: ${new Date().toISOString().split('T')[0]}

ВАЖНО:
- Если на чеке несколько товаров, возьми ИТОГОВУЮ сумму
- Выбирай категорию максимально точно
- Описание должно быть кратким (например: "Продукты в Пятёрочке")
- При определении даты: если год на чеке не указан или нечитаем, используй текущий год ${new Date().getFullYear()}
- Если дата полностью не видна, верни null

Ответь ТОЛЬКО в формате JSON (без markdown):
{
  "amount": число,
  "category": "название категории из списка",
  "description": "краткое описание",
  "store": "название магазина",
  "date": "дата в формате YYYY-MM-DD или null если не видно"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Проанализируй этот чек и извлеки данные'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', response.status, errorText);
      throw new Error('Ошибка распознавания чека');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('AI response:', content);

    // Parse JSON from response
    let result;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanContent);

      // Fix date if it's in the past (more than 1 year ago)
      if (result.date) {
        const receiptDate = new Date(result.date);
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        // If date is more than 1 year in the past, use current date
        if (receiptDate < oneYearAgo) {
          console.log(`Date ${result.date} is too old, using current date`);
          result.date = now.toISOString().split('T')[0];
        }
      }
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Не удалось распознать чек. Попробуйте другое фото.');
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Receipt scan error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Ошибка сканирования чека'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

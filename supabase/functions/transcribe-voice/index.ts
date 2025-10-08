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
    const { audioUrl, categories, sources } = requestData;

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Transcribing voice message from:', audioUrl);

    // Step 1: Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file');
    }
    const audioBlob = await audioResponse.blob();

    // Step 2: Transcribe audio using Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ru');

    const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('Whisper API error:', transcribeResponse.status, errorText);
      throw new Error('Ошибка распознавания голоса');
    }

    const transcribeData = await transcribeResponse.json();
    const transcribedText = transcribeData.text;

    console.log('Transcribed text:', transcribedText);

    // Step 3: Parse transcribed text to extract transaction data
    const categoriesText = categories.map((c: any) => `${c.icon} ${c.name}`).join(', ');
    const sourcesText = sources ? sources.map((s: any) => `${s.name}`).join(', ') : '';

    const parsePrompt = `Ты - помощник по распознаванию финансовых транзакций из голосовых сообщений.

Пользователь сказал: "${transcribedText}"

Доступные категории расходов: ${categoriesText}
${sourcesText ? `Доступные источники дохода: ${sourcesText}` : ''}

Определи:
1. Тип транзакции (расход или доход)
2. Сумму
3. Категорию/источник (выбери наиболее подходящий из списка)
4. Описание (опционально)

Примеры:
- "Купил продуктов на тысячу рублей" → расход, 1000, категория "Питание"
- "Потратил 500 на такси" → расход, 500, категория "Транспорт"
- "Получил зарплату 50000" → доход, 50000, источник "Зарплата"

ВАЖНО:
- Если пользователь не указал категорию явно, выбери наиболее подходящую
- Если не можешь определить тип или сумму, верни error
- Сумма должна быть числом (без валюты)

Ответь ТОЛЬКО в формате JSON (без markdown):
{
  "type": "expense" или "income",
  "amount": число,
  "category": "название категории или источника из списка",
  "description": "краткое описание или null",
  "error": "текст ошибки если не удалось распознать или null"
}`;

    const parseResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: parsePrompt
          }
        ],
        max_completion_tokens: 300,
      }),
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error('GPT API error:', parseResponse.status, errorText);
      throw new Error('Ошибка обработки текста');
    }

    const parseData = await parseResponse.json();
    const resultText = parseData.choices[0].message.content;

    console.log('Parse result:', resultText);

    // Parse JSON response
    let result;
    try {
      const cleanContent = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanContent);
      result.transcribedText = transcribedText; // Add original transcription
    } catch (e) {
      console.error('Failed to parse GPT response:', resultText);
      throw new Error('Не удалось обработать голосовое сообщение');
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Voice transcription error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Ошибка распознавания голоса'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

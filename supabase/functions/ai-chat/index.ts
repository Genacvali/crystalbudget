import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Processing chat request with', messages.length, 'messages');

    const tools = [
      {
        type: "function",
        function: {
          name: "create_category",
          description: "Создать новую категорию расходов",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Название категории" },
              icon: { type: "string", description: "Эмодзи иконка (например: 🍔, 🚗, 🏠)" },
            },
            required: ["name", "icon"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_category",
          description: "Обновить название или иконку категории",
          parameters: {
            type: "object",
            properties: {
              old_name: { type: "string", description: "Текущее название категории" },
              new_name: { type: "string", description: "Новое название категории" },
              icon: { type: "string", description: "Новая эмодзи иконка" },
            },
            required: ["old_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_category",
          description: "Удалить категорию",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Название категории для удаления" },
            },
            required: ["name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_category_allocation",
          description: "Настроить процент или лимит для категории",
          parameters: {
            type: "object",
            properties: {
              category_name: { type: "string", description: "Название категории" },
              allocation_percent: { type: "number", description: "Процент от дохода (например: 30 для 30%)" },
              allocation_amount: { type: "number", description: "Фиксированная сумма лимита" },
            },
            required: ["category_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_income_source",
          description: "Создать новый источник дохода",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Название источника (например: Зарплата, Фриланс)" },
              amount: { type: "number", description: "Ожидаемая сумма дохода" },
            },
            required: ["name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_income_source",
          description: "Обновить название или сумму источника дохода",
          parameters: {
            type: "object",
            properties: {
              old_name: { type: "string", description: "Текущее название источника" },
              new_name: { type: "string", description: "Новое название источника" },
              amount: { type: "number", description: "Новая ожидаемая сумма" },
            },
            required: ["old_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_income_source",
          description: "Удалить источник дохода",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Название источника для удаления" },
            },
            required: ["name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_expense",
          description: "Добавить расход",
          parameters: {
            type: "object",
            properties: {
              category_name: { type: "string", description: "Название категории расхода" },
              amount: { type: "number", description: "Сумма расхода" },
              description: { type: "string", description: "Описание расхода" },
              date: { type: "string", description: "Дата в формате YYYY-MM-DD" }
            },
            required: ["category_name", "amount"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_expense",
          description: "Обновить расход. Для поиска используется описание или сумма и дата",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Описание расхода для поиска" },
              amount: { type: "number", description: "Сумма для поиска (если описания нет)" },
              date: { type: "string", description: "Дата для поиска в формате YYYY-MM-DD" },
              new_amount: { type: "number", description: "Новая сумма расхода" },
              new_description: { type: "string", description: "Новое описание" },
              new_category_name: { type: "string", description: "Новая категория" },
            },
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_expense",
          description: "Удалить расход. Для поиска используется описание или сумма и дата",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Описание расхода" },
              amount: { type: "number", description: "Сумма расхода" },
              date: { type: "string", description: "Дата в формате YYYY-MM-DD" },
            },
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_income",
          description: "Добавить доход",
          parameters: {
            type: "object",
            properties: {
              source_name: { type: "string", description: "Название источника дохода" },
              amount: { type: "number", description: "Сумма дохода" },
              description: { type: "string", description: "Описание дохода" },
              date: { type: "string", description: "Дата в формате YYYY-MM-DD" }
            },
            required: ["source_name", "amount"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_income",
          description: "Обновить доход. Для поиска используется описание или сумма и дата",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Описание дохода для поиска" },
              amount: { type: "number", description: "Сумма для поиска" },
              date: { type: "string", description: "Дата для поиска в формате YYYY-MM-DD" },
              new_amount: { type: "number", description: "Новая сумма дохода" },
              new_description: { type: "string", description: "Новое описание" },
              new_source_name: { type: "string", description: "Новый источник" },
            },
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_income",
          description: "Удалить доход. Для поиска используется описание или сумма и дата",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Описание дохода" },
              amount: { type: "number", description: "Сумма дохода" },
              date: { type: "string", description: "Дата в формате YYYY-MM-DD" },
            },
            required: []
          }
        }
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'Ты - профессиональный финансовый аналитик и помощник по управлению бюджетом. Ты можешь создавать, редактировать и удалять категории, источники дохода, доходы и расходы, а также настраивать проценты и лимиты для категорий. Когда пользователь просит создать, изменить или удалить что-то, используй доступные инструменты. ВАЖНО: ты НЕ можешь изменять настройки профиля пользователя, семьи или личный кабинет. Отвечай кратко и по делу, на русском языке.'
          },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        max_completion_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Превышен лимит запросов. Попробуйте позже.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Недостаточно средств на балансе OpenAI.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('Ошибка OpenAI API');
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Неизвестная ошибка' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

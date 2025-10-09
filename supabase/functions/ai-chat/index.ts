import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get family owner ID if user is in a family, otherwise return user_id
async function getEffectiveUserId(supabase: any, userId: string): Promise<string> {
  console.log('🔍 Determining effective user ID for:', userId);
  
  // Check if user is a family owner
  const { data: ownedFamily, error: ownedFamilyError } = await supabase
    .from('families')
    .select('id, owner_id')
    .eq('owner_id', userId)
    .maybeSingle();

  if (ownedFamilyError) {
    console.error('❌ Error checking family ownership:', ownedFamilyError);
  }

  console.log('👑 Family ownership check:', { ownedFamily, ownedFamilyError });

  if (ownedFamily) {
    console.log('✅ User is family owner, using their ID');
    return userId;
  }

  // Check if user is a family member
  const { data: membership, error: membershipError } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    console.error('❌ Error checking family membership:', membershipError);
  }

  console.log('👨‍👩‍👧‍👦 Family membership check:', { membership, membershipError });

  if (membership) {
    // Get the family owner
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('owner_id')
      .eq('id', membership.family_id)
      .maybeSingle();

    if (familyError) {
      console.error('❌ Error getting family owner:', familyError);
    }

    console.log('👑 Family owner check:', { family, familyError });

    if (family) {
      console.log('✅ User is family member, using owner ID:', family.owner_id);
      return family.owner_id;
    }
  }

  console.log('✅ User is individual, using their own ID');
  return userId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userId } = await req.json();

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Processing chat request with', messages.length, 'messages', 'userId:', userId);

    // Try to get user context
    let budgetContext = '';
    try {
      if (userId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        console.log('Supabase URL:', supabaseUrl ? 'present' : 'missing');
        console.log('Service Key:', supabaseServiceKey ? 'present' : 'missing');

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('Loading context for user:', userId);

        // Get effective user ID (family owner if in family)
        const effectiveUserId = await getEffectiveUserId(supabase, userId);
        console.log('Effective user ID:', effectiveUserId);

        // Load user's budget context - get last 12 months for better context
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString(); // 12 months ago
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        // Get all family members if user is in a family
        let familyUserIds = [userId];
        console.log('👥 Starting family members check for user:', userId);
        
        const { data: familyMember, error: familyMemberError } = await supabase
          .from('family_members')
          .select('family_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (familyMemberError) {
          console.error('❌ Error checking family membership:', familyMemberError);
        }

        console.log('👥 Family member check result:', { familyMember, familyMemberError });

        if (familyMember) {
          console.log('👨‍👩‍👧‍👦 User is in family, loading all members for family_id:', familyMember.family_id);
          
          const { data: familyMembers, error: familyMembersError } = await supabase
            .from('family_members')
            .select('user_id')
            .eq('family_id', familyMember.family_id);

          if (familyMembersError) {
            console.error('❌ Error loading family members:', familyMembersError);
          }

          console.log('👨‍👩‍👧‍👦 Family members loaded:', { familyMembers, familyMembersError });

          if (familyMembers) {
            familyUserIds = familyMembers.map(m => m.user_id);
            console.log('✅ Family user IDs updated:', familyUserIds);
          }
        } else {
          console.log('👤 User is individual, using single user ID');
        }

        // First check if user has any data at all
        const [totalExpensesRes, totalIncomesRes] = await Promise.all([
          supabase.from('expenses').select('id').in('user_id', familyUserIds),
          supabase.from('incomes').select('id').in('user_id', familyUserIds),
        ]);

        console.log('📊 Total data check:', {
          totalExpenses: totalExpensesRes.data?.length || 0,
          totalIncomes: totalIncomesRes.data?.length || 0,
          totalExpensesError: totalExpensesRes.error,
          totalIncomesError: totalIncomesRes.error
        });

        const [categoriesRes, sourcesRes, expensesRes, incomesRes, allocationsRes] = await Promise.all([
          supabase.from('categories').select('*').eq('user_id', effectiveUserId),
          supabase.from('income_sources').select('*').eq('user_id', effectiveUserId),
          supabase.from('expenses').select('*').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth),
          supabase.from('incomes').select('*').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth),
          supabase.from('category_allocations').select('*'),
        ]);

        // Log any errors
        if (categoriesRes.error) console.error('Categories error:', categoriesRes.error);
        if (sourcesRes.error) console.error('Sources error:', sourcesRes.error);
        if (expensesRes.error) console.error('Expenses error:', expensesRes.error);
        if (incomesRes.error) console.error('Incomes error:', incomesRes.error);
        if (allocationsRes.error) console.error('Allocations error:', allocationsRes.error);

        const categories = categoriesRes.data || [];
        const sources = sourcesRes.data || [];
        const expenses = expensesRes.data || [];
        const incomes = incomesRes.data || [];
        const allocations = allocationsRes.data || [];

        console.log('📊 Loaded data summary:', {
          userId: userId,
          effectiveUserId: effectiveUserId,
          familyUserIds: familyUserIds,
          categories: categories.length,
          sources: sources.length,
          expenses: expenses.length,
          incomes: incomes.length,
          allocations: allocations.length,
          dateRange: { startOfMonth, endOfMonth }
        });

        // Log sample data if available
        if (expenses.length > 0) {
          console.log('📉 Sample expenses:', expenses.slice(0, 3).map(e => ({
            id: e.id,
            amount: e.amount,
            date: e.date,
            category_id: e.category_id,
            user_id: e.user_id
          })));
        }

        if (incomes.length > 0) {
          console.log('📈 Sample incomes:', incomes.slice(0, 3).map(i => ({
            id: i.id,
            amount: i.amount,
            date: i.date,
            source_id: i.source_id,
            user_id: i.user_id
          })));
        }

        if (categories.length > 0) {
          console.log('🏷️ Sample categories with allocations:', categories.slice(0, 3).map(c => {
            const categoryAllocations = allocations.filter(a => a.category_id === c.id);
            return {
              id: c.id,
              name: c.name,
              icon: c.icon,
              allocation_amount: c.allocation_amount,
              allocation_percent: c.allocation_percent,
              allocations: categoryAllocations.map(a => ({
                type: a.allocation_type,
                value: a.allocation_value,
                source_id: a.income_source_id
              }))
            };
          }));
        }

        // Calculate totals
        const totalIncome = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
        const totalExpense = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
        const balance = totalIncome - totalExpense;

        console.log('Budget summary:', { totalIncome, totalExpense, balance });

        // Build context for AI
        budgetContext = `

ТЕКУЩИЙ КОНТЕКСТ БЮДЖЕТА ПОЛЬЗОВАТЕЛЯ:

📊 Баланс за последние 12 месяцев:
- Доход: ${totalIncome} ₽
- Расход: ${totalExpense} ₽
- Остаток: ${balance} ₽

💰 Источники дохода (${sources.length}):
${sources.map(s => `- "${s.name}": ${s.amount || 0} ₽`).join('\n') || '(нет источников)'}

🏷️ Категории расходов (${categories.length}):
${categories.map(c => {
  const categoryAllocations = allocations.filter(a => a.category_id === c.id);
  let totalAllocated = 0;
  let allocationDetails: string[] = [];
  
  // Суммируем все выделения для категории
  categoryAllocations.forEach(allocation => {
    const source = sources.find(s => s.id === allocation.income_source_id);
    if (source) {
      if (allocation.allocation_type === 'amount') {
        totalAllocated += Number(allocation.allocation_value);
        allocationDetails.push(`${source.name}: ${allocation.allocation_value} ₽`);
      } else if (allocation.allocation_type === 'percent') {
        const sourceAmount = Number(source.amount) || 0;
        const allocatedAmount = (sourceAmount * Number(allocation.allocation_value)) / 100;
        totalAllocated += allocatedAmount;
        allocationDetails.push(`${source.name}: ${allocation.allocation_value}%`);
      }
    }
  });
  
  // Добавляем старые поля для совместимости
  if (c.allocation_amount) totalAllocated += Number(c.allocation_amount);
  if (c.allocation_percent) {
    const totalIncome = sources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    totalAllocated += (totalIncome * Number(c.allocation_percent)) / 100;
  }
  
  // Рассчитываем потраченную сумму по категории
  const spent = expenses
    .filter(e => e.category_id === c.id)
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const remaining = totalAllocated - spent;
  
  const details = allocationDetails.length > 0 ? ` (${allocationDetails.join(', ')})` : '';
  return `- ${c.icon} "${c.name}": лимит ${totalAllocated.toFixed(2)} ₽${details}, потрачено ${spent.toFixed(2)} ₽, осталось ${remaining.toFixed(2)} ₽`;
}).join('\n') || '(нет категорий)'}

ВАЖНО: 
- "Источники дохода" - это откуда приходят деньги (зарплата, аванс и т.д.)
- "Категории расходов" - это куда тратятся деньги (продукты, транспорт и т.д.)
- Если пользователь спрашивает про "ЗП Гены", "ЗП Котэ" и т.п. - это ИСТОЧНИКИ ДОХОДА, а не категории расходов

📈 Последние доходы (${incomes.length}):
${incomes.slice(0, 5).map(i => `- ${i.amount} ₽ (ID источника: ${i.source_id}) - ${i.description || 'без описания'}`).join('\n') || '(нет доходов)'}

📉 Последние расходы (${expenses.length}):
${expenses.slice(0, 5).map(e => `- ${e.amount} ₽ (ID категории: ${e.category_id}) - ${e.description || 'без описания'}`).join('\n') || '(нет расходов)'}

Используй этот контекст для ответов на вопросы пользователя о его финансах, анализа расходов и доходов, и предоставления рекомендаций.`;
      }
    } catch (contextError) {
      console.error('Failed to load user context:', contextError);
      // Continue without context
    }

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
            content: `Ты - G.A.I.A. (Global Analytical Intelligence for Allocation), интеллектуальный ассистент CrystalBudget. Ты профессиональный финансовый аналитик и помощник по управлению бюджетом. Ты можешь создавать, редактировать и удалять категории, источники дохода, доходы и расходы, а также настраивать проценты и лимиты для категорий. Когда пользователь просит создать, изменить или удалить что-то, используй доступные инструменты. ВАЖНО: ты НЕ можешь изменять настройки профиля пользователя, семьи или личный кабинет. Отвечай кратко и по делу, на русском языке.${budgetContext}`
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

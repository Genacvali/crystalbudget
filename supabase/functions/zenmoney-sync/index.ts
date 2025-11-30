import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZENMONEY_API_URL = 'https://api.zenmoney.ru/v8/diff/'
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

interface ZenMoneyDiffObject {
    currentClientTimestamp?: number
    serverTimestamp: number
    forceFetch?: string[]
    instrument?: any[]
    company?: any[]
    user?: any[]
    account?: any[]
    tag?: any[]
    merchant?: any[]
    transaction?: any[]
    deletion?: any[]
}

interface ZenMoneyTransaction {
    id: string
    changed: number
    user: number
    deleted: boolean
    incomeInstrument: number
    incomeAccount: string
    income: number
    outcomeInstrument: number
    outcomeAccount: string
    outcome: number
    tag?: string[]
    merchant?: string
    payee?: string
    comment?: string
    date: string
}

interface ZenMoneyTag {
    id: string
    changed: number
    user: number
    title: string
    parent?: string
    showIncome: boolean
    showOutcome: boolean
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI function to categorize uncategorized transactions
async function categorizeTransactionWithAI(
    supabase: any,
    userId: string,
    transaction: ZenMoneyTransaction
): Promise<{ type: 'expense' | 'income' | null; categoryId: string | null; sourceId: string | null }> {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
        console.log('OpenAI API key not configured, skipping AI categorization');
        return { type: null, categoryId: null, sourceId: null };
    }

    try {
        // Get user's categories and income sources
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, icon')
            .eq('user_id', userId);

        const { data: incomeSources } = await supabase
            .from('income_sources')
            .select('id, name')
            .eq('user_id', userId);

        if (!categories || categories.length === 0) {
            console.log('No categories found, skipping AI categorization');
            return { type: null, categoryId: null, sourceId: null };
        }

        const categoriesText = categories.map((c: any) => `${c.icon} ${c.name}`).join(', ');
        const sourcesText = incomeSources && incomeSources.length > 0
            ? incomeSources.map((s: any) => s.name).join(', ')
            : '';

        const description = transaction.comment || transaction.payee || transaction.merchant || '';
        const amount = transaction.outcome > 0 ? transaction.outcome : transaction.income;
        const isOutcome = transaction.outcome > 0;
        const isIncome = transaction.income > 0;

        const aiPrompt = `Ты - помощник по категоризации финансовых транзакций.

Транзакция:
- Описание: "${description}"
- Сумма: ${amount} ₽
- Дата: ${transaction.date}
- Исходящая сумма: ${transaction.outcome} ₽
- Входящая сумма: ${transaction.income} ₽

Доступные категории расходов: ${categoriesText}
${sourcesText ? `Доступные источники дохода: ${sourcesText}` : ''}

Определи:
1. Тип транзакции: "expense" (расход) или "income" (доход)
2. Наиболее подходящую категорию/источник из списка

Правила:
- Если есть исходящая сумма (outcome > 0) и нет входящей (income = 0) → это расход
- Если есть входящая сумма (income > 0) и нет исходящей (outcome = 0) → это доход
- Если обе суммы > 0, определи по описанию и большей сумме
- Выбери наиболее подходящую категорию/источник по описанию
- Если не можешь определить категорию, верни null для category/source

Ответь ТОЛЬКО в формате JSON (без markdown):
{
  "type": "expense" или "income",
  "category": "название категории из списка или null",
  "source": "название источника дохода из списка или null"
}`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: 'Ты - эксперт по категоризации финансовых транзакций. Отвечай только в формате JSON.'
                    },
                    {
                        role: 'user',
                        content: aiPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 500,
            }),
        });

        if (!aiResponse.ok) {
            console.error('OpenAI API error:', aiResponse.status);
            return { type: null, categoryId: null, sourceId: null };
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices[0]?.message?.content;
        if (!content) {
            return { type: null, categoryId: null, sourceId: null };
        }

        // Parse JSON response (remove markdown code blocks if present)
        const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(jsonContent);

        let categoryId = null;
        let sourceId = null;

        if (result.type === 'expense' && result.category) {
            // Find category by name
            const category = categories.find((c: any) =>
                c.name.toLowerCase() === result.category.toLowerCase() ||
                c.name.toLowerCase().includes(result.category.toLowerCase()) ||
                result.category.toLowerCase().includes(c.name.toLowerCase())
            );
            if (category) {
                categoryId = category.id;
            }
        } else if (result.type === 'income' && result.source && incomeSources) {
            // Find income source by name
            const source = incomeSources.find((s: any) =>
                s.name.toLowerCase() === result.source.toLowerCase() ||
                s.name.toLowerCase().includes(result.source.toLowerCase()) ||
                result.source.toLowerCase().includes(s.name.toLowerCase())
            );
            if (source) {
                sourceId = source.id;
            }
        }

        console.log(`AI categorization result: type=${result.type}, categoryId=${categoryId}, sourceId=${sourceId}`);

        return {
            type: result.type || null,
            categoryId,
            sourceId
        };
    } catch (error) {
        console.error('AI categorization error:', error);
        return { type: null, categoryId: null, sourceId: null };
    }
}

async function sendUncategorizedTransactionToTelegram(
    supabase: any,
    userId: string,
    expense: any,
    zenmoneyUser?: number
) {
    console.log('🚀 Starting sendUncategorizedTransactionToTelegram for userId:', userId, 'expenseId:', expense.id);

    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
        console.log('❌ No TELEGRAM_BOT_TOKEN, skipping');
        return;
    }

    try {
        // Get family ID safely
        let familyId: string | null = null;

        // Check if user is family owner
        const { data: ownedFamily } = await supabase
            .from('families')
            .select('id')
            .eq('owner_id', userId)
            .maybeSingle();

        if (ownedFamily?.id) {
            familyId = ownedFamily.id;
        } else {
            // Check if user is family member
            const { data: familyMember } = await supabase
                .from('family_members')
                .select('family_id')
                .eq('user_id', userId)
                .maybeSingle();

            if (familyMember?.family_id) {
                familyId = familyMember.family_id;
            }
        }

        // Get family members if in family
        let familyMemberUserIds: string[] = [];
        if (familyId) {
            const { data: familyMembers } = await supabase
                .from('family_members')
                .select('user_id')
                .eq('family_id', familyId);

            familyMemberUserIds = familyMembers?.map((m: any) => m.user_id) || [];
        }

        // Get Telegram users (current user + family)
        const targetUserIds = [userId, ...familyMemberUserIds];
        const { data: telegramUsers } = await supabase
            .from('telegram_users')
            .select('telegram_id')
            .in('user_id', targetUserIds);

        if (!telegramUsers?.length) {
            console.log('⚠️ No Telegram users found, skipping notification');
            return;
        }

        // Get user's categories for buttons
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, icon')
            .eq('user_id', userId)
            .order('name');

        // Get AI recommendation
        let aiRecommendation = null;
        let aiCategoryId = null;
        try {
            // Create mock transaction for AI
            const mockTx = {
                id: expense.zenmoney_id || expense.id,
                payee: expense.description,
                comment: expense.description,
                outcome: Number(expense.amount),
                income: 0,
                date: expense.date,
                tag: [],
                merchant: expense.description,
                user: zenmoneyUser || 0,
                changed: Date.now(),
                deleted: false,
                incomeInstrument: 0,
                incomeAccount: '',
                outcomeInstrument: 0,
                outcomeAccount: ''
            } as any;

            const aiResult = await categorizeTransactionWithAI(supabase, userId, mockTx);
            if (aiResult.categoryId) {
                const category = categories?.find(c => c.id === aiResult.categoryId);
                if (category) {
                    aiRecommendation = `${category.icon} ${category.name}`;
                    aiCategoryId = category.id;
                }
            }
        } catch (error) {
            console.log('AI recommendation failed:', error);
        }

        // HTML escape function
        const escapeHtml = (text: string) => {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // Prepare message
        const zenmoneyUserInfo = zenmoneyUser ? ` (ZenMoney User: ${zenmoneyUser})` : '';
        const message = `🔔 <b>Новая некатегоризированная транзакция</b>${zenmoneyUserInfo}

💰 Сумма: <b>${escapeHtml(String(expense.amount))} ₽</b>
📅 Дата: <b>${escapeHtml(String(expense.date))}</b>
📝 Описание: <b>${escapeHtml(String(expense.description || ''))}</b>
🔗 ID: <code>${escapeHtml(String(expense.id))}</code>

<b>Выберите категорию:</b>`;

        // Create inline keyboard
        const inlineKeyboard: any[] = [];

        // Category buttons (3 per row)
        const categoriesPerRow = 3;
        for (let i = 0; i < (categories?.length || 0); i += categoriesPerRow) {
            const row: any[] = [];
            for (let j = 0; j < categoriesPerRow && i + j < (categories?.length || 0); j++) {
                const cat = categories[i + j];
                row.push({
                    text: `${cat.icon} ${cat.name}`,
                    callback_data: `zen_cat_${expense.id}_${cat.id}`
                });
            }
            if (row.length > 0) {
                inlineKeyboard.push(row);
            }
        }

        // AI recommendation button
        if (aiRecommendation) {
            inlineKeyboard.push([{
                text: `🤖 ИИ рекомендует: ${aiRecommendation}`,
                callback_data: `zen_ai_${expense.id}_${aiCategoryId}`
            }]);
        }

        // Action buttons
        inlineKeyboard.push([
            {
                text: '⏭️ Игнорировать',
                callback_data: `zen_ignore_${expense.id}`
            },
            {
                text: '❌ Закрыть',
                callback_data: `zen_close_${expense.id}`
            }
        ]);

        const replyMarkup = {
            inline_keyboard: inlineKeyboard
        };

        // Send to each Telegram user
        for (const telegramUser of telegramUsers) {
            let chatId: number;
            if (typeof telegramUser.telegram_id === 'string') {
                const parsed = parseInt(telegramUser.telegram_id, 10);
                if (isNaN(parsed)) {
                    console.error(`❌ Invalid telegram_id: ${telegramUser.telegram_id}`);
                    continue;
                }
                chatId = parsed;
            } else {
                chatId = Number(telegramUser.telegram_id);
            }

            try {
                console.log(`📤 Sending inline keyboard message to chat_id: ${chatId}`);

                const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup
                    }),
                });

                const result = await response.json();
                if (response.ok && result.ok) {
                    console.log(`✅ Sent inline keyboard to ${chatId}, message_id: ${result.result.message_id}`);

                    // Save message for callback handling
                    await supabase
                        .from('telegram_messages')
                        .upsert({
                            expense_id: expense.id,
                            telegram_chat_id: chatId,
                            telegram_message_id: result.result.message_id,
                            created_at: new Date().toISOString()
                        }, { onConflict: 'expense_id,telegram_chat_id' });
                } else {
                    console.error(`❌ Failed to send to ${chatId}:`, result);
                }
            } catch (error) {
                console.error(`❌ Error sending to ${chatId}:`, error);
            }
        }

        console.log('✅ Completed Telegram notification with inline keyboard');
    } catch (error) {
        console.error('💥 Error in sendUncategorizedTransactionToTelegram:', error);
    }
}

async function refreshToken(supabase: any, userId: string, refreshToken: string) {
    const tokenParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: Deno.env.get('ZENMONEY_CLIENT_ID')!,
        client_secret: Deno.env.get('ZENMONEY_CLIENT_SECRET')!,
        refresh_token: refreshToken,
    })

    const tokenResponse = await fetch('https://api.zenmoney.ru/oauth2/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
        throw new Error('Failed to refresh token')
    }

    const tokenData = await tokenResponse.json()
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    await supabase
        .from('zenmoney_connections')
        .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: expiresAt,
        })
        .eq('user_id', userId)

    return tokenData.access_token
}

async function syncWithZenMoney(
    supabase: any,
    userId: string,
    accessToken: string,
    serverTimestamp: number,
    syncType: 'all' | 'transactions' = 'all',
    syncDaysLimit: number | null = null
) {
    console.log(`🔄 Starting ZenMoney sync: type=${syncType}, serverTimestamp=${serverTimestamp}, syncDaysLimit=${syncDaysLimit} (${serverTimestamp === 0 ? 'initial sync - will fetch data' : `incremental sync - will fetch only NEW transactions since ${new Date(serverTimestamp * 1000).toISOString()}`})`)
    const currentTimestamp = Math.floor(Date.now() / 1000)

    const requestBody: ZenMoneyDiffObject = {
        currentClientTimestamp: currentTimestamp,
        serverTimestamp: serverTimestamp,
    }

    // Check if we have any accounts for this user
    const { count: accountsCount, error: countError } = await supabase
        .from('zenmoney_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

    const hasAccounts = !countError && accountsCount !== null && accountsCount > 0
    console.log(`Checking existing accounts: ${hasAccounts ? 'Found ' + accountsCount : 'None found'}`)

    // If first sync or syncType is 'all', request all data
    if (serverTimestamp === 0 || syncType === 'all') {
        requestBody.forceFetch = ['instrument', 'account', 'tag', 'transaction']
        console.log('📥 Full sync: requesting ALL data from ZenMoney (forceFetch enabled)')
    } else {
        // If we don't have accounts locally, force fetch them even in incremental sync
        if (!hasAccounts) {
            requestBody.forceFetch = ['account']
            console.log('📥 Missing local accounts: forcing account fetch')
        }

        // For transactions-only sync, don't use forceFetch - ZenMoney will return only new transactions
        // based on serverTimestamp
        console.log(`📥 Incremental sync: requesting only NEW transactions since timestamp ${serverTimestamp} (forceFetch disabled)`)
    }

    const response = await fetch(ZENMONEY_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ZenMoney API error: ${response.status} ${errorText}`)
    }

    const data: ZenMoneyDiffObject = await response.json()

    console.log(`📊 ZenMoney API response: Accounts: ${data.account?.length || 0}, Tags: ${data.tag?.length || 0}, Transactions: ${data.transaction?.length || 0} (${syncType === 'transactions' && serverTimestamp > 0 ? 'only NEW transactions' : 'all data'})`)

    // Process accounts (always process if present, as balance changes frequently)
    if (data.account && data.account.length > 0) {
        console.log(`Processing ${data.account.length} accounts`)
        for (const account of data.account) {
            const { error: upsertError } = await supabase
                .from('zenmoney_accounts')
                .upsert({
                    user_id: userId,
                    zenmoney_account_id: account.id,
                    account_type: account.type,
                    title: account.title,
                    instrument_id: account.instrument,
                    balance: account.balance,
                    startBalance: account.startBalance,
                    creditLimit: account.creditLimit,
                    archive: account.archive,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id, zenmoney_account_id'
                })

            if (upsertError) {
                console.error(`❌ Error saving account ${account.title}:`, upsertError)
            }
        }
    }

    // Process tags (categories and income sources) - skip if only syncing transactions
    if (syncType === 'all' && data.tag && data.tag.length > 0) {
        console.log(`Processing ${data.tag.length} tags`)
        for (const tag of data.tag as ZenMoneyTag[]) {
            // Determine if tag is for expense (category) or income (source)
            // In ZenMoney, a tag can be both, but usually users separate them
            // We'll treat showIncome=true as potential Income Source and showOutcome=true as potential Expense Category

            // 1. Handle Expense Categories (showOutcome=true or both false/undefined)
            if (tag.showOutcome !== false) {
                // Check if category already exists by zenmoney_id
                const { data: existingCategory } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tag.id)
                    .maybeSingle()

                if (!existingCategory) {
                    // Check if category exists by name (to avoid duplicates)
                    const { data: categoryByName } = await supabase
                        .from('categories')
                        .select('id')
                        .eq('user_id', userId)
                        .ilike('name', tag.title) // Case insensitive match
                        .is('zenmoney_id', null) // Only if not already linked
                        .maybeSingle()

                    if (categoryByName) {
                        // Link existing category
                        await supabase
                            .from('categories')
                            .update({ zenmoney_id: tag.id })
                            .eq('id', categoryByName.id)
                    } else {
                        // Create new category
                        const categoryData: any = {
                            user_id: userId,
                            name: tag.title,
                            zenmoney_id: tag.id,
                            icon: '📦', // Default icon
                        }

                        // Set parent if exists
                        if (tag.parent) {
                            const { data: parentCategory } = await supabase
                                .from('categories')
                                .select('id')
                                .eq('user_id', userId)
                                .eq('zenmoney_id', tag.parent)
                                .maybeSingle()

                            if (parentCategory) {
                                categoryData.parent_id = parentCategory.id
                            }
                        }

                        await supabase
                            .from('categories')
                            .insert(categoryData)
                    }
                }
            }

            // 2. Handle Income Sources (showIncome=true)
            if (tag.showIncome) {
                // Check if income source already exists by zenmoney_id
                const { data: existingSource } = await supabase
                    .from('income_sources')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tag.id)
                    .maybeSingle()

                if (!existingSource) {
                    // Check if source exists by name
                    const { data: sourceByName } = await supabase
                        .from('income_sources')
                        .select('id')
                        .eq('user_id', userId)
                        .ilike('name', tag.title)
                        .is('zenmoney_id', null)
                        .maybeSingle()

                    if (sourceByName) {
                        // Link existing source
                        await supabase
                            .from('income_sources')
                            .update({ zenmoney_id: tag.id })
                            .eq('id', sourceByName.id)
                    } else {
                        // Create new income source
                        await supabase
                            .from('income_sources')
                            .insert({
                                user_id: userId,
                                name: tag.title,
                                zenmoney_id: tag.id,
                                icon: '💰', // Default icon
                                currency: 'RUB' // Default currency
                            })
                    }
                }
            }
        }
    }

    // Process transactions (always process, regardless of syncType)
    if (data.transaction && data.transaction.length > 0) {
        console.log(`💳 Processing ${data.transaction.length} transactions from ZenMoney`)

        // Filter transactions by date if syncDaysLimit is specified
        let transactionsToProcess = data.transaction as ZenMoneyTransaction[];
        if (syncDaysLimit && syncDaysLimit > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - syncDaysLimit);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

            const originalCount = transactionsToProcess.length;
            transactionsToProcess = transactionsToProcess.filter(tx => tx.date >= cutoffDateStr);

            const filtered = originalCount - transactionsToProcess.length;
            if (filtered > 0) {
                console.log(`📅 Filtered out ${filtered} transactions older than ${syncDaysLimit} days (before ${cutoffDateStr})`);
            }
            console.log(`📥 Will process ${transactionsToProcess.length} transactions within the last ${syncDaysLimit} days`);
        }

        // Statistics counters
        let expensesCreated = 0
        let expensesSkipped = 0
        let expensesUpdated = 0
        let incomesCreated = 0
        let incomesSkipped = 0
        let incomesUpdated = 0
        let transfersSkipped = 0

        for (const tx of transactionsToProcess) {
            if (tx.deleted) {
                // Delete transaction
                await supabase
                    .from('incomes')
                    .delete()
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tx.id)

                await supabase
                    .from('expenses')
                    .delete()
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tx.id)

                continue
            }

            // Determine transaction type
            // In ZenMoney: outcome > 0 means expense, income > 0 means income
            // If both > 0, it's usually a transfer between accounts, but could be a real expense/income
            // We'll treat it as transfer only if it's between accounts of the same user AND has no tags
            const isExpense = tx.outcome > 0 && tx.income === 0
            const isIncome = tx.income > 0 && tx.outcome === 0
            const isTransfer = tx.outcome > 0 && tx.income > 0

            // Skip transfers between accounts only if:
            // 1. Both income and outcome > 0
            // 2. No tags (category) assigned
            // 3. Same account or same user (to avoid skipping real transactions)
            // If transaction has tags, treat it as expense/income even if both > 0
            if (isTransfer && (!tx.tag || tx.tag.length === 0)) {
                // Check if it's between different accounts (likely a transfer)
                // If accounts are different, it's likely a transfer - skip it
                // But if it has a tag, it's a categorized transaction - process it
                if (tx.incomeAccount !== tx.outcomeAccount) {
                    transfersSkipped++
                    continue // Skip transfers between different accounts
                }
                // If same account with both income/outcome and no tag, skip (internal transfer)
                transfersSkipped++
                continue
            }

            // If transfer but has tags, treat as expense (outcome) or income based on which is larger
            // This handles cases where user manually categorized a transfer-like transaction

            // Handle expenses (including transfers with tags - treat as expenses)
            if (isExpense || (isTransfer && tx.tag && tx.tag.length > 0 && tx.outcome > tx.income)) {
                // Check if expense already exists (check by zenmoney_id to avoid duplicates)
                const { data: existingExpense } = await supabase
                    .from('expenses')
                    .select('id, category_id')
                    .eq('zenmoney_id', tx.id)
                    .maybeSingle()

                if (existingExpense) {
                    // If exists but has no category, try to categorize it with AI
                    if (!existingExpense.category_id) {
                        console.log(`Existing expense ${existingExpense.id} has no category, trying AI categorization...`);
                        const aiResult = await categorizeTransactionWithAI(supabase, userId, tx);
                        if (aiResult.type === 'expense' && aiResult.categoryId) {
                            await supabase
                                .from('expenses')
                                .update({ category_id: aiResult.categoryId })
                                .eq('id', existingExpense.id);
                            console.log(`Updated expense ${existingExpense.id} with AI category: ${aiResult.categoryId}`);
                            expensesUpdated++
                        } else {
                            expensesSkipped++
                        }
                    } else {
                        expensesSkipped++
                    }
                    continue // Skip if already exists
                }

                // Find category
                let categoryId = null
                if (tx.tag && tx.tag.length > 0) {
                    const { data: category } = await supabase
                        .from('categories')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('zenmoney_id', tx.tag[0])
                        .maybeSingle()

                    if (category) {
                        categoryId = category.id
                    }
                }

                // If no category, try AI categorization
                if (!categoryId) {
                    console.log(`No category found for transaction ${tx.id}, trying AI categorization...`);
                    const aiResult = await categorizeTransactionWithAI(supabase, userId, tx);
                    if (aiResult.type === 'expense' && aiResult.categoryId) {
                        categoryId = aiResult.categoryId;
                        console.log(`AI categorized as expense with category: ${categoryId}`);
                    }
                }

                // Calculate expense amount
                // For transfers with tags, use net amount (outcome - income) or just outcome
                const expenseAmount = isTransfer ? Math.abs(tx.outcome - tx.income) : Math.abs(tx.outcome)

                // Use absolute value for expense amount (outcome is already positive in ZenMoney)
                const { data: insertedExpense } = await supabase
                    .from('expenses')
                    .insert({
                        user_id: userId,
                        category_id: categoryId,
                        amount: expenseAmount,
                        date: tx.date,
                        description: tx.comment || tx.payee || `Транзакция от пользователя ZenMoney (ID: ${tx.user})`,
                        zenmoney_id: tx.id,
                        currency: 'RUB', // Default to RUB, should map from instrument
                    })
                    .select()
                    .single()

                if (insertedExpense) {
                    expensesCreated++
                    // If still no category after AI, send to Telegram for manual categorization (fallback)
                    if (!categoryId && TELEGRAM_BOT_TOKEN) {
                        console.log(`AI failed to categorize, sending to Telegram for manual categorization`);
                        await sendUncategorizedTransactionToTelegram(supabase, userId, insertedExpense, tx.user)
                    }
                }
            }

            // Handle incomes (including transfers with tags - treat as incomes)
            if (isIncome || (isTransfer && tx.tag && tx.tag.length > 0 && tx.income > tx.outcome)) {
                // Check if income already exists (check by zenmoney_id to avoid duplicates)
                const { data: existingIncome } = await supabase
                    .from('incomes')
                    .select('id, source_id')
                    .eq('zenmoney_id', tx.id)
                    .maybeSingle()

                if (existingIncome) {
                    // If exists but has no source, try to categorize it with AI
                    if (!existingIncome.source_id) {
                        console.log(`Existing income ${existingIncome.id} has no source, trying AI categorization...`);
                        const aiResult = await categorizeTransactionWithAI(supabase, userId, tx);
                        if (aiResult.type === 'income' && aiResult.sourceId) {
                            await supabase
                                .from('incomes')
                                .update({ source_id: aiResult.sourceId })
                                .eq('id', existingIncome.id);
                            console.log(`Updated income ${existingIncome.id} with AI source: ${aiResult.sourceId}`);
                            incomesUpdated++
                        } else {
                            incomesSkipped++
                        }
                    } else {
                        incomesSkipped++
                    }
                    continue // Skip if already exists
                }

                // Find income source (from tag)
                let sourceId = null
                if (tx.tag && tx.tag.length > 0) {
                    const { data: source } = await supabase
                        .from('income_sources')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('zenmoney_id', tx.tag[0])
                        .maybeSingle()

                    if (source) {
                        sourceId = source.id
                    }
                }

                // If no source, try AI categorization
                if (!sourceId) {
                    console.log(`No source found for transaction ${tx.id}, trying AI categorization...`);
                    const aiResult = await categorizeTransactionWithAI(supabase, userId, tx);
                    if (aiResult.type === 'income' && aiResult.sourceId) {
                        sourceId = aiResult.sourceId;
                        console.log(`AI categorized as income with source: ${sourceId}`);
                    }
                }

                // Calculate income amount
                // For transfers with tags, use net amount (income - outcome) or just income
                const incomeAmount = isTransfer ? Math.abs(tx.income - tx.outcome) : Math.abs(tx.income)

                // Create income
                const { data: insertedIncome } = await supabase
                    .from('incomes')
                    .insert({
                        user_id: userId,
                        source_id: sourceId, // Map from ZenMoney tag if possible, or from AI
                        amount: incomeAmount,
                        date: tx.date,
                        description: tx.comment || tx.payee || `Транзакция от пользователя ZenMoney (ID: ${tx.user})`,
                        zenmoney_id: tx.id,
                    })
                    .select()
                    .single()

                if (insertedIncome) {
                    incomesCreated++
                }
            }
        }

        // Log statistics
        console.log(`📊 Transaction processing statistics:`)
        console.log(`   ✅ Expenses: ${expensesCreated} created, ${expensesUpdated} updated, ${expensesSkipped} skipped (duplicates)`)
        console.log(`   ✅ Incomes: ${incomesCreated} created, ${incomesUpdated} updated, ${incomesSkipped} skipped (duplicates)`)
        console.log(`   ⏭️  Transfers: ${transfersSkipped} skipped`)
        console.log(`   📈 Total processed: ${expensesCreated + expensesUpdated + incomesCreated + incomesUpdated} new/updated, ${expensesSkipped + incomesSkipped + transfersSkipped} skipped`)
    }

    // Update sync state with new serverTimestamp for next incremental sync
    await supabase
        .from('zenmoney_sync_state')
        .update({
            server_timestamp: data.serverTimestamp,
            last_sync_at: new Date().toISOString(),
            sync_status: 'success',
            sync_error: null,
        })
        .eq('user_id', userId)

    console.log(`✅ Sync completed! Updated serverTimestamp to ${data.serverTimestamp} (${new Date(data.serverTimestamp * 1000).toISOString()}) for next incremental sync`)

    return {
        serverTimestamp: data.serverTimestamp,
        accountsCount: data.account?.length || 0,
        tagsCount: data.tag?.length || 0,
        transactionsCount: data.transaction?.length || 0,
        accounts: data.account || [] // Return accounts to frontend
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data: { user }, error: userError } = await supabase.auth.getUser(token)
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get ZenMoney connection
        const { data: connection, error: connError } = await supabase
            .from('zenmoney_connections')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (connError || !connection) {
            return new Response(
                JSON.stringify({ error: 'ZenMoney not connected' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if token expired
        let accessToken = connection.access_token
        if (new Date(connection.expires_at) < new Date()) {
            console.log('Token expired, refreshing...')
            accessToken = await refreshToken(supabase, user.id, connection.refresh_token)
        }

        // Get sync state
        const { data: syncState } = await supabase
            .from('zenmoney_sync_state')
            .select('*')
            .eq('user_id', user.id)
            .single()

        const serverTimestamp = syncState?.server_timestamp || 0

        // Get sync type from request body (default to 'all')
        let syncType: 'all' | 'transactions' = 'all'
        try {
            const requestBody = await req.json()
            syncType = requestBody.syncType === 'transactions' ? 'transactions' : 'all'
            console.log('Received syncType from request:', syncType)
        } catch (e) {
            // If no body or invalid JSON, use default 'all'
            console.log('No body in request, using default syncType: all')
        }

        // Update status to syncing
        await supabase
            .from('zenmoney_sync_state')
            .update({ sync_status: 'syncing' })
            .eq('user_id', user.id)

        // Perform sync with sync_days_limit from connection
        const result = await syncWithZenMoney(
            supabase,
            user.id,
            accessToken,
            serverTimestamp,
            syncType,
            connection.sync_days_limit || null
        )

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Sync completed successfully',
                ...result
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Sync error:', error)

        // Try to update sync state with error
        try {
            const authHeader = req.headers.get('Authorization')
            const token = authHeader?.replace('Bearer ', '')
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey) // Create admin client for error logging
            const supabase = createClient(
                supabaseUrl,
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader! } } }
            )
            const { data: { user } } = await supabase.auth.getUser(token!)

            if (user) {
                await supabase
                    .from('zenmoney_sync_state')
                    .update({
                        sync_status: 'error',
                        sync_error: error.message,
                    })
                    .eq('user_id', user.id)
            }
        } catch (e) {
            console.error('Failed to update sync state:', e)
        }

        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

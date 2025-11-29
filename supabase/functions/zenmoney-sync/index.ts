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

async function sendUncategorizedTransactionToTelegram(
    supabase: any,
    userId: string,
    expense: any
) {
    try {
        // Get user's Telegram ID
        const { data: telegramUser } = await supabase
            .from('telegram_users')
            .select('telegram_id')
            .eq('user_id', userId)
            .single()

        if (!telegramUser?.telegram_id || !TELEGRAM_BOT_TOKEN) {
            console.log('User has no Telegram connection or bot token not configured, skipping notification')
            return
        }

        // Get user's categories
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, icon')
            .eq('user_id', userId)
            .order('name')

        if (!categories || categories.length === 0) {
            console.log('User has no categories, skipping notification')
            return
        }

        // Format amount
        const amount = expense.amount.toLocaleString('ru-RU')
        const date = new Date(expense.date).toLocaleDateString('ru-RU')
        const description = expense.description || 'Без описания'

        // Create inline keyboard with categories (limit to 20 categories to avoid Telegram limits)
        const categoriesToShow = categories.slice(0, 20)
        const keyboard = {
            inline_keyboard: [
                ...categoriesToShow.map(cat => [{
                    text: `${cat.icon} ${cat.name}`,
                    callback_data: `zm_cat_${expense.id}_${cat.id}`
                }]),
                [{
                    text: '⏭️ Пропустить',
                    callback_data: `zm_skip_${expense.id}`
                }]
            ]
        }

        // Send message to Telegram
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: telegramUser.telegram_id,
                text: `📥 <b>Новая транзакция из ZenMoney</b>\n\n` +
                      `💰 Сумма: <b>${amount} ₽</b>\n` +
                      `📅 Дата: ${date}\n` +
                      `📝 Описание: ${description}\n\n` +
                      `❓ <b>Выберите категорию:</b>`,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })
        })

        const result = await response.json()
        if (!result.ok) {
            console.error('Failed to send Telegram message:', result)
        }
    } catch (error) {
        console.error('Error sending uncategorized transaction to Telegram:', error)
        // Don't throw - this is non-critical
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
    serverTimestamp: number
) {
    const currentTimestamp = Math.floor(Date.now() / 1000)

    const requestBody: ZenMoneyDiffObject = {
        currentClientTimestamp: currentTimestamp,
        serverTimestamp: serverTimestamp,
    }

    // If first sync, request all data
    if (serverTimestamp === 0) {
        requestBody.forceFetch = ['instrument', 'account', 'tag', 'transaction']
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

    // Process accounts
    if (data.account && data.account.length > 0) {
        for (const account of data.account) {
            await supabase
                .from('zenmoney_accounts')
                .upsert({
                    user_id: userId,
                    zenmoney_account_id: account.id,
                    account_type: account.type,
                    title: account.title,
                    instrument_id: account.instrument,
                    balance: account.balance,
                })
        }
    }

    // Process tags (categories)
    if (data.tag && data.tag.length > 0) {
        for (const tag of data.tag as ZenMoneyTag[]) {
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
    }

    // Process transactions
    if (data.transaction && data.transaction.length > 0) {
        for (const tx of data.transaction as ZenMoneyTransaction[]) {
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
            // If both > 0, it's a transfer between accounts (skip it)
            const isExpense = tx.outcome > 0 && tx.income === 0
            const isIncome = tx.income > 0 && tx.outcome === 0
            const isTransfer = tx.outcome > 0 && tx.income > 0

            // Skip transfers between accounts
            if (isTransfer) {
                continue
            }

            if (isExpense) {
                // Check if expense already exists
                const { data: existingExpense } = await supabase
                    .from('expenses')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tx.id)
                    .single()

                if (existingExpense) {
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
                        .single()

                    if (category) {
                        categoryId = category.id
                    }
                }

                // Use absolute value for expense amount (outcome is already positive in ZenMoney)
                const { data: insertedExpense } = await supabase
                    .from('expenses')
                    .insert({
                        user_id: userId,
                        category_id: categoryId,
                        amount: Math.abs(tx.outcome), // Ensure positive value
                        date: tx.date,
                        description: tx.comment || tx.payee || '',
                        zenmoney_id: tx.id,
                        currency: 'RUB', // Default to RUB, should map from instrument
                    })
                    .select()
                    .single()

                // If no category, send to Telegram for manual categorization
                if (!categoryId && insertedExpense && TELEGRAM_BOT_TOKEN) {
                    await sendUncategorizedTransactionToTelegram(supabase, userId, insertedExpense)
                }
            }

            if (isIncome) {
                // Check if income already exists
                const { data: existingIncome } = await supabase
                    .from('incomes')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('zenmoney_id', tx.id)
                    .single()

                if (existingIncome) {
                    continue // Skip if already exists
                }

                // Create income
                await supabase
                    .from('incomes')
                    .insert({
                        user_id: userId,
                        source_id: null, // Could map from account later
                        amount: Math.abs(tx.income), // Ensure positive value
                        date: tx.date,
                        description: tx.comment || tx.payee || '',
                        zenmoney_id: tx.id,
                    })
            }
        }
    }

    // Update sync state
    await supabase
        .from('zenmoney_sync_state')
        .update({
            server_timestamp: data.serverTimestamp,
            last_sync_at: new Date().toISOString(),
            sync_status: 'success',
            sync_error: null,
        })
        .eq('user_id', userId)

    return {
        serverTimestamp: data.serverTimestamp,
        accountsCount: data.account?.length || 0,
        tagsCount: data.tag?.length || 0,
        transactionsCount: data.transaction?.length || 0,
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

        // Update status to syncing
        await supabase
            .from('zenmoney_sync_state')
            .update({ sync_status: 'syncing' })
            .eq('user_id', user.id)

        // Perform sync
        const result = await syncWithZenMoney(supabase, user.id, accessToken, serverTimestamp)

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
            const supabase = createClient(supabaseUrl, supabaseServiceKey)
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

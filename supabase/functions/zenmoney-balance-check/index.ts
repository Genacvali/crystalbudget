import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BalanceReport {
    account_id: string
    account_title: string
    zenmoney_balance: number
    calculated_balance: number
    difference: number
    status: 'ok' | 'warning' | 'error'
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
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

        // Get all ZenMoney accounts for this user
        const { data: accounts, error: accountsError } = await supabase
            .from('zenmoney_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('archive', false)

        if (accountsError) {
            throw new Error(`Failed to fetch accounts: ${accountsError.message}`)
        }

        if (!accounts || accounts.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No ZenMoney accounts found',
                    accounts: []
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const balanceReports: BalanceReport[] = []

        for (const account of accounts) {
            // For now, we calculate balance as: start_balance + sum(incomes) - sum(expenses)
            // In future, we should track which transactions belong to which account

            // Simplified calculation - in reality we need to track account_id in transactions
            const zenmoneyBalance = parseFloat(account.balance || '0')
            const startBalance = parseFloat(account.startBalance || '0')

            // TODO: Calculate actual balance from transactions
            // For now, we'll just use the start balance as calculated
            const calculatedBalance = startBalance

            const difference = zenmoneyBalance - calculatedBalance
            const diffPercent = zenmoneyBalance !== 0 ? Math.abs(difference / zenmoneyBalance) * 100 : 0

            let status: 'ok' | 'warning' | 'error' = 'ok'
            if (diffPercent > 10) {
                status = 'error'
            } else if (diffPercent > 1) {
                status = 'warning'
            }

            balanceReports.push({
                account_id: account.id,
                account_title: account.title,
                zenmoney_balance: zenmoneyBalance,
                calculated_balance: calculatedBalance,
                difference: difference,
                status: status
            })

            // Update the account with calculated values
            await supabase
                .from('zenmoney_accounts')
                .update({
                    calculated_balance: calculatedBalance,
                    balance_diff: difference,
                    last_balance_check_at: new Date().toISOString()
                })
                .eq('id', account.id)
        }

        const hasErrors = balanceReports.some(r => r.status === 'error')
        const hasWarnings = balanceReports.some(r => r.status === 'warning')

        return new Response(
            JSON.stringify({
                success: true,
                summary: {
                    total_accounts: balanceReports.length,
                    ok: balanceReports.filter(r => r.status === 'ok').length,
                    warnings: balanceReports.filter(r => r.status === 'warning').length,
                    errors: balanceReports.filter(r => r.status === 'error').length,
                },
                accounts: balanceReports,
                message: hasErrors
                    ? 'Some accounts have significant balance discrepancies'
                    : hasWarnings
                        ? 'Some accounts have minor balance discrepancies'
                        : 'All account balances match'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Balance check error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZENMONEY_CLIENT_ID = Deno.env.get('ZENMONEY_CLIENT_ID') || 'fEr0lhR7jo0dAD7MI4OkKuHjS16pUo'
const ZENMONEY_CLIENT_SECRET = Deno.env.get('ZENMONEY_CLIENT_SECRET') || 'd3sHVJmBAm'
const ZENMONEY_REDIRECT_URI = Deno.env.get('ZENMONEY_REDIRECT_URI') || 'https://crystalbudget.net/'

const ZENMONEY_TOKEN_URL = 'https://api.zenmoney.ru/oauth2/token/'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Проверка авторизации пользователя (по токену сессии)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing authorization header');
        }
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabase.auth.getUser(token)
        if (userError || !user) {
            throw new Error('Invalid session');
        }

        const body = await req.json()
        const { code, userId, access_token, refresh_token, expires_in, redirectUri } = body
        
        let finalAccessToken = access_token
        let finalRefreshToken = refresh_token
        let finalExpiresIn = expires_in

        // Сценарий 1: Обмен кода на токен (OAuth Callback)
        if (code) {
            console.log('Exchanging code for token...');
            const tokenParams = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: ZENMONEY_CLIENT_ID,
                client_secret: ZENMONEY_CLIENT_SECRET,
                code: code,
                redirect_uri: redirectUri || ZENMONEY_REDIRECT_URI,
            })

            const tokenResponse = await fetch(ZENMONEY_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenParams.toString(),
            })

            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.json()
                console.error('ZenMoney token exchange error:', errorData)
                return new Response(JSON.stringify(errorData), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            const tokenData = await tokenResponse.json()
            finalAccessToken = tokenData.access_token
            finalRefreshToken = tokenData.refresh_token
            finalExpiresIn = tokenData.expires_in
        }

        if (!finalAccessToken) {
            throw new Error('No access token obtained');
        }

        // Вычисляем дату истечения
        const expiresAt = finalExpiresIn
            ? new Date(Date.now() + finalExpiresIn * 1000).toISOString()
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

        // Сохраняем в базу
        const { error: dbError } = await supabase
            .from('zenmoney_connections')
            .upsert({
                user_id: user.id,
                access_token: finalAccessToken,
                refresh_token: finalRefreshToken || '',
                token_type: 'bearer',
                expires_at: expiresAt,
            })

        if (dbError) throw dbError

        // Инициализируем состояние синхронизации
        await supabase
            .from('zenmoney_sync_state')
            .upsert({
                user_id: user.id,
                server_timestamp: 0,
                sync_status: 'idle',
            })

        return new Response(
            JSON.stringify({ success: true, message: 'ZenMoney connected successfully' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('ZenMoney Auth Error:', error.message)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

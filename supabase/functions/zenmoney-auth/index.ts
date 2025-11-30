import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZENMONEY_CLIENT_ID = Deno.env.get('ZENMONEY_CLIENT_ID')
const ZENMONEY_CLIENT_SECRET = Deno.env.get('ZENMONEY_CLIENT_SECRET')
const ZENMONEY_REDIRECT_URI = Deno.env.get('ZENMONEY_REDIRECT_URI')

const ZENMONEY_AUTH_URL = 'https://api.zenmoney.ru/oauth2/authorize/'
const ZENMONEY_TOKEN_URL = 'https://api.zenmoney.ru/oauth2/token/'

interface OAuthTokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Handle POST request for manual token saving
        if (req.method === 'POST') {
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
                    JSON.stringify({ error: 'Invalid session token' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const body = await req.json()
            const { access_token, refresh_token, expires_in, sync_days_limit } = body

            if (!access_token) {
                return new Response(
                    JSON.stringify({ error: 'Missing access_token' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Verify token with ZenMoney API
            const testResponse = await fetch('https://api.zenmoney.ru/v8/diff/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentClientTimestamp: Math.floor(Date.now() / 1000),
                    serverTimestamp: 0,
                    forceFetch: [], // Empty fetch just to check auth
                }),
            })

            if (!testResponse.ok) {
                return new Response(
                    JSON.stringify({ error: 'Invalid ZenMoney token' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Calculate expiration
            // If expires_in is not provided, assume a long time or handle refresh manually later
            const expiresAt = expires_in
                ? new Date(Date.now() + expires_in * 1000).toISOString()
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // Default 1 year if unknown

            // Save to DB
            const { error: dbError } = await supabase
                .from('zenmoney_connections')
                .upsert({
                    user_id: user.id,
                    access_token: access_token,
                    refresh_token: refresh_token || '', // Optional
                    token_type: 'bearer',
                    expires_at: expiresAt,
                    sync_days_limit: sync_days_limit ?? null, // Save sync period
                })

            if (dbError) {
                return new Response(
                    JSON.stringify({ error: 'Database error', details: dbError.message }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Initialize sync state
            await supabase
                .from('zenmoney_sync_state')
                .upsert({
                    user_id: user.id,
                    server_timestamp: 0,
                    sync_status: 'idle',
                })

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const url = new URL(req.url)
        const code = url.searchParams.get('code')
        const userId = url.searchParams.get('state') // We'll pass user_id as state

        // Step 1: If no code, redirect to ZenMoney OAuth
        if (!code) {
            if (!ZENMONEY_CLIENT_ID || !ZENMONEY_REDIRECT_URI) {
                return new Response(
                    JSON.stringify({ error: 'ZenMoney OAuth not configured' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Get user_id from request (should be sent in the request)
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

            const authUrl = new URL(ZENMONEY_AUTH_URL)
            authUrl.searchParams.set('response_type', 'code')
            authUrl.searchParams.set('client_id', ZENMONEY_CLIENT_ID)
            authUrl.searchParams.set('redirect_uri', ZENMONEY_REDIRECT_URI)
            authUrl.searchParams.set('state', user.id) // Pass user_id as state

            return new Response(
                JSON.stringify({ authUrl: authUrl.toString() }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Step 2: Exchange code for tokens
        if (!userId) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id in state parameter' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!ZENMONEY_CLIENT_ID || !ZENMONEY_CLIENT_SECRET || !ZENMONEY_REDIRECT_URI) {
            return new Response(
                JSON.stringify({ error: 'ZenMoney OAuth not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: ZENMONEY_CLIENT_ID,
            client_secret: ZENMONEY_CLIENT_SECRET,
            code: code,
            redirect_uri: ZENMONEY_REDIRECT_URI,
        })

        const tokenResponse = await fetch(ZENMONEY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenParams.toString(),
        })

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('ZenMoney token error:', errorText)
            return new Response(
                JSON.stringify({ error: 'Failed to get access token', details: errorText }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const tokenData: OAuthTokenResponse = await tokenResponse.json()

        // Calculate token expiration time
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

        // Store tokens in database
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { error: dbError } = await supabase
            .from('zenmoney_connections')
            .upsert({
                user_id: userId,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                token_type: tokenData.token_type,
                expires_at: expiresAt,
            })

        if (dbError) {
            console.error('Database error:', dbError)
            return new Response(
                JSON.stringify({ error: 'Failed to save connection', details: dbError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize sync state
        await supabase
            .from('zenmoney_sync_state')
            .upsert({
                user_id: userId,
                server_timestamp: 0,
                sync_status: 'idle',
            })

        return new Response(
            JSON.stringify({
                success: true,
                message: 'ZenMoney connected successfully',
                expiresAt
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

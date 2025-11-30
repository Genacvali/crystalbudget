import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Reset ZenMoney sync state for this user
    const { data: syncState, error: resetError } = await supabase
      .from('zenmoney_sync_state')
      .upsert({
        user_id: user.id,
        server_timestamp: 0, // Reset to 0 for initial sync (only new transactions)
        last_sync_at: new Date().toISOString(),
        sync_status: 'idle',
        sync_error: null,
      }, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (resetError) {
      console.error('Error resetting sync state:', resetError)
      return new Response(
        JSON.stringify({ error: 'Failed to reset sync state', details: resetError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ ZenMoney sync reset for user ${user.id}. Next sync will load only NEW transactions (server_timestamp=0)`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'ZenMoney sync state has been reset. Next sync will load only new transactions from now on.',
        resetAt: new Date().toISOString(),
        serverTimestamp: syncState.server_timestamp,
        lastSyncAt: syncState.last_sync_at,
        syncType: 'initial_new_only',
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error in zenmoney-reset-sync:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

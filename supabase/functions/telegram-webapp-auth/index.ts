import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Verify Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
async function verifyTelegramWebAppData(initData: string): Promise<{ valid: boolean; user?: any }> {
  try {
    // Parse initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      console.error('No hash in initData');
      return { valid: false };
    }

    // Remove hash from params for verification
    params.delete('hash');
    
    // Sort params alphabetically and create data-check-string
    const dataCheckArr: string[] = [];
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');
    
    console.log('Data check string:', dataCheckString);
    
    // Create secret key from bot token using HMAC-SHA-256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const secretKey = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(TELEGRAM_BOT_TOKEN)
    );
    
    // Import secret key for data verification
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      secretKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    // Calculate HMAC
    const signature = await crypto.subtle.sign(
      'HMAC',
      verifyKey,
      encoder.encode(dataCheckString)
    );
    
    const calculatedHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('Calculated hash:', calculatedHash);
    console.log('Received hash:', hash);
    
    if (calculatedHash !== hash) {
      console.error('Hash mismatch');
      return { valid: false };
    }
    
    // Parse user data
    const userParam = params.get('user');
    if (!userParam) {
      console.error('No user data in initData');
      return { valid: false };
    }
    
    const user = JSON.parse(userParam);
    console.log('Verified user:', user);
    
    return { valid: true, user };
    
  } catch (error) {
    console.error('Error verifying Telegram WebApp data:', error);
    return { valid: false };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json() as { initData: string };

    if (!initData) {
      return new Response(
        JSON.stringify({ error: 'Missing initData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify initData
    const { valid, user: telegramUser } = await verifyTelegramWebAppData(initData);
    
    if (!valid || !telegramUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid Telegram data' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Telegram user verified:', telegramUser.id);

    // Find user by telegram_id
    const { data: existingTelegramUser, error: fetchError } = await supabase
      .from('telegram_users')
      .select('user_id')
      .eq('telegram_id', telegramUser.id.toString())
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching telegram user:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId: string;

    if (existingTelegramUser) {
      // User already exists
      userId = existingTelegramUser.user_id;
      console.log('Existing user found:', userId);
    } else {
      // Create new user
      const fullName = `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`;
      const tempEmail = `telegram_${telegramUser.id}@crystalbudget.temp`;
      const tempPassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: tempEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          telegram_only: true
        }
      });

      if (authError || !authData.user) {
        console.error('Error creating auth user:', authError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;

      // Link Telegram account
      const { error: telegramError } = await supabase
        .from('telegram_users')
        .insert({
          user_id: userId,
          telegram_id: telegramUser.id.toString(),
          telegram_username: telegramUser.username,
          telegram_first_name: telegramUser.first_name,
          telegram_last_name: telegramUser.last_name
        });

      if (telegramError) {
        console.error('Error linking telegram:', telegramError);
        await supabase.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: 'Failed to link Telegram account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create default user preferences
      await supabase.from('user_preferences').insert({
        user_id: userId,
        currency: 'RUB',
        reminder_enabled: false,
        reminder_time: '21:00'
      });

      console.log('New user created:', userId);
    }

    // Get user's email for generating auth link
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !userData) {
      console.error('Error fetching user:', userError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate magic link for authentication
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email!,
      options: {
        // IMPORTANT: must match the actual origin used in Telegram WebApp (window.location.origin)
        redirectTo: 'https://www.crystalbudget.net/'
      }
    });

    if (linkError || !linkData) {
      console.error('Error generating magic link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate login link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generated magic link for user:', userId);

    return new Response(
      JSON.stringify({ 
        magic_link: linkData.properties.action_link
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in telegram-webapp-auth:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


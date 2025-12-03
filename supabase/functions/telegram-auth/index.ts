import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Verify Telegram authentication data
async function verifyTelegramAuth(telegramUser: TelegramUser): Promise<boolean> {
  const { hash, ...data } = telegramUser;

  // Create data-check-string
  const dataCheckArr = Object.keys(data)
    .filter(key => data[key as keyof typeof data] !== undefined)
    .sort()
    .map(key => `${key}=${data[key as keyof typeof data]}`)
    .join('\n');

  console.log('Data check string:', dataCheckArr);

  try {
    // Create secret key from bot token using SHA-256 hash
    const encoder = new TextEncoder();
    const tokenHash = await crypto.subtle.digest('SHA-256', encoder.encode(TELEGRAM_BOT_TOKEN));

    // Import the hashed token as HMAC key
    const secretKey = await crypto.subtle.importKey(
      'raw',
      tokenHash,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Calculate HMAC
    const signature = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(dataCheckArr));
    const hexHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Calculated hash:', hexHash);
    console.log('Received hash:', hash);

    return hexHash === hash;
  } catch (error) {
    console.error('Error verifying Telegram auth:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telegramUser } = await req.json() as { telegramUser: TelegramUser };

    if (!telegramUser) {
      return new Response(
        JSON.stringify({ error: 'Missing telegram user data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Telegram authentication
    const isValid = await verifyTelegramAuth(telegramUser);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid Telegram authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already exists with this Telegram ID
    const { data: existingTelegramUser } = await supabase
      .from('telegram_users')
      .select('user_id')
      .eq('telegram_id', telegramUser.id)
      .maybeSingle();

    let userId: string;

    if (existingTelegramUser) {
      // User already exists
      userId = existingTelegramUser.user_id;
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
        // Clean up auth user if telegram link failed
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

    const { data: otpData, error: otpError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email!,
      options: {
        redirectTo: 'https://www.crystalbudget.net/'
      }
    });

    if (otpError || !otpData) {
      console.error('Error generating OTP link:', otpError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate login link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generated magic link:', otpData.properties.action_link);

    // Return the magic link URL - client will navigate to it for auto-login
    return new Response(
      JSON.stringify({
        magic_link: otpData.properties.action_link
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in telegram-auth:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


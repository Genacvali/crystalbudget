import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.181.0/node/crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CLOUDPAYMENTS_SECRET = Deno.env.get('CLOUDPAYMENTS_SECRET');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendTelegramMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });
}

async function getTelegramIdByUserId(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('telegram_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.telegram_id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const payment = JSON.parse(body);

    console.log('CloudPayments webhook received:', payment);

    // Verify webhook signature if secret is set
    if (CLOUDPAYMENTS_SECRET) {
      const signature = req.headers.get('Content-HMAC');
      const expectedSignature = createHmac('sha256', CLOUDPAYMENTS_SECRET)
        .update(body)
        .digest('base64');

      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ code: 13 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle successful payment
    if (payment.Status === 'Completed' || payment.Status === 'Authorized') {
      const invoiceId = payment.InvoiceId; // Format: sub_{userId}_{planType}_{timestamp}
      const amount = payment.Amount;
      const userId = payment.AccountId;

      // Parse invoiceId to get planType
      const parts = invoiceId.split('_');
      if (parts.length < 3 || parts[0] !== 'sub') {
        console.error('Invalid invoice ID format:', invoiceId);
        return new Response(JSON.stringify({ code: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const planType = parts[2];

      // Calculate expiration date
      const now = new Date();
      let expiresAt = new Date();

      switch (planType) {
        case 'monthly':
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          break;
        case 'quarterly':
          expiresAt.setMonth(expiresAt.getMonth() + 3);
          break;
        case 'yearly':
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          break;
        default:
          console.error('Unknown plan type:', planType);
          return new Response(JSON.stringify({ code: 0 }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
      }

      // Create or extend subscription
      const { error } = await supabase.from('subscriptions').insert({
        user_id: userId,
        plan_type: planType,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount: amount
      });

      if (error) {
        console.error('Error creating subscription:', error);
        return new Response(JSON.stringify({ code: 13 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Send notification to user via Telegram
      const telegramId = await getTelegramIdByUserId(userId);
      if (telegramId) {
        const planNames: Record<string, string> = {
          monthly: 'месячная подписка',
          quarterly: 'подписка на 3 месяца',
          yearly: 'годовая подписка'
        };

        await sendTelegramMessage(
          telegramId,
          `🎉 <b>Поздравляем!</b>\n\n` +
          `Ваша ${planNames[planType]} успешно оформлена!\n\n` +
          `Теперь вам доступны:\n` +
          `✅ Сканирование чеков\n` +
          `✅ Голосовые сообщения\n` +
          `✅ Неограниченное использование\n\n` +
          `Действует до: ${expiresAt.toLocaleDateString('ru-RU')}`
        );
      }

      // Return success code to CloudPayments
      return new Response(JSON.stringify({ code: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For other statuses, just acknowledge
    return new Response(JSON.stringify({ code: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('CloudPayments webhook error:', error);
    return new Response(JSON.stringify({ code: 13 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

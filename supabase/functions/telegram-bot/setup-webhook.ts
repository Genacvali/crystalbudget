// This script sets up the Telegram webhook
// Run it once after deploying the edge function

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;

console.log('Setting up Telegram webhook...');
console.log('Webhook URL:', webhookUrl);

const response = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  }
);

const result = await response.json();
console.log('Result:', result);

if (result.ok) {
  console.log('✅ Webhook set successfully!');
} else {
  console.error('❌ Failed to set webhook:', result);
}

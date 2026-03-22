require('dotenv').config();
const fetch = require('node-fetch');

async function sendEmail(to, subject, html) {
  if (!process.env.BREVO_SMTP_KEY) return;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_SMTP_KEY },
      body: JSON.stringify({
        sender:      { name: 'CongoSwap', email: process.env.EMAIL_USER },
        to:          [{ email: to }],
        subject:     subject,
        htmlContent: html
      })
    });
    const data = await r.json();
    if (data.messageId) console.log('Email envoye a ' + to);
    else console.error('Brevo erreur:', JSON.stringify(data));
  } catch(e) { console.error('Email erreur:', e.message); }
}

async function sendTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch(e) { console.error('Telegram error:', e.message); }
}

module.exports = { sendEmail, sendTelegram };

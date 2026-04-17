require('dotenv').config();
const fetch = require('node-fetch');

const LOGO_URL = 'https://congoswap.onrender.com/assets/logo_icon_512.png';
const SITE_URL = 'https://congoswap.onrender.com';

async function sendEmail(to, subject, bodyContent) {
  if (!process.env.BREVO_SMTP_KEY) return;

  // Template HTML enrichi avec logo et design
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111111;border:1px solid #2a2a2a;border-radius:4px;overflow:hidden;">

        <!-- HEADER avec logo -->
        <tr>
          <td style="background:linear-gradient(135deg,#141414 0%,#1a1a0a 100%);border-bottom:3px solid #C9A84C;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="${LOGO_URL}" width="48" height="48" alt="CongoSwap" style="display:inline-block;vertical-align:middle;border-radius:8px;margin-right:14px;"/>
                  <span style="font-size:24px;font-weight:800;color:#f0ede6;vertical-align:middle;letter-spacing:-0.5px;">Congo<span style="color:#C9A84C;">Swap</span></span>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="background:#C9A84C;color:#0a0a0a;font-size:11px;font-weight:700;padding:4px 10px;letter-spacing:0.08em;border-radius:2px;">OFFICIEL</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENU -->
        <tr>
          <td style="padding:32px;">
            ${bodyContent}
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 32px;">
            <hr style="border:none;border-top:1px solid #2a2a2a;margin:0;"/>
          </td>
        </tr>

        <!-- INFOS PRATIQUES -->
        <tr>
          <td style="padding:24px 32px;background:#0f0f0f;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="vertical-align:top;padding-right:16px;">
                  <div style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:0.08em;margin-bottom:6px;">HORAIRES</div>
                  <div style="color:#8a8578;font-size:12px;line-height:1.6;">Lun–Sam : 8h–20h<br/>Dimanche : 10h–18h</div>
                </td>
                <td width="33%" style="vertical-align:top;padding-right:16px;">
                  <div style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:0.08em;margin-bottom:6px;">SUPPORT</div>
                  <div style="color:#8a8578;font-size:12px;line-height:1.6;">WhatsApp :<br/>+242 06 114 9792</div>
                </td>
                <td width="33%" style="vertical-align:top;">
                  <div style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:0.08em;margin-bottom:6px;">TRAITEMENT</div>
                  <div style="color:#8a8578;font-size:12px;line-height:1.6;">Crypto : &lt;2h<br/>Abonnements : &lt;30min</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#0a0a0a;border-top:1px solid #1a1a1a;padding:20px 32px;text-align:center;">
            <a href="${SITE_URL}" style="color:#C9A84C;text-decoration:none;font-size:12px;font-weight:600;">${SITE_URL}</a>
            <div style="color:#3a3a3a;font-size:11px;margin-top:8px;">République du Congo · Service 100% local</div>
            <div style="color:#2a2a2a;font-size:10px;margin-top:4px;">Cet email a été envoyé automatiquement par CongoSwap. Ne pas répondre directement.</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_SMTP_KEY
      },
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
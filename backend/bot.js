require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const { sendEmail, sendTelegram } = require('./utils.js');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const MONGO_URI = process.env.MONGODB_URI;

const bot = new TelegramBot(TOKEN, { polling: false });
global.telegramBot = bot;

// ─── DB ───────────────────────────────────────────────────────
let dbConn;
async function initBot() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  dbConn = client.db('congoswap');
  console.log('CongoSwap Bot connecte');
}

// ─── CONFIG ───────────────────────────────────────────────────
const RATES = { buy: 630, sell: 575, exchange: 2, payment: 700 };

const CRYPTOS = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP'];

const NETWORKS = {
  BTC:  ['Bitcoin (BTC)'],
  ETH:  ['Ethereum (ERC-20)', 'Arbitrum', 'Optimism'],
  USDT: ['Ethereum (ERC-20)', 'Tron (TRC-20)', 'BNB Smart Chain (BEP-20)'],
  BNB:  ['BNB Smart Chain (BEP-20)', 'Ethereum (ERC-20)'],
  SOL:  ['Solana'],
  XRP:  ['Ripple (XRP)'],
};

const WALLET_BY_NETWORK = {
  'Bitcoin (BTC)':            '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',
  'Ethereum (ERC-20)':        '0x90439961b090f8b51c28023e30213e318db227f3',
  'Arbitrum':                 '0x90439961b090f8b51c28023e30213e318db227f3',
  'Optimism':                 '0x90439961b090f8b51c28023e30213e318db227f3',
  'Tron (TRC-20)':            'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',
  'BNB Smart Chain (BEP-20)': '0x90439961b090f8b51c28023e30213e318db227f3',
  'Solana':                   '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5',
  'Ripple (XRP)':             'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',
};

const SERVICES = {
  Netflix:  [{ name: 'Standard',      price: 7  }, { name: 'Standard HD', price: 13 }, { name: 'Premium 4K', price: 22 }],
  Spotify:  [{ name: 'Solo',          price: 11 }, { name: 'Duo',         price: 15 }, { name: 'Famille',    price: 17 }],
  ChatGPT:  [{ name: 'Plus',          price: 20 }, { name: 'Pro',         price: 200 }],
  YouTube:  [{ name: 'Premium Solo',  price: 14 }, { name: 'Famille',     price: 23 }],
  Amazon:   [{ name: 'Prime',         price: 15 }, { name: 'Prime Video', price: 9  }],
  Canva:    [{ name: 'Pro Solo',      price: 15 }, { name: 'Pro Equipe',  price: 30 }],
};

// ─── SESSION ──────────────────────────────────────────────────
const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: 'menu', data: {} };
  return sessions[chatId];
}

function resetSession(chatId) {
  sessions[chatId] = { step: 'menu', data: {} };
}

// ─── HELPERS ─────────────────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('fr-FR').format(Math.round(n)); }

async function getPrices() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,solana,ripple&vs_currencies=usd',
      { headers: { 'User-Agent': 'CongoSwap/1.0' } });
    return await r.json();
  } catch(e) { return {}; }
}

function getUsdPrice(prices, sym) {
  const map = { BTC:'bitcoin', ETH:'ethereum', USDT:'tether', BNB:'binancecoin', SOL:'solana', XRP:'ripple' };
  return prices[map[sym]]?.usd || 0;
}

async function notifyAdmin(text) {
  try { await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' }); } catch(e) {}
}

async function saveOrder(order) {
  const id  = uuidv4();
  const now = new Date().toISOString();
  await dbConn.collection('orders').insertOne({ id, ...order, status: 'pending', notes: '', created_at: now, updated_at: now });
  return id;
}

// ─── MENUS ───────────────────────────────────────────────────
const MAIN_MENU = {
  reply_markup: {
    keyboard: [
      [{ text: '💸 Acheter des cryptos' }, { text: '💰 Vendre mes cryptos' }],
      [{ text: '🔄 Echanger crypto → crypto' }, { text: '💳 Abonnements' }],
      [{ text: '📋 Mes transactions' }, { text: '📊 Taux du jour' }],
      [{ text: '❓ Aide' }]
    ],
    resize_keyboard: true
  }
};

function cryptoKeyboard() {
  const rows = [];
  for (let i = 0; i < CRYPTOS.length; i += 3) {
    rows.push(CRYPTOS.slice(i, i+3).map(c => ({ text: c })));
  }
  rows.push([{ text: '↩ Retour' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function networkKeyboard(crypto) {
  const nets = NETWORKS[crypto] || [];
  const rows = nets.map(n => [{ text: n }]);
  rows.push([{ text: '↩ Retour' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function serviceKeyboard() {
  const svcs = Object.keys(SERVICES);
  const rows = [];
  for (let i = 0; i < svcs.length; i += 2) {
    rows.push(svcs.slice(i, i+2).map(s => ({ text: s })));
  }
  rows.push([{ text: '↩ Retour' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function planKeyboard(service) {
  const plans = SERVICES[service] || [];
  const rows  = plans.map(p => [{ text: p.name + ' — $' + p.price + '/mois' }]);
  rows.push([{ text: '↩ Retour' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function durationKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '1 mois' }, { text: '3 mois (-5%)' }],
        [{ text: '6 mois (-10%)' }, { text: '12 mois (-15%)' }],
        [{ text: '↩ Retour' }]
      ],
      resize_keyboard: true
    }
  };
}

function confirmKeyboard() {
  return {
    reply_markup: {
      keyboard: [[{ text: '✅ Confirmer' }, { text: '❌ Annuler' }]],
      resize_keyboard: true
    }
  };
}

// ─── WELCOME ─────────────────────────────────────────────────
async function sendWelcome(chatId, name) {
  const isAdmin = String(chatId) === String(ADMIN_ID);
  const adminInfo = isAdmin ? '' : '\n\n🔑 Votre Chat ID : `' + chatId + '`';
  const text =
    '🇨🇬 *Bienvenue sur CongoSwap Bot* !\n\n' +
    'Bonjour ' + (name || '') + ' 👋\n\n' +
    'Je suis votre assistant pour échanger vos cryptomonnaies en FCFA et commander vos abonnements internationaux.\n\n' +
    '📌 *Taux actuels :*\n' +
    '• Achat crypto : 630 FCFA/$\n' +
    '• Vente crypto : 575 FCFA/$\n' +
    '• Abonnements : 700 FCFA/$\n\n' +
    'Que voulez-vous faire ?' + adminInfo;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...MAIN_MENU });
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text   = msg.text || '';
  const name   = msg.from.first_name || '';
  const sess   = getSession(chatId);

  // Retour / annulation
  if (text === '↩ Retour' || text === '❌ Annuler' || text === '/start') {
    resetSession(chatId);
    await sendWelcome(chatId, name);
    return;
  }

  // ── MENU PRINCIPAL ──────────────────────────────────────────
  if (sess.step === 'menu') {

    if (text === '💸 Acheter des cryptos') {
      sess.step = 'buy_crypto';
      sess.data = { type: 'buy' };
      await bot.sendMessage(chatId, '💸 *Achat de crypto*\n\nQuelle crypto voulez-vous acheter ?', { parse_mode: 'Markdown', ...cryptoKeyboard() });

    } else if (text === '💰 Vendre mes cryptos') {
      sess.step = 'sell_crypto';
      sess.data = { type: 'sell' };
      await bot.sendMessage(chatId, '💰 *Vente de crypto*\n\nQuelle crypto voulez-vous vendre ?', { parse_mode: 'Markdown', ...cryptoKeyboard() });

    } else if (text === '🔄 Echanger crypto → crypto') {
      sess.step = 'exchange_from';
      sess.data = { type: 'exchange' };
      await bot.sendMessage(chatId, '🔄 *Échange crypto*\n\nQuelle crypto voulez-vous *envoyer* ?', { parse_mode: 'Markdown', ...cryptoKeyboard() });

    } else if (text === '💳 Abonnements') {
      sess.step = 'payment_service';
      sess.data = { type: 'payment' };
      await bot.sendMessage(chatId, '💳 *Abonnements internationaux*\n\nChoisissez le service :', { parse_mode: 'Markdown', ...serviceKeyboard() });

    } else if (text === '📊 Taux du jour') {
      const prices = await getPrices();
      let msg2 = '📊 *Taux du jour — CongoSwap*\n\n';
      msg2 += '💱 *Taux de change :*\n';
      msg2 += '• Achat : 630 FCFA / $1\n';
      msg2 += '• Vente : 575 FCFA / $1\n\n';
      msg2 += '💎 *Prix des cryptos :*\n';
      for (const sym of CRYPTOS) {
        const usd = getUsdPrice(prices, sym);
        if (usd) msg2 += '• ' + sym + ' : $' + usd.toLocaleString() + ' ≈ ' + fmt(usd * RATES.buy) + ' FCFA\n';
      }
      await bot.sendMessage(chatId, msg2, { parse_mode: 'Markdown', ...MAIN_MENU });

    } else if (text === '📋 Mes transactions') {
      sess.step = 'history_email';
      await bot.sendMessage(chatId, '📋 *Historique de vos transactions*\n\nEntrez votre adresse email :', { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });

    } else if (text === '❓ Aide') {
      const help =
        '❓ *Aide CongoSwap*\n\n' +
        '🌐 Site web : congoswap.onrender.com\n' +
        '📞 Paiement : +242 06 114 9792\n' +
        '👤 Nom : Michy Magellan\n\n' +
        '📌 *Comment acheter ?*\n' +
        '1. Choisissez la crypto\n' +
        '2. Entrez le montant\n' +
        '3. Envoyez les FCFA sur notre numéro Mobile Money\n' +
        '4. Envoyez la capture d\'écran\n' +
        '5. Recevez votre crypto sous 2h\n\n' +
        '📌 *Délais :*\n' +
        '• Crypto : 30 min à 2h\n' +
        '• Abonnements : 30 min\n\n' +
        'Pour toute question, contactez-nous directement ici.';
      await bot.sendMessage(chatId, help, { parse_mode: 'Markdown', ...MAIN_MENU });

    } else {
      await sendWelcome(chatId, name);
    }
    return;
  }

  // ── ACHAT ───────────────────────────────────────────────────
  if (sess.step === 'buy_crypto') {
    if (!CRYPTOS.includes(text)) { await bot.sendMessage(chatId, 'Choisissez une crypto dans la liste.', cryptoKeyboard()); return; }
    sess.data.crypto = text;
    sess.step = 'buy_network';
    await bot.sendMessage(chatId, 'Sur quel réseau voulez-vous recevoir *' + text + '* ?', { parse_mode: 'Markdown', ...networkKeyboard(text) });
    return;
  }

  if (sess.step === 'buy_network') {
    const nets = NETWORKS[sess.data.crypto] || [];
    if (!nets.includes(text)) { await bot.sendMessage(chatId, 'Choisissez un réseau dans la liste.', networkKeyboard(sess.data.crypto)); return; }
    sess.data.network = text;
    sess.step = 'buy_wallet';
    await bot.sendMessage(chatId, '🔑 Entrez votre adresse wallet *' + sess.data.crypto + '* (' + text + ') :', { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'buy_wallet') {
    if (text.length < 10) { await bot.sendMessage(chatId, 'Adresse invalide. Réessayez.'); return; }
    sess.data.wallet = text;
    sess.step = 'buy_amount';
    const prices  = await getPrices();
    const usd     = getUsdPrice(prices, sess.data.crypto);
    const preview = usd ? '\n\n💡 1 ' + sess.data.crypto + ' ≈ $' + usd + ' ≈ ' + fmt(usd * RATES.buy) + ' FCFA' : '';
    await bot.sendMessage(chatId, '💵 Combien de dollars voulez-vous acheter ? (minimum $5)' + preview, { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'buy_amount') {
    const usd = parseFloat(text);
    if (!usd || usd < 5) { await bot.sendMessage(chatId, 'Montant minimum : $5. Réessayez.'); return; }
    sess.data.amount_usd = usd;
    sess.data.amount_cfa = Math.round(usd * RATES.buy);
    sess.step = 'buy_email';
    await bot.sendMessage(chatId, '📧 Votre adresse email (pour recevoir la confirmation) :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'buy_email') {
    if (!text.includes('@')) { await bot.sendMessage(chatId, 'Email invalide. Réessayez.'); return; }
    sess.data.email = text;
    sess.step = 'buy_confirm';
    const d = sess.data;
    const summary =
      '📋 *Récapitulatif de votre achat*\n\n' +
      '• Crypto : ' + d.crypto + '\n' +
      '• Réseau : ' + d.network + '\n' +
      '• Wallet : `' + d.wallet + '`\n' +
      '• Montant : $' + d.amount_usd + ' = *' + fmt(d.amount_cfa) + ' FCFA*\n' +
      '• Email : ' + d.email + '\n\n' +
      '💳 *Envoyez ' + fmt(d.amount_cfa) + ' FCFA à :*\n' +
      '+242 06 114 9792 (Michy Magellan)\n\n' +
      'Confirmez après paiement 👇';
    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', ...confirmKeyboard() });
    return;
  }

  if (sess.step === 'buy_confirm') {
    if (text !== '✅ Confirmer') { resetSession(chatId); await sendWelcome(chatId, name); return; }
    sess.step = 'buy_screenshot';
    await bot.sendMessage(chatId, '📸 Envoyez la capture d\'écran de votre paiement Mobile Money :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  // ── VENTE ───────────────────────────────────────────────────
  if (sess.step === 'sell_crypto') {
    if (!CRYPTOS.includes(text)) { await bot.sendMessage(chatId, 'Choisissez une crypto dans la liste.', cryptoKeyboard()); return; }
    sess.data.crypto = text;
    sess.step = 'sell_network';
    await bot.sendMessage(chatId, 'Sur quel réseau allez-vous envoyer *' + text + '* ?', { parse_mode: 'Markdown', ...networkKeyboard(text) });
    return;
  }

  if (sess.step === 'sell_network') {
    const nets = NETWORKS[sess.data.crypto] || [];
    if (!nets.includes(text)) { await bot.sendMessage(chatId, 'Choisissez un réseau dans la liste.'); return; }
    sess.data.network = text;
    const addr = WALLET_BY_NETWORK[text] || '';
    sess.step = 'sell_amount';
    await bot.sendMessage(chatId,
      '📬 *Adresse CongoSwap pour recevoir votre ' + sess.data.crypto + ' :*\n\n`' + addr + '`\n\n' +
      '⚠️ Envoyez uniquement ' + sess.data.crypto + ' sur le réseau ' + text + '\n\n' +
      '💵 Combien de dollars souhaitez-vous vendre ? (minimum $5)',
      { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'sell_amount') {
    const usd = parseFloat(text);
    if (!usd || usd < 5) { await bot.sendMessage(chatId, 'Montant minimum : $5. Réessayez.'); return; }
    sess.data.amount_usd = usd;
    sess.data.amount_cfa = Math.round(usd * RATES.sell);
    sess.step = 'sell_phone';
    await bot.sendMessage(chatId, '📱 Votre numéro Mobile Money pour recevoir *' + fmt(sess.data.amount_cfa) + ' FCFA* :', { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'sell_phone') {
    if (text.length < 8) { await bot.sendMessage(chatId, 'Numéro invalide. Réessayez.'); return; }
    sess.data.phone = text;
    sess.step = 'sell_wallet';
    await bot.sendMessage(chatId, '🔑 Votre adresse wallet source (depuis laquelle vous envoyez) :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'sell_wallet') {
    sess.data.wallet = text;
    sess.step = 'sell_email';
    await bot.sendMessage(chatId, '📧 Votre adresse email :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'sell_email') {
    if (!text.includes('@')) { await bot.sendMessage(chatId, 'Email invalide. Réessayez.'); return; }
    sess.data.email = text;
    sess.step = 'sell_confirm';
    const d = sess.data;
    const summary =
      '📋 *Récapitulatif de votre vente*\n\n' +
      '• Crypto : ' + d.crypto + '\n' +
      '• Réseau : ' + d.network + '\n' +
      '• Montant : $' + d.amount_usd + ' = *' + fmt(d.amount_cfa) + ' FCFA*\n' +
      '• Mobile Money : ' + d.phone + '\n' +
      '• Email : ' + d.email + '\n\n' +
      '📬 *Envoyez votre crypto à :*\n`' + (WALLET_BY_NETWORK[d.network] || '') + '`\n\n' +
      'Confirmez après envoi 👇';
    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', ...confirmKeyboard() });
    return;
  }

  if (sess.step === 'sell_confirm') {
    if (text !== '✅ Confirmer') { resetSession(chatId); await sendWelcome(chatId, name); return; }
    sess.step = 'sell_screenshot';
    await bot.sendMessage(chatId, '📸 Envoyez la capture d\'écran de votre transaction crypto :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  // ── ÉCHANGE ─────────────────────────────────────────────────
  if (sess.step === 'exchange_from') {
    if (!CRYPTOS.includes(text)) { await bot.sendMessage(chatId, 'Choisissez une crypto.', cryptoKeyboard()); return; }
    sess.data.exchange_from = text;
    sess.step = 'exchange_network_from';
    await bot.sendMessage(chatId, 'Sur quel réseau allez-vous envoyer *' + text + '* ?', { parse_mode: 'Markdown', ...networkKeyboard(text) });
    return;
  }

  if (sess.step === 'exchange_network_from') {
    const nets = NETWORKS[sess.data.exchange_from] || [];
    if (!nets.includes(text)) { await bot.sendMessage(chatId, 'Choisissez un réseau.'); return; }
    sess.data.exchange_network_from = text;
    const addr = WALLET_BY_NETWORK[text] || '';
    sess.step = 'exchange_to';
    await bot.sendMessage(chatId,
      '📬 *Adresse CongoSwap :*\n`' + addr + '`\n\nEnvoyez votre ' + sess.data.exchange_from + ' ici.\n\nQuelle crypto voulez-vous *recevoir* ?',
      { parse_mode: 'Markdown', ...cryptoKeyboard() });
    return;
  }

  if (sess.step === 'exchange_to') {
    if (!CRYPTOS.includes(text)) { await bot.sendMessage(chatId, 'Choisissez une crypto.', cryptoKeyboard()); return; }
    if (text === sess.data.exchange_from) { await bot.sendMessage(chatId, 'Choisissez une crypto différente.'); return; }
    sess.data.exchange_to = text;
    sess.step = 'exchange_network_to';
    await bot.sendMessage(chatId, 'Sur quel réseau voulez-vous recevoir *' + text + '* ?', { parse_mode: 'Markdown', ...networkKeyboard(text) });
    return;
  }

  if (sess.step === 'exchange_network_to') {
    const nets = NETWORKS[sess.data.exchange_to] || [];
    if (!nets.includes(text)) { await bot.sendMessage(chatId, 'Choisissez un réseau.'); return; }
    sess.data.exchange_network_to = text;
    sess.step = 'exchange_amount';
    await bot.sendMessage(chatId, '💵 Montant en dollars à échanger ? (minimum $5)', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'exchange_amount') {
    const usd = parseFloat(text);
    if (!usd || usd < 5) { await bot.sendMessage(chatId, 'Montant minimum : $5. Réessayez.'); return; }
    sess.data.amount_usd = usd;
    const fee = usd * 0.02;
    sess.data.fee = fee;
    sess.step = 'exchange_wallet';
    await bot.sendMessage(chatId,
      '💡 Frais : 2% = $' + fee.toFixed(2) + '\nVous recevrez : $' + (usd - fee).toFixed(2) + ' en ' + sess.data.exchange_to + '\n\n🔑 Votre adresse wallet *' + sess.data.exchange_to + '* pour recevoir :',
      { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'exchange_wallet') {
    if (text.length < 10) { await bot.sendMessage(chatId, 'Adresse invalide. Réessayez.'); return; }
    sess.data.wallet = text;
    sess.step = 'exchange_email';
    await bot.sendMessage(chatId, '📧 Votre adresse email :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'exchange_email') {
    if (!text.includes('@')) { await bot.sendMessage(chatId, 'Email invalide. Réessayez.'); return; }
    sess.data.email = text;
    sess.step = 'exchange_confirm';
    const d = sess.data;
    const summary =
      '📋 *Récapitulatif de l\'échange*\n\n' +
      '• Vous envoyez : ' + d.amount_usd + '$ de ' + d.exchange_from + ' (' + d.exchange_network_from + ')\n' +
      '• Frais 2% : $' + d.fee.toFixed(2) + '\n' +
      '• Vous recevez : $' + (d.amount_usd - d.fee).toFixed(2) + ' en ' + d.exchange_to + ' (' + d.exchange_network_to + ')\n' +
      '• Wallet réception : `' + d.wallet + '`\n' +
      '• Email : ' + d.email + '\n\n' +
      '📬 *Envoyez votre crypto à :*\n`' + (WALLET_BY_NETWORK[d.exchange_network_from] || '') + '`\n\n' +
      'Confirmez après envoi 👇';
    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', ...confirmKeyboard() });
    return;
  }

  if (sess.step === 'exchange_confirm') {
    if (text !== '✅ Confirmer') { resetSession(chatId); await sendWelcome(chatId, name); return; }
    sess.step = 'exchange_screenshot';
    await bot.sendMessage(chatId, '📸 Envoyez la capture d\'écran de votre transaction :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  // ── ABONNEMENT ──────────────────────────────────────────────
  if (sess.step === 'payment_service') {
    if (!SERVICES[text]) { await bot.sendMessage(chatId, 'Choisissez un service dans la liste.', serviceKeyboard()); return; }
    sess.data.service = text;
    sess.step = 'payment_plan';
    await bot.sendMessage(chatId, '📦 Choisissez votre plan *' + text + '* :', { parse_mode: 'Markdown', ...planKeyboard(text) });
    return;
  }

  if (sess.step === 'payment_plan') {
    const plans = SERVICES[sess.data.service] || [];
    const plan  = plans.find(p => text.startsWith(p.name));
    if (!plan) { await bot.sendMessage(chatId, 'Choisissez un plan dans la liste.'); return; }
    sess.data.plan = plan;
    sess.step = 'payment_duration';
    await bot.sendMessage(chatId, '⏱ Quelle durée souhaitez-vous ?', durationKeyboard());
    return;
  }

  if (sess.step === 'payment_duration') {
    const months = text === '1 mois' ? 1 : text === '3 mois (-5%)' ? 3 : text === '6 mois (-10%)' ? 6 : text === '12 mois (-15%)' ? 12 : 0;
    if (!months) { await bot.sendMessage(chatId, 'Choisissez une durée.'); return; }
    const discount = months >= 12 ? 0.15 : months >= 6 ? 0.10 : months >= 3 ? 0.05 : 0;
    const usd      = sess.data.plan.price * months * (1 - discount);
    const fcfa     = Math.round(usd * RATES.payment);
    sess.data.months     = months;
    sess.data.amount_usd = usd.toFixed(2);
    sess.data.amount_cfa = fcfa;
    sess.step = 'payment_email';
    await bot.sendMessage(chatId,
      '💰 Total : *' + fmt(fcfa) + ' FCFA* ($' + usd.toFixed(2) + ')' + (discount > 0 ? ' — remise ' + (discount*100) + '% appliquée' : '') + '\n\n📧 Votre adresse email (pour recevoir vos accès) :',
      { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'payment_email') {
    if (!text.includes('@')) { await bot.sendMessage(chatId, 'Email invalide. Réessayez.'); return; }
    sess.data.email = text;
    sess.step = 'payment_phone';
    await bot.sendMessage(chatId, '📱 Votre numéro Mobile Money :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  if (sess.step === 'payment_phone') {
    if (text.length < 8) { await bot.sendMessage(chatId, 'Numéro invalide. Réessayez.'); return; }
    sess.data.phone = text;
    sess.step = 'payment_confirm';
    const d = sess.data;
    const summary =
      '📋 *Récapitulatif de votre abonnement*\n\n' +
      '• Service : ' + d.service + ' ' + d.plan.name + '\n' +
      '• Durée : ' + d.months + ' mois\n' +
      '• Total : *' + fmt(d.amount_cfa) + ' FCFA* ($' + d.amount_usd + ')\n' +
      '• Email : ' + d.email + '\n' +
      '• Mobile Money : ' + d.phone + '\n\n' +
      '💳 *Envoyez ' + fmt(d.amount_cfa) + ' FCFA à :*\n' +
      '+242 06 114 9792 (Michy Magellan)\n\n' +
      'Vous recevrez vos accès par email sous 30 min après confirmation.\n\nConfirmez après paiement 👇';
    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', ...confirmKeyboard() });
    return;
  }

  if (sess.step === 'payment_confirm') {
    if (text !== '✅ Confirmer') { resetSession(chatId); await sendWelcome(chatId, name); return; }
    sess.step = 'payment_screenshot';
    await bot.sendMessage(chatId, '📸 Envoyez la capture d\'écran de votre paiement Mobile Money :', { reply_markup: { keyboard: [[{ text: '↩ Retour' }]], resize_keyboard: true } });
    return;
  }

  // ── HISTORIQUE ──────────────────────────────────────────────
  if (sess.step === 'history_email') {
    if (!text.includes('@')) { await bot.sendMessage(chatId, 'Email invalide. Réessayez.'); return; }
    try {
      const orders = await dbConn.collection('orders').find({ email: text }).sort({ created_at: -1 }).limit(10).toArray();
      if (!orders.length) {
        await bot.sendMessage(chatId, '📭 Aucune transaction trouvée pour ' + text, MAIN_MENU);
      } else {
        const typeLabel = t => t === 'buy' ? '💸 Achat' : t === 'sell' ? '💰 Vente' : t === 'exchange' ? '🔄 Echange' : '💳 Abonnement';
        const statusLabel = s => s === 'validated' ? '✅ Validée' : s === 'rejected' ? '❌ Refusée' : '⏳ En attente';
        let msg2 = '📋 *Vos ' + orders.length + ' dernières transactions :*\n\n';
        orders.forEach(function(o) {
          msg2 += typeLabel(o.type) + ' — #' + o.id.slice(0,8).toUpperCase() + '\n';
          msg2 += statusLabel(o.status);
          if (o.amount_usd) msg2 += ' — $' + o.amount_usd;
          msg2 += '\n\n';
        });
        await bot.sendMessage(chatId, msg2, { parse_mode: 'Markdown', ...MAIN_MENU });
      }
    } catch(e) {
      await bot.sendMessage(chatId, 'Erreur. Réessayez.', MAIN_MENU);
    }
    resetSession(chatId);
    return;
  }

  // Screenshot handler par défaut
  await bot.sendMessage(chatId, 'Utilisez le menu ci-dessous.', MAIN_MENU);
});

// ─── PHOTOS (captures d'écran) ───────────────────────────────
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const name   = msg.from.first_name || '';
  const sess   = getSession(chatId);
  const steps  = ['buy_screenshot', 'sell_screenshot', 'exchange_screenshot', 'payment_screenshot'];

  if (!steps.includes(sess.step)) {
    await bot.sendMessage(chatId, 'Utilisez le menu.', MAIN_MENU);
    return;
  }

  await bot.sendMessage(chatId, '⏳ Traitement en cours...');

  const d    = sess.data;
  const type = d.type;

  try {
    const id  = await saveOrder({
      type,
      email:        d.email || '',
      phone:        d.phone || '',
      crypto:       d.crypto || '',
      network:      d.network || '',
      amount_usd:   parseFloat(d.amount_usd) || 0,
      amount_cfa:   d.amount_cfa || 0,
      wallet_address: d.wallet || '',
      exchange_from: d.exchange_from || '',
      exchange_to:   d.exchange_to || '',
      exchange_network_from: d.exchange_network_from || '',
      exchange_network_to:   d.exchange_network_to || '',
      service:  d.service  ? d.service + ' ' + d.plan?.name : '',
      details:  d.months   ? d.months + ' mois' : '',
      referrer: '',
      screenshot_path: 'via_telegram',
    });

    const typeLabel = type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : type === 'exchange' ? 'Echange' : 'Abonnement';
    const emoji     = type === 'buy' ? '💸' : type === 'sell' ? '💰' : type === 'exchange' ? '🔄' : '💳';
    const sep       = '───────────────────';

    // Notif admin
    await notifyAdmin(
      emoji + ' <b>' + typeLabel.toUpperCase() + ' — CongoSwap Bot</b>\n' +
      sep + '\n' +
      '🆔 <b>Ref :</b> <code>#' + id.slice(0,8).toUpperCase() + '</code>\n' +
      '📧 <b>Email :</b> ' + (d.email || 'N/A') + '\n' +
      '📱 <b>Tel :</b> ' + (d.phone || 'N/A') + '\n' +
      sep + '\n' +
      (type === 'exchange' ?
        '💎 <b>Echange :</b> ' + d.exchange_from + ' → ' + d.exchange_to + '\n' +
        '🌐 <b>Reseaux :</b> ' + d.exchange_network_from + ' → ' + d.exchange_network_to + '\n' :
        type === 'payment' ?
        '🌐 <b>Service :</b> ' + d.service + ' ' + d.plan?.name + '\n' +
        '⏱ <b>Duree :</b> ' + d.months + ' mois\n' :
        '💎 <b>Crypto :</b> ' + d.crypto + '\n' +
        '🌐 <b>Reseau :</b> ' + d.network + '\n'
      ) +
      '💵 <b>Montant :</b> $' + d.amount_usd + ' (~' + (d.amount_cfa ? new Intl.NumberFormat('fr-FR').format(d.amount_cfa) : '--') + ' FCFA)\n' +
      '🔗 <b>Wallet :</b> ' + (d.wallet || 'N/A') + '\n' +
      sep + '\n' +
      '📱 <b>Via :</b> Telegram Bot\n' +
      '⏰ ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
    );

    // Forward screenshot to admin
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await bot.forwardMessage(ADMIN_ID, chatId, msg.message_id);

    // Confirmation client
    const confirmText =
      '✅ *Commande enregistrée !*\n\n' +
      '🆔 Référence : *#' + id.slice(0,8).toUpperCase() + '*\n\n' +
      (type === 'buy' ?
        'Votre crypto sera envoyée à votre wallet dans les 2 heures.' :
       type === 'sell' ?
        'Vous recevrez vos FCFA sur votre Mobile Money dans les 2 heures.' :
       type === 'exchange' ?
        'Votre échange sera traité dans les 24 heures.' :
        'Vos identifiants de connexion seront envoyés par email dans les 30 minutes.'
      ) + '\n\n' +
      'Merci de faire confiance à CongoSwap 🇨🇬';

    await bot.sendMessage(chatId, confirmText, { parse_mode: 'Markdown', ...MAIN_MENU });
    resetSession(chatId);

  } catch(e) {
    console.error('Erreur bot:', e.message);
    await bot.sendMessage(chatId, '❌ Erreur serveur. Contactez-nous directement.', MAIN_MENU);
  }
});

// ─── START ───────────────────────────────────────────────────
initBot().then(function() {
  console.log('CongoSwap Bot demarre');
}).catch(function(e) {
  console.error('Erreur bot:', e.message);
});

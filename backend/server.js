require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const multer     = require('multer');
const fetch      = require('node-fetch');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const { MongoClient } = require('mongodb');
const { sendEmail, sendTelegram } = require('./utils.js');

const app  = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_RATES = { buy: 630, sell: 575, exchange: 2, payment: 700 };
const OTP_PURPOSES = new Set(['history', 'referral']);
const uploadsDir = path.join(__dirname, 'uploads');
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(function(origin) { return origin.trim(); })
  .filter(Boolean);

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function requireEnvVars() {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_PASSWORD'];
  if (process.env.TELEGRAM_BOT_TOKEN) required.push('TELEGRAM_WEBHOOK_SECRET');
  const missing = required.filter(function(name) { return !process.env[name]; });
  if (missing.length) {
    throw new Error('Variables d’environnement manquantes: ' + missing.join(', '));
  }
}

requireEnvVars();

app.use(cors({
  origin: function(origin, cb) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origine non autorisee'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function cleanText(value, maxLen) {
  if (value === undefined || value === null) return '';
  const normalized = String(value).replace(/[<>]/g, '').trim();
  return maxLen ? normalized.slice(0, maxLen) : normalized;
}

function normalizeEmail(value) {
  return cleanText(value, 160).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildAccessToken(email, purpose) {
  return jwt.sign({ email, purpose }, getJwtSecret(), { expiresIn: '15m' });
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7);
}

function getRequestToken(req) {
  return getBearerToken(req) || cleanText(req.query.token, 500);
}

function verifyScopedToken(req, email, purpose) {
  const token = getRequestToken(req);
  if (!token) return false;
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return payload.email === email && payload.purpose === purpose;
  } catch {
    return false;
  }
}

function getRateValue(rates, key) {
  const value = Number(rates && rates[key]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RATES[key];
}

async function loadRates() {
  try {
    const doc = await dbConn.collection('config').findOne({ key: 'rates' });
    return doc && doc.value ? { ...DEFAULT_RATES, ...doc.value } : { ...DEFAULT_RATES };
  } catch {
    return { ...DEFAULT_RATES };
  }
}

async function saveRates(rates) {
  const next = {
    buy: getRateValue(rates, 'buy'),
    sell: getRateValue(rates, 'sell'),
    exchange: getRateValue(rates, 'exchange'),
    payment: getRateValue(rates, 'payment')
  };
  await dbConn.collection('config').updateOne(
    { key: 'rates' },
    { $set: { key: 'rates', value: next } },
    { upsert: true }
  );
  return next;
}

function publicOrderView(order) {
  return {
    id: order.id,
    type: order.type,
    status: order.status,
    crypto: order.crypto,
    exchange_from: order.exchange_from,
    exchange_to: order.exchange_to,
    amount_usd: order.amount_usd,
    amount_cfa: order.amount_cfa,
    created_at: order.created_at
  };
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.pdf'].includes(ext)
      ? ext
      : (file.mimetype === 'application/pdf' ? '.pdf' : '.png');
    cb(null, crypto.randomUUID() + safeExt);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Format de fichier non supporte'));
  }
});

const MONGO_URI = process.env.MONGODB_URI;
let dbConn;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  dbConn = client.db('congoswap');
  console.log('MongoDB connecte');
  const admins = dbConn.collection('admins');
  const existing = await admins.findOne({ username: 'admin' });
  if (!existing) {
    await admins.insertOne({
      username: 'admin',
      password: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)
    });
    console.log('Admin cree');
  }
}

const db = {
  async insertOrder(order) {
    await dbConn.collection('orders').insertOne(order);
  },
  async getOrder(id) {
    return await dbConn.collection('orders').findOne({ id });
  },
  async updateOrder(id, fields) {
    await dbConn.collection('orders').updateOne(
      { id },
      { $set: { ...fields, updated_at: new Date().toISOString() } }
    );
  },
  async deleteOrder(id) {
    await dbConn.collection('orders').deleteOne({ id });
  },
  async getOrders({ status, type, limit = 20, offset = 0 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (type)   query.type   = type;
    const total  = await dbConn.collection('orders').countDocuments(query);
    const orders = await dbConn.collection('orders')
      .find(query).sort({ created_at: -1 }).skip(offset).limit(limit).toArray();
    return { orders, total };
  },
  async getStats() {
    const col = dbConn.collection('orders');
    const total     = await col.countDocuments();
    const pending   = await col.countDocuments({ status: 'pending' });
    const validated = await col.countDocuments({ status: 'validated' });
    const rejected  = await col.countDocuments({ status: 'rejected' });
    const vOrders   = await col.find({ status: 'validated' }).toArray();
    const volume    = vOrders.reduce((s, o) => s + (o.amount_cfa || 0), 0);
    return { total, pending, validated, rejected, volume };
  },
  async getAdmin(username) {
    return await dbConn.collection('admins').findOne({ username });
  }
};

// Email via Brevo HTTP API (SMTP bloque sur Render Free)
// sendEmail et sendTelegram importes depuis utils.js

function authRequired(req, res, next) {
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: 'Non autorise' });
  try {
    req.admin = jwt.verify(token, getJwtSecret());
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

app.get('/api/test-email', authRequired, async (req, res) => {
  if (!process.env.BREVO_SMTP_KEY) return res.json({ error: 'BREVO_SMTP_KEY non configure' });
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_SMTP_KEY },
      body: JSON.stringify({
        sender: { name: 'CongoSwap', email: process.env.EMAIL_USER },
        to: [{ email: process.env.EMAIL_USER }],
        subject: 'CongoSwap - Test email',
        htmlContent: '<p>Email de test CongoSwap. Configuration correcte.</p>'
      })
    });
    const data = await r.json();
    if (data.messageId) res.json({ success: true, message: 'Email envoye' });
    else res.json({ error: data });
  } catch (e) { res.json({ error: e.message }); }
});

let priceCache = {};
let lastPriceFetch = 0;
const FALLBACK_PRICES = {
  bitcoin: { usd: 97000 }, ethereum: { usd: 3200 }, tether: { usd: 1 },
  binancecoin: { usd: 610 }, solana: { usd: 185 }, ripple: { usd: 2.1 }
};

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (now - lastPriceFetch < 300000 && Object.keys(priceCache).length) return res.json(priceCache);
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,solana,ripple&vs_currencies=usd',
      { headers: { 'User-Agent': 'CongoSwap/1.0', 'Accept': 'application/json' } }
    );
    const data = await r.json();
    if (data.bitcoin && data.bitcoin.usd) { priceCache = data; lastPriceFetch = now; return res.json(priceCache); }
    return res.json(Object.keys(priceCache).length ? priceCache : FALLBACK_PRICES);
  } catch (e) { return res.json(Object.keys(priceCache).length ? priceCache : FALLBACK_PRICES); }
});

app.post('/api/orders', upload.single('screenshot'), async (req, res) => {
  try {
    const type = cleanText(req.body.type, 20);
    const email = normalizeEmail(req.body.email);
    const cryptoName = cleanText(req.body.crypto, 32);
    const network = cleanText(req.body.network, 64);
    const walletAddress = cleanText(req.body.wallet_address, 200);
    const phone = cleanText(req.body.phone, 40);
    const referrer = normalizeEmail(req.body.referrer);
    const exchangeFrom = cleanText(req.body.exchange_from, 32);
    const exchangeTo = cleanText(req.body.exchange_to, 32);
    const exchangeNetworkFrom = cleanText(req.body.exchange_network_from, 64);
    const exchangeNetworkTo = cleanText(req.body.exchange_network_to, 64);
    const amountUsd = parseFloat(req.body.amount_usd);
    const amountCfa = parseFloat(req.body.amount_cfa);

    if (!['buy', 'sell', 'exchange'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const rates = await loadRates();
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.insertOrder({
      id, type, email,
      phone: phone || '',
      referrer: referrer || '',
      crypto: cryptoName || '', network: network || '',
      amount_usd: amountUsd || 0,
      amount_cfa: amountCfa || 0,
      wallet_address: walletAddress || '',
      screenshot_path: req.file ? '/uploads/' + req.file.filename : null,
      exchange_from: exchangeFrom || '', exchange_to: exchangeTo || '',
      exchange_network_from: exchangeNetworkFrom || '', exchange_network_to: exchangeNetworkTo || '',
      status: 'pending', notes: '', created_at: now, updated_at: now
    });

    const typeLabel  = type === 'buy' ? 'Achat de crypto' : type === 'sell' ? 'Vente de crypto' : 'Echange de crypto';
    const typeEmoji  = type === 'buy' ? '💸' : type === 'sell' ? '💰' : '🔄';
    const typeColor  = type === 'buy' ? '#C9A84C' : type === 'sell' ? '#2ecc71' : '#3498db';
    const refCode    = '#' + id.slice(0,8).toUpperCase();
    const dateStr    = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville', dateStyle: 'full', timeStyle: 'short' });

    const nextStepsBuy  = '<li style="margin:6px 0;color:#8a8578;">✅ Votre commande est <strong style="color:#f0ede6;">en cours de traitement</strong></li><li style="margin:6px 0;color:#8a8578;">⏱ Delai estimé : <strong style="color:#C9A84C;">30 min à 2 heures</strong></li><li style="margin:6px 0;color:#8a8578;">📨 Vous recevrez un email de confirmation dès l\'envoi de votre crypto</li><li style="margin:6px 0;color:#8a8578;">📱 En cas de question : WhatsApp +242 06 114 9792</li>';
    const nextStepsSell = '<li style="margin:6px 0;color:#8a8578;">✅ Votre demande est <strong style="color:#f0ede6;">en cours de verification</strong></li><li style="margin:6px 0;color:#8a8578;">⏱ Vos FCFA seront envoyés sous <strong style="color:#2ecc71;">2 heures</strong></li><li style="margin:6px 0;color:#8a8578;">📲 Vous recevrez le virement sur votre Mobile Money</li><li style="margin:6px 0;color:#8a8578;">📱 En cas de question : WhatsApp +242 06 114 9792</li>';
    const nextStepsExch = '<li style="margin:6px 0;color:#8a8578;">✅ Votre echange est <strong style="color:#f0ede6;">en cours de traitement</strong></li><li style="margin:6px 0;color:#8a8578;">⏱ Delai estimé : <strong style="color:#3498db;">2 à 24 heures</strong></li><li style="margin:6px 0;color:#8a8578;">📨 Confirmation par email dès l\'envoi de votre crypto</li><li style="margin:6px 0;color:#8a8578;">📱 En cas de question : WhatsApp +242 06 114 9792</li>';
    const nextSteps = type === 'buy' ? nextStepsBuy : type === 'sell' ? nextStepsSell : nextStepsExch;

    sendEmail(email, typeEmoji + ' CongoSwap — ' + typeLabel + ' recu ' + refCode,
      '<div style="color:#f0ede6;">' +

      // Titre
      '<h2 style="color:#f0ede6;font-size:22px;margin:0 0 4px;">' + typeEmoji + ' ' + typeLabel + '</h2>' +
      '<p style="color:#8a8578;margin:0 0 24px;font-size:13px;">Votre demande a bien ete enregistree.</p>' +

      // Ref + date
      '<table width="100%" style="background:#1a1a1a;border-radius:4px;margin-bottom:20px;" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="padding:16px 20px;border-right:1px solid #2a2a2a;width:50%;">' +
      '<div style="font-size:11px;color:#8a8578;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Reference</div>' +
      '<div style="font-family:monospace;font-size:18px;font-weight:700;color:#C9A84C;">' + refCode + '</div>' +
      '</td><td style="padding:16px 20px;">' +
      '<div style="font-size:11px;color:#8a8578;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Date</div>' +
      '<div style="font-size:13px;color:#f0ede6;">' + dateStr + '</div>' +
      '</td></tr></table>' +

      // Details transaction
      '<div style="background:#161616;border:1px solid #2a2a2a;border-left:3px solid ' + typeColor + ';padding:20px;margin-bottom:20px;border-radius:2px;">' +
      '<div style="font-size:12px;font-weight:700;color:' + typeColor + ';letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Détails de la transaction</div>' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
      (type !== 'exchange' ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;width:40%;">Cryptomonnaie</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;font-weight:600;">' + (cryptoName || '--') + '</td></tr>' : '') +
      (type !== 'exchange' ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Réseau</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;">' + (network || '--') + '</td></tr>' : '') +
      (type === 'exchange' ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Vous envoyez</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;font-weight:600;">' + exchangeFrom + ' (' + exchangeNetworkFrom + ')</td></tr>' : '') +
      (type === 'exchange' ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Vous recevez</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;font-weight:600;">' + exchangeTo + ' (' + exchangeNetworkTo + ')</td></tr>' : '') +
      (amountUsd ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Montant USD</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;font-weight:600;">$' + amountUsd + '</td></tr>' : '') +
      (amountCfa ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Montant FCFA</td><td style="padding:6px 0;color:' + typeColor + ';font-size:16px;font-weight:800;">' + new Intl.NumberFormat('fr-FR').format(amountCfa) + ' FCFA</td></tr>' : '') +
      (walletAddress ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">' + (type === 'buy' ? 'Votre wallet' : 'Wallet source') + '</td><td style="padding:6px 0;color:#f0ede6;font-size:11px;font-family:monospace;word-break:break-all;">' + walletAddress + '</td></tr>' : '') +
      (phone ? '<tr><td style="padding:6px 0;color:#8a8578;font-size:13px;">Mobile Money</td><td style="padding:6px 0;color:#f0ede6;font-size:13px;">' + phone + '</td></tr>' : '') +
      '</table></div>' +

      // Prochaines étapes
      '<div style="background:#161616;border:1px solid #2a2a2a;padding:20px;margin-bottom:20px;border-radius:2px;">' +
      '<div style="font-size:12px;font-weight:700;color:#f0ede6;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">Prochaines étapes</div>' +
      '<ul style="margin:0;padding-left:16px;">' + nextSteps + '</ul>' +
      '</div>' +

      // Taux rappel
      '<div style="background:#111;border:1px solid #1a1a1a;padding:16px 20px;margin-bottom:20px;border-radius:2px;display:flex;gap:24px;">' +
      '<div><div style="font-size:11px;color:#8a8578;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;">Taux achat</div><div style="color:#C9A84C;font-weight:700;font-size:15px;">' + getRateValue(rates, 'buy') + ' FCFA/$</div></div>' +
      '<div style="border-left:1px solid #2a2a2a;padding-left:24px;"><div style="font-size:11px;color:#8a8578;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;">Taux vente</div><div style="color:#2ecc71;font-weight:700;font-size:15px;">' + getRateValue(rates, 'sell') + ' FCFA/$</div></div>' +
      '<div style="border-left:1px solid #2a2a2a;padding-left:24px;"><div style="font-size:11px;color:#8a8578;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;">Abonnements</div><div style="color:#e74c3c;font-weight:700;font-size:15px;">' + getRateValue(rates, 'payment') + ' FCFA/$</div></div>' +
      '</div>' +

      // CTA
      '<div style="text-align:center;margin-bottom:8px;">' +
      '<a href="https://congoswap.onrender.com/waiting.html?id=' + id + '" style="background:#C9A84C;color:#0a0a0a;text-decoration:none;font-weight:800;font-size:14px;padding:14px 32px;display:inline-block;letter-spacing:0.06em;border-radius:2px;">SUIVRE MA COMMANDE →</a>' +
      '</div>' +

      '</div>'
    ).catch(function(e) { console.error('Email erreur:', e.message); });

    // Email notification admin
    sendEmail(process.env.EMAIL_USER, 'CongoSwap - Nouvelle ' + typeLabel + ' #' + id.slice(0,8).toUpperCase(),
      '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
      '<h2 style="color:#C9A84C;">Nouvelle commande</h2>' +
      '<div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">' +
      '<p><strong>Ref :</strong> #' + id.slice(0,8).toUpperCase() + '</p>' +
      '<p><strong>Type :</strong> ' + typeLabel + '</p>' +
      '<p><strong>Email client :</strong> ' + email + '</p>' +
      '<p><strong>Telephone :</strong> ' + (phone || 'Non renseigne') + '</p>' +
      '<p><strong>Crypto :</strong> ' + (cryptoName || (exchangeFrom + ' → ' + exchangeTo)) + '</p>' +
      '<p><strong>Reseau :</strong> ' + (network || exchangeNetworkFrom || 'N/A') + '</p>' +
      (amountUsd ? '<p><strong>Montant :</strong> $' + amountUsd + ' soit ' + amountCfa + ' FCFA</p>' : '') +
      '<p><strong>Wallet client :</strong> ' + (walletAddress || 'N/A') + '</p>' +
      '</div>' +
      '<a href="https://congoswap.onrender.com/admin.html" style="background:#C9A84C;color:#000;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px;">Voir dans l\'admin</a>' +
      '</div>'
    ).catch(function(e) { console.error('Email admin erreur:', e.message); });

    const emoji = type === 'buy' ? '💸' : type === 'sell' ? '💰' : '🔄';
    const sep = '───────────────────';
    sendTelegram(
      emoji + ' <b>' + typeLabel.toUpperCase() + ' — CongoSwap</b>\n' +
      sep + '\n' +
      '🆔 <b>Ref :</b> <code>#' + id.slice(0,8).toUpperCase() + '</code>\n' +
      '📧 <b>Email :</b> ' + email + '\n' +
      '📱 <b>Tel :</b> ' + (phone || 'Non renseigne') + '\n' +
      sep + '\n' +
      '💎 <b>Crypto :</b> ' + (cryptoName || (exchangeFrom + ' → ' + exchangeTo)) + '\n' +
      '🌐 <b>Reseau :</b> ' + (network || exchangeNetworkFrom || 'N/A') + '\n' +
      '💵 <b>Montant :</b> ' + (amountUsd ? '$' + amountUsd + '  (~' + amountCfa + ' FCFA)' : 'Echange') + '\n' +
      '🔗 <b>Wallet :</b> <code>' + (walletAddress || 'N/A') + '</code>\n' +
      (referrer ? '🎁 <b>Parrain :</b> ' + referrer + '\n' : '') +
      sep + '\n' +
      '⏰ ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
    ).catch(function(e) { console.error('Telegram erreur:', e.message); });

    res.json({ success: true, order_id: id });

    // ── Programme fidelite ──────────────────────────────────────
    try {
      const userOrders = await dbConn.collection('orders').countDocuments({ email, status: 'validated' });
      if (userOrders > 0 && userOrders % 5 === 0) {
        sendEmail(email, 'CongoSwap - Bonus fidelite !',
          '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
          '<h2 style="color:#C9A84C;">Merci pour votre fidelite !</h2>' +
          '<p>Vous avez effectue <strong>' + (userOrders + 1) + ' transactions</strong> sur CongoSwap.</p>' +
          '<div style="background:#1c1c1c;border:2px solid #C9A84C;padding:20px;border-radius:6px;text-align:center;margin:20px 0;">' +
          '<div style="font-size:2rem;margin-bottom:8px;">🎁</div>' +
          '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:1.4rem;color:#C9A84C;">$1 offert</div>' +
          '<div style="font-size:.85rem;color:#8a8578;margin-top:6px;">Bonus applique sur votre prochaine transaction</div>' +
          '</div>' +
          '<p style="color:#8a8578;font-size:.85rem;">Mentionnez ce code lors de votre prochaine commande : <strong style="color:#C9A84C;">LOYAL' + userOrders + '</strong></p>' +
          '</div>'
        ).catch(function(e) {});
      }
    } catch(e) {}
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(publicOrderView(order));
});

// ─── OTP VERIFICATION ─────────────────────────────────────────
app.post('/api/otp/send', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const purpose = cleanText(req.body.purpose || 'history', 20);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide' });
  if (!OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Usage OTP invalide' });

  const existing = await dbConn.collection('otp').findOne({ email, purpose });
  if (existing && existing.last_sent_at && (Date.now() - new Date(existing.last_sent_at).getTime()) < 60000) {
    return res.status(429).json({ error: 'Veuillez patienter avant de demander un nouveau code.' });
  }

  const code    = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await dbConn.collection('otp').updateOne(
    { email, purpose },
    {
      $set: {
        email, purpose, code, expires,
        created_at: new Date(),
        last_sent_at: new Date(),
        verify_attempts: 0
      }
    },
    { upsert: true }
  );

  await sendEmail(email, 'CongoSwap - Code de verification',
    '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
    '<h2 style="color:#C9A84C;">CongoSwap — Verification</h2>' +
    '<p>Votre code de verification :</p>' +
    '<div style="text-align:center;margin:24px 0;">' +
    '<span style="font-family:monospace;font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#C9A84C;background:#1c1c1c;padding:16px 24px;">' + code + '</span>' +
    '</div>' +
    '<p style="color:#8a8578;font-size:.85rem;">Ce code expire dans 10 minutes. Ne le partagez avec personne.</p>' +
    '</div>'
  );

  res.json({ success: true });
});

app.post('/api/otp/verify', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = cleanText(req.body.code, 6);
  const purpose = cleanText(req.body.purpose || 'history', 20);
  if (!OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Usage OTP invalide' });
  const otp = await dbConn.collection('otp').findOne({ email, purpose });
  if (!otp) return res.status(400).json({ error: 'Code invalide' });
  if ((otp.verify_attempts || 0) >= 5) return res.status(429).json({ error: 'Trop de tentatives' });
  if (otp.code !== code) {
    await dbConn.collection('otp').updateOne(
      { email, purpose },
      { $inc: { verify_attempts: 1 } }
    );
    return res.status(400).json({ error: 'Code invalide' });
  }
  if (new Date() > otp.expires) return res.status(400).json({ error: 'Code expire' });
  await dbConn.collection('otp').deleteOne({ email, purpose });
  res.json({ success: true, access_token: buildAccessToken(email, purpose) });
});

// ─── PAIEMENTS INTERNATIONAUX ─────────────────────────────────
app.post('/api/payments', upload.single('screenshot'), async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const phone = cleanText(req.body.phone, 40);
    const service = cleanText(req.body.service, 120);
    const details = cleanText(req.body.details, 120);
    const note = cleanText(req.body.note, 300);
    const referrer = normalizeEmail(req.body.referrer);
    const amountUsd = parseFloat(req.body.amount_usd);
    const amountCfa = parseFloat(req.body.amount_cfa);

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    if (!service) return res.status(400).json({ error: 'Service invalide' });
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const id  = uuidv4();
    const now = new Date().toISOString();

    await dbConn.collection('orders').insertOne({
      id, type: 'payment', email,
      phone:      phone || '',
      service:    service || '',
      details:    details || '',
      amount_usd: amountUsd || 0,
      amount_cfa: amountCfa || 0,
      note:       note || '',
      referrer:   referrer || '',
      screenshot_path: req.file ? '/uploads/' + req.file.filename : null,
      status: 'pending', notes: '',
      created_at: now, updated_at: now
    });

    // Email client
    sendEmail(email, 'CongoSwap - Abonnement recu #' + id.slice(0,8).toUpperCase(),
      '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
      '<h2 style="color:#C9A84C;">CongoSwap — Abonnements Internationaux</h2>' +
      '<p>Bonjour,</p>' +
      '<p>Votre commande d\'abonnement a bien ete recue.</p>' +
      '<div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">' +
      '<p><strong>Reference :</strong> #' + id.slice(0,8).toUpperCase() + '</p>' +
      '<p><strong>Service :</strong> ' + service + '</p>' +
      '<p><strong>Duree :</strong> ' + details + '</p>' +
      '<p><strong>Montant :</strong> $' + amountUsd + ' = ' + amountCfa + ' FCFA</p>' +
      '</div>' +
      '<p>Apres confirmation de votre paiement Mobile Money, vous recevrez vos identifiants de connexion par email dans les <strong>30 minutes</strong>.</p>' +
      '<p style="color:#8a8578;font-size:.85rem;">Merci de faire confiance a CongoSwap.</p>' +
      '</div>'
    ).catch(function(e) { console.error('Email erreur:', e.message); });

    // Email admin
    sendEmail(process.env.EMAIL_USER, 'CongoSwap - Nouveau paiement #' + id.slice(0,8).toUpperCase(),
      '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
      '<h2 style="color:#C9A84C;">Nouveau paiement international</h2>' +
      '<div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">' +
      '<p><strong>Ref :</strong> #' + id.slice(0,8).toUpperCase() + '</p>' +
      '<p><strong>Email :</strong> ' + email + '</p>' +
      '<p><strong>Tel :</strong> ' + (phone || 'N/A') + '</p>' +
      '<p><strong>Service :</strong> ' + service + '</p>' +
      '<p><strong>Compte :</strong> ' + details + '</p>' +
      '<p><strong>Montant :</strong> $' + amountUsd + ' = ' + amountCfa + ' FCFA</p>' +
      (note ? '<p><strong>Note :</strong> ' + note + '</p>' : '') +
      '</div>' +
      '<a href="https://congoswap.onrender.com/admin.html" style="background:#C9A84C;color:#000;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;">Voir dans l\'admin</a>' +
      '</div>'
    ).catch(function(e) { console.error('Email admin erreur:', e.message); });

    // Telegram
    sendTelegram(
      '💳 <b>PAIEMENT INTERNATIONAL — CongoSwap</b>\n' +
      '───────────────────\n' +
      '🆔 <b>Ref :</b> <code>#' + id.slice(0,8).toUpperCase() + '</code>\n' +
      '📧 <b>Email :</b> ' + email + '\n' +
      '📱 <b>Tel :</b> ' + (phone || 'N/A') + '\n' +
      '───────────────────\n' +
      '🌐 <b>Service :</b> ' + service + '\n' +
      '👤 <b>Compte :</b> ' + details + '\n' +
      '💵 <b>Montant :</b> $' + amountUsd + '  (~' + amountCfa + ' FCFA)\n' +
      (note ? '📝 <b>Note :</b> ' + note + '\n' : '') +
      '───────────────────\n' +
      '⏰ ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
    ).catch(function(e) { console.error('Telegram erreur:', e.message); });

    res.json({ success: true, order_id: id });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Historique transactions par email (client)
app.get('/api/my-orders', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email requis' });
  if (!verifyScopedToken(req, email, 'history')) return res.status(401).json({ error: 'Verification requise' });
  const orders = await dbConn.collection('orders')
    .find({ email: email })
    .sort({ created_at: -1 })
    .toArray();
  res.json({ orders: orders.map(publicOrderView) });
});

// Stats parrainage
app.get('/api/referral-stats', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email requis' });
  if (!verifyScopedToken(req, email, 'referral')) return res.status(401).json({ error: 'Verification requise' });
  const all       = await dbConn.collection('orders').find({ referrer: email }).toArray();
  const validated = all.filter(function(o) { return o.status === 'validated'; });
  res.json({ total: all.length, validated: validated.length });
});

// Clients fideles (emails masques, min 2 commandes)
app.get('/api/trusted-clients', async (req, res) => {
  try {
    const orders = await dbConn.collection('orders').find({ status: 'validated' }).toArray();
    const count = {};
    orders.forEach(function(o) {
      if (o.email) count[o.email] = (count[o.email] || 0) + 1;
    });
    const frequent = Object.entries(count)
      .filter(function(e) { return e[1] >= 2; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 8)
      .map(function(e) {
        const email = e[0];
        const at = email.indexOf('@');
        const name = email.slice(0, at);
        const domain = email.slice(at);
        const masked = name[0] + '*'.repeat(Math.max(name.length - 2, 3)) + name[name.length - 1] + domain;
        return masked;
      });
    res.json({ clients: frequent });
  } catch(e) { res.json({ clients: [] }); }
});

app.get('/api/public-stats', async (req, res) => {
  try {
    const total = await dbConn.collection('orders').countDocuments();
    res.json({ total });
  } catch(e) { res.json({ total: 0 }); }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getAdmin(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Identifiants incorrects' });
  const token = jwt.sign({ username }, getJwtSecret(), { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/admin/orders', authRequired, async (req, res) => {
  const { status, type, page = 1 } = req.query;
  const result = await db.getOrders({ status, type, limit: 20, offset: (page - 1) * 20 });
  res.json(result);
});

app.patch('/api/admin/orders/:id', authRequired, async (req, res) => {
  const status = cleanText(req.body.status, 20);
  const notes = cleanText(req.body.notes, 500);
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Introuvable' });
  if (!['pending', 'validated', 'rejected'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await db.updateOrder(req.params.id, { status, notes: notes || order.notes });
  const typeLabel   = order.type === 'buy' ? 'Achat' : order.type === 'sell' ? 'Vente' : 'Echange';
  const statusLabel = status === 'validated' ? 'validee' : 'refusee';
  const statusColor = status === 'validated' ? '#2ecc71' : '#e74c3c';
  if (status === 'validated' || status === 'rejected') {
    sendEmail(order.email, 'CongoSwap - Transaction ' + statusLabel,
      '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
      '<h2 style="color:#C9A84C;">CongoSwap</h2>' +
      '<p>Votre transaction de <strong>' + typeLabel + '</strong> a ete <strong style="color:' + statusColor + '">' + statusLabel + '</strong>.</p>' +
      '<div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">' +
      '<p><strong>Reference :</strong> #' + order.id.slice(0,8).toUpperCase() + '</p>' +
      (notes ? '<p><strong>Note :</strong> ' + notes + '</p>' : '') +
      '</div>' + (status === 'rejected' ? '<p>Contactez-nous sur Telegram pour toute question.</p>' : '<p>Merci de faire confiance a CongoSwap !</p>') +
      '</div>'
    ).catch(function(e) { console.error('Email erreur:', e.message); });
  }
  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', authRequired, async (req, res) => {
  await db.deleteOrder(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/orders/:id/screenshot', authRequired, async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order || !order.screenshot_path) return res.status(404).json({ error: 'Capture introuvable' });
  const filePath = path.join(uploadsDir, path.basename(order.screenshot_path));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Capture introuvable' });
  res.sendFile(filePath);
});

// Envoi des accès abonnement au client
app.post('/api/admin/send-access', authRequired, async (req, res) => {
  const orderId = cleanText(req.body.orderId, 60);
  const service = cleanText(req.body.service, 120);
  const accountEmail = cleanText(req.body.accountEmail, 160);
  const accountPass = cleanText(req.body.accountPass, 160);
  const note = cleanText(req.body.note, 400);
  const order = await db.getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (!service || !accountEmail || !accountPass) return res.status(400).json({ error: 'Parametres invalides' });

  await sendEmail(order.email, 'CongoSwap - Vos accès ' + service,
    '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
    '<h2 style="color:#C9A84C;">CongoSwap — Vos accès sont prêts !</h2>' +
    '<p>Bonjour,</p>' +
    '<p>Votre abonnement <strong>' + service + '</strong> est activé. Voici vos identifiants de connexion :</p>' +
    '<div style="background:#1c1c1c;padding:20px;border-radius:6px;margin:16px 0;border-left:3px solid #C9A84C;">' +
    '<p style="margin:6px 0;"><strong>Service :</strong> ' + service + '</p>' +
    '<p style="margin:6px 0;"><strong>Email :</strong> ' + accountEmail + '</p>' +
    '<p style="margin:6px 0;"><strong>Mot de passe :</strong> <span style="font-family:monospace;background:#2a2a2a;padding:2px 8px;">' + accountPass + '</span></p>' +
    (note ? '<p style="margin:12px 0 0;color:#8a8578;font-size:.88rem;">' + note + '</p>' : '') +
    '</div>' +
    '<p style="color:#e74c3c;font-size:.85rem;">⚠️ Ne partagez pas ces identifiants. Ne modifiez pas le mot de passe.</p>' +
    '<p style="color:#8a8578;font-size:.85rem;">Merci de faire confiance à CongoSwap !</p>' +
    '</div>'
  );

  await db.updateOrder(orderId, { status: 'validated', notes: 'Accès envoyés : ' + service });
  res.json({ success: true });
});

app.get('/api/admin/stats', authRequired, async (req, res) => {
  const stats = await db.getStats();
  res.json(stats);
});

// Analytics
app.get('/api/admin/analytics', authRequired, async (req, res) => {
  try {
    const col    = dbConn.collection('orders');
    const orders = await col.find({}).toArray();

    // Par type
    const by_type = { buy: 0, sell: 0, exchange: 0 };
    orders.forEach(function(o) { if (by_type[o.type] !== undefined) by_type[o.type]++; });

    // Par crypto
    const cryptoCount = {};
    orders.forEach(function(o) {
      const name = o.crypto || o.exchange_from;
      if (name) cryptoCount[name] = (cryptoCount[name] || 0) + 1;
    });
    const by_crypto = Object.entries(cryptoCount)
      .map(function(e) { return { name: e[0], count: e[1] }; })
      .sort(function(a, b) { return b.count - a.count; });

    // Top clients
    const clientCount = {};
    orders.forEach(function(o) { if (o.email) clientCount[o.email] = (clientCount[o.email] || 0) + 1; });
    const top_clients = Object.entries(clientCount)
      .map(function(e) { return { email: e[0], count: e[1] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10);

    // Par jour (7 derniers jours)
    const days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('fr-FR')] = 0;
    }
    orders.forEach(function(o) {
      const d = new Date(o.created_at).toLocaleDateString('fr-FR');
      if (days[d] !== undefined) days[d]++;
    });
    const by_day = Object.entries(days).map(function(e) { return { date: e[0], count: e[1] }; });

    res.json({ by_type, by_crypto, top_clients, by_day });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Taux — lecture
app.get('/api/admin/rates', authRequired, async (req, res) => {
  res.json(await loadRates());
});

// Taux — mise a jour
app.post('/api/admin/rates', authRequired, async (req, res) => {
  try {
    const rates = await saveRates(req.body || {});
    res.json({ success: true, rates });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Taux publics (pour le frontend)
app.get('/api/rates', async (req, res) => {
  res.json(await loadRates());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── TELEGRAM WEBHOOK ─────────────────────────────────────────
app.post('/webhook/telegram', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  if (global.telegramBot) {
    global.telegramBot.processUpdate(req.body);
  }
});

connectDB().then(function() {
  // Charger le bot AVANT de démarrer le serveur
  require('./bot.js');
  app.listen(PORT, function() {
    console.log('CongoSwap backend running on port ' + PORT);
    // Configurer le webhook après démarrage
    if (global.telegramBot) {
      global.telegramBot.setWebHook('https://congoswap.onrender.com/webhook/telegram', {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET
      })
        .then(function() { console.log('Webhook Telegram configure'); })
        .catch(function(e) { console.error('Webhook erreur:', e.message); });
    }
  });
}).catch(function(e) { console.error('Erreur MongoDB:', e.message); process.exit(1); });

app.use(function(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Upload invalide: ' + err.message });
  }
  if (err && err.message === 'Format de fichier non supporte') {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

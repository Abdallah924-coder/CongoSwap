require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── UPLOADS DIR ──────────────────────────────────────────────
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── DATABASE (sql.js — fonctionne sur Android/Termux) ────────
const DB_PATH = './congoswap.json'; // On stocke en JSON pour persistance

// Simple DB maison basée sur un fichier JSON
// (sql.js nécessite une config WebAssembly complexe sur Termux)
// On utilise plutôt une base JSON légère et fiable sur tous les OS

let _db = { orders: {}, admins: {} };

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch(e) { console.error('Erreur chargement DB:', e.message); }
}

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2));
}

loadDB();

// Initialiser admin par défaut
if (!_db.admins) _db.admins = {};
if (!_db.admins['admin']) {
  _db.admins['admin'] = {
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'congoswap2024', 10)
  };
  saveDB();
  console.log('✅ Admin créé — username: admin');
}
if (!_db.orders) { _db.orders = {}; saveDB(); }

// Helpers DB
const db = {
  insertOrder(order) {
    _db.orders[order.id] = { ...order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    saveDB();
  },
  getOrder(id) { return _db.orders[id] || null; },
  updateOrder(id, fields) {
    if (!_db.orders[id]) return;
    _db.orders[id] = { ..._db.orders[id], ...fields, updated_at: new Date().toISOString() };
    saveDB();
  },
  deleteOrder(id) { delete _db.orders[id]; saveDB(); },
  getOrders({ status, type, limit = 20, offset = 0 } = {}) {
    let list = Object.values(_db.orders);
    if (status) list = list.filter(o => o.status === status);
    if (type) list = list.filter(o => o.type === type);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { orders: list.slice(offset, offset + limit), total: list.length };
  },
  getStats() {
    const list = Object.values(_db.orders);
    return {
      total: list.length,
      pending: list.filter(o => o.status === 'pending').length,
      validated: list.filter(o => o.status === 'validated').length,
      rejected: list.filter(o => o.status === 'rejected').length,
      volume: list.filter(o => o.status === 'validated').reduce((s, o) => s + (o.amount_cfa || 0), 0)
    };
  },
  getAdmin(username) { return _db.admins[username] || null; }
};

// ─── EMAIL ────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(to, subject, html) {
  if (!process.env.EMAIL_USER) return console.log('Email non configuré');
  try {
    await transporter.sendMail({
      from: `"CongoSwap 🇨🇬" <${process.env.EMAIL_USER}>`,
      to, subject, html
    });
    console.log(`📧 Email envoyé à ${to}`);
  } catch (e) {
    console.error('Erreur email:', e.message);
  }
}

// ─── TELEGRAM ─────────────────────────────────────────────────
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (e) { console.error('Telegram error:', e.message); }
}

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────
function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'congoswap_secret');
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

// ─── CRYPTO PRICES ────────────────────────────────────────────
let priceCache = {};
let lastPriceFetch = 0;

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (now - lastPriceFetch < 60000 && Object.keys(priceCache).length) {
    return res.json(priceCache);
  }
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,solana,ripple&vs_currencies=usd,xof'
    );
    const data = await r.json();
    priceCache = data;
    lastPriceFetch = now;
    res.json(data);
  } catch (e) {
    res.json(priceCache);
  }
});

// ─── ORDERS ───────────────────────────────────────────────────

// Create order (buy/sell/exchange)
app.post('/api/orders', upload.single('screenshot'), async (req, res) => {
  try {
    const {
      type, email, crypto, network, amount_usd, amount_cfa,
      wallet_address, exchange_from, exchange_to,
      exchange_network_from, exchange_network_to
    } = req.body;

    const id = uuidv4();
    const screenshot_path = req.file ? `/uploads/${req.file.filename}` : null;

    db.insertOrder({
      id, type, email,
      crypto: crypto || '',
      network: network || '',
      amount_usd: parseFloat(amount_usd) || 0,
      amount_cfa: parseFloat(amount_cfa) || 0,
      wallet_address: wallet_address || '',
      screenshot_path,
      exchange_from: exchange_from || '',
      exchange_to: exchange_to || '',
      exchange_network_from: exchange_network_from || '',
      exchange_network_to: exchange_network_to || '',
      status: 'pending',
      notes: ''
    });

    // Email client
    const typeLabel = type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : 'Échange';
    await sendEmail(email, `✅ CongoSwap — Commande reçue #${id.slice(0,8)}`, `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">
        <h2 style="color:#C9A84C;font-size:1.4rem;">CongoSwap 🇨🇬</h2>
        <p>Bonjour,</p>
        <p>Votre demande de <strong>${typeLabel}</strong> a bien été reçue et est en cours de traitement.</p>
        <div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Référence :</strong> #${id.slice(0,8).toUpperCase()}</p>
          <p style="margin:4px 0;"><strong>Type :</strong> ${typeLabel}</p>
          ${crypto ? `<p style="margin:4px 0;"><strong>Crypto :</strong> ${crypto}</p>` : ''}
          ${amount_usd ? `<p style="margin:4px 0;"><strong>Montant :</strong> $${amount_usd} ≈ ${amount_cfa} FCFA</p>` : ''}
        </div>
        <p>Vous serez notifié par email dès que votre transaction sera traitée.</p>
        <p style="color:#8a8578;font-size:0.85rem;">Merci de faire confiance à CongoSwap.</p>
      </div>
    `);

    // Telegram
    await sendTelegram(`
🔔 <b>Nouvelle commande CongoSwap</b>

🆔 <b>Ref:</b> #${id.slice(0,8).toUpperCase()}
📌 <b>Type:</b> ${typeLabel}
📧 <b>Email:</b> ${email}
💰 <b>Crypto:</b> ${crypto || exchange_from + '→' + exchange_to}
💵 <b>Montant:</b> ${amount_usd ? `$${amount_usd} ≈ ${amount_cfa} FCFA` : 'Échange'}
🔗 <b>Wallet:</b> ${wallet_address || 'N/A'}
    `.trim());

    res.json({ success: true, order_id: id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get order status (for waiting page)
app.get('/api/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const { id, type, status, crypto, amount_usd, amount_cfa, created_at } = order;
  res.json({ id, type, status, crypto, amount_usd, amount_cfa, created_at });
});

// ─── ADMIN AUTH ───────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.getAdmin(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || 'congoswap_secret', { expiresIn: '24h' });
  res.json({ token });
});

// ─── ADMIN ORDERS ─────────────────────────────────────────────
app.get('/api/admin/orders', authRequired, (req, res) => {
  const { status, type, page = 1 } = req.query;
  const result = db.getOrders({ status, type, limit: 20, offset: (page - 1) * 20 });
  res.json(result);
});

app.patch('/api/admin/orders/:id', authRequired, async (req, res) => {
  const { status, notes } = req.body;
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Introuvable' });

  db.updateOrder(req.params.id, { status, notes: notes || order.notes });

  const labels = { validated: '✅ Validée', rejected: '❌ Refusée', pending: '⏳ En attente' };
  const typeLabel = order.type === 'buy' ? 'Achat' : order.type === 'sell' ? 'Vente' : 'Échange';

  if (status === 'validated' || status === 'rejected') {
    await sendEmail(order.email, `CongoSwap — Transaction ${labels[status]}`, `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">
        <h2 style="color:#C9A84C;">CongoSwap 🇨🇬</h2>
        <p>Bonjour,</p>
        <p>Votre transaction de <strong>${typeLabel}</strong> a été <strong style="color:${status === 'validated' ? '#2ecc71' : '#e74c3c'}">${status === 'validated' ? 'validée' : 'refusée'}</strong>.</p>
        <div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">
          <p><strong>Référence :</strong> #${order.id.slice(0,8).toUpperCase()}</p>
          ${notes ? `<p><strong>Note :</strong> ${notes}</p>` : ''}
        </div>
        ${status === 'rejected' ? '<p>Pour toute question, contactez-nous sur Telegram ou par email.</p>' : '<p>Merci de faire confiance à CongoSwap !</p>'}
      </div>
    `);
  }

  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', authRequired, (req, res) => {
  db.deleteOrder(req.params.id);
  res.json({ success: true });
});

// Admin stats
app.get('/api/admin/stats', authRequired, (req, res) => {
  res.json(db.getStats());
});

// ─── FRONTEND ROUTING ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`🚀 CongoSwap backend on port ${PORT}`));


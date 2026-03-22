require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const multer     = require('multer');
const fetch      = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const { MongoClient } = require('mongodb');
const { sendEmail, sendTelegram } = require('./utils.js');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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
      password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'congoswap2024', 10)
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
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorise' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'congoswap_secret');
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

app.get('/api/test-email', async (req, res) => {
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
    const { type, email, crypto, network, amount_usd, amount_cfa, wallet_address, phone, referrer,
            exchange_from, exchange_to, exchange_network_from, exchange_network_to } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.insertOrder({
      id, type, email,
      phone: phone || '',
      referrer: referrer || '',
      crypto: crypto || '', network: network || '',
      amount_usd: parseFloat(amount_usd) || 0,
      amount_cfa: parseFloat(amount_cfa) || 0,
      wallet_address: wallet_address || '',
      screenshot_path: req.file ? '/uploads/' + req.file.filename : null,
      exchange_from: exchange_from || '', exchange_to: exchange_to || '',
      exchange_network_from: exchange_network_from || '', exchange_network_to: exchange_network_to || '',
      status: 'pending', notes: '', created_at: now, updated_at: now
    });

    const typeLabel = type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : 'Echange';

    sendEmail(email, 'CongoSwap - Commande recue #' + id.slice(0,8),
      '<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0d0d0d;color:#f0ede6;padding:32px;border-radius:8px;">' +
      '<h2 style="color:#C9A84C;">CongoSwap</h2><p>Votre demande de <strong>' + typeLabel + '</strong> a bien ete recue.</p>' +
      '<div style="background:#1c1c1c;padding:16px;border-radius:6px;margin:16px 0;">' +
      '<p><strong>Reference :</strong> #' + id.slice(0,8).toUpperCase() + '</p>' +
      '<p><strong>Type :</strong> ' + typeLabel + '</p>' +
      (crypto ? '<p><strong>Crypto :</strong> ' + crypto + '</p>' : '') +
      (amount_usd ? '<p><strong>Montant :</strong> $' + amount_usd + ' soit ' + amount_cfa + ' FCFA</p>' : '') +
      '</div><p>Vous serez notifie par email des que votre transaction sera traitee.</p></div>'
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
      '<p><strong>Crypto :</strong> ' + (crypto || (exchange_from + ' → ' + exchange_to)) + '</p>' +
      '<p><strong>Reseau :</strong> ' + (network || exchange_network_from || 'N/A') + '</p>' +
      (amount_usd ? '<p><strong>Montant :</strong> $' + amount_usd + ' soit ' + amount_cfa + ' FCFA</p>' : '') +
      '<p><strong>Wallet client :</strong> ' + (wallet_address || 'N/A') + '</p>' +
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
      '💎 <b>Crypto :</b> ' + (crypto || (exchange_from + ' → ' + exchange_to)) + '\n' +
      '🌐 <b>Reseau :</b> ' + (network || exchange_network_from || 'N/A') + '\n' +
      '💵 <b>Montant :</b> ' + (amount_usd ? '$' + amount_usd + '  (~' + amount_cfa + ' FCFA)' : 'Echange') + '\n' +
      '🔗 <b>Wallet :</b> <code>' + (wallet_address || 'N/A') + '</code>\n' +
      (referrer ? '🎁 <b>Parrain :</b> ' + referrer + '\n' : '') +
      sep + '\n' +
      '⏰ ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
    ).catch(function(e) { console.error('Telegram erreur:', e.message); });

    res.json({ success: true, order_id: id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const { id, type, status, crypto, amount_usd, amount_cfa, created_at } = order;
  res.json({ id, type, status, crypto, amount_usd, amount_cfa, created_at });
});

// ─── PAIEMENTS INTERNATIONAUX ─────────────────────────────────
app.post('/api/payments', upload.single('screenshot'), async (req, res) => {
  try {
    const { email, phone, service, details, amount_usd, amount_cfa, note, referrer } = req.body;
    const id  = uuidv4();
    const now = new Date().toISOString();

    await dbConn.collection('orders').insertOne({
      id, type: 'payment', email,
      phone:      phone || '',
      service:    service || '',
      details:    details || '',
      amount_usd: parseFloat(amount_usd) || 0,
      amount_cfa: parseFloat(amount_cfa) || 0,
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
      '<p><strong>Montant :</strong> $' + amount_usd + ' = ' + amount_cfa + ' FCFA</p>' +
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
      '<p><strong>Montant :</strong> $' + amount_usd + ' = ' + amount_cfa + ' FCFA</p>' +
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
      '💵 <b>Montant :</b> $' + amount_usd + '  (~' + amount_cfa + ' FCFA)\n' +
      (note ? '📝 <b>Note :</b> ' + note + '\n' : '') +
      '───────────────────\n' +
      '⏰ ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
    ).catch(function(e) { console.error('Telegram erreur:', e.message); });

    res.json({ success: true, order_id: id });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Historique transactions par email (client)
app.get('/api/my-orders', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const orders = await dbConn.collection('orders')
    .find({ email: email })
    .sort({ created_at: -1 })
    .toArray();
  res.json({ orders });
});

// Stats parrainage
app.get('/api/referral-stats', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.json({ total: 0, validated: 0 });
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

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getAdmin(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Identifiants incorrects' });
  const token = jwt.sign({ username }, process.env.JWT_SECRET || 'congoswap_secret', { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/admin/orders', authRequired, async (req, res) => {
  const { status, type, page = 1 } = req.query;
  const result = await db.getOrders({ status, type, limit: 20, offset: (page - 1) * 20 });
  res.json(result);
});

app.patch('/api/admin/orders/:id', authRequired, async (req, res) => {
  const { status, notes } = req.body;
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Introuvable' });
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
  try {
    const doc = await dbConn.collection('config').findOne({ key: 'rates' });
    if (doc) res.json(doc.value);
    else res.json({ buy: 630, sell: 575, exchange: 2 });
  } catch(e) { res.json({ buy: 630, sell: 575, exchange: 2 }); }
});

// Taux — mise a jour
app.post('/api/admin/rates', authRequired, async (req, res) => {
  try {
    const { buy, sell, exchange } = req.body;
    await dbConn.collection('config').updateOne(
      { key: 'rates' },
      { $set: { key: 'rates', value: { buy, sell, exchange } } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Taux publics (pour le frontend)
app.get('/api/rates', async (req, res) => {
  try {
    const doc = await dbConn.collection('config').findOne({ key: 'rates' });
    if (doc) res.json(doc.value);
    else res.json({ buy: 630, sell: 575, exchange: 2 });
  } catch(e) { res.json({ buy: 630, sell: 575, exchange: 2 }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── TELEGRAM WEBHOOK ─────────────────────────────────────────
app.post('/webhook/telegram', (req, res) => {
  if (global.telegramBot) {
    global.telegramBot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

connectDB().then(function() {
  app.listen(PORT, function() { console.log('CongoSwap backend running on port ' + PORT); });
  // Lancer le bot Telegram dans le même processus
  require('./bot.js');
}).catch(function(e) { console.error('Erreur MongoDB:', e.message); process.exit(1); });

module.exports = { sendEmail, sendTelegram };

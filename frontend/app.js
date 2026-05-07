// ─── CONFIG ───────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
const SUPPORT_PHONE = '+242 06 114 9792';

const RATES = { buy: 630, sell: 575, exchange: 2, payment: 700 };

const CRYPTOS = {
  BTC:  { name: 'Bitcoin',      symbol: 'BTC',  coingecko: 'bitcoin',     icon: '₿' },
  ETH:  { name: 'Ethereum',     symbol: 'ETH',  coingecko: 'ethereum',    icon: 'Ξ' },
  USDT: { name: 'Tether USD',   symbol: 'USDT', coingecko: 'tether',      icon: '₮' },
  BNB:  { name: 'Binance Coin', symbol: 'BNB',  coingecko: 'binancecoin', icon: 'B' },
  SOL:  { name: 'Solana',       symbol: 'SOL',  coingecko: 'solana',      icon: 'S' },
  XRP:  { name: 'Ripple',       symbol: 'XRP',  coingecko: 'ripple',      icon: 'X' },
};

const NETWORKS = {
  BTC:  ['Bitcoin (BTC)'],
  ETH:  ['Ethereum (ERC-20)', 'Arbitrum', 'Optimism'],
  USDT: ['Ethereum (ERC-20)', 'Tron (TRC-20)', 'BNB Smart Chain (BEP-20)'],
  BNB:  ['BNB Smart Chain (BEP-20)', 'Ethereum (ERC-20)'],
  SOL:  ['Solana'],
  XRP:  ['Ripple (XRP)'],
};

const WALLET_ADDRESSES = {
  BTC:  { address: '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',          network: 'Bitcoin (BTC)' },
  ETH:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'Ethereum (ERC-20)' },
  USDT: { address: 'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',           network: 'Tron (TRC-20)' },
  BNB:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'BNB Smart Chain (BEP-20)' },
  SOL:  { address: '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5', network: 'Solana' },
  XRP:  { address: 'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',           network: 'Ripple (XRP)' },
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

function getWalletAddress(crypto, network) {
  if (network && WALLET_BY_NETWORK[network]) return WALLET_BY_NETWORK[network];
  return WALLET_ADDRESSES[crypto] ? WALLET_ADDRESSES[crypto].address : '';
}

// ─── PRIX ─────────────────────────────────────────────────────
var _prices = {};
var _ratesLoaded = false;
var otpAccessTokens = {};

async function loadPrices() {
  try {
    const r = await fetch(API + '/api/prices');
    _prices = await r.json();
  } catch(e) {}
  return _prices;
}

async function loadRates() {
  try {
    const r = await fetch(API + '/api/rates');
    const data = await r.json();
    if (data && typeof data === 'object') {
      Object.assign(RATES, data);
      _ratesLoaded = true;
    }
  } catch(e) {}
  return RATES;
}

function getUsdPrice(sym) {
  var map = { BTC:'bitcoin', ETH:'ethereum', USDT:'tether', BNB:'binancecoin', SOL:'solana', XRP:'ripple' };
  var k = map[sym] || sym;
  return (_prices[k] && _prices[k].usd) ? _prices[k].usd : 0;
}

// ─── HELPERS ──────────────────────────────────────────────────
function formatCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function formatUSD(n) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(n);
}

// ─── NAV ──────────────────────────────────────────────────────
function buildNavHTML(activePage) {
  return '<nav>' +
    '<a class="logo" href="/index.html">Congo<span>Swap</span></a>' +
    '<ul>' +
    '<li><a href="/index.html" class="' + (activePage==='home'?'active':'') + '">Accueil</a></li>' +
    '<li><a href="/buy.html" class="' + (activePage==='buy'?'active':'') + '">Acheter</a></li>' +
    '<li><a href="/sell.html" class="' + (activePage==='sell'?'active':'') + '">Vendre</a></li>' +
    '<li><a href="/exchange.html" class="' + (activePage==='exchange'?'active':'') + '">Echanger</a></li>' +
    '<li><a href="/payment.html" class="' + (activePage==='payment'?'active':'') + '">Abonnements</a></li>' +
    '<li><a href="/parrainage.html" class="' + (activePage==='parrainage'?'active':'') + '">Parrainage</a></li>' +
    '<li><a href="/historique.html" class="' + (activePage==='historique'?'active':'') + '">Mes transactions</a></li>' +
    '<li><a href="/contact.html" class="' + (activePage==='contact'?'active':'') + '">Contact</a></li>' +
    '<li><a href="/buy.html" class="nav-cta btn">Commencer</a></li>' +
    '</ul>' +
    '<button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>' +
    '</nav>' +
    '<div class="nav-drawer" id="nav-drawer">' +
    '<a href="/index.html">Accueil</a>' +
    '<a href="/buy.html">💸 Acheter des cryptos</a>' +
    '<a href="/sell.html">💰 Vendre mes cryptos</a>' +
    '<a href="/exchange.html">🔄 Echanger</a>' +
    '<a href="/payment.html">💳 Abonnements</a>' +
    '<a href="/parrainage.html">🎁 Parrainage</a>' +
    '<a href="/historique.html">📋 Mes transactions</a>' +
    '<a href="/contact.html">💬 Contact & FAQ</a>' +
    '<a href="/buy.html" class="nav-drawer-cta">Commencer maintenant</a>' +
    '</div>';
}

function buildFooterHTML() {
  return '<footer>' +
    '<a class="logo" href="/index.html">Congo<span>Swap</span></a>' +
    '<p>© ' + new Date().getFullYear() + ' CongoSwap · République du Congo</p>' +
    '<p>Les prix sont indicatifs et mis à jour en temps réel.</p>' +
    '<p style="margin-top:8px;font-size:.78rem;">' +
    '<a href="/legal.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Conditions</a>·' +
    '<a href="/legal.html?tab=privacy" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Confidentialité</a>·' +
    '<a href="/contact.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Contact</a>·' +
    '<a href="/status.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Statut</a>' +
    '</p>' +
    '</footer>';
}

// ─── SELECTS ──────────────────────────────────────────────────
function populateCryptoSelect(selectEl, withAll) {
  selectEl.innerHTML = withAll ? '<option value="">Toutes les cryptos</option>' : '<option value="">Choisir une crypto...</option>';
  Object.entries(CRYPTOS).forEach(function(e) {
    var sym = e[0]; var c = e[1];
    var opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = c.name + ' (' + sym + ')';
    selectEl.appendChild(opt);
  });
}

function populateNetworkSelect(networkEl, crypto) {
  networkEl.innerHTML = '<option value="">Choisir un réseau...</option>';
  (NETWORKS[crypto] || []).forEach(function(n) {
    var opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    networkEl.appendChild(opt);
  });
}

// ─── TICKER ───────────────────────────────────────────────────
function buildTicker() {
  var items = Object.entries(CRYPTOS).map(function(e) {
    var sym = e[0];
    var price = getUsdPrice(sym);
    var cfa = price * RATES.buy;
    return '<div class="ticker-item"><span class="ticker-name">' + sym + '</span><span>' + (price ? formatCFA(cfa) : '---') + '</span><span class="up">▲</span></div>';
  }).join('');
  return '<div class="ticker-inner">' + items + items + '</div>';
}

// ─── UI HELPERS ───────────────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>Envoi...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origText || 'Envoyer';
    btn.disabled = false;
  }
}

function goToWaiting(orderId) {
  window.location.href = '/waiting.html?id=' + orderId;
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(function() { alert('Copié !'); }).catch(function() {
    prompt('Copiez ce texte :', text);
  });
}

function getOtpCacheKey(email, purpose) {
  return purpose + ':' + email.toLowerCase();
}

function getOtpAccessToken(email, purpose) {
  return otpAccessTokens[getOtpCacheKey(email, purpose)] || '';
}

function setOtpAccessToken(email, purpose, token) {
  otpAccessTokens[getOtpCacheKey(email, purpose)] = token;
}

// ─── PARRAINAGE ───────────────────────────────────────────────
(function() {
  var params = new URLSearchParams(window.location.search);
  var from = params.get('from');
  if (from) sessionStorage.setItem('cs_referrer', from);
})();

function getReferrer() {
  return sessionStorage.getItem('cs_referrer') || '';
}

// ─── OTP ──────────────────────────────────────────────────────
var otpVerified = {};

async function requestOTP(email, purpose) {
  try {
    const r = await fetch(API + '/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, purpose: purpose || 'history' })
    });
    return r.ok;
  } catch(e) { return false; }
}

async function showOTPModal(email, onSuccess, purpose) {
  purpose = purpose || 'history';
  var key = getOtpCacheKey(email, purpose);
  if (otpVerified[key] && getOtpAccessToken(email, purpose)) {
    onSuccess(getOtpAccessToken(email, purpose));
    return;
  }
  await requestOTP(email, purpose);
  var modal = document.createElement('div');
  modal.id = 'otp-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--dark3);border:1px solid var(--border);border-top:2px solid var(--gold);padding:32px;max-width:380px;width:100%;text-align:center;">' +
    '<div style="font-size:2rem;margin-bottom:12px;">📧</div>' +
    '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:8px;">Verification email</div>' +
    '<p style="color:var(--text-dim);font-size:.86rem;margin-bottom:20px;">Code envoye a <strong>' + email + '</strong></p>' +
    '<input type="text" id="otp-input" maxlength="6" placeholder="000000" style="width:100%;text-align:center;font-family:monospace;font-size:1.8rem;letter-spacing:8px;background:var(--dark);border:1px solid var(--border);color:var(--text);padding:14px;margin-bottom:14px;"/>' +
    '<button onclick="verifyOTP(\'' + email + '\', \'' + purpose + '\')" class="btn btn-gold btn-full" style="margin-bottom:10px;">Verifier</button>' +
    '<div id="otp-error" style="color:var(--red);font-size:.82rem;margin-top:8px;"></div>' +
    '</div>';
  window._otpCallback = onSuccess;
  window._otpPurpose = purpose;
  document.body.appendChild(modal);
}

async function verifyOTP(email, purpose) {
  var code = document.getElementById('otp-input').value.trim();
  if (code.length !== 6) { document.getElementById('otp-error').textContent = 'Entrez les 6 chiffres.'; return; }
  try {
    const r = await fetch(API + '/api/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code, purpose: purpose || 'history' })
    });
    const data = await r.json();
    if (data.success && data.access_token) {
      var key = getOtpCacheKey(email, purpose || 'history');
      otpVerified[key] = true;
      setOtpAccessToken(email, purpose || 'history', data.access_token);
      document.getElementById('otp-modal').remove();
      if (window._otpCallback) window._otpCallback(data.access_token);
    } else {
      document.getElementById('otp-error').textContent = data.error || 'Code incorrect. Reessayez.';
    }
  } catch(e) {
    document.getElementById('otp-error').textContent = 'Erreur. Reessayez.';
  }
}

// ─── HAMBURGER ────────────────────────────────────────────────
function initNavDrawer() {
  var btn = document.getElementById('hamburger');
  var drawer = document.getElementById('nav-drawer');
  if (!btn || !drawer) return;
  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    btn.classList.toggle('open');
    drawer.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (btn && drawer && !btn.contains(e.target) && !drawer.contains(e.target)) {
      btn.classList.remove('open');
      drawer.classList.remove('open');
    }
  });
}

window.initNavDrawer = initNavDrawer;
document.addEventListener('DOMContentLoaded', initNavDrawer);

// ─── GOOGLE ANALYTICS ─────────────────────────────────────────
(function() {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-5858WNL8PS';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', 'G-5858WNL8PS');
})();

// ─── KEEP-ALIVE ───────────────────────────────────────────────
setInterval(function() {
  fetch(API + '/api/prices').catch(function(){});
}, 10 * 60 * 1000);

// ─── CHAT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.createElement('div');
  btn.style.cssText = 'position:fixed;bottom:100px;right:28px;width:52px;height:52px;background:var(--dark3);border:2px solid var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:996;font-size:1.3rem;box-shadow:0 4px 16px rgba(0,0,0,.4);';
  btn.textContent = '💬';

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:168px;right:28px;width:300px;background:var(--dark2);border:1px solid var(--border);border-top:2px solid var(--gold);z-index:995;display:none;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  panel.innerHTML =
    '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
    '<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:.9rem;">Support CongoSwap</div>' +
    '<div style="font-size:.72rem;color:var(--green);">● En ligne</div></div>' +
    '<button id="chat-close" style="background:none;border:none;color:var(--text-dim);cursor:pointer;">✕</button></div>' +
    '<div id="chat-msgs" style="padding:14px;height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>' +
    '<div style="padding:8px;border-top:1px solid var(--border);display:flex;gap:6px;">' +
    '<input id="chat-input" type="text" placeholder="Votre message..." style="flex:1;background:var(--dark);border:1px solid var(--border);color:var(--text);padding:8px;font-size:.82rem;"/>' +
    '<button id="chat-send" style="background:var(--gold);border:none;color:var(--dark);padding:8px 12px;cursor:pointer;font-weight:700;">→</button>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function addMsg(from, text) {
    var msgs = document.getElementById('chat-msgs');
    var el = document.createElement('div');
    var isBot = from === 'bot';
    el.style.cssText = 'max-width:85%;padding:8px 10px;font-size:.82rem;line-height:1.5;' +
      (isBot ? 'background:var(--dark3);align-self:flex-start;border-left:2px solid var(--gold);' : 'background:var(--gold);color:var(--dark);align-self:flex-end;font-weight:600;');
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function sendMsg() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;
    addMsg('user', text);
    input.value = '';
    var lower = text.toLowerCase();
    setTimeout(function() {
      if (lower.includes('achat') || lower.includes('acheter')) addMsg('bot', 'Pour acheter : ' + RATES.buy + ' FCFA/$. Minimum $5. Rendez-vous sur la page Acheter.');
      else if (lower.includes('vente') || lower.includes('vendre')) addMsg('bot', 'Pour vendre : ' + RATES.sell + ' FCFA/$. Minimum $5. Rendez-vous sur la page Vendre.');
      else if (lower.includes('abonnement') || lower.includes('netflix') || lower.includes('spotify')) addMsg('bot', 'Abonnements disponibles à ' + RATES.payment + ' FCFA/$. Voir la page Abonnements.');
      else if (lower.includes('taux') || lower.includes('prix')) addMsg('bot', 'Achat : ' + RATES.buy + ' FCFA/$ · Vente : ' + RATES.sell + ' FCFA/$ · Abonnements : ' + RATES.payment + ' FCFA/$');
      else addMsg('bot', 'Pour une aide rapide : WhatsApp ' + SUPPORT_PHONE);
    }, 600);
  }

  btn.onclick = function() {
    var open = panel.style.display === 'flex';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) {
      if (!document.getElementById('chat-msgs').children.length) {
        addMsg('bot', 'Bonjour ! Comment puis-je vous aider ? 👋');
      }
      document.getElementById('chat-input').focus();
    }
  };

  document.getElementById('chat-close').onclick = function() { panel.style.display = 'none'; };
  document.getElementById('chat-send').onclick = sendMsg;
  document.getElementById('chat-input').onkeydown = function(e) { if (e.key === 'Enter') sendMsg(); };
});

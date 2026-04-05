// ─── CONFIG ───────────────────────────────────────────────────
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : ''; // Same origin in production

const RATES = { buy: 630, sell: 575, exchange: 2 };

// Charger les taux depuis le backend
(async function loadRatesFromAPI() {
  try {
    const r = await fetch((window.location.hostname === 'localhost' ? 'http://localhost:3000' : '') + '/api/rates');
    const data = await r.json();
    if (data.buy)  RATES.buy  = data.buy;
    if (data.sell) RATES.sell = data.sell;
    if (data.exchange) RATES.exchange = data.exchange;
  } catch(e) {}
})();

const CRYPTOS = {
  BTC:  { name: 'Bitcoin',       symbol: 'BTC', icon: '₿',  coingecko: 'bitcoin' },
  ETH:  { name: 'Ethereum',      symbol: 'ETH', icon: 'Ξ',  coingecko: 'ethereum' },
  USDT: { name: 'Tether USD',    symbol: 'USDT',icon: '₮',  coingecko: 'tether' },
  BNB:  { name: 'Binance Coin',  symbol: 'BNB', icon: '◈',  coingecko: 'binancecoin' },
  SOL:  { name: 'Solana',        symbol: 'SOL', icon: '◎',  coingecko: 'solana' },
  XRP:  { name: 'Ripple',        symbol: 'XRP', icon: '✕',  coingecko: 'ripple' },
};

const NETWORKS = {
  BTC:  ['Bitcoin (BTC)'],
  ETH:  ['Ethereum (ERC-20)', 'Arbitrum', 'Optimism'],
  USDT: ['Ethereum (ERC-20)', 'Tron (TRC-20)', 'BNB Smart Chain (BEP-20)'],
  BNB:  ['BNB Smart Chain (BEP-20)', 'Ethereum (ERC-20)'],
  SOL:  ['Solana'],
  XRP:  ['Ripple (XRP)'],
};

// Adresses par réseau
const WALLET_ADDRESSES = {
  BTC:  { address: '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',          network: 'Bitcoin (BTC)' },
  ETH:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'Ethereum (ERC-20)' },
  USDT: { address: 'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',           network: 'Tron (TRC-20)' },
  BNB:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'BNB Smart Chain (BEP-20)' },
  SOL:  { address: '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5', network: 'Solana' },
  XRP:  { address: 'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',           network: 'Ripple (XRP)' },
};

// Adresses par réseau (pour USDT multi-réseau)
const WALLET_BY_NETWORK = {
  'Bitcoin (BTC)':             '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',
  'Ethereum (ERC-20)':         '0x90439961b090f8b51c28023e30213e318db227f3',
  'Arbitrum':                  '0x90439961b090f8b51c28023e30213e318db227f3',
  'Optimism':                  '0x90439961b090f8b51c28023e30213e318db227f3',
  'Tron (TRC-20)':             'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',
  'BNB Smart Chain (BEP-20)':  '0x90439961b090f8b51c28023e30213e318db227f3',
  'Solana':                    '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5',
  'Ripple (XRP)':              'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',
};

function getWalletAddress(crypto, network) {
  // Priorité : adresse par réseau si disponible
  if (network && WALLET_BY_NETWORK[network]) return WALLET_BY_NETWORK[network];
  return WALLET_ADDRESSES[crypto]?.address || '';
}

// ─── PRICE CACHE ──────────────────────────────────────────────
let _prices = {};
let _priceLoaded = false;

async function loadPrices() {
  try {
    const r = await fetch(`${API}/api/prices`);
    _prices = await r.json();
    _priceLoaded = true;
  } catch(e) {
    console.error('Prix non disponibles', e);
  }
  return _prices;
}

function getUsdPrice(coinId) {
  const map = {
    BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether',
    BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple'
  };
  const key = map[coinId] || coinId;
  return _prices[key]?.usd || 0;
}

// ─── HELPERS ──────────────────────────────────────────────────
function formatCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function formatUSD(n) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(n);
}

function buildNavHTML(activePage) {
  return `
  <nav>
    <a class="logo" href="/">Congo<span>Swap</span></a>
    <ul>
      <li><a href="/" class="${activePage==='home'?'active':''}">Accueil</a></li>
      <li><a href="/buy.html" class="${activePage==='buy'?'active':''}">Acheter</a></li>
      <li><a href="/sell.html" class="${activePage==='sell'?'active':''}">Vendre</a></li>
      <li><a href="/exchange.html" class="${activePage==='exchange'?'active':''}">Échanger</a></li>
      <li><a href="/payment.html" class="${activePage==='payment'?'active':''}">Paiement intl.</a></li>
      <li><a href="/parrainage.html" class="${activePage==='parrainage'?'active':''}">Parrainage</a></li>
      <li><a href="/historique.html" class="${activePage==='historique'?'active':''}">Mes transactions</a></li>
      <li><a href="/contact.html" class="${activePage==='contact'?'active':''}">Contact</a></li>
      <li><a href="/buy.html" class="nav-cta btn">Commencer</a></li>
    </ul>
    <button class="hamburger" id="hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </nav>
  <div class="nav-drawer" id="nav-drawer">
    <a href="/" class="${activePage==='home'?'active':''}">Accueil</a>
    <a href="/buy.html" class="${activePage==='buy'?'active':''}">💸 Acheter des cryptos</a>
    <a href="/sell.html" class="${activePage==='sell'?'active':''}">💰 Vendre mes cryptos</a>
    <a href="/exchange.html" class="${activePage==='exchange'?'active':''}">🔄 Échanger</a>
    <a href="/payment.html" class="${activePage==='payment'?'active':''}">💳 Paiement international</a>
    <a href="/parrainage.html" class="${activePage==='parrainage'?'active':''}">🎁 Parrainage</a>
    <a href="/historique.html" class="${activePage==='historique'?'active':''}">📋 Mes transactions</a>
    <a href="/contact.html" class="${activePage==='contact'?'active':''}">💬 Contact & FAQ</a>
    <a href="/buy.html" class="nav-drawer-cta">Commencer maintenant</a>
  </div>`;
}

function buildFooterHTML() {
  return `
  <footer>
    <a class="logo" href="/">Congo<span>Swap</span></a>
    <p>© ${new Date().getFullYear()} CongoSwap · République du Congo</p>
    <p>Les prix sont indicatifs et mis à jour en temps réel.</p>
    <p style="margin-top:8px;font-size:.78rem;">
      <a href="/legal.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Conditions d'utilisation</a>·
      <a href="/legal.html?tab=privacy" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Confidentialité</a>·
      <a href="/contact.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Contact</a>·
      <a href="/status.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Statut</a>
    </p>
  </footer>`;
}

// Populate crypto select
function populateCryptoSelect(selectEl, withAll = false) {
  if (withAll) selectEl.innerHTML = '<option value="">Toutes les cryptos</option>';
  else selectEl.innerHTML = '<option value="">Choisir une crypto...</option>';
  Object.entries(CRYPTOS).forEach(([sym, c]) => {
    const opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = `${c.icon} ${c.name} (${sym})`;
    selectEl.appendChild(opt);
  });
}

// Populate network select based on crypto
function populateNetworkSelect(networkEl, crypto) {
  networkEl.innerHTML = '<option value="">Choisir un réseau...</option>';
  (NETWORKS[crypto] || []).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    networkEl.appendChild(opt);
  });
}

// Ticker builder
function buildTicker(prices) {
  const items = Object.entries(CRYPTOS).map(([sym, c]) => {
    const price = getUsdPrice(sym);
    const cfa = price * RATES.buy;
    return `
      <div class="ticker-item">
        <span class="ticker-name">${sym}</span>
        <span>${price ? formatCFA(cfa) : '---'}</span>
        <span class="up">▲</span>
      </div>`;
  }).join('');
  return `<div class="ticker-inner">${items}${items}</div>`;
}

// Show spinner on button
function setLoading(btn, loading) {
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>Envoi...`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origText || 'Envoyer';
    btn.disabled = false;
  }
}

// Go to waiting page
function goToWaiting(orderId) {
  window.location.href = '/waiting.html?id=' + orderId;
}

// ─── OTP VERIFICATION ─────────────────────────────────────────
let otpVerified = {};

async function requestOTP(email) {
  const r = await fetch(API + '/api/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return r.ok;
}

async function showOTPModal(email, onSuccess) {
  // Si déjà vérifié dans cette session
  if (otpVerified[email]) { onSuccess(); return; }

  await requestOTP(email);

  const modal = document.createElement('div');
  modal.id = 'otp-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--dark3);border:1px solid var(--border);border-top:2px solid var(--gold);padding:32px;max-width:380px;width:100%;text-align:center;">' +
    '<div style="font-size:2rem;margin-bottom:12px;">📧</div>' +
    '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:8px;">Vérification email</div>' +
    '<p style="color:var(--text-dim);font-size:.86rem;margin-bottom:20px;">Un code à 6 chiffres a été envoyé à <strong>' + email + '</strong></p>' +
    '<input type="text" id="otp-input" maxlength="6" placeholder="_ _ _ _ _ _" style="width:100%;text-align:center;font-family:monospace;font-size:1.8rem;letter-spacing:8px;background:var(--dark);border:1px solid var(--border);color:var(--text);padding:14px;margin-bottom:14px;"/>' +
    '<button onclick="verifyOTP(\'' + email + '\')" class="btn btn-gold btn-full" style="margin-bottom:10px;">Vérifier</button>' +
    '<button onclick="requestOTP(\'' + email + '\').then(function(){alert(\'Code renvoyé !\')})" style="background:none;border:none;color:var(--text-dim);font-size:.82rem;cursor:pointer;text-decoration:underline;">Renvoyer le code</button>' +
    '<div id="otp-error" style="color:var(--red);font-size:.82rem;margin-top:8px;"></div>' +
    '</div>';

  modal.dataset.callback = 'pending';
  window._otpCallback = onSuccess;
  document.body.appendChild(modal);
}

async function verifyOTP(email) {
  const code = document.getElementById('otp-input').value.trim();
  if (code.length !== 6) { document.getElementById('otp-error').textContent = 'Entrez les 6 chiffres.'; return; }

  const r = await fetch(API + '/api/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const data = await r.json();

  if (data.success) {
    otpVerified[email] = true;
    document.getElementById('otp-modal').remove();
    if (window._otpCallback) window._otpCallback();
  } else {
    document.getElementById('otp-error').textContent = data.error === 'Code expire' ? 'Code expiré. Renvoyez-en un.' : 'Code incorrect. Réessayez.';
  }
}

// ─── PARRAINAGE ───────────────────────────────────────────────
// Capturer le referrer depuis l'URL et le stocker
(function captureReferrer() {
  const params = new URLSearchParams(window.location.search);
  const from   = params.get('from'); // email du parrain
  if (from) sessionStorage.setItem('cs_referrer', from);
})();

function getReferrer() {
  return sessionStorage.getItem('cs_referrer') || '';
}

// ─── PWA ──────────────────────────────────────────────────────
// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      console.log('SW enregistre:', reg.scope);
    }).catch(function(e) {
      console.log('SW erreur:', e);
    });
  });
}

// Bouton d'installation PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  // Afficher le bouton d'installation si pas encore installé
  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById('pwa-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:16px;right:16px;background:#1a1a1a;border:1px solid #C9A84C;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:998;border-radius:2px;box-shadow:0 4px 20px rgba(0,0,0,.5);';
  banner.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;">' +
      '<img src="/assets/favicon_192.png" style="width:36px;height:36px;border-radius:4px;"/>' +
      '<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:.9rem;color:#f0ede6;">Installer CongoSwap</div>' +
      '<div style="font-size:.75rem;color:#8a8578;">Ajoutez l\'app sur votre écran d\'accueil</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button onclick="installPWA()" style="background:#C9A84C;color:#0a0a0a;border:none;padding:8px 14px;font-family:\'Syne\',sans-serif;font-weight:700;font-size:.78rem;cursor:pointer;">Installer</button>' +
      '<button onclick="document.getElementById(\'pwa-banner\').remove()" style="background:none;border:1px solid #3a3a3a;color:#8a8578;padding:8px 10px;cursor:pointer;font-size:.78rem;">✕</button>' +
    '</div>';
  document.body.appendChild(banner);
}

async function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.remove();
}

// ─── PWA ──────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(e) {
      console.log('SW erreur:', e);
    });
  });
}

// ─── CHAT EN DIRECT ───────────────────────────────────────────
(function initChat() {
  const CHAT_MESSAGES = [
    { from: 'bot', text: 'Bonjour ! Comment puis-je vous aider ? 👋', delay: 500 },
  ];

  const btn = document.createElement('div');
  btn.id = 'chat-btn';
  btn.innerHTML = '💬';
  btn.style.cssText = 'position:fixed;bottom:100px;right:28px;width:52px;height:52px;background:var(--dark3);border:2px solid var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:998;font-size:1.3rem;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:transform .2s;';
  btn.onmouseover = function() { this.style.transform = 'scale(1.1)'; };
  btn.onmouseout  = function() { this.style.transform = 'scale(1)'; };

  const badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:var(--red);border-radius:50%;font-size:.6rem;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;';
  badge.textContent = '1';
  btn.style.position = 'fixed';
  btn.appendChild(badge);

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.style.cssText = 'position:fixed;bottom:168px;right:28px;width:300px;background:var(--dark2);border:1px solid var(--border);border-top:2px solid var(--gold);z-index:997;display:none;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  panel.innerHTML =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:.9rem;">Support CongoSwap</div>' +
      '<div style="font-size:.72rem;color:var(--green);">● En ligne · Rép. en &lt;30min</div></div>' +
      '<button onclick="toggleChat()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem;">✕</button>' +
    '</div>' +
    '<div id="chat-msgs" style="padding:14px;height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;"></div>' +
    '<div style="padding:10px;border-top:1px solid var(--border);display:flex;gap:8px;">' +
      '<input id="chat-input" type="text" placeholder="Votre message..." onkeydown="if(event.key===\'Enter\')sendChatMsg()" style="flex:1;background:var(--dark);border:1px solid var(--border);color:var(--text);padding:8px 10px;font-size:.82rem;"/>' +
      '<button onclick="sendChatMsg()" style="background:var(--gold);border:none;color:var(--dark);padding:8px 12px;cursor:pointer;font-weight:700;font-size:.82rem;">→</button>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // Message de bienvenue après 3s
  setTimeout(function() {
    addChatMsg('bot', 'Bonjour ! Besoin d\'aide pour un échange ou un abonnement ? 👋');
    badge.style.display = 'flex';
  }, 3000);

  window.toggleChat = function() {
    const isOpen = panel.style.display === 'flex';
    panel.style.display = isOpen ? 'none' : 'flex';
    badge.style.display = 'none';
    if (!isOpen) document.getElementById('chat-input').focus();
  };

  btn.onclick = window.toggleChat;

  window.addChatMsg = function(from, text) {
    const msgs = document.getElementById('chat-msgs');
    const el   = document.createElement('div');
    const isBot = from === 'bot';
    el.style.cssText = 'max-width:85%;padding:8px 12px;border-radius:2px;font-size:.82rem;line-height:1.5;' +
      (isBot ? 'background:var(--dark3);color:var(--text);align-self:flex-start;border-left:2px solid var(--gold);' : 'background:var(--gold);color:var(--dark);align-self:flex-end;font-weight:600;');
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  };

  window.sendChatMsg = function() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    addChatMsg('user', text);
    input.value = '';

    // Réponses automatiques
    const lower = text.toLowerCase();
    setTimeout(function() {
      if (lower.includes('achat') || lower.includes('acheter')) {
        addChatMsg('bot', 'Pour acheter des cryptos, rendez-vous sur la page Acheter. Taux fixe : 630 FCFA/$. Minimum $5.');
      } else if (lower.includes('vente') || lower.includes('vendre')) {
        addChatMsg('bot', 'Pour vendre vos cryptos, allez sur la page Vendre. Vous recevez 575 FCFA/$.');
      } else if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('abonnement')) {
        addChatMsg('bot', 'Nos abonnements sont disponibles sur la page Abonnements. Taux : 700 FCFA/$.');
      } else if (lower.includes('taux') || lower.includes('prix')) {
        addChatMsg('bot', 'Achat : 630 FCFA/$ · Vente : 575 FCFA/$ · Abonnements : 700 FCFA/$');
      } else if (lower.includes('delai') || lower.includes('temps') || lower.includes('combien')) {
        addChatMsg('bot', 'Les transactions sont traitées en 30 minutes à 2 heures pendant nos horaires (8h-20h).');
      } else if (lower.includes('whatsapp') || lower.includes('contact') || lower.includes('aide')) {
        addChatMsg('bot', 'Contactez-nous sur WhatsApp : +242 06 114 9792 ou via Telegram pour une réponse rapide.');
      } else {
        addChatMsg('bot', 'Merci pour votre message ! Pour une réponse rapide, contactez-nous sur WhatsApp : +242 06 114 9792');
      }
    }, 800);
  };
})();

// ─── KEEP-ALIVE (evite le cold start Render) ──────────────────
setInterval(function() {
  fetch('/api/prices').catch(function(){});
}, 10 * 60 * 1000);

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

// ─── HAMBURGER INIT ───────────────────────────────────────────
// S'exécute après que buildNavHTML a injecté le DOM
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('hamburger');
  const drawer = document.getElementById('nav-drawer');
  if (!btn || !drawer) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    btn.classList.toggle('open');
    drawer.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (!btn.contains(e.target) && !drawer.contains(e.target)) {
      btn.classList.remove('open');
      drawer.classList.remove('open');
    }
  });
});

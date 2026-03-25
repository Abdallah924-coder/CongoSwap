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
      <a href="/contact.html" style="color:var(--text-dim);text-decoration:none;margin:0 8px;">Contact</a>
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
  // Afficher le bouton d'installation si present
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', function() {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result) {
        deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    });
  }
});

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

// ─── CONFIG ───────────────────────────────────────────────────
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : ''; // Same origin in production

const RATES = {
  buy:  630,   // Client achète à 630 FCFA / $1
  sell: 575    // Client vend, reçoit 575 FCFA / $1
};

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

// Adresses de réception pour les ventes (client envoie ici)
// ⚠️ À REMPLIR avec vos vraies adresses
const WALLET_ADDRESSES = {
  BTC:  { address: '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',          network: 'Bitcoin (BTC)' },
  ETH:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'Ethereum (ERC-20)' },
  USDT: { address: 'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',           network: 'Tron (TRC-20)' },
  BNB:  { address: '0x90439961b090f8b51c28023e30213e318db227f3',    network: 'BNB Smart Chain (BEP-20)' },
  SOL:  { address: '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5', network: 'Solana' },
  XRP:  { address: 'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',           network: 'Ripple (XRP)' },
};

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
      <li><a href="/contact.html" class="${activePage==='contact'?'active':''}">Contact & FAQ</a></li>
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
    <a href="/contact.html" class="${activePage==='contact'?'active':''}">💬 Contact & FAQ</a>
    <a href="/buy.html" class="nav-drawer-cta">Commencer maintenant</a>
  </div>`;
}

function buildFooterHTML() {
  return `
  <footer>
    <a class="logo" href="index.html">Congo<span>Swap</span></a>
    <p>© ${new Date().getFullYear()} CongoSwap · République du Congo</p>
    <p>Les prix sont indicatifs et mis à jour en temps réel.</p>
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

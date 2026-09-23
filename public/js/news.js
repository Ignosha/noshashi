/* IGNOSHASHI - CRT News Terminal */
(function (global) {
  'use strict';
  const $ = global.$;
  let newsMode = 'crypto';
  let newsInterval = null;

  const cryptoNews = [
    { title: 'Bitcoin surges past $100K as institutional demand soars', time: '2m ago', tag: 'BTC' },
    { title: 'Ethereum Layer-2 hits record 10M daily transactions', time: '5m ago', tag: 'ETH' },
    { title: 'Solana memecoin market cap reaches new ATH', time: '8m ago', tag: 'SOL' },
    { title: 'SEC delays ETF decision, markets react', time: '12m ago', tag: 'REG' },
    { title: 'Major exchange lists 12 new memecoins', time: '15m ago', tag: 'LISTING' },
    { title: 'Whale moves 50K BTC to cold storage', time: '18m ago', tag: 'WHALE' },
    { title: 'DeFi protocol exploit nets attacker $2M', time: '22m ago', tag: 'SECURITY' },
    { title: 'NFT trading volume rebounds 40% weekly', time: '25m ago', tag: 'NFT' },
    { title: 'Central bank explores digital currency pilot', time: '30m ago', tag: 'CBDC' },
    { title: 'Mining difficulty adjusts amid hash rate spike', time: '35m ago', tag: 'MINING' },
    { title: 'Cross-chain bridge launches zero-knowledge proofs', time: '40m ago', tag: 'BRIDGE' },
    { title: 'Stablecoin market cap crosses $200B milestone', time: '45m ago', tag: 'STABLECOIN' },
  ];

  const memeNews = [
    { title: 'New memecoin launches on pump.fun, reaches $500K MC in 1 hour', time: '1m ago', tag: 'PUMP' },
    { title: 'Based Frog announces partnership with gaming DAO', time: '3m ago', tag: 'PARTNER' },
    { title: 'Pepe Rocket volume spikes 300% after Elon tweet', time: '6m ago', tag: 'ELON' },
    { title: 'Doge Pixel community votes for new tokenomics', time: '9m ago', tag: 'GOV' },
    { title: 'Galactic Shiba lists on major DEX', time: '14m ago', tag: 'DEX' },
    { title: 'Moon Cat NFT collection sells out in 2 minutes', time: '18m ago', tag: 'NFT' },
    { title: 'Wojak Bond launches community treasury', time: '22m ago', tag: 'TREASURY' },
    { title: 'Chad Coin holders vote for burn mechanism', time: '27m ago', tag: 'BURN' },
    { title: 'Pixel Punk devs reveal 2D metaverse roadmap', time: '31m ago', tag: 'METAVERSE' },
    { title: 'Astro Dog reaches 10K holders milestone', time: '36m ago', tag: 'HOLDERS' },
    { title: 'Neon Pepe art competition winners announced', time: '41m ago', tag: 'ART' },
    { title: 'Rocket Hamster partners with blockchain game', time: '47m ago', tag: 'GAME' },
  ];

  function renderNews() {
    const container = document.getElementById('newsContent');
    if (!container) return;
    const items = newsMode === 'crypto' ? cryptoNews : memeNews;
    const tagColor = newsMode === 'crypto' ? 'var(--cyan)' : 'var(--yellow)';
    container.innerHTML = items.map((n, i) => {
      const delay = (i * 0.3).toFixed(1);
      return `<div class="news-item" style="animation-delay:${delay}s">
        <span class="news-tag pixel tiny" style="background:${tagColor};color:#000">${n.tag}</span>
        <span class="news-title pixel small">${n.title}</span>
        <span class="news-time pixel tiny dim">${n.time}</span>
      </div>`;
    }).join('');
  }

  document.getElementById('newsCrypto').addEventListener('click', () => {
    newsMode = 'crypto';
    document.getElementById('newsCrypto').classList.add('active');
    document.getElementById('newsMeme').classList.remove('active');
    document.getElementById('newsChannelLabel').textContent = 'CRYPTO';
    renderNews();
  });

  document.getElementById('newsMeme').addEventListener('click', () => {
    newsMode = 'meme';
    document.getElementById('newsMeme').classList.add('active');
    document.getElementById('newsCrypto').classList.remove('active');
    document.getElementById('newsChannelLabel').textContent = 'MEME';
    renderNews();
  });

  function startNewsTicker() {
    if (newsInterval) clearInterval(newsInterval);
    renderNews();
    newsInterval = setInterval(() => {
      if (document.getElementById('page-news').classList.contains('active')) {
        renderNews();
      }
    }, 30000);
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.news = function () {
    startNewsTicker();
  };
})(window);

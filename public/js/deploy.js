/* IGNOSHASHI - Wallet connect (Ethereum + Solana) + Create/Deploy */
(function (global) {
  'use strict';
  const $ = global.$;

/* ---------- Create form ---------- */
  const crName = $('#crName'), crSymbol = $('#crSymbol'), crDesc = $('#crDesc'),
        crSupply = $('#crSupply'), crImage = $('#crImage'),
        crWebsite = $('#crWebsite'), crTwitter = $('#crTwitter'), crTelegram = $('#crTelegram'),
        crBuyTax = $('#crBuyTax'), crSellTax = $('#crSellTax'), crMktTax = $('#crMktTax'),
        crMaxWallet = $('#crMaxWallet'), crRefReward = $('#crRefReward'),
        crLPLock = $('#crLPLock'), crVesting = $('#crVesting'), crHoneypot = $('#crHoneypot');
  let tokenImage = null; // base64 data URL of uploaded image

  // image upload (accepts gif/heic/png/jpg/webp/svg/any)
  crImage && crImage.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) { tokenImage = null; $('#crImagePreview').innerHTML = '<span class="pixel tiny dim">NO IMAGE SELECTED</span>'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      tokenImage = reader.result; // data URL
      const ext = (file.type || file.name.split('.').pop() || 'img').toLowerCase();
      $('#crImagePreview').innerHTML = `<img src="${tokenImage}" alt="token" class="tok-preview" />`;
      $('#pvAvatar').innerHTML = `<img src="${tokenImage}" alt="avatar" style="width:84px;height:84px;object-fit:cover;border-radius:8px;" />`;
      toast('Image loaded: ' + file.name + ' (' + ext + ')');
    };
    reader.readAsDataURL(file);
  });

  // live preview
  const keys = [crName, crSymbol, crSupply, crWebsite, crTwitter, crTelegram, crBuyTax, crSellTax, crMktTax, crMaxWallet, crRefReward, crLPLock, crVesting, crHoneypot];
  keys.forEach(el => el && el.addEventListener('input', () => {
    $('#pvName').textContent = crName.value || '-';
    $('#pvSymbol').textContent = '$' + (crSymbol.value || '-');
    $('#pvSupply').textContent = 'SUPPLY: ' + (crSupply.value ? global.fmt.num(crSupply.value) : '-');
    $('#contractPreview').textContent = buildContract();
    if (!tokenImage) $('#pvAvatar').textContent = global.fmt.avatar(crSymbol.value || 'X');
  }));

  function pct(v, max) { const n = parseInt(v) || 0; return Math.min(n, max || 25); }

  function buildContract() {
    const n = crName.value || 'MemeCoin';
    const s = crSymbol.value || 'MEME';
    const sup = crSupply.value || '1000000000';
    const feeNet = global.STATE.network;
    const fee = feeNet === 'ethereum' ? global.STATE.feeETH : global.STATE.feeSOL;
    const creator = global.STATE.wallet || '0x0';
    const buyTax = pct(crBuyTax ? crBuyTax.value : 0, 25);
    const sellTax = pct(crSellTax ? crSellTax.value : 0, 25);
    const mktTax = pct(crMktTax ? crMktTax.value : 0, 10);
    const maxWallet = parseFloat(crMaxWallet ? crMaxWallet.value : 2) || 2;
    const refReward = pct(crRefReward ? crRefReward.value : 0, 10);
    const lpLock = parseInt(crLPLock ? crLPLock.value : 0) || 0;
    const vesting = parseInt(crVesting ? crVesting.value : 0) || 0;
    const honeypot = crHoneypot ? parseInt(crHoneypot.value) : 1;
    const website = crWebsite ? crWebsite.value.trim() : '';
    const twitter = crTwitter ? crTwitter.value.trim() : '';
    const telegram = crTelegram ? crTelegram.value.trim() : '';
    const totalTax = buyTax + sellTax + mktTax;
    const warning = totalTax > 20 ? '\n    // WARNING: combined taxes exceed 20% — this may scare buyers' : '';
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${s.replace(/[^A-Za-z0-9_]/g,'_') || 'MemeCoin'} {
    string public name = "${n}";
    string public symbol = "${s}";
    uint256 public totalSupply = ${sup} * 10 ** 18;
    address public creator;
    address public constant PLATFORM = ${fee ? `"${fee.slice(0,42)}"` : '0x0'};
    uint256 public buyTax = ${buyTax}; // ${buyTax}% buy tax
    uint256 public sellTax = ${sellTax}; // ${sellTax}% sell tax
    uint256 public marketingTax = ${mktTax}; // ${mktTax}% marketing fee
    uint256 public maxWalletPercent = ${maxWallet}; // max ${maxWallet}% per wallet
    uint256 public referralReward = ${refReward}; // ${refReward}% referral bonus
    uint256 public lpLockDays = ${lpLock}; // LP locked for ${lpLock} days
    uint256 public vestingDays = ${vesting}; // Team vesting over ${vesting} days
    bool public honeypotEnabled = ${honeypot ? 'true' : 'false'}; // ${honeypot ? 'Anti-rug enabled' : 'No honeypot'}
    string public website = "${website}";
    string public twitter = "${twitter}";
    string public telegram = "${telegram}";
    mapping(address => uint) public balanceOf;
    mapping(address => uint256) public lastTradeBlock;
    constructor() {
        creator = msg.sender;
        balanceOf[msg.sender] = totalSupply;
    }${warning}
}`;
  }

  function updateCreatorPreview() {
    const creator = global.STATE.wallet || 'NOT CONNECTED';
    const el = document.getElementById('pvCreator');
    if (el) el.textContent = 'CREATOR: ' + global.fmt.shortAddr(creator);
  }

  $('#btnCreate').addEventListener('click', async () => {
    const name = crName.value.trim();
    const symbol = crSymbol.value.trim();
    if (!name || !symbol) return toast('Enter name & symbol');

    const wallet = await global.requireWallet();
    if (!wallet) return;

    updateCreatorPreview();

    const body = {
      name,
      symbol,
      supply: crSupply.value || '1000000000',
      creator: wallet,
      description: crDesc.value || '',
      network: global.STATE.network,
      address: wallet,
      image: tokenImage || undefined,
      website: crWebsite ? crWebsite.value.trim() : '',
      twitter: crTwitter ? crTwitter.value.trim() : '',
      telegram: crTelegram ? crTelegram.value.trim() : '',
      buyTax: crBuyTax ? pct(crBuyTax.value, 25) : 0,
      sellTax: crSellTax ? pct(crSellTax.value, 25) : 0,
      marketingTax: crMktTax ? pct(crMktTax.value, 10) : 0,
      maxWallet: crMaxWallet ? parseFloat(crMaxWallet.value) || 2 : 2,
      referralReward: crRefReward ? pct(crRefReward.value, 10) : 0,
      lpLock: crLPLock ? parseInt(crLPLock.value) || 0 : 0,
      vesting: crVesting ? parseInt(crVesting.value) || 0 : 0,
      honeypot: crHoneypot ? parseInt(crHoneypot.value) : 1,
    };

    try {
      toast(`Creating $${symbol} on ${global.STATE.network.toUpperCase()}... 2% fee to vault`);
      const r = await API.post('/api/create', body);
      global.STATE.tokens.unshift(r.token);
      global.refreshTokenSelects();

      // Show pump.fun publish option if on solana
      if (global.STATE.network === 'solana' && r.token && r.token.id) {
        const publishBtn = document.getElementById('btnPublishPumpCreate');
        if (publishBtn) {
          publishBtn.style.display = 'block';
          publishBtn.onclick = async () => {
            const contractAddr = r.token.id || r.token.address || '';
            try {
              const pr = await API.post('/api/pumpfun/publish', { tokenId: r.token.id, wallet, contractAddress: contractAddr, name, symbol });
              toast('Published to pump.fun! ' + pr.url);
              if (global.SoundEngine && global.SoundEngine.successBlip) global.SoundEngine.successBlip();
            } catch (e) { toast('Publish failed: ' + e.message); }
          };
        }
      }

      global.showPage('trade');
      setTimeout(() => global.selectToken(r.token.id), 100);

      // If server deployed on-chain (built-in wallet), show success
      if (r.onchain && r.onchain.address) {
        let msg = `🎉 $${symbol} launched ON-CHAIN! ${global.fmt.shortAddr(r.onchain.address)}`;
        if (r.onchain.explorer) {
          msg += `<div class="pixel tiny" style="margin-top:6px;color:#39ff88">🔗 <a href="${r.onchain.explorer}" target="_blank" rel="noopener" class="txlink">View deployment tx</a></div>`;
        }
        toast(msg);
      } else {
        toast(`🎉 $${symbol} created! Ready for bonding curve trading.`);
      }
    } catch (e) {
      toast('Create failed: ' + e.message);
    }
  });

  // initial contract preview
  $('#contractPreview').textContent = buildContract();
  updateCreatorPreview();
})(window);


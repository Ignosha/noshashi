/* IGNOSHASHI - Built-in Wallet Manager Only
 *
 * REAL keypairs generated and stored locally on the server.
 *  - Built-in ETH: Ethereum keypair
 *  - Built-in SOL: Solana keypair
 *
 * No external wallets. No MetaMask. No Phantom. No WalletConnect.
 */
(function (global) {
  'use strict';

  /* Safe access to shared state */
  function state() {
    return global.STATE || (global.STATE = {
      tokens: [], trades: [], connected: false, wallet: null, network: 'ethereum',
      platformFee: 2, feeETH: '', feeSOL: '', handlers: {},
    });
  }

  function toast(msg) {
    if (global.toast) global.toast(msg);
  }

  function currentNetwork() {
    return state().network === 'ethereum' ? 'ethereum' : 'solana';
  }
  function isEth() { return currentNetwork() === 'ethereum'; }

  function getUserId() {
    let uid = localStorage.getItem('igno_userId');
    if (!uid) {
      uid = 'user_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('igno_userId', uid);
    }
    return uid;
  }

  /* ------------------------------------------------------------------ */
  /* Profile picture management                                          */
  /* ------------------------------------------------------------------ */
  function getProfilePicKey(wallet) {
    return 'igno_profile_' + (wallet || state().wallet);
  }

  function getProfilePic(wallet) {
    const key = getProfilePicKey(wallet);
    const data = localStorage.getItem(key);
    return data || '';
  }

  function setProfilePic(wallet, url) {
    const key = getProfilePicKey(wallet);
    if (url) {
      localStorage.setItem(key, url);
    } else {
      localStorage.removeItem(key);
    }
  }

  function showProfilePicModal() {
    const s = state();
    if (!s.connected || !s.wallet) return;
    const currentPic = getProfilePic(s.wallet);
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--cyan,#32f2ff);padding:24px;max-width:360px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;">
        <div style="font-size:12px;color:var(--cyan,#32f2ff);margin-bottom:12px;">🖼️ PROFILE PICTURE</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">Upload a profile picture for your wallet.</div>
        <div id="profilePicPreview" style="width:80px;height:80px;border-radius:50%;border:3px solid var(--cyan,#32f2ff);margin:0 auto 12px;background:var(--bg2,#12121f);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:30px;">
          ${currentPic ? `<img src="${currentPic}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='👤'" />` : '👤'}
        </div>
        <input id="profilePicFile" type="file" accept="image/*" class="pixel-input" style="width:100%;margin-bottom:10px;" />
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="profilePicSave" style="background:var(--cyan,#32f2ff);color:#000;">💾 SAVE PICTURE</button>
          <button class="pixel-btn w100" id="profilePicClear" style="background:var(--red,#ff4d6d);color:#fff;">🗑️ REMOVE</button>
          <button class="pixel-btn w100" id="profilePicClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button>
        </div>
      </div>`);

    const preview = document.getElementById('profilePicPreview');
    const fileInput = document.getElementById('profilePicFile');
    let selectedFile = null;

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = () => {
          preview.innerHTML = `<img src="${reader.result}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='👤'" />`;
        };
        reader.readAsDataURL(file);
      });
    }

    modal.querySelector('#profilePicSave').addEventListener('click', async () => {
      if (!selectedFile) { toast('Select an image first'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setProfilePic(s.wallet, reader.result);
        toast('Profile picture saved');
        modal.remove();
        global.updateWalletUI && global.updateWalletUI();
      };
      reader.readAsDataURL(selectedFile);
    });

    modal.querySelector('#profilePicClear').addEventListener('click', () => {
      setProfilePic(s.wallet, '');
      toast('Profile picture removed');
      modal.remove();
      global.updateWalletUI && global.updateWalletUI();
    });

    modal.querySelector('#profilePicClose').addEventListener('click', () => modal.remove());
  }

  global.getProfilePic = getProfilePic;
  global.setProfilePic = setProfilePic;
  global.showProfilePicModal = showProfilePicModal;

  /* ------------------------------------------------------------------ */
  /* Built-in wallet helpers (server-backed, real keys)                  */
  /* ------------------------------------------------------------------ */
  async function listBuiltinWallets() {
    try {
      const net = currentNetwork();
      const uid = getUserId();
      const r = await global.API.get('/api/builtin-wallet/' + net + '?userId=' + encodeURIComponent(uid));
      return (r && r.wallets) || [];
    } catch (e) { return []; }
  }

  async function createBuiltinWallet(label) {
    const net = currentNetwork();
    const uid = getUserId();
    const r = await global.API.post('/api/builtin-wallet', { network: net, label: label || '', userId: uid });
    return r;
  }

  async function importBuiltinWallet(privateKey, seed, label) {
    const net = currentNetwork();
    const uid = getUserId();
    const r = await global.API.post('/api/builtin-wallet/import', { network: net, privateKey: privateKey || undefined, seed: seed || undefined, label: label || '', userId: uid });
    return r;
  }

  async function deleteBuiltinWallet(id) {
    try {
      const uid = getUserId();
      await global.API.del('/api/builtin-wallet/' + id + '?userId=' + encodeURIComponent(uid), {});
    } catch (e) {}
  }

  async function fetchBalance(walletId) {
    try {
      const uid = getUserId();
      const r = await global.API.get('/api/builtin-wallet/' + walletId + '/balance?userId=' + encodeURIComponent(uid));
      return r;
    } catch (e) {
      return null;
    }
  }

  function showReceiveModal(wallet) {
    const isEth = wallet.network === 'ethereum';
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--green,#39ff88);padding:24px;max-width:380px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;">
        <div style="font-size:12px;color:var(--green,#39ff88);margin-bottom:12px;">📥 RECEIVE ${isEth ? 'ETH' : 'SOL'}</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">Send ${isEth ? 'ETH' : 'SOL'} to this address. Double-check the network matches.</div>
        <div id="qrCode" style="background:#fff;padding:10px;display:inline-block;margin-bottom:12px;border-radius:4px;"></div>
        <div style="background:#000;border:1px solid var(--panel-line);padding:10px;border-radius:4px;word-break:break-all;font-size:9px;color:#32f2ff;margin-bottom:12px;">${wallet.address}</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="rcCopy" style="background:var(--cyan,#32f2ff);color:#000;">📋 COPY ADDRESS</button>
          <button class="pixel-btn w100" id="rcClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
        </div>
      </div>`);
    try {
      const qrEl = document.getElementById('qrCode');
      if (qrEl && global.QRCode) new global.QRCode(qrEl, { text: wallet.address, width: 160, height: 160 });
    } catch (e) {}
    modal.querySelector('#rcCopy').addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(wallet.address);
      else {
        const ta = document.createElement('textarea'); ta.value = wallet.address; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast('Address copied');
    });
    modal.querySelector('#rcClose').addEventListener('click', () => modal.remove());
  }

  function showSendModal(wallet) {
    const isEth = wallet.network === 'ethereum';
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--yellow,#ffe14d);padding:24px;max-width:380px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;">
        <div style="font-size:12px;color:var(--yellow,#ffe14d);margin-bottom:12px;">📤 SEND ${isEth ? 'ETH' : 'SOL'}</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">Send real ${isEth ? 'ETH' : 'SOL'} from this built-in wallet.</div>
        <div id="sendBalance" class="pixel tiny dim" style="margin-bottom:10px;">BALANCE: checking...</div>
        <input id="sendTo" class="pixel-input" placeholder="${isEth ? '0x... recipient address' : 'recipient SOL address'}" style="width:100%;margin-bottom:10px;" />
        <input id="sendAmount" class="pixel-input" type="number" step="any" placeholder="Amount" style="width:100%;margin-bottom:10px;" />
        <div id="sendResult" class="pixel tiny" style="margin-bottom:10px;min-height:16px;"></div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="sendConfirm" style="background:var(--yellow,#ffe14d);color:#000;">✅ SEND</button>
          <button class="pixel-btn w100" id="sendClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button>
        </div>
      </div>`);

    const balEl = document.getElementById('sendBalance');
    const toEl = document.getElementById('sendTo');
    const amtEl = document.getElementById('sendAmount');
    const resEl = document.getElementById('sendResult');

    fetchBalance(wallet.id).then(r => {
      if (!r) { balEl.textContent = 'BALANCE: --'; return; }
      const txt = r.network === 'ethereum' ? ('BALANCE: ' + parseFloat(r.balanceEth || 0).toFixed(6) + ' ETH') : ('BALANCE: ' + parseFloat(r.balanceSol || 0).toFixed(6) + ' SOL');
      balEl.textContent = txt;
    });

    modal.querySelector('#sendConfirm').addEventListener('click', async () => {
      const to = (toEl.value || '').trim();
      const amount = parseFloat(amtEl.value || '0');
      if (!to || !amount || amount <= 0) { toast('Enter valid recipient and amount'); return; }
      resEl.textContent = 'Sending...';
      resEl.style.color = 'var(--yellow)';
      try {
        const uid = getUserId();
        const r = await global.API.post('/api/builtin-wallet/' + wallet.id + '/send?userId=' + encodeURIComponent(uid), { to, amount });
        if (r && r.hash) {
          resEl.textContent = 'SENT! TX: ' + r.hash.substring(0, 16) + '...';
          resEl.style.color = 'var(--green)';
          toast('Sent ' + amount + ' ' + (isEth ? 'ETH' : 'SOL'));
          amtEl.value = '';
          toEl.value = '';
        } else {
          resEl.textContent = (r && r.error) ? r.error : 'Send failed';
          resEl.style.color = 'var(--red)';
        }
      } catch (e) {
        resEl.textContent = 'Error: ' + e.message;
        resEl.style.color = 'var(--red)';
      }
    });
    modal.querySelector('#sendClose').addEventListener('click', () => modal.remove());
  }

  /* Use a built-in wallet as the active connected wallet */
  function useBuiltinWallet(w) {
    const s = state();
    s.wallet = w.address;
    s.connected = true;
    s.walletType = 'builtin';
    s.walletNetwork = w.network;
    s.builtinId = w.id;
    s.builtinLabel = w.label;
    global.userKey = w.address;
    finishConnect('Built-in ' + (w.network === 'ethereum' ? 'ETH' : 'SOL'));
  }

  /* ------------------------------------------------------------------ */
  /* Connection modal & entrypoint                                       */
  /* ------------------------------------------------------------------ */
  global.connectWallet = async function () {
    const s = state();
    if (s.connected && s.wallet) {
      await showWalletMenu(true);
      return;
    }
    await showWalletMenu(false);
  };

  function buildModal(innerHTML, borderColor) {
    let modal = document.getElementById('wmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wmModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;overflow:auto;';
      document.body.appendChild(modal);
    }
    modal.style.borderColor = borderColor || '#39ff88';
    modal.innerHTML = innerHTML;
    return modal;
  }

  async function showWalletMenu(connected) {
    const net = currentNetwork();
    const isEthNet = isEth();
    const s = state();
    const title = 'CONNECT WALLET';
    const builtins = await listBuiltinWallets();

    const primaryOpts = isEthNet
      ? `<button class="pixel-btn w100" id="wmBuiltin" style="background:var(--cyan,#32f2ff);color:#000;">🔐 BUILT-IN ETH WALLET</button>`
      : `<button class="pixel-btn w100" id="wmBuiltin" style="background:var(--purple,#a855f7);color:#000;">🔐 BUILT-IN SOL WALLET</button>`;

    const connectedBlock = connected
      ? `<hr style="border-color:#2a2a55;margin:8px 0">
         <div class="pixel tiny dim" style="margin-bottom:8px">CONNECTED: ${global.fmt.shortAddr(s.wallet)} (${s.walletType || 'wallet'})</div>
         ${s.walletType === 'builtin' ? '<button class="pixel-btn w100" id="wmReceive" style="background:var(--green,#39ff88);color:#000;">📥 RECEIVE</button><button class="pixel-btn w100" id="wmSend" style="background:var(--yellow,#ffe14d);color:#000;">📤 SEND</button>' : ''}
         <button class="pixel-btn w100" id="wmProfilePic" style="background:var(--purple,#a855f7);color:#fff;">🖼️ PROFILE PICTURE</button>
         <button class="pixel-btn w100" id="wmSwitch" style="background:#2a2a55;color:#fff;">🔁 SWITCH WALLET</button>
         <button class="pixel-btn w100" id="wmDisconnect" style="background:var(--red,#ff4d6d)">DISCONNECT</button>`
      : '';

    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--green,#39ff88);padding:24px;max-width:360px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:13px;color:var(--green,#39ff88);margin-bottom:6px;">${title}</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:14px;line-height:1.6;">Real keypairs stored locally. No external wallets.<br/>Current network: <b>${net.toUpperCase()}</b></div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${primaryOpts}
          ${connectedBlock}
          <button class="pixel-btn w100" id="wmClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button>
        </div>
      </div>`);

    modal.querySelector('#wmClose').addEventListener('click', () => modal.remove());
    if (connected) {
      const sw = modal.querySelector('#wmSwitch');
      if (sw) sw.addEventListener('click', () => { modal.remove(); showWalletSwitcher(); });
      modal.querySelector('#wmDisconnect').addEventListener('click', () => {
        disconnectWallet();
        modal.remove();
      });
      const wmRecv = modal.querySelector('#wmReceive');
      if (wmRecv) wmRecv.addEventListener('click', () => {
        const bw = builtins.find(b => b.id === state().builtinId);
        if (bw) { modal.remove(); showReceiveModal(bw); }
        else toast('No built-in wallet active');
      });
      const wmSend = modal.querySelector('#wmSend');
      if (wmSend) wmSend.addEventListener('click', () => {
        const bw = builtins.find(b => b.id === state().builtinId);
        if (bw) { modal.remove(); showSendModal(bw); }
        else toast('No built-in wallet active');
      });
    }
    const builtin = modal.querySelector('#wmBuiltin');
    if (builtin) builtin.addEventListener('click', () => { modal.remove(); showBuiltinWalletPanel(); });
    const profilePicBtn = modal.querySelector('#wmProfilePic');
    if (profilePicBtn) profilePicBtn.addEventListener('click', () => { modal.remove(); showProfilePicModal(); });
  }

  /* ---- Wallet switcher: toggle between built-in wallets ---- */
  async function showWalletSwitcher() {
    const s = state();
    const builtins = await listBuiltinWallets();
    const net = currentNetwork();
    const isEthNet = isEth();

    let rows = '';
    if (builtins.length) {
      builtins.forEach((w, i) => {
        rows += `<button class="pixel-btn w100" id="swb_${i}" style="background:#2a2a55;color:#fff;">🔐 ${w.label} — ${global.fmt.shortAddr(w.address)}${s.builtinId === w.id ? ' (active)' : ''}</button>`;
      });
    } else {
      rows += `<div class="pixel tiny dim" style="margin:6px 0;">No built-in ${isEthNet ? 'ETH' : 'SOL'} wallets yet.</div>`;
    }
    rows += `<button class="pixel-btn w100" id="swNew" style="background:var(--green,#39ff88);color:#000;">➕ CREATE BUILT-IN ${isEthNet ? 'ETH' : 'SOL'} WALLET</button>`;
    rows += `<button class="pixel-btn w100" id="swImport" style="background:var(--yellow,#ffe14d);color:#000;">📥 IMPORT WALLET</button>`;

    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--cyan,#32f2ff);padding:24px;max-width:360px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--cyan,#32f2ff);margin-bottom:12px;">🔁 SWITCH WALLET (${net.toUpperCase()})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">${rows}<button class="pixel-btn w100" id="swClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button></div>
      </div>`);

    builtins.forEach((w, i) => {
      const btn = modal.querySelector('#swb_' + i);
      if (btn) btn.addEventListener('click', () => { modal.remove(); useBuiltinWallet(w); });
    });
    modal.querySelector('#swNew').addEventListener('click', () => { modal.remove(); promptCreateBuiltin(); });
    modal.querySelector('#swImport').addEventListener('click', () => { modal.remove(); promptImportBuiltin(); });
    modal.querySelector('#swClose').addEventListener('click', () => modal.remove());
  }

  /* ---- Built-in wallet panel (list + create/import entry) ---- */
  async function showBuiltinWalletPanel() {
    const net = currentNetwork();
    const isEthNet = isEth();
    const builtins = await listBuiltinWallets();

    let list = '';
    if (builtins.length) {
      list = builtins.map((w, i) => `
        <div class="bw-item" data-idx="${i}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#111833;padding:10px;border-radius:4px;margin-bottom:6px;cursor:pointer;transition:background 0.2s;" onmouseenter="this.style.background='#1a2350'" onmouseleave="this.style.background='#111833'">
          <div style="text-align:left;font-size:8px;line-height:1.5;flex:1;min-width:0;">
            <div style="color:#e6f7ff;font-weight:bold;">${w.label}</div>
            <div style="color:#9fb3c8;word-break:break-all;">${w.address}</div>
            <div class="pixel tiny dim">${w.network.toUpperCase()} · Created: ${new Date(w.created_at || Date.now()).toLocaleDateString()}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
            <button class="pixel-btn small bw-receive" data-idx="${i}" style="background:var(--green,#39ff88);color:#000;padding:4px 8px;" title="Receive">📥</button>
            <button class="pixel-btn small bw-send" data-idx="${i}" style="background:var(--yellow,#ffe14d);color:#000;padding:4px 8px;" title="Send">📤</button>
            <button class="pixel-btn small" id="bw_use_${i}" style="background:var(--cyan,#32f2ff);color:#000;padding:4px 8px;" title="Use this wallet">USE</button>
            <button class="pixel-btn small" id="bw_del_${i}" style="background:var(--red,#ff4d6d);color:#fff;padding:4px 8px;" title="Delete">DEL</button>
          </div>
        </div>`).join('');
    } else {
      list = `<div class="pixel tiny dim" style="margin:8px 0;">No built-in ${isEthNet ? 'ETH' : 'SOL'} wallets yet. Create one below — it's a real keypair stored locally.</div>`;
    }

    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--green,#39ff88);padding:24px;max-width:380px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--green,#39ff88);margin-bottom:12px;">🔐 BUILT-IN ${isEthNet ? 'ETH' : 'SOL'} WALLETS</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">Real keypairs generated on this device and stored in the app's local database. The private key never leaves your machine via the UI.</div>
        <div style="margin-bottom:12px;">${list}</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="bwNew" style="background:var(--green,#39ff88);color:#000;">➕ CREATE NEW</button>
          <button class="pixel-btn w100" id="bwImport" style="background:var(--yellow,#ffe14d);color:#000;">📥 IMPORT EXISTING</button>
          <button class="pixel-btn w100" id="bwClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">BACK</button>
        </div>
      </div>`);

    builtins.forEach((w, i) => {
      const use = modal.querySelector('#bw_use_' + i);
      if (use) use.addEventListener('click', (e) => { e.stopPropagation(); modal.remove(); useBuiltinWallet(w); });
      const del = modal.querySelector('#bw_del_' + i);
      if (del) del.addEventListener('click', async (e) => { e.stopPropagation(); await deleteBuiltinWallet(w.id); if (state().builtinId === w.id) { state().connected = false; state().wallet = null; state().walletType = null; state().builtinId = null; global.updateWalletUI && global.updateWalletUI(); } toast('Wallet deleted'); modal.remove(); showBuiltinWalletPanel(); });
      const recv = modal.querySelector('.bw-receive[data-idx="' + i + '"]');
      if (recv) recv.addEventListener('click', (e) => { e.stopPropagation(); showReceiveModal(w); });
      const send = modal.querySelector('.bw-send[data-idx="' + i + '"]');
      if (send) send.addEventListener('click', (e) => { e.stopPropagation(); showSendModal(w); });
      const row = modal.querySelector('.bw-item[data-idx="' + i + '"]');
      if (row) row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        showWalletDetailModal(w);
      });
    });
    modal.querySelector('#bwNew').addEventListener('click', () => { modal.remove(); promptCreateBuiltin(); });
    modal.querySelector('#bwImport').addEventListener('click', () => { modal.remove(); promptImportBuiltin(); });
    modal.querySelector('#bwClose').addEventListener('click', () => { modal.remove(); showWalletMenu(state().connected && state().wallet); });
  }

  async function showWalletDetailModal(w) {
    const net = w.network || 'ethereum';
    const isEthNet = net === 'ethereum';
    let balance = '0';
    try {
      const uid = getUserId();
      const r = await global.API.get('/api/builtin-wallet/' + encodeURIComponent(w.id) + '/balance?userId=' + encodeURIComponent(uid));
      balance = isEthNet ? (r.balanceEth || '0') : (r.balanceSol || '0');
    } catch (e) { balance = 'Error'; }
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--cyan,#32f2ff);padding:24px;max-width:420px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--cyan,#32f2ff);margin-bottom:12px;">🔐 WALLET DETAILS</div>
        <div style="text-align:left;font-size:8px;line-height:1.8;background:#111833;padding:12px;border-radius:4px;margin-bottom:12px;">
          <div><b>Label:</b> ${w.label}</div>
          <div><b>Network:</b> ${net.toUpperCase()}</div>
          <div><b>Address:</b></div>
          <div style="word-break:break-all;color:var(--cyan,#32f2ff);margin-top:4px;">${w.address}</div>
          <div style="margin-top:8px;"><b>Balance:</b> ${balance} ${isEthNet ? 'ETH' : 'SOL'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100 bw-receive-detail" data-id="${w.id}" style="background:var(--green,#39ff88);color:#000;">📥 RECEIVE</button>
          <button class="pixel-btn w100 bw-send-detail" data-id="${w.id}" style="background:var(--yellow,#ffe14d);color:#000;">📤 SEND</button>
          <button class="pixel-btn w100" id="bwDetailUse" data-id="${w.id}" style="background:var(--cyan,#32f2ff);color:#000;">🔁 USE THIS WALLET</button>
          <button class="pixel-btn w100" id="bwDetailClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
        </div>
      </div>`);
    modal.querySelector('#bwDetailClose').addEventListener('click', () => modal.remove());
    const recv = modal.querySelector('.bw-receive-detail');
    if (recv) recv.addEventListener('click', () => showReceiveModal(w));
    const send = modal.querySelector('.bw-send-detail');
    if (send) send.addEventListener('click', () => showSendModal(w));
    const use = modal.querySelector('#bwDetailUse');
    if (use) use.addEventListener('click', () => { modal.remove(); useBuiltinWallet(w); });
  }

  function promptCreateBuiltin() {
    const isEthNet = isEth();
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--green,#39ff88);padding:24px;max-width:360px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;">
        <div style="font-size:12px;color:var(--green,#39ff88);margin-bottom:12px;">➕ CREATE BUILT-IN ${isEthNet ? 'ETH' : 'SOL'} WALLET</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">A new real ${isEthNet ? 'Ethereum' : 'Solana'} keypair will be generated and stored on this device. You'll get a backup phrase/key to save. Do not share it.</div>
        <input id="bwLabel" class="pixel-input" placeholder="Label (optional)" style="width:100%;margin-bottom:10px;" />
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="bwCreate" style="background:var(--green,#39ff88);color:#000;">⚡ GENERATE & CONNECT</button>
          <button class="pixel-btn w100" id="bwCancel" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button>
        </div>
      </div>`);
    modal.querySelector('#bwCreate').addEventListener('click', async () => {
      const label = (modal.querySelector('#bwLabel').value || '').trim();
      toast('Generating wallet...');
      try {
        const r = await createBuiltinWallet(label);
        if (r && r.wallet) {
          modal.remove();
          showBackupModal(r.backup, r.wallet);
        } else {
          toast('Failed to create wallet');
        }
      } catch (e) { toast('Failed: ' + (e.message || e)); }
    });
    modal.querySelector('#bwCancel').addEventListener('click', () => modal.remove());
  }

  function promptImportBuiltin() {
    const isEthNet = isEth();
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--yellow,#ffe14d);padding:24px;max-width:360px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;">
        <div style="font-size:12px;color:var(--yellow,#ffe14d);margin-bottom:12px;">📥 IMPORT BUILT-IN ${isEthNet ? 'ETH' : 'SOL'} WALLET</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:12px;line-height:1.6;">${isEthNet ? 'Paste your ETH private key (starts with 0x) or 12/24-word seed phrase.' : 'Paste your SOL private key (JSON array of 64 numbers, or 128-char hex) or a secret-key array.'}</div>
        <input id="bwPk" class="pixel-input" placeholder="${isEthNet ? '0x... private key or seed phrase' : 'SOL private key (array or hex)'}" style="width:100%;margin-bottom:10px;" />
        <label class="pixel tiny dim" style="display:block;text-align:left;margin-bottom:4px;">LABEL (OPTIONAL)</label>
        <input id="bwLabel" class="pixel-input" placeholder="Label" style="width:100%;margin-bottom:12px;" />
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="bwImport" style="background:var(--yellow,#ffe14d);color:#000;">📥 IMPORT & CONNECT</button>
          <button class="pixel-btn w100" id="bwCancel" style="background:transparent;color:var(--dim);border-color:var(--dim)">CANCEL</button>
        </div>
      </div>`);
    modal.querySelector('#bwImport').addEventListener('click', async () => {
      const pk = (modal.querySelector('#bwPk').value || '').trim();
      const label = (modal.querySelector('#bwLabel').value || '').trim();
      if (!pk) { toast('Enter a private key'); return; }
      toast('Importing wallet...');
      try {
        const isEthSeed = isEthNet && pk.split(/\s+/).length >= 12;
        const r = await importBuiltinWallet(!isEthSeed ? pk : undefined, isEthSeed ? pk : undefined, label);
        if (r && r.wallet) {
          modal.remove();
          showBackupModal(r.backup, r.wallet);
        } else {
          toast('Import failed');
        }
      } catch (e) { toast('Import failed: ' + (e.message || e)); }
    });
    modal.querySelector('#bwCancel').addEventListener('click', () => modal.remove());
  }

  function showBackupModal(backup, wallet) {
    const isEthNet = wallet.network === 'ethereum';
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--yellow,#ffe14d);padding:24px;max-width:380px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--yellow,#ffe14d);margin-bottom:12px;">⚠️ SAVE YOUR BACKUP</div>
        <div style="font-size:8px;color:#9fb3c8;margin-bottom:10px;line-height:1.6;">${isEthNet ? 'Seed phrase' : 'Secret key'} — write this down. It is shown only once. Anyone with it controls the wallet.</div>
        <div style="background:#000;padding:10px;border:1px solid #2a2a55;border-radius:4px;word-break:break-all;font-size:9px;color:#39ff88;margin-bottom:12px;user-select:all;">${backup}</div>
        <div style="font-size:9px;color:#9fb3c8;margin-bottom:12px;">ADDRESS: <span style="color:#32f2ff;">${wallet.address}</span></div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="pixel-btn w100" id="bkConnect" style="background:var(--green,#39ff88);color:#000;">✅ I SAVED IT — CONNECT</button>
          <button class="pixel-btn w100" id="bkClose" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
        </div>
      </div>`);
    modal.querySelector('#bkConnect').addEventListener('click', () => {
      listBuiltinWallets().then(list => {
        const w = list.find(x => x.address === wallet.address) || wallet;
        modal.remove();
        useBuiltinWallet({ ...w, network: wallet.network });
      });
    });
    modal.querySelector('#bkClose').addEventListener('click', () => modal.remove());
  }

  function finishConnect(label) {
    const s = state();
    if (global.updateWalletUI) global.updateWalletUI();
    global.userKey = s.wallet;
    toast(`Connected: ${global.fmt.shortAddr(s.wallet)} (${label})`);
    if (global.renderWatchlist) global.renderWatchlist();
  }

  /* ---- Disconnect ---- */
  global.disconnectWallet = function disconnectWallet() {
    const s = state();
    s.connected = false;
    s.wallet = null;
    s.walletType = null;
    s.walletNetwork = null;
    s.builtinId = null;
    s.builtinLabel = null;
    global.userKey = null;
    global.updateWalletUI && global.updateWalletUI();
    try { if (global.API) global.API.post('/api/wallet-disconnect', {}); } catch (e) {}
    toast('Wallet disconnected');
  };

  /* ---- Require a connected wallet before sensitive actions ---- */
  global.requireWallet = async function () {
    const s = state();
    if (s.connected && s.wallet && s.walletType !== 'demo') return s.wallet;
    await global.connectWallet();
    if (s.connected && s.wallet && s.walletType !== 'demo') return s.wallet;
    toast('A built-in wallet must be connected to continue.');
    return null;
  };

  /* ---- Export / import helpers ---- */
  global.exportWallet = async function () {
    const s = state();
    if (!s.connected || !s.wallet) { toast('No wallet connected'); return null; }
    try {
      const r = await global.API.post('/api/wallet/export', { address: s.wallet });
      if (r && r.backup) {
        toast('Wallet export ready — save this securely');
        return r.backup;
      }
      toast('Export failed');
      return null;
    } catch (e) { toast('Export failed: ' + (e.message || e)); return null; }
  };

  global.importWallet = async function (backupData, label) {
    try {
      const r = await global.API.post('/api/wallet/import', { backup: backupData, label: label || '' });
      if (r && r.wallet) {
        useBuiltinWallet({ ...r.wallet, network: r.wallet.network || currentNetwork() });
        toast('Wallet imported successfully');
        return r.wallet;
      }
      toast('Import failed');
      return null;
    } catch (e) { toast('Import failed: ' + (e.message || e)); return null; }
  };

  /* ------------------------------------------------------------------ */
  /* Expose API                                                        */
  /* ------------------------------------------------------------------ */
  global.wallet = {
    listBuiltinWallets,
    createBuiltinWallet,
    importBuiltinWallet,
    deleteBuiltinWallet,
    disconnectWallet,
    useBuiltinWallet,
    connectWallet,
    requireWallet,
    exportWallet,
    importWallet,
    showBuiltinWalletPanel,
    showWalletSwitcher,
    showProfilePicModal,
    getProfilePic,
    setProfilePic,
    fetchBalance,
  };
})(window);

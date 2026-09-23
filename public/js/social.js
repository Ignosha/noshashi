/* IGNOSHASHI - Social profiles, tournament, token gating, bridge */
(function (global) {
  'use strict';
  const $ = global.$;

  /* ---------- Social profile ---------- */
  async function loadProfile() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('socialProfile');
    if (!container) return;
    if (!wallet) { container.innerHTML = '<p class="dim pixel small">Connect wallet to view profile</p>'; return; }
    try {
      const r = await API.get('/api/community/profile/' + encodeURIComponent(wallet));
      const isDefault = !r.username || r.username.startsWith('anon_');
      container.innerHTML = `
        <div class="pf-summary">
          <div class="pf-block"><span class="pixel tiny dim">USERNAME</span><span class="pixel sm">${r.username || 'anon'}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">WALLET</span><span class="pixel sm">${wallet.slice(0,10)}...${wallet.slice(-6)}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">JOINED</span><span class="pixel sm">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '--'}</span></div>
        </div>
        <div style="margin-top:12px"><span class="pixel tiny dim">Bio:</span> <span class="pixel small">${r.bio || 'No bio yet'}</span></div>
        ${isDefault ? '<button id="socialSetupUsername" class="pixel-btn small w100" style="margin-top:10px;background:var(--purple,#a855f7);color:#fff;">👤 SET USERNAME</button>' : ''}
      `;
      const setupBtn = document.getElementById('socialSetupUsername');
      if (setupBtn) setupBtn.addEventListener('click', setupUsername);
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load profile</p>'; }
  }

  /* ---------- Token gating ---------- */
  document.getElementById('btnGate') && document.getElementById('btnGate').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const tokenId = document.getElementById('gateToken').value;
    const minHold = parseFloat(document.getElementById('gateMinHold').value);
    if (!tokenId || !minHold) return global.toast('Fill all fields');
    try {
      await API.post('/api/gating/create', { wallet, tokenId, minHold });
      global.toast('Token gate created!');
    } catch (e) { global.toast('Gating failed: ' + e.message); }
  });

  /* ---------- Bridge ---------- */
  document.getElementById('btnBridge') && document.getElementById('btnBridge').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const token = document.getElementById('bridgeToken').value;
    const amount = parseFloat(document.getElementById('bridgeAmount').value);
    const destChain = document.getElementById('bridgeDest').value;
    if (!token || !amount || !destChain) return global.toast('Fill all fields');
    try {
      const r = await API.post('/api/bridge', { wallet, token, amount, destChain });
      global.toast('Bridge initiated! TX: ' + (r.hash || 'ok'));
    } catch (e) { global.toast('Bridge failed: ' + e.message); }
  });

  /* ---------- Username setup ---------- */
  async function setupUsername() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    const modal = document.createElement('div');
    modal.className = 'username-modal';
    modal.innerHTML = `
      <div class="username-panel">
        <div class="panel-title pixel">👤 CHOOSE YOUR USERNAME</div>
        <div class="pixel tiny dim" style="margin-bottom:12px">This will be your display name in the community. Choose wisely — usernames are unique.</div>
        <input id="usernameInput" class="pixel-input" placeholder="Enter username" maxlength="32" style="width:100%;margin-bottom:8px" />
        <div id="usernameError" class="pixel tiny" style="color:var(--red);margin-bottom:8px;min-height:16px;"></div>
        <button id="usernameSave" class="pixel-btn w100">💾 SAVE USERNAME</button>
        <button id="usernameSkip" class="pixel-btn w100" style="margin-top:6px;background:transparent;color:var(--dim);border-color:var(--dim)">SKIP FOR NOW</button>
      </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('usernameInput');
    const errorEl = document.getElementById('usernameError');
    const saveBtn = document.getElementById('usernameSave');
    const skipBtn = document.getElementById('usernameSkip');

    if (input) input.focus();

    async function attemptSave() {
      const username = input.value.trim();
      errorEl.textContent = '';
      if (!username) { errorEl.textContent = 'Enter a username'; return; }
      if (username.length < 3) { errorEl.textContent = 'Username must be at least 3 characters'; return; }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) { errorEl.textContent = 'Only letters, numbers, and underscores'; return; }
      saveBtn.disabled = true;
      saveBtn.textContent = 'CHECKING...';
      try {
        const r = await API.post('/api/community/username', { wallet, username });
        if (r && r.success) {
          global.toast('Username set: @' + username);
          modal.remove();
          renderUserProfile();
        } else {
          errorEl.textContent = r.error || 'Username already taken';
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 SAVE USERNAME';
        }
      } catch (e) {
        errorEl.textContent = 'Error: ' + e.message;
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 SAVE USERNAME';
      }
    }

    if (saveBtn) saveBtn.addEventListener('click', attemptSave);
    if (skipBtn) skipBtn.addEventListener('click', () => modal.remove());
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSave(); });
  }

  /* ---------- User Profile ---------- */
  function renderUserProfile() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    const el = document.getElementById('profileDisplay');
    const editEl = document.getElementById('profileEdit');
    if (!el) return;
    API.get('/api/community/profile/' + encodeURIComponent(wallet)).then((profile) => {
      if (profile && profile.wallet) {
        const isDefault = !profile.username || profile.username.startsWith('anon_');
        el.innerHTML = `
          <div class="profile-card">
            <div class="profile-avatar">${profile.avatar ? `<img src="${profile.avatar}" style="width:64px;height:64px;object-fit:cover;border-radius:8px" />` : global.fmt.avatar(profile.username || 'X')}</div>
            <div class="pixel lg">${profile.username || 'anon'}</div>
            <div class="pixel tiny dim">${wallet.slice(0,10)}...${wallet.slice(-6)}</div>
            <div class="pixel small" style="margin-top:6px">${profile.bio || 'No bio yet'}</div>
            ${isDefault ? '<button id="btnSetupUsername" class="pixel-btn small w100" style="margin-top:8px;background:var(--purple,#a855f7);color:#fff;">👤 SET USERNAME</button>' : ''}
          </div>
        `;
        const setupBtn = document.getElementById('btnSetupUsername');
        if (setupBtn) setupBtn.addEventListener('click', setupUsername);
        if (editEl) editEl.style.display = 'none';
      }
    }).catch(() => {
      el.innerHTML = '<p class="dim pixel small">Failed to load profile</p>';
    });
  }

  function initProfile() {
    const saveBtn = $('#profileSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const wallet = global.STATE.wallet;
        if (!wallet) return global.toast('Connect a wallet first');
        const username = document.getElementById('profileUsername').value.trim();
        const bio = document.getElementById('profileBio').value.trim();
        const avatarInput = document.getElementById('profileAvatar');
        const saveProfile = (avatarData) => {
          API.post('/api/community/profile', { wallet, username, bio, avatar: avatarData }).then(() => {
            global.toast('Profile saved!');
            renderUserProfile();
          }).catch(() => global.toast('Save failed'));
        };
        if (avatarInput && avatarInput.files && avatarInput.files[0]) {
          const reader = new FileReader();
          reader.onload = () => saveProfile(reader.result);
          reader.readAsDataURL(avatarInput.files[0]);
        } else {
          saveProfile('');
        }
      });
    }
    renderUserProfile();
  }

  /* ---------- Presence ---------- */
  function updatePresence() {
    if (!global.STATE.wallet) return;
    localStorage.setItem('igno_presence', JSON.stringify({
      wallet: global.STATE.wallet,
      username: global.STATE.wallet.slice(0, 8),
      lastSeen: Date.now(),
    }));
  }
  setInterval(updatePresence, 30000);
  updatePresence();

  let chatInitialized = false;
  let videoFeedInitialized = false;
  let profileInitialized = false;

  /* ---------- Router ---------- */
  global.renderCommunity = function () {
    if (!chatInitialized) { initChat(); chatInitialized = true; }
    if (!videoFeedInitialized) { initVideoFeed(); videoFeedInitialized = true; }
    if (!profileInitialized) { initProfile(); profileInitialized = true; }
    initNewChannel();
  };

  global.WS.on('wallet-disconnect', () => { updateChatWalletState(); updateVideoFeedWalletState(); });
  global.WS.on('wallet-connect', () => { updateChatWalletState(); updateVideoFeedWalletState(); });

  function initNewChannel() {
    const btn = document.getElementById('newChannelBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const name = prompt('Channel name:');
      if (!name) return;
      const desc = prompt('Description (optional):') || '';
      API.post('/api/community/channels', { name, description: desc, category: 'general' }).then(() => {
        global.toast('Channel created!');
        renderChannels();
      }).catch(() => global.toast('Failed'));
    });
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.community = global.renderCommunity;

  /* ---------- WS live updates ---------- */
  global.WS.on('community-message', (msg) => {
    if (msg.channelId === currentChannel && msg.message) {
      const container = document.getElementById('chatMessages');
      if (!container) return;
      const div = document.createElement('div');
      div.className = 'chat-msg ' + (msg.message.user === (global.STATE.wallet || '') ? 'own' : '');
      div.innerHTML = `
        <div class="chat-avatar">${global.fmt.avatar(msg.message.username || 'X')}</div>
        <div class="chat-body">
          <div class="chat-header">
            <span class="chat-user pixel small">${msg.message.username || 'anon'}</span>
            <span class="chat-time pixel tiny dim">${global.fmt.time(msg.message.timestamp)}</span>
          </div>
          <div class="chat-text pixel small">${escapeHtml(msg.message.text)}</div>
        </div>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  });

  global.WS.on('community-video', (msg) => {
    if (msg.video) loadVideoFeed();
  });

  global.WS.on('community-like', (msg) => {
    if (msg.videoId) loadVideoFeed();
  });

  global.WS.on('community-comment', (msg) => {
    if (msg.videoId) loadVideoFeed();
  });
})(window);

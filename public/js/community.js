/* IGNOSHASHI - Community: Discord-style chat + TikTok-style video feed */
(function (global) {
  'use strict';
  const $ = global.$;
  const $$ = global.$$;

  let currentChannel = null;
  let videoFeedMode = 'trending'; // 'trending' | 'new' | 'following'
  let currentVideoIndex = -1;
  let videoFeedData = [];

  /* ---------- Discord-style Chat ---------- */
  function renderChannels() {
    const list = $('#communityChannelList');
    if (!list) return;
    API.get('/api/community/channels').then((channels) => {
      list.innerHTML = channels.length ? channels.map((ch) => `
        <div class="channel-item ${currentChannel === ch.id ? 'active' : ''}" data-channel="${ch.id}">
          <span class="channel-hash">#</span>
          <div>
            <div class="channel-name pixel small">${ch.name}</div>
            <div class="channel-desc pixel tiny dim">${ch.description || ''}</div>
          </div>
        </div>
      `).join('') : '<p class="dim pixel tiny">No channels yet</p>';

      $$('.channel-item').forEach((el) => {
        el.addEventListener('click', () => {
          currentChannel = el.dataset.channel;
          renderChannels();
          loadMessages(currentChannel);
        });
      });
    }).catch(() => {});
  }

  function loadMessages(channelId) {
    const container = $('#chatMessages');
    if (!container) return;
    API.get('/api/community/channels/' + channelId + '/messages').then((msgs) => {
      container.innerHTML = msgs.length ? msgs.map((m) => `
        <div class="chat-msg ${m.user === (global.STATE.wallet || '') ? 'own' : ''}">
          <div class="chat-avatar">${global.fmt.avatar(m.username || 'X')}</div>
          <div class="chat-body">
            <div class="chat-header">
              <span class="chat-user pixel small">${m.username || 'anon'}</span>
              <span class="chat-time pixel tiny dim">${global.fmt.time(m.timestamp)}</span>
            </div>
            <div class="chat-text pixel small">${escapeHtml(m.text)}</div>
          </div>
        </div>
      `).join('') : '<p class="dim pixel tiny">No messages yet. Say hello!</p>';
      container.scrollTop = container.scrollHeight;
    }).catch(() => {});
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sendMessage() {
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text || !currentChannel) return;
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect a wallet to chat');
    API.post('/api/community/channels/' + currentChannel + '/messages', { user: wallet, text }).then(() => {
      input.value = '';
      loadMessages(currentChannel);
    }).catch(() => {});
  }

  function initChat() {
    const sendBtn = $('#chatSendBtn');
    const input = $('#chatInput');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
    }
    renderChannels();
    if (currentChannel) loadMessages(currentChannel);
    updateChatWalletState();
  }

  function updateChatWalletState() {
    const input = $('#chatInput');
    const sendBtn = $('#chatSendBtn');
    const wallet = global.STATE.wallet;
    const connected = !!(wallet && wallet !== 'anon_' + wallet.slice(0, 8));
    if (input) {
      input.disabled = !connected;
      input.placeholder = connected ? 'Type a message...' : 'Connect wallet to chat';
    }
    if (sendBtn) {
      sendBtn.disabled = !connected;
    }
  }

  global.WS.on('wallet-disconnect', () => { updateChatWalletState(); });
  global.WS.on('wallet-connect', () => { updateChatWalletState(); });

  /* ---------- TikTok-style Video Feed ---------- */
  function engagementScore(v) {
    return (v.likes || 0) * 3 + (v.comments || 0) * 2 + (v.views || 0) * 0.1;
  }

  function loadVideoFeed() {
    API.get('/api/community/videos').then((videos) => {
      videoFeedData = videos;
      if (videoFeedMode === 'trending') {
        videoFeedData.sort((a, b) => engagementScore(b) - engagementScore(a));
      } else if (videoFeedMode === 'new') {
        videoFeedData.sort((a, b) => b.created_at - a.created_at);
      }
      renderVideoFeed();
    }).catch(() => {});
  }

  function renderVideoFeed() {
    const container = $('#videoFeed');
    if (!container) return;
    if (!videoFeedData.length) {
      container.innerHTML = '<p class="dim pixel small">No videos yet. Be the first to upload!</p>';
      return;
    }
    container.innerHTML = videoFeedData.map((v, i) => `
      <div class="video-card ${currentVideoIndex === i ? 'active' : ''}" data-index="${i}">
        <div class="video-wrapper">
          <video src="${v.url}" loop playsinline preload="metadata" ${currentVideoIndex === i ? 'autoplay' : ''}></video>
          <div class="video-overlay">
            <div class="video-actions">
              <button class="video-action like-btn" data-video="${v.id}">
                <span class="video-action-icon">♥</span>
                <span class="video-action-count">${v.likes || 0}</span>
              </button>
              <button class="video-action comment-btn" data-video="${v.id}">
                <span class="video-action-icon">💬</span>
                <span class="video-action-count">${v.comments || 0}</span>
              </button>
              <button class="video-action view-btn" data-video="${v.id}">
                <span class="video-action-icon">▶</span>
                <span class="video-action-count">${v.views || 0}</span>
              </button>
            </div>
          </div>
          <div class="video-info">
            <div class="video-user pixel small">@${v.username || 'anon'}</div>
            <div class="video-desc pixel tiny">${escapeHtml(v.description || '')}</div>
          </div>
        </div>
      </div>
    `).join('');

    // Like / comment / view handlers
    container.querySelectorAll('.like-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vid = btn.dataset.video;
        const wallet = global.STATE.wallet;
        if (!wallet) return global.toast('Connect a wallet to like');
        API.post('/api/community/videos/' + vid + '/like', { user: wallet }).then(() => loadVideoFeed());
      });
    });

    container.querySelectorAll('.comment-btn').forEach((btn) => {
      btn.addEventListener('click', () => openVideoComments(btn.dataset.video));
    });

    container.querySelectorAll('.view-btn').forEach((btn) => {
      const vid = btn.dataset.video;
      const wallet = global.STATE.wallet;
      if (!wallet) return global.toast('Connect a wallet to view');
      API.post('/api/community/view', { user: wallet, video_id: vid }).then(() => loadVideoFeed());
    });

    // Auto-play active video
    const activeVideo = container.querySelector('.video-card.active video');
    if (activeVideo) activeVideo.play().catch(() => {});
  }

  function openVideoComments(videoId) {
    const modal = document.createElement('div');
    modal.className = 'video-comment-modal';
    modal.innerHTML = `
      <div class="video-comment-panel">
        <div class="panel-title pixel">💬 COMMENTS</div>
        <div class="comments-list" id="videoCommentsList"><p class="dim pixel tiny">Loading...</p></div>
        <div class="comment-input-row">
          <input id="videoCommentInput" class="pixel-input" placeholder="Add a comment..." />
          <button id="videoCommentSend" class="pixel-btn small">SEND</button>
        </div>
        <button class="pixel-btn small" id="videoCommentClose" style="margin-top:8px">CLOSE</button>
      </div>
    `;
    document.body.appendChild(modal);

    function loadComments() {
      API.get('/api/community/videos/' + videoId + '/comments').then((cmts) => {
        const list = document.getElementById('videoCommentsList');
        list.innerHTML = cmts.length ? cmts.map((c) => `
          <div class="comment-item">
            <span class="pixel small">${c.username || 'anon'}</span>
            <span class="pixel tiny">${escapeHtml(c.text)}</span>
            <span class="pixel tiny dim">${global.fmt.time(c.timestamp)}</span>
          </div>
        `).join('') : '<p class="dim pixel tiny">No comments yet</p>';
      }).catch(() => {});
    }
    loadComments();

    document.getElementById('videoCommentSend').addEventListener('click', () => {
      const input = document.getElementById('videoCommentInput');
      const text = input.value.trim();
      if (!text) return;
      const wallet = global.STATE.wallet;
      if (!wallet) return global.toast('Connect a wallet to comment');
      API.post('/api/community/videos/' + videoId + '/comment', { user: wallet, text }).then(() => {
        input.value = '';
        loadComments();
        loadVideoFeed();
      });
    });
    document.getElementById('videoCommentClose').addEventListener('click', () => modal.remove());
  }

  function initVideoFeed() {
    const newBtn = $('#videoFeedNew');
    const trendingBtn = $('#videoFeedTrending');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        videoFeedMode = 'new';
        if (newBtn) newBtn.classList.add('active');
        if (trendingBtn) trendingBtn.classList.remove('active');
        loadVideoFeed();
      });
    }
    if (trendingBtn) {
      trendingBtn.addEventListener('click', () => {
        videoFeedMode = 'trending';
        if (trendingBtn) trendingBtn.classList.add('active');
        if (newBtn) newBtn.classList.remove('active');
        loadVideoFeed();
      });
    }

    // Upload video
    const uploadBtn = $('#videoUploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        if (!global.STATE.wallet) return global.toast('Connect a wallet to upload');
        openVideoUploadModal();
      });
    }
    updateVideoFeedWalletState();
    loadVideoFeed();
  }

  function updateVideoFeedWalletState() {
    const uploadBtn = $('#videoUploadBtn');
    const wallet = global.STATE.wallet;
    if (uploadBtn) {
      uploadBtn.disabled = !wallet;
      uploadBtn.title = wallet ? 'Upload video' : 'Connect wallet to upload';
    }
  }

  function openVideoUploadModal() {
    const modal = document.createElement('div');
    modal.className = 'video-upload-modal';
    modal.innerHTML = `
      <div class="video-upload-panel">
        <div class="panel-title pixel">📹 UPLOAD VIDEO</div>
        <input id="videoUploadUrl" class="pixel-input" placeholder="Video URL (or base64 data URL)" style="width:100%;margin-bottom:8px" />
        <textarea id="videoUploadDesc" class="pixel-input" rows="3" placeholder="Description (optional)" style="width:100%;margin-bottom:8px"></textarea>
        <div class="pixel tiny dim" style="margin-bottom:8px">Tip: record a short clip & paste a base64 data URL, or link to a hosted MP4.</div>
        <button id="videoUploadSubmit" class="pixel-btn w100">🚀 UPLOAD</button>
        <button id="videoUploadCancel" class="pixel-btn w100" style="margin-top:6px">CANCEL</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('videoUploadSubmit').addEventListener('click', () => {
      const url = document.getElementById('videoUploadUrl').value.trim();
      const desc = document.getElementById('videoUploadDesc').value.trim();
      if (!url) return global.toast('Enter a video URL');
      const wallet = global.STATE.wallet;
      if (!wallet) return global.toast('Connect a wallet to upload');
      API.post('/api/community/videos', { user: wallet, url, description: desc }).then(() => {
        modal.remove();
        loadVideoFeed();
        global.toast('Video uploaded!');
      }).catch(() => global.toast('Upload failed'));
    });
    document.getElementById('videoUploadCancel').addEventListener('click', () => modal.remove());
  }

  /* ---------- User Profile ---------- */
  function renderUserProfile() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    API.get('/api/community/profile/' + encodeURIComponent(wallet)).then((profile) => {
      const el = document.getElementById('profileDisplay');
      if (!el) return;
      if (profile && profile.wallet) {
        el.innerHTML = `
          <div class="profile-card">
            <div class="profile-avatar">${profile.avatar ? `<img src="${profile.avatar}" style="width:64px;height:64px;object-fit:cover;border-radius:8px" />` : global.fmt.avatar(profile.username || 'X')}</div>
            <div class="pixel lg">${profile.username || 'anon'}</div>
            <div class="pixel tiny dim">${wallet.slice(0,10)}...${wallet.slice(-6)}</div>
            <div class="pixel small" style="margin-top:6px">${profile.bio || 'No bio yet'}</div>
          </div>
        `;
      }
    }).catch(() => {});
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

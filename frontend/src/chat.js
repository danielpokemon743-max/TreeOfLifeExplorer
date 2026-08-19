// 💬 chat.js - Chat global e local da comunidade
import { sounds } from './SoundManager.js';
import { openModal, closeModal } from './fx.js';
import { fetchAdminCheck, getAuthToken, adminBanAccount, adminBanIp, fetchInbox, fetchInboxUnread, inboxReply, reportUser } from './auth.js';
import { openUserHistory, openReportModal, moderationReady } from './moderation.js';

const CHAT_BASE = '/api/chat';
const POLL_INTERVAL_MS = 5000;

let _open = false;
let _tab = 'global';
let _admin = false;
let _pollTimer = null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtHours(h) {
  const n = Number(h) || 0;
  if (n >= 1) return `${n}h`;
  return `${Math.max(1, Math.round(n * 60))}min`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const $ = (id) => document.getElementById(id);

// Links (http/www/domínio com extensão) não são permitidos no chat.
const _LINK_TLDS = 'com|net|org|info|biz|io|co|gg|xyz|tv|me|cc|mobi|tel|top|club|site|online|store|shop|blog|tech|app|dev|link|click|live|fun|br|us|uk|de|fr|es|it|pt|ru|ca|au|ar|cl|mx|co|jp|cn|in|eu|be|ch|nl|se|no|dk|fi|pl|cz|tk|ml|ga|cf|gq|ly|to|ai|ws'.split('|');
const _LINK_REGEX = new RegExp('(?:[a-z][a-z0-9+.-]{0,30}://|www\\.|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(' + _LINK_TLDS.join('|') + ')(?:[/?#]\\S*)?)', 'i');
function _textHasLink(text) {
  return _LINK_REGEX.test(text || '');
}
function parts() {
  return {
    fab: $('chat-fab'),
    panel: $('chat-panel'),
    close: $('chat-close'),
    tabs: Array.from(document.querySelectorAll('.chat-tab')),
    list: $('chat-messages'),
    status: $('chat-status'),
    input: $('chat-input'),
    send: $('chat-send'),
    ctx: $('chat-context-menu'),
  };
}

export function closeChat(silent = false) {
  if (!_open) return;
  _open = false;
  stopPoll();
  const p = parts();
  if (p.panel) closeModal(p.panel, silent ? null : 'close');
  hideContextMenu();
}

async function refreshAdminFlag() {
  try {
    const check = await fetchAdminCheck();
    _admin = !!(check && check.is_admin);
  } catch {
    _admin = false;
  }
}

function openChat() {
  _open = true;
  const p = parts();
  if (!p.panel) return;
  refreshAdminFlag();
  openModal(p.panel, 'open');
  loadMessages();
  startPoll();
  if (p.input) setTimeout(() => p.input.focus(), 60);
}

function toggleChat() {
  if (_open) closeChat(false);
  else openChat();
}

function startPoll() {
  stopPoll();
  pollInboxBadge();
  refreshAdminFlag();
  _pollTimer = setInterval(() => {
    if (!_open) return;
    if (_tab === 'inbox') loadInbox();
    else {
      loadMessages(false);
      pollInboxBadge();
    }
  }, POLL_INTERVAL_MS);
}
function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function setStatus(msg, temporary = false) {
  const p = parts();
  if (!p.status) return;
  p.status.textContent = msg;
  p.status.classList.remove('hidden');
  if (temporary) {
    clearTimeout(p.status._hideTimer);
    p.status._hideTimer = setTimeout(() => {
      p.status.textContent = '';
      p.status.classList.add('hidden');
    }, 3500);
  }
}

function switchTab(channel) {
  if (channel === _tab) return;
  _tab = channel;
  const p = parts();
  p.tabs.forEach(t => t.classList.toggle('active', t.dataset.channel === channel));
  sounds.playSFX('click');
  if (channel === 'inbox') loadInbox();
  else loadMessages();
}

function setBadge(n) {
  const badge = $('chat-inbox-badge');
  if (!badge) return;
  n = Number(n) || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('hidden', n <= 0);
}

async function pollInboxBadge() {
  if (!getAuthToken()) { setBadge(0); return; }
  try {
    const data = await fetchInboxUnread();
    setBadge(data.unread || 0);
  } catch { /* silencioso */ }
}

async function loadInbox() {
  const p = parts();
  if (!p.list) return;
  const inputRow = document.querySelector('.chat-input-row');
  if (inputRow) inputRow.classList.add('hidden');
  if (!getAuthToken()) {
    p.list.innerHTML = '<p class="chat-empty">🔒 Faça login para ver as notificações da moderação.</p>';
    setBadge(0);
    return;
  }
  try {
    const data = await fetchInbox();
    const threads = data.threads || [];
    setBadge(0);
    if (!threads.length) {
      p.list.innerHTML = '<p class="chat-empty">Sem notificações por enquanto. Se você foi denunciado, as mensagens do admin aparecem aqui.</p>';
      return;
    }
    p.list.innerHTML = threads.map(t => {
      const msgs = (t.messages || []).map(m =>
        '<div class="chat-msg' + (m.is_admin ? ' mod-from-admin' : ' mine') + '">' +
          '<div class="chat-bubble">' + esc(m.content) + '</div>' +
          '<div class="chat-time">' + (m.is_admin ? '🛡 Admin · ' : 'Você · ') + fmtTime(m.created_at) + '</div>' +
        '</div>').join('');
      const done = t.status !== 'pending';
      return (
        '<div class="mod-thread" data-rid="' + esc(t.id) + '">' +
          '<div class="mod-thread-head">' +
            '<span class="mod-thread-title">Solicitação de ban</span>' +
            '<span class="mod-req-badge ' + (done ? 'mod-badge-done' : '') + '">' + esc(t.status) + '</span>' +
          '</div>' +
          '<div class="mod-thread-reason">Motivo: “' + esc(t.reason) + '”</div>' +
          '<div class="mod-thread-msgs">' + (msgs || '<p class="chat-empty">Sem mensagens ainda.</p>') + '</div>' +
          (done
            ? '<p class="mod-thread-done">Esta solicitação foi encerrada pela administração.</p>'
            : '<div class="chat-input-row mod-inbox-reply">' +
                '<input type="text" maxlength="500" class="mod-inbox-input" placeholder="Responder ao admin…" autocomplete="off" />' +
                '<button class="chat-send mod-inbox-send" title="Enviar">➤</button>' +
              '</div>') +
        '</div>'
      );
    }).join('');
    // delegado de respostas do inbox
    p.list.querySelectorAll('.mod-inbox-send').forEach(btn => {
      btn.addEventListener('click', () => sendInboxReply(btn.closest('.mod-thread').dataset.rid, btn.closest('.chat-input-row').querySelector('.mod-inbox-input')));
    });
    p.list.querySelectorAll('.mod-inbox-input').forEach(inp => {
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') sendInboxReply(inp.closest('.mod-thread').dataset.rid, inp);
      });
    });
  } catch {
    p.list.innerHTML = '<p class="chat-empty">Falha ao carregar as notificações.</p>';
  }
}

async function sendInboxReply(requestId, input) {
  const txt = (input.value || '').trim();
  if (!txt) return;
  input.disabled = true;
  const r = await inboxReply(requestId, txt);
  if (r.ok) {
    sounds.playSFX('success');
    loadInbox();
  } else {
    sounds.playSFX('denied');
    input.disabled = false;
    setStatus('❌ ' + (r.detail || 'Não foi possível responder.'), true);
  }
}

async function loadMessages(showError = true) {
  const p = parts();
  if (!p.list) return;
  const inputRow = document.querySelector('.chat-input-row');
  if (inputRow) inputRow.classList.remove('hidden');
  try {
    const res = await fetch(`${CHAT_BASE}/messages?channel=${encodeURIComponent(_tab)}&limit=60`, { cache: 'no-store' });
    const data = await res.json().catch(() => null) || { messages: [] };
    renderMessages(data);
  } catch {
    if (showError) {
      p.list.innerHTML = '<p class="chat-empty">Falha ao carregar o chat. Tente novamente.</p>';
    }
  }
}

function renderMessages(data) {
  const p = parts();
  const messages = data.messages || [];

  if (_tab === 'local' && data.localization_ok === false) {
    p.list.innerHTML = `<p class="chat-empty">${esc(data.hint || 'Chat local indisponível.')}</p>`;
    return;
  }

  if (!messages.length) {
    p.list.innerHTML = '<p class="chat-empty">' +
      (_tab === 'local'
        ? 'Nenhuma mensagem de pessoas perto de você por enquanto. Seja o primeiro!'
        : 'Nenhuma mensagem ainda. Seja o primeiro a conversar!') +
      '</p>';
    return;
  }

  const wasAtBottom = p.list.scrollHeight - p.list.scrollTop - p.list.clientHeight < 40;

  p.list.innerHTML = messages.map(m => {
    const mine = m.is_mine ? ' mine' : '';
    const rankClass = m.top_rank ? ` rank-${m.top_rank}` : '';
    const medal = m.top_rank ? { 1: '🥇', 2: '🥈', 3: '🥉' }[m.top_rank] : '';
    const adminBadge = m.is_admin_user ? '<span class="chat-admin-badge" title="Administrador">🛡</span>' : '';
    const flag = esc(m.flag || '');
    const nick = esc(m.nick || 'Sem nick');
    const ipAttr = m.ip ? ` data-ip="${esc(m.ip)}"` : '';
    let actions = '';
    const logged = !!getAuthToken();
    if (_admin) {
      actions = '<span class="chat-act" data-act="history" title="Ver histórico de mensagens" role="button" tabindex="0">📜</span>' +
        '<span class="chat-act" data-act="ban" title="Banir conta" role="button" tabindex="0">🚫</span>' +
        (m.ip ? '<span class="chat-act" data-act="banip" title="Banir IP" role="button" tabindex="0">🌐</span>' : '');
    } else if (logged) {
      actions = '<span class="chat-act" data-act="report" title="Solicitar banimento" role="button" tabindex="0">🚨</span>';
    }
    return (
      '<div class="chat-msg' + mine + rankClass + '" data-uid="' + esc(m.user_id) + '" data-nick="' + esc(m.nick || '') + '"' + ipAttr + '>' +
        '<div class="chat-msg-hdr">' +
          '<span class="chat-avatar">' + esc((m.nick || '?')[0] || '?') + '</span>' +
          '<span class="chat-nick">' + flag + ' ' + nick + '<span class="chat-medal" title="Top ' + m.top_rank + ' do ranking">' + medal + '</span>' + adminBadge + '</span>' +
          '<span class="chat-meta">Lv ' + esc(m.level) + ' · ' + esc(fmtHours(m.hours)) + '</span>' +
          actions +
        '</div>' +
        '<div class="chat-bubble">' + esc(m.content) + '</div>' +
        '<div class="chat-time">' + fmtTime(m.created_at) + '</div>' +
      '</div>'
    );
  }).join('');

  if (wasAtBottom) p.list.scrollTop = p.list.scrollHeight;
}

async function sendMessage() {
  const p = parts();
  const txt = (p.input.value || '').trim();
  if (!txt) return;

  if (!getAuthToken()) {
    setStatus('🔒 Você precisa estar logado para enviar mensagens.', true);
    sounds.playSFX('denied');
    return;
  }

  if (_textHasLink(txt)) {
    setStatus('🚫 Links não são permitidos no chat.', true);
    sounds.playSFX('denied');
    return;
  }

  p.send.disabled = true;
  try {
    const res = await fetch(`${CHAT_BASE}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ channel: _tab, content: txt.slice(0, 500) }),
    });
    const data = await res.json().catch(() => null) || {};
    if (res.ok) {
      p.input.value = '';
      sounds.playSFX('success');
      loadMessages();
    } else {
      setStatus(esc(data.detail || 'Não foi possível enviar a mensagem.'), true);
      sounds.playSFX('denied');
    }
  } catch {
    setStatus('Falha de rede ao enviar. Tente novamente.', true);
    sounds.playSFX('denied');
  } finally {
    p.send.disabled = false;
  }
}

// ─── Menu de contexto do admin (clique direito numa mensagem) ───────────────
function hideContextMenu() {
  const p = parts();
  if (p.ctx) p.ctx.classList.add('hidden');
}

function openContextMenu(x, y, data) {
  const p = parts();
  if (!p.ctx) return;
  const logged = !!getAuthToken();
  if (!_admin && !logged) return;

  p.ctx.innerHTML = '';

  if (!_admin && logged) {
    const btnRep = document.createElement('button');
    btnRep.type = 'button';
    btnRep.textContent = '🚨 Solicitar banimento';
    btnRep.addEventListener('click', () => { hideContextMenu(); doReport(data.nick || 'usuário', data.uid); });
    p.ctx.appendChild(btnRep);
  }

  if (_admin) {
    if (moderationReady()) {
      const btnHist = document.createElement('button');
      btnHist.type = 'button';
      btnHist.textContent = '📜 Ver histórico de mensagens';
      btnHist.addEventListener('click', () => { hideContextMenu(); openUserHistory(data.uid, data.nick); });
      p.ctx.appendChild(btnHist);
    }

    const btnConta = document.createElement('button');
    btnConta.type = 'button';
    btnConta.textContent = '🚫 Banir conta';
    btnConta.addEventListener('click', () => { hideContextMenu(); doBanAccount(data.uid); });
    p.ctx.appendChild(btnConta);

    if (data.ip) {
      const btnIp = document.createElement('button');
      btnIp.type = 'button';
      btnIp.textContent = '🌐 Banir IP';
      btnIp.addEventListener('click', () => { hideContextMenu(); doBanIp(data.ip); });
      p.ctx.appendChild(btnIp);
    }
  }

  const menuW = 200, menuH = p.ctx.children.length * 40 + 12;
  p.ctx.style.left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
  p.ctx.style.top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
  p.ctx.classList.remove('hidden');
}

async function doReport(nick, uid) {
  if (!uid) return;
  if (moderationReady()) openReportModal(nick, uid);
  else {
    const reason = prompt('Motivo da denúncia de ' + nick + ' (mínimo 5 caracteres):');
    if (reason && reason.trim().length >= 5) {
      const r = await reportUser(uid, reason.trim());
      setStatus(r.ok ? (r.existing ? '✅ Denúncia já pendente.' : '✅ Denúncia enviada.') : `❌ ${r.detail || 'Falha.'}`, true);
    } else if (reason != null) {
      setStatus('❌ Motivo muito curto.', true);
    }
  }
}

async function doBanAccount(uid) {
  if (!uid || !confirm('Banir esta conta? Ela não poderá mais fazer login.')) return;
  const r = await adminBanAccount(uid);
  setStatus(r.ok ? '✅ Conta banida.' : `❌ ${r.detail || 'Falha ao banir.'}`, true);
}

async function doBanIp(ip) {
  if (!ip || !confirm('Banir este IP? Ele não poderá criar conta nem fazer login.')) return;
  const r = await adminBanIp(ip);
  setStatus(r.ok ? '✅ IP banido.' : `❌ ${r.detail || 'Falha ao banir.'}`, true);
}

export async function initChat() {
  const p = parts();
  if (!p.fab || !p.panel) return;

  try {
    const check = await fetchAdminCheck();
    _admin = !!(check && check.is_admin);
  } catch {
    _admin = false;
  }

  p.fab.addEventListener('click', toggleChat);
  if (p.close) p.close.addEventListener('click', () => closeChat(false));
  if (p.send) p.send.addEventListener('click', sendMessage);
  if (p.input) p.input.addEventListener('keydown', ev => { if (ev.key === 'Enter') sendMessage(); });
  p.tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.channel)));

  // Botão direito em uma mensagem → menu
  p.list.addEventListener('contextmenu', ev => {
    const msg = ev.target.closest('.chat-msg');
    if (!msg) return;
    ev.preventDefault();
    hideContextMenu();
    openContextMenu(ev.pageX, ev.pageY, { uid: msg.dataset.uid, ip: msg.dataset.ip, nick: msg.dataset.nick });
  });

  // Botões de ação por mensagem (🚨 denunciar / 📜 histórico / 🚫 banir)
  p.list.addEventListener('click', ev => {
    const btn = ev.target.closest('.chat-act');
    const msg = ev.target.closest('.chat-msg');
    if (!btn || !msg) return;
    ev.preventDefault();
    ev.stopPropagation();
    hideContextMenu();
    const target = { uid: msg.dataset.uid, ip: msg.dataset.ip, nick: msg.dataset.nick };
    switch (btn.dataset.act) {
      case 'report': doReport(target.nick, target.uid); break;
      case 'history': openUserHistory(target.uid, target.nick); break;
      case 'ban': doBanAccount(target.uid); break;
      case 'banip': if (target.ip) doBanIp(target.ip); break;
    }
  });

  // Fechar ao clicar fora ou pressionar Esc
  document.addEventListener('click', ev => {
    hideContextMenu();
    if (!_open) return;
    if (!p.panel.contains(ev.target) && !p.fab.contains(ev.target)) closeChat(false);
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeChat(true); } });
  window.addEventListener('blur', () => hideContextMenu());
  window.addEventListener('resize', () => hideContextMenu());
}
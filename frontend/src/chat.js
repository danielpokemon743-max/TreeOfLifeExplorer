// 💬 chat.js - Chat global e local da comunidade
import { sounds } from './SoundManager.js';
import { fetchAdminCheck, getAuthToken, adminBanAccount, adminBanIp } from './auth.js';

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
  if (p.panel) p.panel.classList.add('hidden');
  hideContextMenu();
  if (!silent) sounds.playSFX('close');
}

function openChat() {
  _open = true;
  const p = parts();
  if (!p.panel) return;
  p.panel.classList.remove('hidden');
  sounds.playSFX('open');
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
  _pollTimer = setInterval(() => { if (_open) loadMessages(false); }, POLL_INTERVAL_MS);
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
  loadMessages();
}

async function loadMessages(showError = true) {
  const p = parts();
  if (!p.list) return;
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
    return (
      '<div class="chat-msg' + mine + rankClass + '" data-uid="' + esc(m.user_id) + '"' + ipAttr + '>' +
        '<div class="chat-msg-hdr">' +
          '<span class="chat-avatar">' + esc((m.nick || '?')[0] || '?') + '</span>' +
          '<span class="chat-nick">' + flag + ' ' + nick + '<span class="chat-medal" title="Top ' + m.top_rank + ' do ranking">' + medal + '</span>' + adminBadge + '</span>' +
          '<span class="chat-meta">Lv ' + esc(m.level) + ' · ' + esc(fmtHours(m.hours)) + '</span>' +
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
  if (!_admin || !p.ctx) return;

  p.ctx.innerHTML = '';

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

  const menuW = 170, menuH = p.ctx.children.length * 40 + 12;
  p.ctx.style.left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
  p.ctx.style.top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
  p.ctx.classList.remove('hidden');
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

  // Botão direito em uma mensagem → menu do admin
  p.list.addEventListener('contextmenu', ev => {
    const msg = ev.target.closest('.chat-msg');
    if (!msg) return;
    ev.preventDefault();
    hideContextMenu();
    openContextMenu(ev.pageX, ev.pageY, { uid: msg.dataset.uid, ip: msg.dataset.ip });
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
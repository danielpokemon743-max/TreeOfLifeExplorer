// 🚨 moderation.js - Solicitações de ban, histórico do usuário e conversa admin<->usuário
import { sounds } from './SoundManager.js';
import { openModal, closeModal } from './fx.js';
import {
  adminBanAccount, adminBanIp,
  reportUser, fetchBanRequests, fetchBanRequest, fetchUserChatHistory,
  adminReplyBanRequest, resolveBanRequest,
} from './auth.js';

const $ = (id) => document.getElementById(id);

// ─── estado ─────────────────────────────────────────────────────────────────
let _historyMode = 'chat';      // 'chat' | 'thread'
let _historyUserId = null;
let _historyIp = null;
let _threadRequestId = null;

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── histórico de mensagens de chat de um usuário (modal) ──────────────────
export async function openUserHistory(userId, displayName) {
  const modal = $('mod-history-modal');
  if (!modal) return;
  _historyMode = 'chat';
  _threadRequestId = null;
  _historyUserId = userId;
  _historyIp = null;
  $('mod-history-title').textContent = `Histórico de ${displayName || 'usuário'}`;
  $('mod-history-body').innerHTML = '<p class="mod-empty">Carregando…</p>';
  $('mod-history-msg').textContent = '';
  openModal(modal);

  const data = await fetchUserChatHistory(userId);
  if (!data.ok) {
    $('mod-history-body').innerHTML = `<p class="mod-empty">${esc(data.detail || 'Falha ao carregar.')}</p>`;
    return;
  }
  _historyIp = data.user.last_ip || null;
  const msgs = data.messages || [];
  $('mod-history-body').innerHTML = !msgs.length
    ? '<p class="mod-empty">Este usuário nunca enviou mensagens no chat.</p>'
    : msgs.map(m =>
        `<div class="mod-msg-row"><span class="mod-msg-time">${fmtTime(m.created_at)}</span>` +
        `<span class="mod-msg-bubble">${esc(m.content)}</span></div>`).join('');
  $('mod-history-msg').textContent = `${msgs.length} mensagens no total.`;
}

// ─── tópico de solicitação de ban (modal) ───────────────────────────────────
export async function openBanThread(requestId, targetName) {
  const modal = $('mod-history-modal');
  if (!modal) return;
  _historyMode = 'thread';
  _threadRequestId = requestId;
  _historyUserId = null;
  _historyIp = null;
  $('mod-history-title').textContent = `Solicitação de ban — ${targetName || ''}`;
  $('mod-history-body').innerHTML = '<p class="mod-empty">Carregando…</p>';
  $('mod-history-msg').textContent = '';
  openModal(modal);

  const data = await fetchBanRequest(requestId);
  if (!data.ok) {
    $('mod-history-body').innerHTML = `<p class="mod-empty">${esc(data.detail || 'Falha ao carregar.')}</p>`;
    return;
  }
  _historyUserId = data.target_user_id;
  // pega o IP do alvo para facilitar o ban por IP
  const hist = await fetchUserChatHistory(data.target_user_id);
  _historyIp = (hist.ok && hist.user && hist.user.last_ip) ? hist.user.last_ip : null;

  const meta =
    `<div class="mod-thread-meta">` +
      `<span><strong>Denunciado por:</strong> ${esc(data.requester_name)}</span>` +
      `<span><strong>Motivo:</strong> ${esc(data.reason)}</span>` +
      `<span><strong>Status:</strong> ${esc(data.status)}</span>` +
      (data.last_message ? `<span><strong>Última mensagem no chat:</strong> “${esc(data.last_message)}”</span>` : '') +
    `</div>`;
  const thread = (data.messages && data.messages.length)
    ? data.messages.map(m => {
        const who = m.is_admin ? 'Admin' : 'Você/Usuário';
        return `<div class="mod-msg-row"><span class="mod-msg-time">${fmtTime(m.created_at)}</span>` +
               `<span class="mod-msg-who">${esc(who)}:</span>` +
               `<span class="mod-msg-bubble">${esc(m.content)}</span></div>`;
      }).join('')
    : '<p class="mod-empty">Nenhuma mensagem trocada ainda.</p>';

  $('mod-history-body').innerHTML = meta + '<div class="mod-thread-list">' + thread + '</div>';
  $('mod-history-msg').textContent = '';
}

// ─── responder (admin) ──────────────────────────────────────────────────────
export function openReplyModal(requestId, targetName) {
  const modal = $('mod-reply-modal');
  if (!modal) return;
  _threadRequestId = requestId;
  $('mod-reply-title').textContent = `Responder a ${targetName || 'pessoa denunciada'}`;
  $('mod-reply-text').value = '';
  $('mod-reply-msg').textContent = '';
  openModal(modal);
  setTimeout(() => $('mod-reply-text').focus(), 60);
}

export async function openReportModal(targetName, targetUserId) {
  const modal = $('mod-report-modal');
  if (!modal) return;
  $('mod-report-target').textContent = targetName || '';
  $('mod-report-text').value = '';
  $('mod-report-msg').textContent = '';
  $('mod-report-modal').dataset.target = targetUserId;
  openModal(modal);
  setTimeout(() => $('mod-report-text').focus(), 60);
}

// ─── lista de solicitações de ban (painel admin) ────────────────────────────
export async function refreshBanRequests(containerId = 'admin-ban-requests-list') {
  const list = $(containerId);
  if (!list) return;
  const data = await fetchBanRequests('pending');
  if (!data.ok) {
    list.innerHTML = '<p class="mod-empty">Falha ao carregar solicitações.</p>';
    return;
  }
  const reqs = data.requests || [];
  if (!reqs.length) {
    list.innerHTML = '<p class="mod-empty">Nenhuma solicitação de ban pendente. 🎉</p>';
    return;
  }
  list.innerHTML = reqs.map(r =>
    `<div class="mod-req-item">` +
      `<div class="mod-req-head"><span class="mod-req-name">${esc(r.target_name)}</span>` +
      `<span class="mod-req-badge">pendente</span></div>` +
      `<div class="mod-req-meta">Denunciado por <strong>${esc(r.requester_name)}</strong></div>` +
      `<div class="mod-req-reason">“${esc(r.reason)}”</div>` +
      (r.last_message ? `<div class="mod-req-last">Última mensagem: “${esc(r.last_message)}”</div>` : '') +
      `<div class="mod-req-actions">` +
        `<button class="mod-btn" data-act="open" data-rid="${esc(r.id)}" data-name="${esc(r.target_name)}">Abrir</button>` +
        `<button class="mod-btn" data-act="history" data-uid="${esc(r.target_user_id)}" data-name="${esc(r.target_name)}">Ver msgs</button>` +
        `<button class="mod-btn mod-btn-success" data-act="resolve" data-rid="${esc(r.id)}" data-out="resolved">Resolvido</button>` +
        `<button class="mod-btn" data-act="resolve" data-rid="${esc(r.id)}" data-out="dismissed">Descartar</button>` +
      `</div>` +
    `</div>`).join('');
}

// ─── ligar os eventos dos modais e da lista ─────────────────────────────────
function _wireBanButtons() {
  $('mod-history-ban').addEventListener('click', async () => {
    if (!_historyUserId) return;
    if (!confirm('Banir esta conta? Ela não poderá mais fazer login.')) return;
    const r = await adminBanAccount(_historyUserId);
    $('mod-history-msg').textContent = r.ok ? '✅ Conta banida.' : `❌ ${r.detail || 'Falha.'}`;
    if (r.ok) refreshBanRequests();
  });
  $('mod-history-banip').addEventListener('click', async () => {
    if (!_historyIp) {
      $('mod-history-msg').textContent = '❌ Nenhum IP registrado para este usuário.';
      return;
    }
    if (!confirm(`Banir o IP ${_historyIp}? As contas desse IP também serão banidas.`)) return;
    const r = await adminBanIp(_historyIp, 'Banimento via solicitação de ban');
    $('mod-history-msg').textContent = r.ok
      ? `✅ IP ${_historyIp} banido${r.accounts_banned && r.accounts_banned.length ? ` (${r.accounts_banned.length} conta(s))` : ''}.`
      : `❌ ${r.detail || 'Falha.'}`;
    if (r.ok) refreshBanRequests();
  });
  $('mod-history-reply').addEventListener('click', () => {
    if (_historyMode === 'thread' && _threadRequestId) {
      openReplyModal(_threadRequestId, $('mod-history-title').textContent.replace('Solicitação de ban — ', ''));
    } else {
      $('mod-history-msg').textContent = 'Responder só está disponível dentro de uma solicitação de ban.';
    }
  });
}

function _wireReplyModal() {
  $('mod-reply-send').addEventListener('click', async () => {
    if (!_threadRequestId) return;
    const content = ($('mod-reply-text').value || '').trim();
    if (!content) { $('mod-reply-msg').textContent = 'Escreva uma mensagem.'; return; }
    const r = await adminReplyBanRequest(_threadRequestId, content);
    if (r.ok) {
      sounds.playSFX('success');
      closeModal($('mod-reply-modal'));
      openBanThread(_threadRequestId, '');
      refreshBanRequests();
    } else {
      $('mod-reply-msg').textContent = `❌ ${r.detail || 'Falha ao enviar.'}`;
    }
  });
}

function _wireReportModal() {
  $('mod-report-send').addEventListener('click', async () => {
    const uid = $('mod-report-modal').dataset.target;
    const reason = ($('mod-report-text').value || '').trim();
    if (!uid) return;
    if (reason.length < 5) { $('mod-report-msg').textContent = 'Descreva o motivo (mínimo 5 caracteres).'; return; }
    const r = await reportUser(uid, reason);
    if (r.ok) {
      sounds.playSFX('success');
      $('mod-report-msg').textContent = r.existing
        ? '✅ Esta pessoa já tinha uma solicitação pendente.'
        : '✅ Solicitação de banimento enviada para a administração.';
      setTimeout(() => closeModal($('mod-report-modal')), 1200);
    } else {
      $('mod-report-msg').textContent = `❌ ${r.detail || 'Falha ao enviar.'}`;
    }
  });
}

function _wireDelegatedClicks() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'open') openBanThread(btn.dataset.rid, btn.dataset.name);
    else if (act === 'history') openUserHistory(btn.dataset.uid, btn.dataset.name);
    else if (act === 'resolve') {
      const out = btn.dataset.out;
      if (!confirm(out === 'resolved' ? 'Marcar como resolvida (banida)?' : 'Descartar esta solicitação?')) return;
      resolveBanRequest(btn.dataset.rid, out).then(() => refreshBanRequests());
    }
  });
}

export function initModeration() {
  const closeBtns = ['mod-history-close', 'mod-reply-close', 'mod-report-close'];
  closeBtns.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', () => closeModal(el.closest('.modal-overlay')));
  });
  _wireBanButtons();
  _wireReplyModal();
  _wireReportModal();
  _wireDelegatedClicks();
}

// exposto para o chat.js/menu de contexto
export function moderationReady() {
  return !!$('mod-history-modal');
}

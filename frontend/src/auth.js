import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const API_BASE = '/api/auth';
const PROGRESS_BASE = '/api/progress';
const RANKING_BASE = '/api/ranking';
const ADMIN_BASE = '/api/admin';
const CHAT_BASE = '/api/chat';
const MOD_BASE = '/api/moderation';

export function getAuthToken() {
  return localStorage.getItem('passkey_auth_token');
}

export function setAuthToken(token) {
  if (token) localStorage.setItem('passkey_auth_token', token);
  else localStorage.removeItem('passkey_auth_token');
}

/**
 * Lê o corpo de uma resposta como JSON de forma segura. Se o corpo estiver vazio
 * ou não for JSON válido (ex.: o proxy devolveu uma página de erro), retorna null
 * em vez de lançar "JSON.parse: unexpected end of data".
 */
async function safeJson(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 0.1. Captcha matemático anti-bot (usado no login)
 */
export async function fetchCaptcha() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/captcha`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 0. Detecta o IP que o servidor vê (mostrado no cadastro para consentimento)
 */
export async function detectMyIp() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/detect-ip`, { cache: 'no-store' });
    if (!res.ok) return '';
    const data = await res.json();
    return data.ip || '';
  } catch {
    return '';
  }
}

/**
 * 1. Registro de Usuário (nick + senha) + Passkey
 */
export async function registerPasskey(displayName, password, deviceName, country = '', ipConsent = true) {
  const startRes = await fetch(`${API_BASE}/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName, password, device_name: deviceName, country, ip_consent: ipConsent })
  });

  if (!startRes.ok) {
    const err = (await safeJson(startRes)) || { detail: `Erro HTTP ${startRes.status}` };
    throw new Error(err.detail || 'Erro ao iniciar registro.');
  }

  const { session_id, options } = (await safeJson(startRes)) || {};
  if (!session_id || !options) {
    throw new Error('Resposta do servidor inválida ao iniciar registro.');
  }

  const attResp = await startRegistration({ optionsJSON: options });

  const finishRes = await fetch(`${API_BASE}/register/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      display_name: displayName,
      device_name: deviceName,
      webauthn_response: attResp
    })
  });

  const data = (await safeJson(finishRes)) || {};
  if (!finishRes.ok) throw new Error(data.detail || `Erro HTTP ${finishRes.status}`);

  setAuthToken(data.access_token);
  return data;
}

/**
 * 2. Login com Nick + Senha + Passkey
 */
export async function loginPasskey(displayName, password, captchaId = '', captchaAnswer = null) {
  const startRes = await fetch(`${API_BASE}/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName, password, captcha_id: captchaId, captcha_answer: captchaAnswer })
  });

  if (!startRes.ok) {
    const err = (await safeJson(startRes)) || { detail: `Erro HTTP ${startRes.status}` };
    throw new Error(err.detail || 'Nick ou senha incorretos.');
  }

  const { session_id, options } = (await safeJson(startRes)) || {};
  if (!session_id || !options) {
    throw new Error('Resposta do servidor inválida ao iniciar login.');
  }

  // Tenta usar a chave de acesso (biometria) do aparelho. Se o dispositivo não
  // tiver a passkey (ex.: conta criada em outro aparelho), cai para nick+senha,
  // que já foram validados no login/start.
  let assertionResp = {};
  try {
    assertionResp = await startAuthentication({ optionsJSON: options });
  } catch (e) {
    assertionResp = {};
  }

  const finishRes = await fetch(`${API_BASE}/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      webauthn_response: assertionResp
    })
  });

  const data = (await safeJson(finishRes)) || {};
  if (!finishRes.ok) throw new Error(data.detail || `Erro HTTP ${finishRes.status}`);

  setAuthToken(data.access_token);
  return data;
}

/**
 * 3. Adicionar Nova Passkey
 */
export async function addPasskeyDevice(deviceName) {
  const token = getAuthToken();
  if (!token) throw new Error('Você precisa estar autenticado.');

  const startRes = await fetch(`${API_BASE}/passkeys/add/start`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ device_name: deviceName })
  });

  if (!startRes.ok) throw new Error('Não foi possível iniciar cadastro de dispositivo.');

  const { session_id, options } = await startRes.json();
  const attResp = await startRegistration({ optionsJSON: options });

  const finishRes = await fetch(`${API_BASE}/passkeys/add/finish`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      session_id,
      display_name: '',
      device_name: deviceName,
      webauthn_response: attResp
    })
  });

  const data = await finishRes.json();
  if (!finishRes.ok) throw new Error(data.detail || 'Falha ao cadastrar dispositivo.');
  return data;
}

/**
 * 4. Obter Perfil do Usuário
 */
export async function fetchUserProfile() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      setAuthToken(null);
      return null;
    }
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * 5. Logout
 */
export async function logoutUser() {
  const token = getAuthToken();
  if (token) {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
  }
  setAuthToken(null);
}

/**
 * 6. Gravar Espécie Descoberta no PostgreSQL
 */
export async function saveDiscovery(speciesId) {
  const token = getAuthToken();
  if (!token) return { ok: false, achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/discoveries`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ species_id: speciesId })
    });
    const data = await res.json();
    return { ok: res.ok, achievements: data.new_achievements || [], xp_gained: data.xp_gained || 0 };
  } catch {
    return { ok: false, achievements: [], xp_gained: 0 };
  }
}

/**
 * 7. Gravar Táxon Favorito no PostgreSQL
 */
export async function saveFavorite(itemType, itemId) {
  const token = getAuthToken();
  if (!token) return { ok: false, achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/favorites`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ item_type: itemType, item_id: itemId })
    });
    const data = await res.json();
    return { ok: res.ok, achievements: data.new_achievements || [], xp_gained: data.xp_gained || 0 };
  } catch {
    return { ok: false, achievements: [], xp_gained: 0 };
  }
}

/**
 * 8. Listar Favoritos
 */
export async function fetchFavorites() {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${PROGRESS_BASE}/favorites`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 9. Remover Favorito
 */
export async function removeFavorite(itemId) {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const res = await fetch(`${PROGRESS_BASE}/favorites/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 10. Listar Conquistas
 */
export async function fetchAchievements() {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${PROGRESS_BASE}/achievements`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 10b. Desbloquear conquista secreta
 */
export async function unlockAchievement(code) {
  const token = getAuthToken();
  if (!token) return { status: 'unauthorized', new_achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/achievements/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    return { status: data.status || 'error', new_achievements: data.new_achievements || [] };
  } catch {
    return { status: 'error', new_achievements: [] };
  }
}

/**
 * 11. Descobrimento em lote
 */
export async function saveDiscoveriesBatch(speciesIds) {
  const token = getAuthToken();
  if (!token) return { ok: false, achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/discoveries/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ species_ids: speciesIds })
    });
    const data = await res.json();
    return { ok: res.ok, achievements: data.new_achievements || [], xp_gained: data.xp_gained || 0 };
  } catch {
    return { ok: false, achievements: [], xp_gained: 0 };
  }
}

/**
 * 12. Obter perfil de progresso (XP, nível, contadores)
 */
export async function fetchUserProgress() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${PROGRESS_BASE}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 13. Reportar tempo ativo no site (segundos)
 */
export async function reportSessionTime(seconds) {
  const token = getAuthToken();
  if (!token) return { ok: false, achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/session-time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ seconds })
    });
    const data = await res.json();
    return {
      ok: res.ok,
      achievements: data.new_achievements || [],
      total_seconds: data.total_seconds || 0,
    };
  } catch {
    return { ok: false, achievements: [], total_seconds: 0 };
  }
}

/**
 * 14. DEV: subir níveis rapidamente (comando secreto "0909")
 */
export async function devLevelUp(levels = 10) {
  const token = getAuthToken();
  if (!token) return { status: 'unauthorized', level: null, xp_gained: 0, new_achievements: [] };

  try {
    const res = await fetch(`${PROGRESS_BASE}/level-dev`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ levels })
    });
    const data = await res.json();
    return {
      status: data.status || 'error',
      old_level: data.old_level,
      new_level: data.new_level,
      xp_gained: data.xp_gained || 0,
      new_achievements: data.new_achievements || [],
    };
  } catch {
    return { status: 'error', level: null, xp_gained: 0, new_achievements: [] };
  }
}

/**
 * 15. Ranking Global (público — não precisa de token)
 */
export async function fetchRanking(sort = 'xp') {
  try {
    const res = await fetchWithTimeout(`${RANKING_BASE}?sort=${encodeURIComponent(sort)}`, { cache: 'no-store' });
    if (!res.ok) return { ranking: [], sort, total: 0 };
    return await res.json();
  } catch {
    return { ranking: [], sort, total: 0 };
  }
}

// fetch com timeout (45s) — evita "Carregando…" eterno quando o servidor demora
async function fetchWithTimeout(url, opts = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 16. Admin: o usuário logado é admin?
 */
export async function fetchAdminCheck() {
  const token = getAuthToken();
  if (!token) return { is_admin: false };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/check`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return { is_admin: false };
    return await res.json();
  } catch {
    return { is_admin: false };
  }
}

/**
 * 16b. Admin: IP atual do admin logado (banir por IP sem digitar)
 */
export async function fetchMyIp() {
  const token = getAuthToken();
  if (!token) return { ip: '', _ok: true };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/my-ip`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return { ip: '', _ok: false };
    const data = await res.json();
    return { ip: data.ip || '', _ok: true };
  } catch {
    return { ip: '', _ok: false };
  }
}

/**
 * 17. Admin: lista de usuários (nick, IP, status de ban)
 */
export async function fetchAdminUsers() {
  const token = getAuthToken();
  if (!token) return { users: [], _ok: true };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/users`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { users: [], _ok: false };
    return { ...(await res.json()), _ok: true };
  } catch {
    return { users: [], _ok: false };
  }
}

/**
 * 17b. Admin: estatísticas de visualizações do site (IPs únicos)
 */
export async function fetchSiteViews() {
  const token = getAuthToken();
  if (!token) return { total: 0, views: [], _ok: true };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/views`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { total: 0, views: [], _ok: false };
    return { ...(await res.json()), _ok: true };
  } catch {
    return { total: 0, views: [], _ok: false };
  }
}

/**
 * 18. Admin: banir / desbanir conta
 */
export async function adminBanAccount(userId) {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await res.json();
    return { ok: res.ok, detail: data.detail || '' };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

export async function adminUnbanAccount(userId) {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await res.json();
    return { ok: res.ok, detail: data.detail || '' };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

/**
 * 19. Admin: banir / listar / desbanir IPs
 */
export async function adminBanIp(ip, reason = '') {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/ip-bans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ip, reason })
    });
    const data = await res.json();
    return { ok: res.ok, detail: data.detail || '', accounts_banned: data.accounts_banned || [] };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

export async function fetchAdminIpBans() {
  const token = getAuthToken();
  if (!token) return { ip_bans: [], _ok: true };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/ip-bans`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { ip_bans: [], _ok: false };
    return { ...(await res.json()), _ok: true };
  } catch {
    return { ip_bans: [], _ok: false };
  }
}

export async function adminUnbanIp(ip) {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithTimeout(`${ADMIN_BASE}/ip-bans/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();
    return { ok: res.ok, detail: data.detail || '' };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

/**
 * 20. Admin: alertas de mensagens ofensivas bloqueadas no chat
 */
export async function fetchChatReports() {
  const token = getAuthToken();
  if (!token) return { reports: [], _ok: true };
  try {
    const res = await fetchWithTimeout(`${CHAT_BASE}/reports`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { reports: [], _ok: false };
    return { ...(await res.json()), _ok: true };
  } catch {
    return { reports: [], _ok: false };
  }
}

export async function resolveChatReport(reportId) {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithTimeout(`${CHAT_BASE}/reports/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ report_id: reportId })
    });
    return { ok: res.ok, detail: '' };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

/**
 * 21. Moderação: solicitação de ban + caixa de notificações do admin
 */

async function _mod(tokenRequired, path, options = {}) {
  const token = getAuthToken();
  if (!token) return { ok: false, detail: 'Não autenticado' };
  try {
    const res = await fetchWithTimeout(`${MOD_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, detail: body.detail || '', ...body };
  } catch {
    return { ok: false, detail: 'Erro de rede' };
  }
}

export function reportUser(targetUserId, reason) {
  return _mod(true, '/report-user', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  });
}

export function fetchBanRequests(status = 'pending') {
  return _mod(true, `/ban-requests?status=${encodeURIComponent(status)}`);
}

export function fetchBanRequest(requestId) {
  return _mod(true, `/ban-requests/${encodeURIComponent(requestId)}`);
}

export function adminReplyBanRequest(requestId, content) {
  return _mod(true, `/ban-requests/${encodeURIComponent(requestId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function resolveBanRequest(requestId, outcome) {
  return _mod(true, `/ban-requests/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  });
}

export function fetchUserChatHistory(userId) {
  return _mod(true, `${ADMIN_BASE}/users/${encodeURIComponent(userId)}/messages`);
}

export function fetchInbox() {
  return _mod(true, '/inbox');
}

export function fetchInboxUnread() {
  return _mod(true, '/inbox/unread');
}

export function inboxReply(requestId, content) {
  return _mod(true, `/inbox/${encodeURIComponent(requestId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

const ACHIEVEMENT_NAMES = {
  "PRIMEIRA_DESCOBERTA": "Primeira Descoberta",
  "CINCO_DESCOBERTAS": "Colecionador Iniciante",
  "DEZ_DESCOBERTAS": "Naturalista",
  "VINTE_CINCO_DESCOBERTAS": "Explorador Dedicado",
  "CINQUENTA_DESCOBERTAS": "Biólogo de Campo",
  "CEM_DESCOBERTAS": "Mestre da Biodiversidade",
  "DUZENTAS_DESCOBERTAS": "Enciclopédia Viva",
  "QUINHENTAS_DESCOBERTAS": "Guardião da Vida",
  "MIL_DESCOBERTAS": "Lenda da Taxonomia",
  "PRIMEIRO_FAVORITO": "Favorito",
  "CINCO_FAVORITOS": "Curador",
  "DEZ_FAVORITOS": "Colecionador de Espécies",
  "VINTE_CINCO_FAVORITOS": "Arquivista",
  "CINQUENTA_FAVORITOS": "Bibliotecário da Vida",
  "TREINTA_MINUTOS": "Dedicação",
  "UMA_HORA": "Devoto",
  "DUAS_HORAS": "Viciado em Descobertas",
  "CINCO_HORAS": "Cientista Dedicado",
  "DEZ_HORAS": "O Explorador Incansável",
  "TODOS_REINOS": "Pan-biológico",
  "KONAMI": "Código Secreto",
  "QUINZE_MINUTOS": "Curiosidade",
  "QUARENTA_CINCO_MINUTOS": "Foco",
  "TRES_HORAS": "Determinação",
  "QUARENTA_FAVORITOS": "Colecionador Sênior",
  "CEM_FAVORITOS": "Arquivo de Vida",
  "TREZENTAS_DESCOBERTAS": "Investigador",
  "SETECENTAS_DESCOBERTAS": "Explorador Extremo",
  "NIVEL_TRES": "Explorador em Ascensão",
  "NIVEL_CINCO": "Taxonomista Expert",
  "NIVEL_DEZ": "Mestre da Árvore"
};

const ACHIEVEMENT_DESCRIPTIONS = {
  "PRIMEIRA_DESCOBERTA": "Explore seu primeiro táxon!",
  "CINCO_DESCOBERTAS": "Descubra 5 táxons diferentes.",
  "DEZ_DESCOBERTAS": "Descubra 10 táxons diferentes.",
  "VINTE_CINCO_DESCOBERTAS": "Descubra 25 táxons.",
  "CINQUENTA_DESCOBERTAS": "Descubra 50 táxons.",
  "CEM_DESCOBERTAS": "Descubra 100 táxons!",
  "DUZENTAS_DESCOBERTAS": "Descubra 200 táxons.",
  "QUINHENTAS_DESCOBERTAS": "Descubra 500 táxons!",
  "MIL_DESCOBERTAS": "Descubra 1.000 táxons!",
  "PRIMEIRO_FAVORITO": "Salve seu primeiro táxon favorito.",
  "CINCO_FAVORITOS": "Tenha 5 táxons favoritos.",
  "DEZ_FAVORITOS": "Tenha 10 favoritos.",
  "VINTE_CINCO_FAVORITOS": "Tenha 25 favoritos.",
  "CINQUENTA_FAVORITOS": "Tenha 50 favoritos!",
  "TREINTA_MINUTOS": "Fique 30 minutos explorando.",
  "UMA_HORA": "Fique 1 hora explorando.",
  "DUAS_HORAS": "Fique 2 horas explorando.",
  "CINCO_HORAS": "Fique 5 horas explorando.",
  "DEZ_HORAS": "Fique 10 horas explorando!",
  "TODOS_REINOS": "Descubra táxons de todos os reinos.",
  "KONAMI": "Digite o código Konami no teclado (↑ ↑ ↓ ↓ ← → ← → B A).",
  "QUINZE_MINUTOS": "Fique 15 minutos explorando.",
  "QUARENTA_CINCO_MINUTOS": "Fique 45 minutos explorando.",
  "TRES_HORAS": "Fique 3 horas explorando.",
  "QUARENTA_FAVORITOS": "Tenha 40 favoritos.",
  "CEM_FAVORITOS": "Tenha 100 favoritos!",
  "TREZENTAS_DESCOBERTAS": "Descubra 300 táxons.",
  "SETECENTAS_DESCOBERTAS": "Descubra 700 táxons.",
  "NIVEL_TRES": "Alcance o nível 3.",
  "NIVEL_CINCO": "Alcance o nível 5.",
  "NIVEL_DEZ": "Alcance o nível 10."
};

export { ACHIEVEMENT_NAMES, ACHIEVEMENT_DESCRIPTIONS };

/**
 * Lista de países para a seleção no cadastro (nome em português → guardado no banco).
 */
export const COUNTRIES = [
  "Brasil", "Portugal", "Moçambique", "Angola", "Cabo Verde", "Guiné-Bissau",
  "São Tomé e Príncipe", "Timor-Leste", "Argentina", "Chile", "Uruguai",
  "Paraguai", "Bolívia", "Peru", "Equador", "Colômbia", "Venezuela", "Guiana",
  "Suriname", "México", "Cuba", "Estados Unidos", "Canadá",
  "Espanha", "França", "Itália", "Alemanha", "Reino Unido", "Suíça",
  "Países Baixos", "Bélgica", "Irlanda", "Suécia", "Noruega", "Dinamarca",
  "Finlândia", "Polônia", "Ucrânia", "Rússia", "Japão", "China", "Coreia do Sul",
  "Índia", "Austrália", "Nova Zelândia", "África do Sul", "Nigéria", "Egito",
  "Marrocos", "Quênia", "Gana", "Senegal", "Israel", "Turquia", "Arábia Saudita",
  "Emirados Árabes Unidos", "Outro",
];
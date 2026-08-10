import './style.css';
import { TreeNode, TreeRenderer } from './TreeRenderer.js';
import { sounds }                 from './SoundManager.js';
import { 
  registerPasskey, 
  loginPasskey, 
  addPasskeyDevice, 
  fetchUserProfile, 
  logoutUser, 
  saveDiscovery, 
  saveFavorite,
  fetchFavorites,
  removeFavorite,
  fetchAchievements,
  unlockAchievement,
  fetchUserProgress,
  reportSessionTime,
  devLevelUp,
  ACHIEVEMENT_NAMES,
  ACHIEVEMENT_DESCRIPTIONS
} from './auth.js';
 
// ─── SANITIZAÇÃO (XSS) ────────────────────────────────────────────────────────
// Escapa texto para uso seguro dentro de HTML. Aplicar em QUALQUER valor que
// venha de API externa, banco ou input do usuário antes de ir para innerHTML.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
// Escapa valor para uso dentro de atributos HTML (ex.: data-name="...")
function escAttr(value) {
  return esc(value);
}
// Garante que uma URL usada em atributos href/src comece com protocolo seguro
// (evita javascript: / data: maliciosos).
function safeUrl(value) {
  const v = String(value ?? '');
  if (/^(https?:|\/\/)/i.test(v)) return v;
  return '';
}

// ─── ELEMENTOS DO DOM ────────────────────────────────────────────────────────
const canvas       = document.getElementById('tree-canvas');
const infoPanel    = document.getElementById('info-panel');
const closeInfoBtn = document.getElementById('close-panel');
const taxonName    = document.getElementById('taxon-name');
const taxonRank    = document.getElementById('taxon-rank');
const taxonDesc    = document.getElementById('taxon-desc');
const taxonImgWrap = document.getElementById('taxon-img-wrap');
const lineageSect  = document.getElementById('lineage-section');
const lineageList  = document.getElementById('lineage-list');
const wikiLink     = document.getElementById('wiki-link');
const hintEl       = document.getElementById('hint');
const searchInput  = document.getElementById('search-input');
const searchBtn    = document.getElementById('search-btn');
 
// Botões de Ações e Progresso do Usuário
const btnFavTaxon      = document.getElementById('btn-fav-taxon');

// Sliders de Áudio
const musicSlider      = document.getElementById('music-slider');
const sfxSlider        = document.getElementById('sfx-slider');

// Página de Favoritos
const btnFavsPage      = document.getElementById('btn-favs-page');
const favsModal        = document.getElementById('favs-modal');
const closeFavsBtn     = document.getElementById('close-favs');
const favsList         = document.getElementById('favs-list');

// Página de Conquistas
const btnAchievementsPage = document.getElementById('btn-achievements-page');
const achievementsModal    = document.getElementById('achievements-modal');
const closeAchievementsBtn = document.getElementById('close-achievements');
const achievementsList     = document.getElementById('achievements-list');

const backgroundsModal = document.getElementById('backgrounds-modal');
const closeBackgroundsBtn = document.getElementById('close-backgrounds');
const backgroundsGrid = document.getElementById('backgrounds-grid');
const btnBackgroundsPage = document.getElementById('btn-backgrounds-page');

// Toast de Notificação
const notifToast       = document.getElementById('notification-toast');
 
// Painel de Estatísticas
const statsPanel   = document.getElementById('stats-panel');
const statsCount   = document.getElementById('stats-count');
const statsLoading = document.getElementById('stats-loading');
const statsBar     = document.getElementById('stats-bar');
 
// Botões de Controle e Modais
const btnZoomIn  = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnReset   = document.getElementById('btn-reset');
const btnSources = document.getElementById('btn-sources');
const btnHelp    = document.getElementById('btn-help');
const btnAuth    = document.getElementById('btn-auth');
 
const helpModal    = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help');
 
const authModal    = document.getElementById('auth-modal');
const closeAuthBtn = document.getElementById('close-auth');
const authUnlogged = document.getElementById('auth-unlogged');
const authLogged   = document.getElementById('auth-logged');
 
const btnRegisterPasskey = document.getElementById('btn-register-passkey');
const btnLoginPasskey    = document.getElementById('btn-login-passkey');
const btnAddDevice       = document.getElementById('btn-add-device');
const btnLogout          = document.getElementById('btn-logout');
 
// ─── ESTADO GLOBAL ───────────────────────────────────────────────────────────
// Palavras bloqueadas em nicks (mesma lógica do backend)
const BANNED_NICKWORDS = [
  'puta','puto','porra','caralho','foda','foder','merda','bosta','cagar','cacete',
  'piroca','buceta','xota','rola','filhodaputa','arrombado','viado','bixa',
  'escroto','idiota','macaco','negrada','crioulo','nazista','hitler','ku klux',
  'fuck','fucking','shit','bitch','dick','cock','pussy','asshole','nigger',
  'faggot','retard','rape','rapist','kill','murder','sex','sexual'
];
function _normNick(text) {
  return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
let renderer;
let rootNode = null;
let currentSelectedNode = null;
let currentProfile = null;
let currentProgress = null;
window.allTreeNodes = [];
window._nodeById = new Map();
window._bioFilterEnabled = true;
window._rawTsvText = null;
window._bioFilterCount = 0;

// ─── SÍMBOLOS E FUNDOS POR NÍVEL ─────────────────────────────────────────────
const LEVEL_SYMBOLS = {
  1: '🌱', 2: '🌿', 3: '🐛', 4: '🦋', 5: '🐦',
  6: '🦎', 7: '🦁', 8: '🦅', 9: '🐉', 10: '🌌'
};
const LEVEL_SYMBOL_DEFAULT = '⭐';

function levelSymbol(level) {
  return LEVEL_SYMBOLS[level] || LEVEL_SYMBOL_DEFAULT;
}

// Fundos: cada um é liberado ao atingir um nível.
// `css` aplicado ao <body>; `interactive` ativa o canvas animado do nível 10.
const LEVEL_BACKGROUNDS = [
  { id: 'abyss',        name: 'Abismo',       level: 1,  css: 'background: radial-gradient(ellipse at 50% 20%, #1b1b3a 0%, #07070f 65%);' },
  { id: 'deepsea',      name: 'Oceano',       level: 2,  css: 'background: radial-gradient(ellipse at 30% 20%, #0f3d5c 0%, #071a2b 70%);' },
  { id: 'forest',       name: 'Floresta',     level: 3,  css: 'background: radial-gradient(ellipse at 70% 25%, #123b1f 0%, #07150d 70%);' },
  { id: 'savanna',      name: 'Savana',       level: 4,  css: 'background: linear-gradient(160deg, #3d2a12 0%, #1c120a 60%, #07070f 100%);' },
  { id: 'desert',       name: 'Deserto',      level: 5,  css: 'background: linear-gradient(170deg, #4a2f0e 0%, #2a1a08 55%, #120a05 100%);' },
  { id: 'jungle',       name: 'Selva',        level: 6,  css: 'background: radial-gradient(ellipse at 45% 15%, #14532d 0%, #0a2b16 65%, #05160c 100%);' },
  { id: 'aurora',       name: 'Aurora',       level: 7,  css: 'background: radial-gradient(ellipse at 50% 100%, #0b2447 0%, #10265c 40%, #07070f 80%);' },
  { id: 'volcano',      name: 'Vulcão',       level: 8,  css: 'background: radial-gradient(ellipse at 50% 120%, #5a1616 0%, #2b0b0b 55%, #0a0505 100%);' },
  { id: 'galaxy',       name: 'Galáxia',      level: 9,  css: 'background: radial-gradient(ellipse at 35% 30%, #2b0f4d 0%, #15082b 55%, #07070f 100%);' },
  { id: 'universe',     name: 'Universo',     level: 10, css: 'background: radial-gradient(ellipse at 50% 45%, #0b1026 0%, #05070f 100%);', interactive: true },
];

// Fundo selecionado pelo usuário (persistido localmente)
let _selectedBgId = localStorage.getItem('tol_selected_bg') || null;
let _interactiveBg = null;   // canvas animado
let _interactiveRAF = null;  // requestAnimationFrame id
let _pulseRAF = null;        // loop da luz pulsante
let _pulseEl = null;         // elemento #bg-light
let _lightEnabled = localStorage.getItem('tol_light_enabled') !== 'off'; // iluminação do fundo

// Padrões de pulso da luz que ilumina o fundo.
// Cada fundo tem um "coração" único: forma de onda, velocidade, força e posição.
//   wf    : ('sine' suave, 'pulse' forte e contínuo, 'swell' sobe rápido e murcha devagar, 'bump' "1,2")
//   speed : ciclos por minuto (alto = rápido)
//   min/max: intensidade da luz (0..1)
//   cx,cy: centro da luz em %
//   r,g,b: cor da luz (combina com o tom do fundo)
const BG_PULSE = {
  abyss:    { wf: 'sine',   speed: 3,  min: 0.10, max: 0.45, cx: 50, cy: 20, r: 150, g: 170, b: 255 },  // respiro lentíssimo e fraco nas profundezas
  deepsea:  { wf: 'swell',  speed: 22, min: 0.15, max: 0.85, cx: 25, cy: 18, r: 120, g: 200, b: 255 },  // onda que sobre e murcha, luz baixa
  forest:   { wf: 'bump',   speed: 7,  min: 0.10, max: 0.80, cx: 70, cy: 25, r: 140, g: 230, b: 160 },  // "1,2" dois patamares, quase parado
  savanna:  { wf: 'pulse',  speed: 40, min: 0.15, max: 0.95, cx: 50, cy: 55, r: 255, g: 190, b: 120 },  // batida aguda e quente
  desert:   { wf: 'sine',   speed: 68, min: 0.35, max: 1.00, cx: 50, cy: 70, r: 255, g: 160, b: 80 },   // vibração seca e escaldante
  jungle:   { wf: 'swell',  speed: 30, min: 0.10, max: 0.90, cx: 45, cy: 12, r: 120, g: 220, b: 150 },  // cresce rápido, luz bem no dossel
  aurora:   { wf: 'bump',   speed: 4,  min: 0.15, max: 0.95, cx: 50, cy: 100, r: 80, g: 255, b: 200 },  // mansinho, luz varrendo o chão
  volcano:  { wf: 'pulse',  speed: 52, min: 0.20, max: 1.00, cx: 50, cy: 120, r: 255, g: 120, b: 60 },  // explosões curtas sob o orifício
  galaxy:   { wf: 'sine',   speed: 2,  min: 0.05, max: 0.60, cx: 30, cy: 25, r: 200, g: 120, b: 255 },  // quase estático, brilho remoto
  universe: { wf: 'swell',  speed: 18, min: 0.10, max: 0.95, cx: 50, cy: 45, r: 150, g: 180, b: 255 },  // pulsação ampla da explosão
};

function unlockedBackgrounds(level) {
  return LEVEL_BACKGROUNDS.filter(b => (level || 1) >= b.level);
}

function applyBackground(id) {
  const bg = LEVEL_BACKGROUNDS.find(b => b.id === id);
  if (!bg) {
    console.warn('[Fundo] ID desconhecido:', id);
    return false;
  }
  const userLevel = currentProgress?.level || currentProfile?.level || 1;
  console.log('[Fundo] Aplicando:', bg.id, '| nome:', bg.name, '| requer nível:', bg.level, '| nível atual:', userLevel, '| logged:', !!currentProfile);
  if (userLevel < bg.level) {
    console.warn('[Fundo] Bloqueado — nível atual', userLevel, '<', bg.level);
    return false;
  }

  _selectedBgId = id;
  localStorage.setItem('tol_selected_bg', id);

  // Aplica o gradiente do fundo + sempre garante cor de fundo escura de fallback
  // (se o gradiente falhar/cancelar, o site nunca fica branco)
  document.body.style.cssText = bg.css + '; background-color: #07070f;';
  document.body.style.color = 'var(--text)';
  console.log('[Fundo] body.style agora =', document.body.getAttribute('style'));

  // Fundo interativo (nível 10)
  if (bg.interactive) startInteractiveBackground();
  else stopInteractiveBackground();

  // (Re)inicia a pulsação com o padrão deste fundo
  startPulse(id);
  return true;
}

// ─── LUZ PULSANTE ────────────────────────────────────────────────────────────
function startPulse(bgId) {
  stopPulse();
  const cfg = BG_PULSE[bgId];
  if (!cfg) return;

  _pulseEl = document.getElementById('bg-light');
  if (!_pulseEl) {
    _pulseEl = document.createElement('div');
    _pulseEl.id = 'bg-light';
    document.body.insertBefore(_pulseEl, document.body.firstChild);
  }

  // Se a iluminação estiver desligada, mantém o fundo puro (sem luz)
  if (!_lightEnabled) {
    _pulseEl.style.opacity = '0';
    return;
  }

  const cx = cfg.cx ?? 50;
  const cy = cfg.cy ?? 35;
  _pulseEl.style.setProperty('--lx', `${cx}%`);
  _pulseEl.style.setProperty('--ly', `${cy}%`);
  _pulseEl.style.setProperty('--lr', cfg.r ?? 255);
  _pulseEl.style.setProperty('--lg', cfg.g ?? 255);
  _pulseEl.style.setProperty('--lb', cfg.b ?? 255);

  const periodMs = 60000 / Math.max(1, cfg.speed || 12); // rpm -> ms por ciclo
  const start = performance.now();
  let phase = cfg.min;

  // Função suave (ease) usada para evitar cortes bruscos no fim do pulso
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  const loop = () => {
    const t = (performance.now() - start) / periodMs; // fases progressivas
    const p = ((t % 1) + 1) % 1; // 0..1 contínuo
    let n; // valor em [0,1] da onda
    switch (cfg.wf) {
      case 'sine':
        n = (Math.sin(p * Math.PI * 2) + 1) / 2;
        break;
      case 'pulse':
        // Forte e destacado, mas nunca corta: sempre encosta em 0 e 1 suavemente
        n = Math.pow(Math.sin(p * Math.PI), 6);
        break;
      case 'swell':
        // Sobe rápido e "murcha" devagar (decai suavemente, sem queda brusca)
        n = p < 0.25 ? easeOut(p / 0.25) : 1 - easeOut((p - 0.25) / 0.75);
        break;
      case 'bump':
        // "1, 2": sobe em dois patamares e apaga bem devagar
        n = p < 0.20 ? (p / 0.20) : p < 0.55 ? 1 : (1 - easeOut((p - 0.55) / 0.45));
        break;
      default:
        n = (Math.sin(p * Math.PI * 2) + 1) / 2;
    }
    const val = cfg.min + (cfg.max - cfg.min) * n;
    _pulseEl.style.setProperty('--lc', val.toFixed(3));
    if (Math.abs(val - phase) > 0.001) _pulseEl.style.opacity = '1';
    phase = val;
    _pulseRAF = requestAnimationFrame(loop);
  };
  loop();
}

function stopPulse() {
  if (_pulseRAF) {
    cancelAnimationFrame(_pulseRAF);
    _pulseRAF = null;
  }
  if (_pulseEl) {
    _pulseEl.style.opacity = '0';
  }
}

// Liga/desliga a iluminação do fundo (mantém apenas o fundo)
function toggleLight() {
  _lightEnabled = !_lightEnabled;
  localStorage.setItem('tol_light_enabled', _lightEnabled ? 'on' : 'off');
  const label = document.getElementById('light-toggle-label');
  if (label) label.textContent = _lightEnabled ? '💡 Iluminação: Ligada' : '💡 Iluminação: Desligada';
  if (_lightEnabled) startPulse(_selectedBgId);
  else stopPulse();
  console.log('[Fundo] Iluminação', _lightEnabled ? 'LIGADA' : 'DESLIGADA');
}

// Inicia o canvas animado de "Universo" (partículas flutuantes + reação ao mouse)
function startInteractiveBackground() {
  console.log('[Fundo] Iniciando fundo interativo (Universo)');
  stopInteractiveBackground();
  let el = document.getElementById('interactive-bg');
  if (!el) {
    el = document.createElement('canvas');
    el.id = 'interactive-bg';
    document.body.insertBefore(el, document.body.firstChild);
  }
  const ctx = el.getContext('2d');
  const resize = () => {
    el.width = window.innerWidth;
    el.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  // Posição do mouse (em pixels do canvas). null = fora.
  let mouse = { x: -9999, y: -9999, active: false };
  const onMouseMove = (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  };
  const onMouseLeave = () => {
    mouse.active = false;
    mouse.x = -9999;
    mouse.y = -9999;
  };
  // Suporte a touch: o dedo também interage com as partículas
  const onTouchMove = (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.active = true;
    }
  };
  const onTouchEnd = () => {
    mouse.active = false;
    mouse.x = -9999;
    mouse.y = -9999;
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd);
  _interactiveMouseMove = onMouseMove;
  _interactiveMouseLeave = onMouseLeave;
  _interactiveTouchMove = onTouchMove;
  _interactiveTouchEnd = onTouchEnd;

  // Raio de influência do mouse e intensidade do efeito
  const RADIUS = 160;
  const FORCE = 0.6;
  const LINK_DIST = 120; // distância máx. para desenhar linhas entre partículas

  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const particles = Array.from({ length: 150 }, () => ({
    x: Math.random() * el.width,
    y: Math.random() * el.height,
    r: Math.random() * 2 + 0.6,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    baseVx: (Math.random() - 0.5) * 0.25,
    baseVy: (Math.random() - 0.5) * 0.25,
    hue: 180 + Math.random() * 60,
  }));

  const draw = () => {
    ctx.clearRect(0, 0, el.width, el.height);

    // Linhas de conexão entre partículas próximas
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < LINK_DIST) {
          ctx.strokeStyle = `hsla(200, 90%, 75%, ${(1 - dist / LINK_DIST) * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Linhas das partículas até o mouse quando ele está por perto
    if (mouse.active) {
      ctx.beginPath();
      for (const p of particles) {
        const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (d < LINK_DIST * 1.2) {
          const alpha = (1 - d / (LINK_DIST * 1.2)) * 0.5;
          ctx.strokeStyle = `hsla(190, 90%, 80%, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      // Repulsão pelo mouse: empurra para longe do cursor
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < RADIUS) {
          const force = (1 - dist / RADIUS) * FORCE;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // Amortecimento leve para voltar à velocidade de cruzeiro
      p.vx += (p.baseVx - p.vx) * 0.02;
      p.vy += (p.baseVy - p.vy) * 0.02;

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = el.width;
      if (p.x > el.width) p.x = 0;
      if (p.y < 0) p.y = el.height;
      if (p.y > el.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, 0.8)`;
      ctx.fill();
    }
    _interactiveRAF = requestAnimationFrame(draw);
  };

  draw();
}

// Variáveis para remover os listeners do mouse/touch ao desligar o fundo
let _interactiveMouseMove = null;
let _interactiveMouseLeave = null;
let _interactiveTouchMove = null;
let _interactiveTouchEnd = null;

function stopInteractiveBackground() {
  if (_interactiveRAF) {
    cancelAnimationFrame(_interactiveRAF);
    _interactiveRAF = null;
  }
  if (_interactiveMouseMove) {
    document.removeEventListener('mousemove', _interactiveMouseMove);
    _interactiveMouseMove = null;
  }
  if (_interactiveMouseLeave) {
    document.removeEventListener('mouseleave', _interactiveMouseLeave);
    _interactiveMouseLeave = null;
  }
  if (_interactiveTouchMove) {
    document.removeEventListener('touchmove', _interactiveTouchMove);
    _interactiveTouchMove = null;
  }
  if (_interactiveTouchEnd) {
    document.removeEventListener('touchend', _interactiveTouchEnd);
    _interactiveTouchEnd = null;
  }
  const el = document.getElementById('interactive-bg');
  if (el) el.remove();
}

// ─── RASTREAMENTO DE TEMPO ATIVO ─────────────────────────────────────────────
let _activeSecondsAccum = 0;
let _activeLastTick = Date.now();
let _pageIsVisible = !document.hidden;

function _sessionTick() {
  const now = Date.now();
  if (_pageIsVisible) {
    _activeSecondsAccum += Math.floor((now - _activeLastTick) / 1000);
  }
  _activeLastTick = now;
}

// Sincroniza o acumulador de tempo ativo a cada segundo
setInterval(_sessionTick, 1000);

// Pausa/retoma quando a aba perde/ganha foco
document.addEventListener('visibilitychange', () => {
  _sessionTick();
  _pageIsVisible = !document.hidden;
});

// Envia o tempo acumulado ao backend periodicamente (30s) e re-checa conquistas
setInterval(async () => {
  if (!currentProfile) return;
  _sessionTick();
  const seconds = _activeSecondsAccum;
  if (seconds <= 0) return;
  _activeSecondsAccum = 0;

  try {
    const result = await reportSessionTime(seconds);
    if (result && result.achievements && result.achievements.length > 0) {
      result.achievements.forEach(code => {
        showAchievementNotification(code, ACHIEVEMENT_NAMES[code] || code, ACHIEVEMENT_DESCRIPTIONS[code] || '');
      });
    }
    fetchUserProgress().then(p => {
      if (p) {
        currentProgress = p;
        renderLevelUI(p);
      }
    });
  } catch {
    _activeSecondsAccum += seconds;
  }
}, 30000);

// Tenta enviar o restante ao fechar/fechar a aba
window.addEventListener('beforeunload', () => {
  _sessionTick();
  if (currentProfile && _activeSecondsAccum > 0) {
    reportSessionTime(_activeSecondsAccum);
  }
});

function normalizeStr(str) {
  return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
}


async function findBestCatalogueMatch(name, lineage = []) {

    const url = `https://api.checklistbank.org/dataset/3LR/nameusage/search?q=${encodeURIComponent(name)}&limit=20`;

    const res = await fetch(url);

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.result?.length) return null;

    const wanted = normalizeStr(name);

    const lineageNorm = lineage.map(x => normalizeStr(x));

    let best = null;
    let bestScore = -999;

    for (const item of data.result) {

        let score = 0;

        const sci =
            normalizeStr(
                item.usage?.name?.scientificName ||
                item.name ||
                ""
            );

        if (sci === wanted)
            score += 100;

        if (item.rank)
            score += 5;

        const cls = item.classification || [];

        for (const c of cls) {

            if (lineageNorm.includes(normalizeStr(c.name)))
                score += 20;

        }

        if (score > bestScore) {

            bestScore = score;
            best = item;

        }

    }

    return best;

}




// Filtro biológico — nomes que NÃO são organismos reais
const NON_BIOLOGICAL_PATTERNS = [
  /^myth/i, /^fict/i, /^legend/i, /^deity/i, /^god$/i, /^goddess/i,
  /^demon/i, /^angel/i, /^spirit/i, /^ghost/i, /^magic/i,
  /^supernatural/i, /^mythical/i, /^dragon/i, /^unicorn/i,
  /^chimera/i, /^centaur/i, /^zombie/i, /^vampire/i, /^king/i, /^carro/i, /^marca/i, /^rei/i, /^eletronico/i, /^musica/i,
  /^werewolf/i, /^mermaid/i, /^cyclops/i, /^phoenix/i,
  /^witch/i, /^wizard/i, /^sorcer/i, /^enchant/i,
  /^pessoa/i, /^aviao/i, /^lingua/i, /^livro/i, /^monstro/i,
  /^edificio/i, /^cidade/i, /^pais$/i, /^estado/i, /^regiao/i,
  /^cifra/i, /^linguagem/i, /^crenca/i,
  /fobia/i, /^medo/i, /^aversao/i, /^sentimento/i,
  /^psicologa/i, /^parasitologa/i, /^biologa/i, /^profissao/i,
];

function isBiologicalName(name) {
  if (!name) return false;
  const norm = normalizeStr(name);
  if (norm.length === 0) return false;
  return !NON_BIOLOGICAL_PATTERNS.some(p => p.test(norm));
}
window.isBiologicalName = isBiologicalName;

// ─── VALIDAÇÃO TAXONÔMICA ─────────────────────────────────────────────────────
const RANK_ORDER = [
  'life', 'domain', 'superkingdom', 'kingdom', 'subkingdom',
  'phylum', 'subphylum', 'superclass', 'class', 'subclass',
  'superorder', 'order', 'suborder', 'infraorder', 'parvorder',
  'superfamily', 'family', 'subfamily', 'tribe', 'subtribe',
  'genus', 'subgenus', 'section', 'subsection',
  'species', 'subspecies', 'variety', 'form', 'forma'
];

function getRankIndex(rank) {
  return RANK_ORDER.indexOf((rank || '').toLowerCase());
}

function detectCycle(startId, nodesMap) {
  const visited = new Set();
  let cur = startId;
  while (cur && nodesMap.has(cur)) {
    if (visited.has(cur)) return true;
    visited.add(cur);
    cur = nodesMap.get(cur).parent_id;
  }
  return false;
}

function validateTaxonomicData(nodesMap) {
  const issues = [];
  const validMap = new Map();

  for (const [id, node] of nodesMap) {
    validMap.set(id, { ...node, parent_id: node.parent_id || null, _valid: true });
  }

  // 1. Remove nós com parent_id que não existe
  for (const [id, node] of validMap) {
    if (node.parent_id && !validMap.has(node.parent_id)) {
      issues.push({ id, name: node.name, rank: node.rank, type: 'invalid_parent', detail: `parent_id ${node.parent_id} inexistente` });
      validMap.delete(id);
    }
  }

  // 2. Remove ciclos
  for (const [id] of validMap) {
    if (detectCycle(id, validMap)) {
      const node = validMap.get(id);
      issues.push({ id, name: node.name, rank: node.rank, type: 'cycle', detail: 'cadeia parental forma ciclo' });
      validMap.delete(id);
    }
  }

  // 3. Valida hierarquia de ranks
  for (const [id, node] of validMap) {
    if (!node.parent_id) continue;
    const parent = validMap.get(node.parent_id);
    if (!parent) continue;
    const pIdx = getRankIndex(parent.rank);
    const cIdx = getRankIndex(node.rank);
    if (pIdx !== -1 && cIdx !== -1 && cIdx <= pIdx) {
      issues.push({ id, name: node.name, rank: node.rank, type: 'rank_mismatch', detail: `rank "${node.rank}" não é mais específico que o pai "${parent.rank}"` });
      validMap.delete(id);
    }
  }

  // 4. Detecta homônimos (mesmo nome, mesmo parent_id)
  const nameIndex = new Map();
  for (const [id, node] of validMap) {
    const norm = normalizeStr(node.name);
    if (!norm || norm.length <= 3) continue;
    if (!nameIndex.has(norm)) nameIndex.set(norm, []);
    nameIndex.get(norm).push({ id, parent_id: node.parent_id, name: node.name });
  }
  for (const [norm, entries] of nameIndex) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].parent_id === entries[j].parent_id) {
          issues.push({ id: entries[i].id, name: entries[i].name, rank: '', type: 'homonym', detail: `"${entries[i].name}" duplicado sob o mesmo pai` });
          issues.push({ id: entries[j].id, name: entries[j].name, rank: '', type: 'homonym', detail: `"${entries[j].name}" duplicado sob o mesmo pai` });
          validMap.delete(entries[i].id);
          validMap.delete(entries[j].id);
        }
      }
    }
  }

  // 5. Identifica órfãos (sem caminho até a raiz)
  for (const [id, node] of validMap) {
    let cur = node;
    let reachedRoot = false;
    const visited = new Set();
    while (cur && cur.parent_id) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (!validMap.has(cur.parent_id)) break;
      cur = validMap.get(cur.parent_id);
    }
    if (!cur || cur.parent_id) {
      // Não encontrou raiz (nó sem parent_id)
      reachedRoot = !cur || !cur.parent_id;
    } else {
      reachedRoot = true;
    }
    if (!reachedRoot) {
      issues.push({ id, name: node.name, rank: node.rank, type: 'orphan', detail: 'sem cadeia até a raiz do banco' });
    }
  }

  return { validMap, issues };
}

// ─── VALIDAÇÃO DE LINHAGEM (CATALOGUE OF LIFE) ────────────────────────────────
const LINEAGE_REPORT = { checked: 0, correct: 0, corrected: [], manual: [], errors: [] };

async function lookupColByName(name, lineageHints = []) {
  const res = await fetch(`https://api.checklistbank.org/dataset/3LR/nameusage/search?q=${encodeURIComponent(name)}&limit=8`);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.result;
  if (!results || results.length === 0) return null;

  const nameNorm = normalizeStr(name);
  const hintNorms = lineageHints.map(h => normalizeStr(h)).filter(Boolean);
  let bestScore = -1;
  let best = results[0];

  for (const r of results) {
    const classification = r.classification || [];
    let score = 0;
    for (const c of classification) {
      const cName = normalizeStr(c.name);
      if (cName && hintNorms.includes(cName)) score++;
    }
    const sciName = normalizeStr(r.name || r.usage?.name?.scientificName || '');
    if (sciName === nameNorm) score += 10;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

async function getColLineage(taxonId) {
  const res = await fetch(`https://api.checklistbank.org/dataset/3LR/tree/${taxonId}/parents`);
  if (!res.ok) return null;
  const data = await res.json();
  return data;
}

function buildStoredLineage(node) {
  const chain = [];
  let cur = node;
  while (cur) {
    chain.unshift({ id: cur.id, name: cur.name, rank: cur.rank });
    cur = cur.parent;
  }
  return chain;
}

function findColParentMismatch(storedLineage, colLineage) {
  if (!storedLineage || storedLineage.length < 2) return null;
  if (!colLineage || colLineage.length < 2) return null;

  const nodeName = normalizeStr(storedLineage[storedLineage.length - 1].name);
  const storedParentName = normalizeStr(storedLineage[storedLineage.length - 2].name);

  let nodeIdx = -1;
  for (let i = 0; i < colLineage.length; i++) {
    if (normalizeStr(colLineage[i].name) === nodeName) { nodeIdx = i; break; }
  }
  if (nodeIdx < 1) return null;

  const colParentName = normalizeStr(colLineage[nodeIdx - 1].name);
  if (colParentName !== storedParentName) {
    return {
      storedParent: storedLineage[storedLineage.length - 2].name,
      storedParentId: storedLineage[storedLineage.length - 2].id,
      correctParent: colLineage[nodeIdx - 1].name,
      correctParentId: String(colLineage[nodeIdx - 1].id || ''),
      colLineage: colLineage.map(c => ({ id: c.id, name: c.name, rank: c.rank }))
    };
  }
  return null;
}

async function validateNodeLineage(node) {
  if (!node || !node.name) return;
  const norm = normalizeStr(node.name);
  if (!norm || VAGUE_TAXA.has(norm)) return;

  const storedLineage = buildStoredLineage(node);
  const hints = storedLineage.map(n => n.name).filter(Boolean);

  const colTaxon = await lookupColByName(node.name, hints);
  if (!colTaxon) { LINEAGE_REPORT.errors.push(`${node.name}: não encontrado no COL`); return; }

  const colId = colTaxon.id;
  const colLineage = await getColLineage(colId);
  if (!colLineage) { LINEAGE_REPORT.errors.push(`${node.name}: falha ao obter classificação`); return; }

  LINEAGE_REPORT.checked++;

  const mismatch = findColParentMismatch(storedLineage, colLineage);
  if (!mismatch) { LINEAGE_REPORT.correct++; return; }

  const storedParent = node.parent;
  if (storedParent) {
    // Procura o pai correto primeiro por COL ID, depois por nome
    let correctNode = null;
    if (mismatch.correctParentId) {
      correctNode = window._nodeById.get(mismatch.correctParentId) || null;
    }
    if (!correctNode) {
      const correctParentNorm = normalizeStr(mismatch.correctParent);
      correctNode = window.allTreeNodes.find(n => normalizeStr(n.name) === correctParentNorm);
    }

    if (correctNode && correctNode !== node && correctNode !== storedParent) {
      const idx = storedParent.children.indexOf(node);
      if (idx !== -1) storedParent.children.splice(idx, 1);
      node.parent = correctNode;
      if (!correctNode.children.includes(node)) correctNode.children.push(node);
      correctNode.loaded = true;
      correctNode.expanded = true;
      LINEAGE_REPORT.corrected.push({
        node: node.name,
        rank: node.rank,
        storedParent: storedParent.name,
        correctParent: mismatch.correctParent,
        action: 'parent_id corrigido automaticamente'
      });
      return;
    }
  }

  LINEAGE_REPORT.manual.push({
    node: node.name,
    rank: node.rank,
    storedParent: mismatch.storedParent,
    correctParent: mismatch.correctParent,
    storedLineage: storedLineage.map(n => n.name),
    colLineage: mismatch.colLineage.map(c => c.name),
    detail: 'revisão manual necessária — pai correto não encontrado na árvore'
  });
}

async function validateTreeLineage() {
  LINEAGE_REPORT.checked = 0;
  LINEAGE_REPORT.correct = 0;
  LINEAGE_REPORT.corrected = [];
  LINEAGE_REPORT.manual = [];
  LINEAGE_REPORT.errors = [];

  const toCheck = window.allTreeNodes.filter(n => n && n.name && n.loaded);

  for (let i = 0; i < toCheck.length; i++) {
    const node = toCheck[i];
    await validateNodeLineage(node);
    if ((i + 1) % 10 === 0 || i === toCheck.length - 1) {
      const el = document.getElementById('lineage-progress');
      if (el) el.textContent = `Validando linhagens… ${i + 1}/${toCheck.length}`;
    }
  }

  showLineageReport(LINEAGE_REPORT);
  return LINEAGE_REPORT;
}

function showLineageReport(report) {
  let el = document.getElementById('lineage-report');
  if (!el) {
    const container = document.getElementById('validation-issues');
    if (!container) return;
    el = document.createElement('div');
    el.id = 'lineage-report';
    el.style.marginTop = '12px';
    container.after(el);
  }

  const total = report.checked;
  const ok = report.correct;
  const fixed = report.corrected.length;
  const manual = report.manual.length;
  const errs = report.errors.length;

  el.innerHTML = `
    <div style="background:rgba(52,152,219,0.08); border:1px solid rgba(52,152,219,0.25); border-radius:8px; padding:10px; font-size:12px;">
      <strong style="color:#3498db;">🔬 Relatório de Linhagem</strong>
      <div style="margin-top:6px; color:#ccc;">
        <div>Verificados: <strong>${total}</strong></div>
        <div>Corretos: <strong style="color:#2ecc71;">${ok}</strong></div>
        ${fixed > 0 ? `<div>Corrigidos automaticamente: <strong style="color:#f39c12;">${fixed}</strong></div>` : ''}
        ${manual > 0 ? `<div>Requerem revisão manual: <strong style="color:#e74c3c;">${manual}</strong></div>` : ''}
        ${errs > 0 ? `<div>Erros de consulta: <strong style="color:#e74c3c;">${errs}</strong></div>` : ''}
      </div>
      ${fixed > 0 ? `
        <div style="margin-top:8px; padding:6px; background:rgba(243,156,18,0.1); border-radius:4px; font-size:11px; color:#f39c12;">
          <strong>Correções:</strong>
          <ul style="margin:4px 0 0 16px; padding:0;">
            ${report.corrected.map(c => `<li>"${esc(c.node)}" (${esc(c.rank)}): ${esc(c.storedParent)} → ${esc(c.correctParent)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${manual > 0 ? `
        <div style="margin-top:8px; padding:6px; background:rgba(231,76,60,0.1); border-radius:4px; font-size:11px; color:#e74c3c;">
          <strong>Revisão Manual Necessária:</strong>
          <ul style="margin:4px 0 0 16px; padding:0;">
            ${report.manual.map(c => `<li>"${esc(c.node)}" (${esc(c.rank)}): pai "${esc(c.storedParent)}", COL diz "${esc(c.correctParent)}"</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${errs > 0 ? `
        <div style="margin-top:8px; padding:6px; background:rgba(231,76,60,0.05); border-radius:4px; font-size:11px; color:#999;">
          ${report.errors.map(e => `<div>⚠ ${esc(e)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// Expoe no console para testes manuais
window.validateTreeLineage = validateTreeLineage;

async function validateExternalChildLineage(childNode, parentNode) {
  if (!childNode || !parentNode) return;
  const colTaxon = await lookupColByName(childNode.name, [parentNode.name]);
  if (!colTaxon) return;

  const colId = colTaxon.id;
  const colLineage = await getColLineage(colId);
  if (!colLineage) return;

  const storedLineage = buildStoredLineage(childNode);
  const mismatch = findColParentMismatch(storedLineage, colLineage);
  if (!mismatch) return;

  console.warn(`🧬 Validação de "${childNode.name}": pai no COL é "${mismatch.correctParent}" (armazenado: "${mismatch.storedParent}")`);

  childNode._colCorrectParent = mismatch.correctParent;
  childNode._colLineage = colLineage;
}

// ─── TESTE AUTOMATIZADO DE VALIDAÇÃO ─────────────────────────────────────────
async function runValidationTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  // Teste 1: normalizeStr
  if (normalizeStr('Árvore') === 'arvore') results.passed++;
  else { results.failed++; results.errors.push('normalizeStr falhou: acentos'); }

  // Teste 2: getRankIndex
  if (getRankIndex('species') > getRankIndex('genus')) results.passed++;
  else { results.failed++; results.errors.push('getRankIndex: species deve ser > genus'); }

  if (getRankIndex('kingdom') < getRankIndex('phylum')) results.passed++;
  else { results.failed++; results.errors.push('getRankIndex: kingdom deve ser < phylum'); }

  // Teste 3: RANK_ORDER consistency
  if (RANK_ORDER.length > 20) results.passed++;
  else { results.failed++; results.errors.push('RANK_ORDER muito curto'); }

  // Teste 4: buildStoredLineage
  if (rootNode) {
    const lin = buildStoredLineage(rootNode);
    if (lin.length >= 1 && lin[lin.length - 1].name === rootNode.name) results.passed++;
    else { results.failed++; results.errors.push('buildStoredLineage: último elemento deve ser o próprio nó'); }
  }

  // Teste 5: validateTaxonomicData com dados artificiais
  const testMap = new Map();
  testMap.set('1', { id: '1', name: 'Root', rank: 'life', parent_id: '', _source: 'local' });
  testMap.set('2', { id: '2', name: 'Animalia', rank: 'kingdom', parent_id: '1', _source: 'local' });
  testMap.set('3', { id: '3', name: 'Arthropoda', rank: 'phylum', parent_id: '2', _source: 'local' });
  testMap.set('4', { id: '4', name: 'Insecta', rank: 'class', parent_id: '3', _source: 'local' });
  testMap.set('5', { id: '5', name: 'Insecta', rank: 'class', parent_id: '3', _source: 'local' }); // homonym
  const { issues: testIssues } = validateTaxonomicData(testMap);
  const homonymIssues = testIssues.filter(i => i.type === 'homonym');
  if (homonymIssues.length > 0) results.passed++;
  else { results.failed++; results.errors.push('validateTaxonomicData: homônimos não detectados'); }

  // Teste 6: VAGUE_TAXA filter
  if (VAGUE_TAXA.has('animalia')) results.passed++;
  else { results.failed++; results.errors.push('VAGUE_TAXA: animalia não encontrado'); }

  // Teste 7: isBiologicalName
  if (isBiologicalName('Canis lupus')) results.passed++;
  else { results.failed++; results.errors.push('isBiologicalName: Canis lupus deve ser biológico'); }

  if (!isBiologicalName('Dragon')) results.passed++;
  else { results.failed++; results.errors.push('isBiologicalName: Dragon não deve ser biológico'); }

  console.log(`🧪 Testes de validação: ${results.passed} passaram, ${results.failed} falharam`);
  if (results.failed > 0) {
    console.error('Falhas:', results.errors.map(e => `  ❌ ${e}`).join('\n'));
  }
  return results;
}
window.runValidationTests = runValidationTests;

// ─── LAZY LOADING EXTERNO (CATALOGUE OF LIFE) COM VALIDAÇÃO ──────────────────
async function fetchExternalChildren(node) {
  if (!node || !node.name || node._externalLoaded || node._externalLoading) return;
  node._externalLoading = true;

  if (node.rank === 'species' || node.rank === 'subspecies') {
    node.loaded = true;
    node._externalLoading = false;
    return;
  }
 
  try {
    const searchRes = await fetch(`https://api.checklistbank.org/dataset/3LR/nameusage/search?q=${encodeURIComponent(node.name)}&limit=8`);

    if (!searchRes.ok) throw new Error("Erro na API");
    const searchData = await searchRes.json();

    const results = searchData.result;
    if (!results || results.length === 0) {
      node._externalLoaded = true;
      node.loaded = true;
      node._externalLoading = false;
      return;
    }

    const lineageNames = [];
    let cur = node;
    while (cur) {
      const n = normalizeStr(cur.name);
      if (n) lineageNames.push(n);
      cur = cur.parent;
    }

    const nameNorm = normalizeStr(node.name);
    let bestScore = -1;
    let target = results[0];

    for (const r of results) {
      const classification = r.classification || [];
      let score = 0;
      for (const c of classification) {
        const cName = normalizeStr(c.name);
        if (cName && lineageNames.includes(cName)) {
          score++;
        }
      }
      const sciName = normalizeStr(r.name || r.usage?.name?.scientificName || '');
      if (sciName === nameNorm) score += 10;
      if (score > bestScore) {
        bestScore = score;
        target = r;
      }
    }

    const taxonId = target.id;
    if (!taxonId) {
      node._externalLoaded = true;
      node.loaded = true;
      node._externalLoading = false;
      return;
    }

    const childrenRes = await fetch(`https://api.checklistbank.org/dataset/3LR/tree/${taxonId}/children?limit=50`);
    if (!childrenRes.ok) throw new Error("Erro ao buscar filhos");
    const childrenData = await childrenRes.json();

    const childList = childrenData.result;
    if (!childList || !Array.isArray(childList) || childList.length === 0) {
      node._externalLoaded = true;
      node.loaded = true;
      node._externalLoading = false;
      return;
    }

    if (!node.children) node.children = [];
    let addedCount = 0;

    for (const child of childList) {
      const childName = child.name || child.scientificName;
      if (!childName || !isBiologicalName(childName)) continue;

      const normChild = normalizeStr(childName);
      const exists = node.children.some(c =>

    String(c.id)==String(child.id)

);
      if (exists) continue;

      const childRank = child.rank ? String(child.rank).toLowerCase() : 'species';

      // Valida hierarquia de ranks
      const pIdx = getRankIndex(node.rank);
      const cIdx = getRankIndex(childRank);
      if (pIdx !== -1 && cIdx !== -1 && cIdx <= pIdx) {
        console.warn(`Validação: filho "${childName}" (${childRank}) ignorado — rank incompatível com pai "${node.name}" (${node.rank})`);
        continue;
      }

      const colId = String(child.id || '');
      const newNode = new TreeNode({
        id: colId,
        colId: colId,
        name: childName,
        canonicalName: child.canonicalName || child.scientificName || childName,
        scientificName: child.scientificName || childName,
        vernacularName: child.vernacularName || '',
        rank: childRank,
        status: child.status || child.taxonomicStatus || 'accepted',
        parentId: target.id,
        parent: node,
        children: [],
        _source: 'api',
        lineage: [...(node.lineage || []), { id: colId, name: childName, rank: childRank }]
      });

      node.children.push(newNode);
      if (!window.allTreeNodes.includes(newNode)) {
        window.allTreeNodes.push(newNode);
      }
      if (!window._nodeById.has(colId)) {
        window._nodeById.set(colId, newNode);
      }
      addedCount++;

      // Valida linhagem do filho externo (fire-and-forget)
      validateExternalChildLineage(newNode, node);
    }

    node._externalLoaded = true;
    node.loaded = true;
    node.expanded = true;
    node._externalLoading = false;

    if (addedCount > 0 && renderer) {
      if (typeof renderer._recomputeLayout === 'function') renderer._recomputeLayout();
      if (typeof renderer._requestRender === 'function') renderer._requestRender();
    }

  } catch (err) {
    console.warn(`Aviso no Lazy Loading para ${node.name}:`, err);
    node.loaded = true;
    node._externalLoading = false;
  }
}
 
// ─── CARREGAMENTO DA ÁRVORE LOCAL (TAXON_MINI2.TSV) ──────────────────────────
function pruneNonBiological() {
  if (!window._bioFilterEnabled) return 0;
  if (!rootNode) return 0;

  let removedCount = 0;
  const removedIds = new Set();

  function walk(node) {
    if (!node) return;
    if (node.children && node.children.length > 0) {
      node.children = node.children.filter(child => {
        const keep = isBiologicalName(child.name || '') && !child._descriptionNonBiological;
        if (!keep) {
          removedCount++;
          if (child.id) removedIds.add(String(child.id));
          const arrIdx = window.allTreeNodes.indexOf(child);
          if (arrIdx !== -1) window.allTreeNodes.splice(arrIdx, 1);
          if (child.primaryId) window._nodeById.delete(child.primaryId);
          if (child.id) window._nodeById.delete(child.id);
        }
        return keep;
      });
      node.children.forEach(walk);
    }
  }

  walk(rootNode);

  if (removedCount > 0) {
    window._bioFilterCount += removedCount;
    console.log(`🌿 Prune: ${removedCount} nó(s) não-biológico(s) removido(s) da árvore`);
  }
  return removedCount;
}

// Remove um único nó (e seus descendentes) da árvore, com base em descrição não-biológica
function removeNodeAndDescendants(node) {
  if (!node || !rootNode) return 0;
  let count = 0;

  function collect(n, arr) {
    arr.push(n);
    (n.children || []).forEach(c => collect(c, arr));
  }
  const all = [];
  collect(node, all);

  if (node.parent && node.parent.children) {
    const idx = node.parent.children.indexOf(node);
    if (idx !== -1) node.parent.children.splice(idx, 1);
  }

  for (const n of all) {
    const arrIdx = window.allTreeNodes.indexOf(n);
    if (arrIdx !== -1) window.allTreeNodes.splice(arrIdx, 1);
    if (n.primaryId) window._nodeById.delete(n.primaryId);
    if (n.id) window._nodeById.delete(n.id);
    count++;
  }

  window._bioFilterCount += 1;
  console.log(`🌿 Descrição não-biológica: nó "${node.name}" removido da árvore`);
  return count;
}

async function initTree(forceRebuild = false) {
  try {
    if (forceRebuild && renderer) {
      renderer.app.destroy(true);
      renderer = null;
      window.allTreeNodes = [];
      window._nodeById = new Map();
      rootNode = null;
      currentSelectedNode = null;
    }

    if (statsLoading) {
      statsLoading.textContent = 'Carregando banco de dados taxonômico…';
      statsLoading.style.display = 'block';
    }

    let text;
    if (window._rawTsvText) {
      text = window._rawTsvText;
    } else {
      const response = await fetch(`/Taxon_mini2.tsv?v=${Date.now()}`);
      if (!response.ok) throw new Error(`Falha ao abrir Taxon_mini2.tsv (${response.status})`);
      text = await response.text();
      window._rawTsvText = text;
    }

    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
    const headers = lines[0].split('\t');
  
    const allParsed = lines.slice(1).map(line => {
      const cols = line.split('\t');
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
      return obj;
    });

    let bioFilteredCount = 0;
    const rawData = allParsed.filter(item => {
      const kingdom = (item.kingdom || '').trim().toLowerCase();
      if (kingdom === 'viruses') return false;
      const name = item.scientificName || item.canonicalName || '';
      if (window._bioFilterEnabled && name && !isBiologicalName(name)) {
        bioFilteredCount++;
        return false;
      }
      return true;
    });

    window._bioFilterCount = bioFilteredCount;
    if (window._bioFilterEnabled && bioFilteredCount > 0) {
      console.log(`🌿 Filtro não-biológico: ${bioFilteredCount} registro(s) removido(s)`);
    }
  
    // ── Passo 1: Construir mapa de nós por ID ──────────────────────────────
    const nodesMap = new Map();
  
    for (const item of rawData) {
      if (!item.taxonID) continue;
      if (item.acceptedNameUsageID && item.acceptedNameUsageID.trim() !== '') continue;
  
      const id = item.taxonID.trim();
      const parentId = item.parentNameUsageID ? item.parentNameUsageID.trim() : '';
      const scientificName = item.scientificName || item.canonicalName || 'Sem nome';
      const vernacular = item.vernacularName || item.commonName || item.popularName || '';
  
      const taxonStatus = (item.taxonomicStatus || '').toLowerCase();
      nodesMap.set(id, {
        id,
        parent_id: parentId,
        name: scientificName,
        canonicalName: item.canonicalName || item.canonical_name || scientificName,
        scientificName: item.scientificName || scientificName,
        vernacularName: vernacular,
        rank: item.taxonRank || 'unknown',
        status: taxonStatus === 'accepted' || taxonStatus === '' ? 'accepted' : taxonStatus || 'accepted',
        kingdom: (item.kingdom || '').trim().toLowerCase(),
        phylum: (item.phylum || '').trim().toLowerCase(),
        class: (item.class || '').trim().toLowerCase(),
        children: [],
        _source: 'local',
        lineage: []
      });
    }
  
    // ── Passo 2: Validar e limpar ──────────────────────────────────────────
    const { validMap, issues } = validateTaxonomicData(nodesMap);
    window._taxonIssues = issues;
  
    if (issues.length > 0) {
      console.warn(`🧬 Validação taxonômica: ${issues.length} registro(s) com problemas`);
      const byType = {};
      for (const iss of issues) {
        byType[iss.type] = (byType[iss.type] || 0) + 1;
      }
      console.warn('  Problemas por tipo:', byType);
    }
  
    // ── Passo 3: Pre-computar linhagem e registrar por ID ────────────────
    function computeLineage(nodeId, nodesMap) {
      const node = nodesMap.get(nodeId);
      if (!node) return [];
      if (node.lineage && node.lineage.length > 0) return node.lineage;
      if (!node.parent_id || !nodesMap.has(node.parent_id)) {
        node.lineage = [{ id: node.id, name: node.name, rank: node.rank }];
        return node.lineage;
      }
      const parentLineage = computeLineage(node.parent_id, nodesMap);
      node.lineage = [...parentLineage, { id: node.id, name: node.name, rank: node.rank }];
      return node.lineage;
    }

    validMap.forEach((node) => {
      computeLineage(node.id, validMap);
      if (node.id) window._nodeById.set(node.id, node);
    });

    // ── Passo 4: Montar árvore apenas com dados válidos ────────────────────
    const potentialRoots = [];

    validMap.forEach((node) => {
      const pId = node.parent_id;
      const parentNode = pId ? validMap.get(pId) : null;

      if (parentNode) {
        node.parent = parentNode;
        parentNode.children.push(node);
      } else {
        potentialRoots.push(node);
      }
    });

    let rootData;
    const foundBiota = potentialRoots.find(n => 
      normalizeStr(n.name) === 'biota' || 
      normalizeStr(n.name) === 'life' || 
      normalizeStr(n.name) === 'root'
    );

    if (foundBiota) {
      rootData = foundBiota;
    } else {
      rootData = {
        id: 'global-root',
        name: 'Biota (Vida)',
        rank: 'life',
        color: '#1ABC9C',
        children: potentialRoots
      };
    }

    rootNode = new TreeNode(rootData);

window.allTreeNodes = [];
window._nodeById = new Map();
    // Re-register TreeNodes by their primary IDs
    function collectAllNodes(node) {
      if (!node) return;
      window.allTreeNodes.push(node);
      const primaryId = node.primaryId;
      if (primaryId && !window._nodeById.has(primaryId)) {
        window._nodeById.set(primaryId, node);
      }
      if (node.children) node.children.forEach(collectAllNodes);
    }
    collectAllNodes(rootNode);
  
    function limitExpansion(node, depth = 0) {
      node.expanded = depth < 2;
      node.loaded = (node.children && node.children.length > 0); 
      if (node.children) node.children.forEach(child => limitExpansion(child, depth + 1));
    }
    
    limitExpansion(rootNode);
  
    pruneNonBiological();
  
    renderer = new TreeRenderer(canvas, { 
      onSelect: showTaxonInfo,
      onExpand: fetchExternalChildren 
    });
    renderer.setRoot(rootNode);
    initSearchModule(renderer, rootNode);
    if (statsLoading) statsLoading.style.display = 'none';
    updateStats();
    await updateAuthUI();

    setTimeout(() => {
      runValidationTests().then(r => {
        if (r.failed > 0) console.warn(`🧪 Testes pós-inicialização: ${r.passed} passaram, ${r.failed} falharam`);
        else console.log(`🧪 Testes pós-inicialização: ${r.passed} passaram, 0 falhas — OK`);
      });
    }, 1000);
  
  } catch (error) {
    console.error('❌ Erro no initTree:', error);
    if (statsLoading) statsLoading.textContent = `Erro: ${error.message}`;
  }
}
 
initTree();

// Aplica o fundo persistido (ou o melhor disponível) ao carregar
ensureBackground();
 
// ─── BUSCA EXTERNA DE ESPÉCIES (CATALOGUE OF LIFE) ───────────────────────────
async function fetchAndInsertExternalTaxon(queryText) {
  try {
    const targetNorm = normalizeStr(queryText);

    const searchRes = await fetch(`https://api.checklistbank.org/dataset/3LR/nameusage/search?q=${encodeURIComponent(queryText)}&limit=10`);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    const results = searchData.result;
    if (!results || results.length === 0) return null;

    // Usa apenas o resultado cujo nome corresponde EXATAMENTE ao que foi digitado
    // (após normalizar maiúsculas/minúsculas e acentos) — evita nomes relacionados.
    const targetUsage = results.find(r => {
      const usageName = r.usage?.name;
      const sciName = usageName?.scientificName || usageName?.name || r.name || '';
      return normalizeStr(sciName) === targetNorm;
    });
    if (!targetUsage) return null;

    const taxonId = targetUsage.id;
    if (!taxonId) return null;

    const classification = targetUsage.classification || [];

    const chain = [];
    for (const item of classification) {
      chain.push({
        id: String(item.id || item.name),
        name: item.name,
        rank: item.rank ? String(item.rank).toLowerCase() : 'unranked',
        vernacularName: ''
      });
    }

    if (!isBiologicalName(targetUsage.name || queryText)) return null;

    if (chain.length === 0 || chain[chain.length - 1].id !== String(taxonId)) {
      const usageName = targetUsage.usage?.name;
      const finalName = usageName?.scientificName || usageName?.name || targetUsage.name || queryText;
      const targetRank = targetUsage.usage?.rank || targetUsage.rank || 'species';
      chain.push({
        id: String(taxonId),
        name: finalName,
        rank: String(targetRank).toLowerCase(),
        vernacularName: (targetUsage.vernacularNames || [])[0]?.name || ''
      });
    }
 
    let currentParent = rootNode;
 
    for (const step of chain) {
      if (!step.name) continue;
      if (normalizeStr(step.name) === normalizeStr(rootNode.name)) continue;
      if (!isBiologicalName(step.name)) continue;

      // Procura existente primeiro por ID, depois por nome + rank para evitar duplicatas
      let existingNode = window._nodeById.get(step.id) || null;
      if (!existingNode) {
        existingNode = window.allTreeNodes.find(n =>
          normalizeStr(n.name) === normalizeStr(step.name) &&
          normalizeStr(n.rank) === normalizeStr(step.rank)
        );
      }

      if (!existingNode) {
        const stepLineage = [...(currentParent.lineage || []), { id: step.id, name: step.name, rank: step.rank }];
        existingNode = new TreeNode({
          id: step.id,
          colId: step.id,
          name: step.name,
          canonicalName: step.name,
          scientificName: step.name,
          rank: step.rank,
          vernacularName: step.vernacularName,
          status: 'accepted',
          children: [],
          parent: currentParent,
          _source: 'api',
          lineage: stepLineage
        });

        if (!currentParent.children) currentParent.children = [];
        currentParent.children.push(existingNode);
        currentParent.loaded = true;
        currentParent.expanded = true;

        window.allTreeNodes.push(existingNode);
        if (!window._nodeById.has(step.id)) {
          window._nodeById.set(step.id, existingNode);
        }
      }
 
      currentParent = existingNode;
    }
 
    return currentParent;
 
  } catch (err) {
    console.error("Erro no fetchAndInsertExternalTaxon:", err);
    return null;
  }
}
 
// ─── SISTEMA DE BUSCA E AUTOCOMPLETE ─────────────────────────────────────────
let rendererInstance = null;
let rootNodeInstance = null;
 
function findNodeInLocalData(query) {
  if (!query) return null;
  const raw = String(query).trim();
  const target = normalizeStr(raw);

  // 1. Busca exata por ID (COL ou local)
  const idMatch = window._nodeById.get(raw);
  if (idMatch) return idMatch;

  // 2. Busca exata por nome ou nome popular normalizado (ignora maiúsculas/minúsculas e acentos)
  return window.allTreeNodes.find(n =>
    normalizeStr(n.name) === target ||
    normalizeStr(String(n.primaryId || (n.id ?? n.ott_id ?? ''))) === target ||
    normalizeStr(n.vernacularName || n.commonName || n.popularName || '') === target
  );
}

export async function executeSearch(queryText) {
  closeAutocomplete();
  if (!queryText || !queryText.trim()) return;
  const targetQuery = queryText.trim();
 
  if (!rootNodeInstance) {
    console.warn("A árvore ainda não foi totalmente carregada.");
    return;
  }
 
  let foundNode = findNodeInLocalData(targetQuery);
 
  if (!foundNode && typeof fetchAndInsertExternalTaxon === 'function') {
    if (!isBiologicalName(targetQuery)) {
      alert(`"${targetQuery}" não parece ser um nome biológico válido.`);
      if (statsLoading) statsLoading.style.display = 'none';
      return;
    }
    if (statsLoading) {
      statsLoading.textContent = 'Buscando na Catalogue of Life…';
      statsLoading.style.display = 'block';
    }
    foundNode = await fetchAndInsertExternalTaxon(targetQuery);
    if (statsLoading) statsLoading.style.display = 'none';
  }
 
  if (foundNode) {
    // CORREÇÃO: Abre todas as "pastas" do ancestral até o nó pesquisado para permitir o foco visual
    let p = foundNode.parent;
    while (p) {
      p.expanded = true;
      p = p.parent;
    }

    sounds.playSFX('success');
 
    if (rendererInstance && typeof rendererInstance.focusOnNode === 'function') {
      if (typeof rendererInstance._recomputeLayout === 'function') rendererInstance._recomputeLayout();
      rendererInstance.focusOnNode(foundNode, 1.4);
    }
 
    if (typeof showTaxonInfo === 'function') {
      showTaxonInfo(foundNode);
    }
  } else {
    sounds.playSFX('error');
    alert(`O táxon "${targetQuery}" não foi encontrado no banco local nem na internet.`);
  }
}
 
function getAutocompleteMatches(query, currentNode, matches = [], maxResults = 6) {
  if (!currentNode || !query || matches.length >= maxResults) return matches;
  const target = normalizeStr(query.trim());
 
  const sciName = normalizeStr(currentNode.name || '');
  const taxonId = normalizeStr(String(currentNode.id ?? currentNode.ott_id ?? ''));
  const popName = normalizeStr(
    currentNode.commonName || 
    currentNode.popularName || 
    currentNode.vernacular_name || 
    currentNode.vernacularName || 
    ''
  );
 
  if (sciName.includes(target) || taxonId.includes(target) || popName.includes(target)) {
    matches.push(currentNode);
  }
 
  if (currentNode.children && Array.isArray(currentNode.children)) {
    for (const child of currentNode.children) {
      getAutocompleteMatches(target, child, matches, maxResults);
      if (matches.length >= maxResults) break;
    }
  }
 
  return matches;
}
 
let activeIndex = -1;
 
function renderAutocompleteList(suggestions) {
  const inputEl = document.getElementById('search-input');
  if (!inputEl) return;
 
  let listEl = document.getElementById('autocomplete-list');
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.id = 'autocomplete-list';
    document.body.appendChild(listEl);
  }
 
  Object.assign(listEl.style, {
    position: 'fixed',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.7)',
    color: '#ffffff',
    zIndex: '999999',
    maxHeight: '220px',
    overflowY: 'auto',
    display: 'none'
  });
 
  if (!suggestions || suggestions.length === 0) {
    listEl.style.display = 'none';
    return;
  }
 
  const rect = inputEl.getBoundingClientRect();
  listEl.style.left = `${rect.left}px`;
  listEl.style.top = `${rect.bottom + 6}px`;
  listEl.style.width = `${rect.width}px`;
  listEl.style.display = 'block';
 
  activeIndex = -1;
listEl.innerHTML = suggestions.map((node, i) => {
    const pop = node.commonName || node.popularName || node.vernacular_name || node.vernacularName;
    const popBadge = pop ? ` <small style="color: #94a3b8;">(${esc(pop)})</small>` : '';
    const idBadge = node.id ? ` <span style="font-size: 10px; color: #00ffcc;">[ID: ${esc(node.id)}]</span>` : '';
    const safeName = esc(node.name || '');

    return `
      <div class="ac-item" data-index="${i}" data-name="${escAttr(node.name || '')}" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #1e293b; font-family: sans-serif; font-size: 13px;">
        <strong>${safeName}</strong>${popBadge}${idBadge}
      </div>
    `;
  }).join('');
 
  listEl.querySelectorAll('.ac-item').forEach(item => {
    item.addEventListener('click', () => {
      const selectedName = item.getAttribute('data-name');
      if (inputEl) inputEl.value = selectedName;
      executeSearch(selectedName);
    });
  });
}
 
function closeAutocomplete() {
  const listEl = document.getElementById('autocomplete-list');
  if (listEl) listEl.style.display = 'none';
}
 
function highlightAutocompleteItem(items) {
  items.forEach((item, idx) => {
    if (idx === activeIndex) {
      item.style.backgroundColor = '#1e293b';
      item.style.color = '#00ffcc';
    } else {
      item.style.backgroundColor = 'transparent';
      item.style.color = '#ffffff';
    }
  });
}
 
export function initSearchModule(renderer, rootNode) {
  rendererInstance = renderer;
  rootNodeInstance = rootNode;
 
  const inputEl = document.getElementById('search-input');
  const btnEl = document.getElementById('search-btn');
 
  if (inputEl) {
    inputEl.addEventListener('input', (e) => {
      const text = e.target.value;
      if (text.trim().length >= 2 && rootNodeInstance) {
        const matches = getAutocompleteMatches(text, rootNodeInstance, [], 6);
        renderAutocompleteList(matches);
      } else {
        closeAutocomplete();
      }
    });
 
    inputEl.addEventListener('keydown', (e) => {
      const listEl = document.getElementById('autocomplete-list');
      const items = listEl ? listEl.querySelectorAll('.ac-item') : [];
 
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length === 0) return;
        activeIndex = (activeIndex + 1) % items.length;
        highlightAutocompleteItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length === 0) return;
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        highlightAutocompleteItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) {
          const name = items[activeIndex].getAttribute('data-name');
          inputEl.value = name;
          executeSearch(name);
        } else {
          executeSearch(inputEl.value);
        }
      } else if (e.key === 'Escape') {
        closeAutocomplete();
      }
    });
  }
 
  if (btnEl) {
    btnEl.addEventListener('click', (e) => {
      e.preventDefault();
      if (inputEl) executeSearch(inputEl.value);
    });
  }
 
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-input') && !e.target.closest('#autocomplete-list')) {
      closeAutocomplete();
    }
  });
}
 
// ─── EXIBIÇÃO E DETALHES DO TÁXON ────────────────────────────────────────────
async function showTaxonInfo(node) {
  if (!infoPanel || !node) return;
 
  sounds.playSFX('click');
  currentSelectedNode = node;
  infoPanel.classList.remove('hidden');
  dismissHint();
 
  if (taxonName) {
    taxonName.textContent = node.name;
    taxonName.className = node.rank === 'species' ? 'species' : '';
  }
  if (taxonRank) {
    taxonRank.textContent = node.rank?.toUpperCase() || 'TÁXON';
    taxonRank.style.background = node.color || '#9B59B6';
  }
  
  if (taxonDesc) taxonDesc.textContent = 'Buscando resumos científicos…';
  if (taxonImgWrap) taxonImgWrap.innerHTML = `<div class="taxon-img-placeholder">⏳</div>`;
  if (wikiLink) wikiLink.style.display = 'none';
 
  updateLineageUI(node);
 
  fetchExternalChildren(node);

  if (currentProfile) {
    saveDiscovery(node.name).then(result => {
      if (result && result.achievements && result.achievements.length > 0) {
        result.achievements.forEach(code => {
          showAchievementNotification(code, ACHIEVEMENT_NAMES[code] || code, ACHIEVEMENT_DESCRIPTIONS[code] || '');
        });
      }
      if (result && result.level && result.level.leveled_up) {
        showLevelUpToast(result.level.new_level);
      }
      updateAuthUI();
    });
  }

  const [imageUrl, descResult] = await Promise.all([
    resolveTaxonImage(node),
    resolveTaxonDescription(node)
  ]);

  const extrasResult = await resolveTaxonExtras(node);
 
  if (currentSelectedNode !== node) return;

  if (descResult && descResult.nonBiological && window._bioFilterEnabled) {
    removeNodeAndDescendants(node);
    infoPanel.classList.add('hidden');
    currentSelectedNode = null;
    updateBioFilterUI();
    if (renderer) {
      if (typeof renderer._recomputeLayout === 'function') renderer._recomputeLayout();
      if (typeof renderer._requestRender === 'function') renderer._requestRender();
    }
    showAchievementNotification('', '🌿 Filtro Biológico', `"${node.name}" foi removido: descrição indica conteúdo não-biológico.`);
    return;
  }

  if (imageUrl && taxonImgWrap) {
    const safeImg = safeUrl(imageUrl);
    if (safeImg) {
      taxonImgWrap.innerHTML = `<img class="taxon-img" src="${escAttr(safeImg)}" alt="${escAttr(node.name)}" loading="lazy"/>`;
    } else {
      taxonImgWrap.innerHTML = `<div class="taxon-img-placeholder">🧬</div>`;
    }
  } else if (taxonImgWrap) {
    taxonImgWrap.innerHTML = `<div class="taxon-img-placeholder">🧬</div>`;
  }
 
  if (descResult && taxonDesc) {
    taxonDesc.textContent = descResult.text;
    if (descResult.url && wikiLink) {
      wikiLink.href = descResult.url;
      wikiLink.style.display = 'block';
    }
  } else if (taxonDesc) {
    const query = encodeURIComponent(node.name || '');
    taxonDesc.innerHTML = `
      <p style="margin-bottom: 12px; line-height: 1.5;">
        Sem resumo em português para <strong>"${esc(node.name)}"</strong>.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a href="https://www.catalogueoflife.org/data/search?q=${encodeURIComponent(node.name || '')}" target="_blank" rel="noopener" class="fallback-btn">🗺️ Catalogue of Life</a>
        <a href="https://www.inaturalist.org/search?q=${encodeURIComponent(node.name || '')}" target="_blank" rel="noopener" class="fallback-btn">🌿 iNaturalist</a>
      </div>
    `;
  }

  renderTaxonExtras(node, extrasResult);

  const sourceEl = document.getElementById('taxon-source');
  if (sourceEl) {
    sourceEl.textContent = node._source === 'api' ? '🌐 veio de API' : '💾 veio do banco local';
  }
}
 
const VAGUE_TAXA = new Set([
  'biota', 'life', 'root', 'biota (vida)', 'eukaryota',
  'cellular organisms', 'organismes cellulaires',
  'animalia', 'metazoa', 'animais', 'animals',
  'plantae', 'viridiplantae', 'plants', 'plantas',
  'fungi', 'fungos',
  'bacteria', 'bacterias',
  'archaea', 'arqueas',
  'protista', 'chromista',
]);

const TAXON_CONFIDENCE_WEIGHTS = {
  kingdom: 0.30, phylum: 0.20, class: 0.15, order: 0.10,
  family: 0.10, genus: 0.10, species: 0.05
};
const CONFIDENCE_THRESHOLD = 0.70;

function getAncestorHints(node) {
  const lineage = (node.lineage && node.lineage.length > 0) ? node.lineage : buildLineage(node);
  const hints = [];
  for (const entry of lineage) {
    if (entry.id === (node.colId || node.id)) continue;
    const norm = normalizeStr(entry.name || '');
    if (VAGUE_TAXA.has(norm)) continue;
    if (norm.length > 3) hints.push(entry.name);
  }
  return hints;
}

function getLineageMap(node) {
  const map = {};
  const lin = node.lineage || [];
  for (const entry of lin) {
    const r = (entry.rank || '').toLowerCase();
    if (r && !map[r]) map[r] = entry.name;
  }
  return map;
}

// ─── TAXONOMIC CONFIDENCE SCORER ────────────────────────────────────────────
function calculateTaxonomicConfidence(storedLineage, apiTaxonomy) {
  let score = 0;
  let maxPossible = 0;
  const mismatches = [];
  const apiMap = {};
  for (const t of apiTaxonomy) {
    const r = (t.rank || '').toLowerCase();
    if (r && !apiMap[r]) apiMap[r] = t;
  }
  for (const [rank, weight] of Object.entries(TAXON_CONFIDENCE_WEIGHTS)) {
    const stored = storedLineage.find(n => (n.rank || '').toLowerCase() === rank);
    const api = apiMap[rank];
    if (stored && api) {
      maxPossible += weight;
      if (normalizeStr(stored.name) === normalizeStr(api.name || api.scientificName || '')) {
        score += weight;
      } else {
        mismatches.push({ rank, stored: stored.name, api: api.name });
      }
    } else if (stored && !api) {
      maxPossible += weight;
      mismatches.push({ rank, stored: stored.name, api: '(ausente)' });
    }
  }
  // Proporcional: quanto da linhagem armazenada foi confirmado pela API
  const ratio = maxPossible > 0 ? score / maxPossible : 0;
  return { score, ratio, mismatches, passed: ratio >= CONFIDENCE_THRESHOLD };
}

function validateApiContent(node, apiTaxonomy, minScore = CONFIDENCE_THRESHOLD) {
  const stored = buildStoredLineage(node);
  const { score, ratio, mismatches, passed } = calculateTaxonomicConfidence(stored, apiTaxonomy);
  return { valid: ratio >= minScore && passed, score: ratio, mismatches };
}

// ─── TAXONOMIC ID RESOLVERS ──────────────────────────────────────────────────
async function resolveColId(name, hints = []) {
  const res = await fetch(`https://api.checklistbank.org/dataset/3LR/nameusage/search?q=${encodeURIComponent(name)}&limit=5`);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.result;
  if (!results || results.length === 0) return null;
  const nameNorm = normalizeStr(name);
  const hintNorms = hints.map(h => normalizeStr(h)).filter(Boolean);
  let bestScore = -1, best = results[0];
  for (const r of results) {
    const classification = r.classification || [];
    let score = 0;
    for (const c of classification) {
      const cName = normalizeStr(c.name);
      if (cName && hintNorms.includes(cName)) score++;
    }
    if (normalizeStr(r.name || r.usage?.name?.scientificName || '') === nameNorm) score += 10;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

async function resolveGbifKey(node) {
  const name = node.name;
  const params = new URLSearchParams({ name, verbose: 'true' });
  const rankMap = getLineageMap(node);
  for (const r of ['kingdom', 'phylum', 'class', 'order', 'family', 'genus']) {
    if (rankMap[r]) params.set(r, rankMap[r]);
  }
  try {
    const res = await fetch(`https://api.gbif.org/v1/species/match?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.usageKey) return null;
    const apiTaxonomy = [
      { rank: 'kingdom', name: data.kingdom },
      { rank: 'phylum', name: data.phylum },
      { rank: 'class', name: data.class },
      { rank: 'order', name: data.order },
      { rank: 'family', name: data.family },
      { rank: 'genus', name: data.genus },
      { rank: 'species', name: data.species || data.canonicalName }
    ].filter(t => t.name);
    const { valid, score } = validateApiContent(node, apiTaxonomy);
    return { key: data.usageKey, rank: data.rank, taxonomy: apiTaxonomy, confidence: score, valid };
  } catch (e) { return null; }
}

async function resolveWikidataQid(name, hints = []) {
  try {
    const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=5&format=json&origin=*`);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.search || [];
    if (results.length === 0) return null;
    const nameNorm = normalizeStr(name);
    const hintNorms = hints.map(h => normalizeStr(h)).filter(Boolean);
    let bestScore = -1, best = results[0];
    for (const r of results) {
      const label = normalizeStr(r.label || '');
      const desc = normalizeStr(r.description || '');
      let score = 0;
      if (label === nameNorm) score += 10;
      for (const h of hintNorms) {
        if (desc.includes(h)) score += 2;
        if (label.includes(h)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return { qid: best.id, label: best.label, description: best.description };
  } catch (e) { return null; }
}

// ─── WIKIPEDIA HELPERS ───────────────────────────────────────────────────────
async function fetchWikipediaSummary(query, lang) {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

async function searchWikipedia(query, lang) {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.query?.search || [];
  } catch (e) { return []; }
}

function isDisambiguationPage(data) {
  if (!data || !data.extract) return false;
  const text = data.extract.toLowerCase();
  return text.includes('pode referir-se a:') || text.includes('may refer to:') ||
         text.includes('pode ser:') || text.includes('disambiguation') ||
         text.includes(' página de desambiguação');
}

const HINT_PT_ROOTS = {
  mammalia: 'mamif', chordata: 'corda', aves: 'ave', insecta: 'inseto',
  reptilia: 'rept', amphibia: 'anfib', actinopterygii: 'peixe',
  arachnida: 'aranh', mollusca: 'molus', annelida: 'anel',
  cnidaria: 'cnida', porifera: 'esponj', echinodermata: 'equin',
  bryophyta: 'briof', pteridophyta: 'pteri', spermatophyta: 'spermat',
  angiospermae: 'angio', gymnospermae: 'gimno', fungi: 'fungo',
  bacteria: 'bacte', archaea: 'arque', protista: 'protis',
  primates: 'primat', carnivora: 'carniv', rodentia: 'roedo',
  artiodactyla: 'artiod', cetacea: 'balei', chiroptera: 'morce'
};

function extractMentionsLineage(text, hints) {
  if (!text || hints.length === 0) return false;
  const clean = normalizeStr(text);
  for (const hint of hints) {
    const normHint = normalizeStr(hint);
    const root = normHint.slice(0, Math.max(5, normHint.length - 1));
    if (clean.includes(root)) return true;
    const ptRoot = HINT_PT_ROOTS[normHint];
    if (ptRoot && clean.includes(ptRoot)) return true;
  }
  return false;
}

function isNonBiologicalExtract(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  // Analisa a primeira frase — é onde a Wikipedia define o sujeito do artigo
  const firstSentence = (lower.split(/[.?!\n]/)[0] || '').trim();
  if (!firstSentence) return false;

  // "é um/uma/o/a <palavra>" — definição direta do sujeito
  const defMatch = /(^|[.;,«„:!?\-—\s])(é|é o|é a|é um|é uma|é um dos|é uma das|trata-se de um|trata-se de uma|é conhecid[ao] como)\s+(muito |pouco |também )?(um |uma |o |a )?([a-zçáéíóúâêôãõàãõ\- ]+)/i.exec(firstSentence);
  if (defMatch) {
    const predicate = normalizeStr(defMatch[0]);
    for (const w of NON_BIO_DESC_WORDS) {
      if (predicate.includes(w)) return true;
    }
  }

  // Definições diretas de fobia/medo/aversão
  if (/medo (de |irracional)/i.test(firstSentence)) return true;
  if (/aversão a/i.test(firstSentence)) return true;
  if (/fobia de/i.test(firstSentence)) return true;
  return false;
}

const NON_BIO_DESC_WORDS = [
  'cidade', 'país', 'pais', 'pessoa', 'livro', 'monstro', 'edifício', 'edificio',
  'avião', 'aviao', 'sentimento', 'crença', 'crenca', 'linguagem', 'idioma',
  'língua', 'lingua', 'profissão', 'profissao', 'marca', 'rei', 'rainha',
  'imperador', 'música', 'musica', 'canção', 'cancao', 'fobia', 'medo',
  'doença', 'doenca', 'síndrome', 'sindrome', 'transtorno', 'conceito',
  'divindade', 'personagem', 'elemento químico', 'elemento quimico',
  'figura mitológica', 'figura mitologica', 'obra de ficção', 'obra de ficcao',
  'cor', 'deus', 'deusa', 'anjo', 'demônio', 'demonio', 'espírito', 'espirito',
  'fantasma', 'dragão', 'dragao', 'unicórnio', 'unicornio', 'quimera',
  'centauro', 'zumbi', 'vampiro', 'lobisomem', 'sereia', 'ciclope', 'fênix',
  'fenix', 'bruxa', 'feiticeiro', 'mago', 'biólogo', 'biologo', 'bióloga',
  'biologa', 'psicólogo', 'psicologo', 'psicóloga', 'psicologa', 'professor',
  'professora', 'ator', 'atriz', 'escritor', 'escritora', 'filósofo', 'filósofa',
  'médico', 'medico', 'médica', 'medica', 'cientista', 'cantor', 'cantora',
  'aparelho eletrônico', 'aparelho eletronico', 'instrumento musical', 'carro'
];

// ─── WIKIPEDIA SEARCH WITH LINEAGE VALIDATION ────────────────────────────────
const _wikiCache = new Map();
setInterval(() => { _wikiCache.clear(); }, 300000);
async function fetchBestWikipedia(nodeOrName, lang = 'pt') {
  const cacheKey = typeof nodeOrName === 'object'
    ? `${nodeOrName.name}|${lang}|${(nodeOrName.parent?.name || '')}`
    : `${nodeOrName}|${lang}|`;
  const cached = _wikiCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const name = typeof nodeOrName === 'object' ? nodeOrName.name : nodeOrName;
  if (!name) { _wikiCache.set(cacheKey, null); return null; }

  const hints = typeof nodeOrName === 'object' ? getAncestorHints(nodeOrName) : [];
  const nameNorm = normalizeStr(name);

  function isValid(data) {
    if (!data || isDisambiguationPage(data)) return false;
    if (isNonBiologicalExtract(data.extract)) return false;
    if (hints.length === 0) return true;
    if (extractMentionsLineage(data.extract, hints)) return true;
    const titleNorm = normalizeStr(data.titles?.normalized || data.title || data.displaytitle || '');
    return titleNorm.includes(nameNorm);
  }

  let result = null;

  // 1. Tenta fetch direto pelo nome exato
  let data = await fetchWikipediaSummary(name, lang);
  if (isValid(data)) result = data;

  // 2. Tenta busca com qualificadores da linhagem
  if (!result) {
    for (const hint of hints) {
      if (hint === nameNorm) continue;
      const results = await searchWikipedia(`${name} ${hint}`, lang);
      for (const page of results) {
        if (!normalizeStr(page.title).includes(nameNorm)) continue;
        data = await fetchWikipediaSummary(page.title, lang);
        if (isValid(data)) { result = data; break; }
      }
      if (result) break;
      for (const page of results) {
        if (normalizeStr(page.title).includes(nameNorm)) continue;
        data = await fetchWikipediaSummary(page.title, lang);
        if (isValid(data)) { result = data; break; }
      }
      if (result) break;
    }
  }

  if (!result && lang === 'pt') {
    result = await fetchBestWikipedia(nodeOrName, 'en');
  }

  _wikiCache.set(cacheKey, result || null);
  return result;
}

// ─── COMMONS IMAGE ───────────────────────────────────────────────────────────
async function queryCommonsImage(query) {
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`);
    if (!res.ok) return null;
    const d = await res.json();
    for (const page of (d.query?.search || [])) {
      const imgRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&format=json&pithumbsize=300&origin=*`);
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const thumb = Object.values(imgData.query?.pages || {})[0]?.thumbnail?.source;
        if (thumb) return thumb.startsWith('//') ? `https:${thumb}` : thumb;
      }
    }
  } catch (e) {}
  return null;
}

// ─── GBIF MEDIA BY USAGE KEY (APÓS MATCH COM LINHAGEM) ──────────────────────
async function queryGBIFMediaByKey(usageKey) {
  try {
    const mediaRes = await fetch(`https://api.gbif.org/v1/species/${usageKey}/media`);
    if (!mediaRes.ok) return null;
    const media = await mediaRes.json();
    for (const item of (media.results || [])) {
      if (item.type === 'StillImage' && item.identifier) return item.identifier;
    }
  } catch (e) {}
  return null;
}

// ─── WIKIDATA IMAGE ─────────────────────────────────────────────────────────
async function queryWikidataImage(qid) {
  try {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const entity = data.entities?.[qid];
    if (!entity) return null;
    const claims = entity.claims || {};
    const imageClaim = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!imageClaim) return null;
    const fileName = imageClaim.replace(/ /g, '_');
    const imgRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`);
    if (!imgRes.ok) return null;
    const imgData = await imgRes.json();
    const pages = imgData.query?.pages || {};
    const info = Object.values(pages)[0]?.imageinfo?.[0];
    return info?.url || null;
  } catch (e) { return null; }
}

// ─── QUERY GBIF WITH FULL LINEAGE ───────────────────────────────────────────
async function queryGBIFMediaByLineage(node) {
  const result = await resolveGbifKey(node);
  if (!result || !result.valid) return null;
  return await queryGBIFMediaByKey(result.key);
}

// ─── VALIDATE LINEAGE VIA COL CLASSIFICATION ────────────────────────────────
async function validateLineageViaCol(node) {
  if (!node) return { valid: false, known: false, score: 0 };
  const hints = getAncestorHints(node);
  let taxonData = null;

  if (node.colId) {
    const res = await fetch(`https://api.checklistbank.org/dataset/3LR/tree/${node.colId}/classification`);
    if (res.ok) taxonData = await res.json();
  }
  if (!taxonData) {
    const best = await resolveColId(node.name, hints);
    if (best && best.classification) {
      taxonData = best.classification;
      if (taxonData.length > 0) node.colId = String(best.id);
    }
  }
  if (!taxonData || taxonData.length === 0) {
    return { valid: true, known: false, score: 0, colId: null };
  }

  const apiTaxonomy = taxonData.map(c => ({ rank: c.rank, name: c.name }));
  const { valid, score } = validateApiContent(node, apiTaxonomy);
  return { valid, known: true, score, colId: node.colId, taxonomy: apiTaxonomy };
}

// ─── MAIN IMAGE PIPELINE (COL-FIRST) ────────────────────────────────────────
async function resolveTaxonImage(node) {
  if (!node || !node.name) return null;

  const lineageCheck = await validateLineageViaCol(node);
  if (lineageCheck.known && !lineageCheck.valid) {
    console.warn(`Imagem "${node.name}": COL tem o táxon mas linhagem diverge (score ${lineageCheck.score.toFixed(2)}), rejeitado`);
    return null;
  }

  const hints = getAncestorHints(node);
  const name = node.name;

  // 1. Wikidata (busca por QID)
  const wd = await resolveWikidataQid(name, hints);
  if (wd) {
    const img = await queryWikidataImage(wd.qid);
    if (img) return img;
  }

  // 2. GBIF com lineage params
  if (lineageCheck.valid) {
    const img = await queryGBIFMediaByLineage(node);
    if (img) return img;
  }

  // 3. Wikipedia com qualificador da linhagem + validação
  const wiki = await fetchBestWikipedia(node, 'pt');
  if (wiki?.thumbnail?.source) return wiki.thumbnail.source;

  // 4. Commons com qualificadores da linhagem
  for (const hint of hints.slice(0, 3)) {
    const q = hint ? `${name} ${hint}` : name;
    const commonsImg = await queryCommonsImage(q);
    if (commonsImg) return commonsImg;
  }

  // 5. iNaturalist (último recurso)
  try {
    const params = new URLSearchParams({ q: name, order: 'desc', order_by: 'observations_count' });
    const res = await fetch(`https://api.inaturalist.org/v1/taxa?${params.toString()}`);
    if (res.ok) {
      const d = await res.json();
      const photo = d.results?.[0]?.default_photo?.medium_url;
      if (photo) return photo;
    }
  } catch (e) {}

  return null;
}

// ─── MAIN DESCRIPTION PIPELINE (COL-FIRST) ──────────────────────────────────
const _descBioCache = new Map();
setInterval(() => { _descBioCache.clear(); }, 300000);

// Verifica se a página Wikipedia direta do nó tem descrição não-biológica
async function isNodeDescriptionNonBiological(node) {
  if (!node || !node.name) return false;
  if (_descBioCache.has(node.name)) return _descBioCache.get(node.name);
  let result = false;
  for (const lang of ['pt', 'en']) {
    const data = await fetchWikipediaSummary(node.name, lang);
    if (!data || !data.extract) continue;
    if (isDisambiguationPage(data)) continue;
    result = isNonBiologicalExtract(data.extract);
    break;
  }
  _descBioCache.set(node.name, result);
  return result;
}

async function resolveTaxonDescription(node) {
  if (!node || !node.name) return null;

  if (window._bioFilterEnabled) {
    const nonBio = await isNodeDescriptionNonBiological(node);
    if (nonBio) {
      node._descriptionNonBiological = true;
      return { text: `"${node.name}" — descrição indica conteúdo não-biológico.`, url: null, nonBiological: true };
    }
  }

  const lineageCheck = await validateLineageViaCol(node);
  if (lineageCheck.known && !lineageCheck.valid) {
    console.warn(`Descrição "${node.name}": COL tem o táxon mas linhagem diverge (score ${lineageCheck.score.toFixed(2)})`);
    return { text: `Descrição indisponível para "${node.name}" — linhagem COL divergente.`, url: null };
  }

  // 1. Wikipedia com validação de linhagem
  const data = await fetchBestWikipedia(node, 'pt');
  if (data?.extract) {
    return { text: data.extract, url: data.content_urls?.desktop?.page };
  }

  // 2. iNaturalist como fallback
  try {
    const params = new URLSearchParams({ q: node.name, order: 'desc', order_by: 'observations_count' });
    const res = await fetch(`https://api.inaturalist.org/v1/taxa?${params.toString()}`);
    if (res.ok) {
      const d = await res.json();
      const taxon = d.results?.[0];
      if (taxon?.wikipedia_url) {
        const wikiData = await fetchBestWikipedia(node, 'en');
        if (wikiData?.extract) return { text: wikiData.extract, url: wikiData.content_urls?.desktop?.page };
      }
      if (taxon?.preferred_common_name && taxon?.observations_count) {
        const desc = `${taxon.preferred_common_name} (${node.name}) — ${taxon.observations_count.toLocaleString('pt-BR')} observações no iNaturalist.`;
        return { text: desc, url: `https://www.inaturalist.org/taxa/${taxon.id}` };
      }
    }
  } catch (e) {}

  return { text: `Descrição indisponível para "${node.name}" — nenhuma fonte confiável encontrada.`, url: null };
}

// ─── DADOS EXTRAS: CONSERVAÇÃO, OCORRÊNCIAS E GENÉTICA ───────────────────────
const _extrasCache = new Map();
setInterval(() => { _extrasCache.clear(); }, 600000);

const IUCN_CATEGORIES = {
  EX: 'Extinta (EX)', EW: 'Extinta na Natureza (EW)',
  CR: 'Criticamente Ameaçada (CR)', EN: 'Ameaçada (EN)',
  VU: 'Vulnerável (VU)', NT: 'Quase Ameaçada (NT)',
  LC: 'Pouco Preocupante (LC)', DD: 'Dados Insuficientes (DD)',
  NE: 'Não Avaliada (NE)'
};

// 1. Conservação: status IUCN via registro do GBIF + iNaturalist
async function resolveConservationStatus(node) {
  try {
    const out = { status: null, threatStatuses: [], source: null };

    // GBIF species record traz "threatStatuses" (status IUCN)
    const gbif = await resolveGbifKey(node);
    if (gbif && gbif.key) {
      const res = await fetch(`https://api.gbif.org/v1/species/${gbif.key}`);
      if (res.ok) {
        const sp = await res.json();
        const ts = (sp.threatStatuses || []).filter(t => t.threatStatus);
        if (ts.length > 0) {
          out.threatStatuses = ts.map(t => ({
            status: IUCN_CATEGORIES[t.threatStatus.toUpperCase()] || t.threatStatus,
            source: t.source || 'IUCN'
          }));
          out.source = 'IUCN / GBIF';
        }
      }
    }

    // Fallback: iNaturalist conservation_status
    if (!out.threatStatuses.length) {
      const params = new URLSearchParams({ q: node.name, per_page: '1' });
      const res = await fetch(`https://api.inaturalist.org/v1/taxa?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        const taxon = d.results?.[0];
        const cs = taxon?.conservation_status;
        if (cs?.status) {
          out.threatStatuses.push({
            status: IUCN_CATEGORIES[String(cs.status).toUpperCase()] || cs.status,
            source: cs.iucn ? 'IUCN / iNaturalist' : 'iNaturalist'
          });
          out.source = 'iNaturalist';
        }
      }
    }

    out.status = out.threatStatuses[0]?.status || null;
    return out;
  } catch (e) { return null; }
}

// 2. Ocorrências e distribuição: contagem + países no GBIF
async function resolveOccurrenceData(node) {
  try {
    const out = { count: null, countries: [], localities: [] };

    const gbif = await resolveGbifKey(node);
    if (!gbif || !gbif.key) return null;

    // Contagem de registros de ocorrência
    const occRes = await fetch(`https://api.gbif.org/v1/occurrence/search?taxonKey=${gbif.key}&limit=0`);
    if (occRes.ok) {
      const occ = await occRes.json();
      out.count = occ.count ?? null;
    }

    // Distribuição (países)
    const distRes = await fetch(`https://api.gbif.org/v1/species/${gbif.key}/distributions`);
    if (distRes.ok) {
      const dist = await distRes.json();
      const seen = new Set();
      for (const item of (dist.results || [])) {
        const cc = item.countryCode || item.country;
        if (cc && cc.length === 2 && !seen.has(`c:${cc}`)) {
          seen.add(`c:${cc}`);
          out.countries.push(cc);
        }
        // Localidades de checklists estaduais/provinciais (ex.: "Vermont-US")
        // não representam a distribuição real — ignore-as.
        const loc = (item.locality || '').trim();
        const source = (item.source || '').toLowerCase();
        const isStateChecklist = /checklist of|\biucn .*red list\b|\blist of\b/.test(source);
        const isSubnational = /^[a-z\s]+-[a-z]{2,}$/i.test(loc);
        if (loc && !isStateChecklist && !isSubnational && !seen.has(`l:${loc}`)) {
          seen.add(`l:${loc}`);
          out.localities.push(loc);
        }
      }
    }

    if (out.count === null && out.countries.length === 0 && out.localities.length === 0) return null;
    return out;
  } catch (e) { return null; }
}

// 3. Informações genéticas: NCBI Taxonomy (E-utilities, sem chave)
async function resolveGeneticInfo(node) {
  try {
    const term = `${encodeURIComponent(node.name)}[Scientific Name]`;
    const esRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=${term}&retmode=json`);
    if (!esRes.ok) return null;
    const es = await esRes.json();
    const id = es?.esearchresult?.idlist?.[0];
    if (!id) return null;

    const sumRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=taxonomy&id=${id}&retmode=json`);
    if (!sumRes.ok) return null;
    const sum = await sumRes.json();
    const info = sum?.result?.[id];
    if (!info) return null;

    return {
      taxid: id,
      scientificName: info.scientificname || null,
      rank: info.rank || null,
      geneticCode: info.geneticcode?.name || null,
      mitoCode: info.mitochondrialgeneticcode?.name || null,
      division: info.division || null,
      lineage: info.lineage || null
    };
  } catch (e) { return null; }
}

async function resolveTaxonExtras(node) {
  const key = node.name;
  if (_extrasCache.has(key)) return _extrasCache.get(key);
  const [conservation, occurrence, genetics] = await Promise.all([
    resolveConservationStatus(node),
    resolveOccurrenceData(node),
    resolveGeneticInfo(node)
  ]);
  const result = { conservation, occurrence, genetics };
  _extrasCache.set(key, result);
  return result;
}

const ISO_COUNTRY_NAMES = {
  BR: 'Brasil', US: 'EUA', CN: 'China', IN: 'Índia', ID: 'Indonésia',
  MX: 'México', CO: 'Colômbia', AU: 'Austrália', AR: 'Argentina', ZA: 'África do Sul',
  ES: 'Espanha', FR: 'França', IT: 'Itália', DE: 'Alemanha', UK: 'Reino Unido',
  GB: 'Reino Unido', CA: 'Canadá', RU: 'Rússia', JP: 'Japão', PE: 'Peru',
  VE: 'Venezuela', BO: 'Bolívia', PY: 'Paraguai', UY: 'Uruguai', CL: 'Chile',
  EC: 'Equador', GT: 'Guatemala', PA: 'Panamá', CR: 'Costa Rica', CU: 'Cuba',
  PT: 'Portugal', AO: 'Angola', MZ: 'Moçambique', TZ: 'Tanzânia', KE: 'Quênia',
  NI: 'Nicarágua', HN: 'Honduras', SV: 'El Salvador', BZ: 'Belize', GY: 'Guiana',
  SR: 'Suriname', GF: 'Guiana Francesa', CD: 'Rep. Dem. do Congo', ET: 'Etiópia',
  GH: 'Gana', NG: 'Nigéria', CM: 'Camarões', SN: 'Senegal', CI: 'Costa do Marfim',
  EG: 'Egito', MA: 'Marrocos', DZ: 'Argélia', TW: 'Taiwan', KR: 'Coreia do Sul',
  KP: 'Coreia do Norte', TH: 'Tailândia', VN: 'Vietnã', PH: 'Filipinas', MY: 'Malásia',
  SG: 'Singapura', PK: 'Paquistão', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal',
  MM: 'Mianmar', LA: 'Laos', KH: 'Camboja', MN: 'Mongólia', KZ: 'Cazaquistão',
  UZ: 'Uzbequistão', TR: 'Turquia', IR: 'Irã', IQ: 'Iraque', IL: 'Israel',
  SA: 'Arábia Saudita', AE: 'Emirados Árabes', QA: 'Qatar', KW: 'Kuwait', YE: 'Iêmen',
  OM: 'Omã', JO: 'Jordânia', LB: 'Líbano', SY: 'Síria', AT: 'Áustria',
  CH: 'Suíça', BE: 'Bélgica', NL: 'Holanda', NO: 'Noruega', SE: 'Suécia',
  DK: 'Dinamarca', FI: 'Finlândia', PL: 'Polônia', CZ: 'Rep. Tcheca', SK: 'Eslováquia',
  HU: 'Hungria', RO: 'Romênia', BG: 'Bulgária', GR: 'Grécia', IE: 'Irlanda',
  IS: 'Islândia', PT: 'Portugal', HR: 'Croácia', RS: 'Sérvia', UA: 'Ucrânia',
  BY: 'Bielorrússia', LT: 'Lituânia', LV: 'Letônia', EE: 'Estônia', CY: 'Chipre',
  MT: 'Malta', LU: 'Luxemburgo', NZ: 'Nova Zelândia', PG: 'Papua-Nova Guiné',
  FJ: 'Fiji', SB: 'Ilhas Salomão', VU: 'Vanuatu', NC: 'Nova Caledônia',
  US: 'Estados Unidos', ZW: 'Zimbábue', ZM: 'Zâmbia', MW: 'Malaui', NA: 'Namíbia',
  BW: 'Botsuana', SZ: 'Eswatini', LS: 'Lesoto', MG: 'Madagascar', CV: 'Cabo Verde',
  GQ: 'Guiné Equatorial', GA: 'Gabão', CG: 'Rep. do Congo', CF: 'Rep. Centro-Africana',
  SD: 'Sudão', SS: 'Sudão do Sul', LY: 'Líbia', TN: 'Tunísia', MR: 'Mauritânia',
  ML: 'Mali', BF: 'Burkina Faso', NE: 'Niger', TD: 'Chade', GM: 'Gâmbia',
  GW: 'Guiné-Bissau', LR: 'Libéria', SL: 'Serra Leoa', BJ: 'Benin', TG: 'Togo',
  IN:'Índia', IR: 'Irã', AM: 'Armênia', GE: 'Geórgia', GE:'Geórgia', TM: 'Turcomenistão',
  KG: 'Quirguistão', TJ: 'Tajiquistão', BY: 'Bielorrússia', MD: 'Moldávia',
  AL: 'Albânia', MK: 'Macedônia', BA: 'Bósnia', SI: 'Eslovênia', DK: 'Dinamarca'
};

function renderTaxonExtras(node, extras) {
  const consSect = document.getElementById('taxon-conservation');
  const consBody = document.getElementById('taxon-conservation-body');
  const occSect = document.getElementById('taxon-occurrence');
  const occBody = document.getElementById('taxon-occurrence-body');
  const genSect = document.getElementById('taxon-genetics');
  const genBody = document.getElementById('taxon-genetics-body');

  // Conservação
  if (consSect && consBody && extras?.conservation?.threatStatuses?.length) {
    const c = extras.conservation;
    consBody.innerHTML = c.threatStatuses.map(t =>
      `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
         <span style="font-weight:600;">${esc(t.status)}</span>
         <span style="font-size:11px; color:#94a3b8;">${esc(t.source)}</span>
       </div>`
    ).join('');
    consSect.style.display = 'block';
  } else if (consSect) {
    consSect.style.display = 'none';
  }

  // Ocorrências e distribuição
  if (occSect && occBody && extras?.occurrence) {
    const o = extras.occurrence;
    const parts = [];
    if (o.count !== null) {
      parts.push(`<div style="padding:6px 0;"><strong style="color:#2ecc71;">${o.count.toLocaleString('pt-BR')}</strong> registro(s) de ocorrência no GBIF.</div>`);
    }
    if (o.countries.length) {
      const names = o.countries.slice(0, 12).map(c => esc(ISO_COUNTRY_NAMES[c] || c)).join(', ');
      parts.push(`<div style="padding:6px 0;">🌎 Países: <strong>${names}</strong>${o.countries.length > 12 ? '…' : ''}</div>`);
    }
    if (o.localities.length) {
      parts.push(`<div style="padding:6px 0;">📍 Localidades: ${o.localities.slice(0, 6).map(esc).join(', ')}</div>`);
    }
    if (parts.length) {
      occBody.innerHTML = parts.join('');
      occSect.style.display = 'block';
    } else {
      occSect.style.display = 'none';
    }
  } else if (occSect) {
    occSect.style.display = 'none';
  }

  // Genética
  if (genSect && genBody && extras?.genetics) {
    const g = extras.genetics;
    const rows = [];
    if (g.scientificName) rows.push(['Nome científico', g.scientificName]);
    if (g.rank) rows.push(['Rank', g.rank]);
    if (g.geneticCode) rows.push(['Código genético', g.geneticCode]);
    if (g.mitoCode) rows.push(['Código mitocondrial', g.mitoCode]);
    if (g.division) rows.push(['Divisão', g.division]);
    if (g.taxid) rows.push(['NCBI TaxID', g.taxid]);

    if (rows.length) {
      genBody.innerHTML = rows.map(([k, v]) =>
        `<div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
           <span style="color:#94a3b8; font-size:12px;">${esc(k)}</span>
           <span style="text-align:right;">${esc(v)}</span>
         </div>`
      ).join('');
      genSect.style.display = 'block';
    } else {
      genSect.style.display = 'none';
    }
  } else if (genSect) {
    genSect.style.display = 'none';
  }
}

// ─── EXPORT FOR TESTS ────────────────────────────────────────────────────────
window._testAPI = { resolveTaxonIds: async (n) => ({
  col: await resolveColId(n.name, getAncestorHints(n)),
  gbif: await resolveGbifKey(n),
  wikidata: await resolveWikidataQid(n.name, getAncestorHints(n))
}) };
 
function buildLineage(node) {
  if (node.lineage && node.lineage.length > 0) {
    return node.lineage;
  }
  const path = [];
  let cur = node;
  while (cur) { path.unshift(cur); cur = cur.parent; }
  return path;
}

function updateLineageUI(node) {
  const lineage = buildLineage(node);
  if (lineage.length > 1 && lineageSect && lineageList) {
    lineageSect.style.display = 'block';
    lineageList.innerHTML = lineage.map(n =>
      `<li>${esc(n.name)}${n.rank ? ` <em class="rank-hint">${esc(n.rank)}</em>` : ''}</li>`
    ).join('');
  } else if (lineageSect) {
    lineageSect.style.display = 'none';
  }
}
 
function updateStats() {
  if (!renderer) return;
  const count = window.allTreeNodes ? window.allTreeNodes.length : 0;
  const formattedCount = count.toLocaleString('pt-BR');
 
  if (statsCount) statsCount.textContent = formattedCount;
  const miniCount = document.getElementById('mini-count');
  if (miniCount) miniCount.textContent = formattedCount;
 
  if (statsBar) {
    const pct = Math.min(100, (count / 2500) * 100);
    statsBar.style.width = `${pct}%`;
  }

  const issues = window._taxonIssues || [];
  const el = document.getElementById('validation-issues');
  const countEl = document.getElementById('validation-count');
  const detailEl = document.getElementById('validation-detail');
  if (el && countEl && detailEl) {
    if (issues.length > 0) {
      el.style.display = 'block';
      countEl.textContent = issues.length;
      const byType = {};
      for (const iss of issues) {
        byType[iss.type] = (byType[iss.type] || 0) + 1;
      }
      detailEl.innerHTML = Object.entries(byType)
        .map(([t, c]) => `<span style="margin-right:12px;">${esc(t)}: ${Number(c)}</span>`)
        .join('');
    } else {
      el.style.display = 'none';
    }
  }
}
setInterval(updateStats, 1000);
 
// ─── PROGRESSO E AUTENTICAÇÃO (PASSKEY) ──────────────────────────────────────
async function updateAuthUI() {
  currentProfile = await fetchUserProfile();
 
  if (currentProfile) {
    if (authUnlogged) authUnlogged.style.display = 'none';
    if (authLogged) authLogged.style.display = 'block';
 
    const elName = document.getElementById('logged-user-name');
    const elLast = document.getElementById('logged-last-login');
    const elDisc = document.getElementById('stat-discoveries-val');
    const elFavs = document.getElementById('stat-favorites-val');
    const elAchv = document.getElementById('stat-achievements-val');
    const elDevs = document.getElementById('user-devices-list');
    const elLevel = document.getElementById('stat-level-val');
    const elXpVal = document.getElementById('stat-xp-val');
    const elXpBar = document.getElementById('stat-xp-bar');
    const elXpNext = document.getElementById('stat-xp-next');

    if (elName) elName.textContent = currentProfile.display_name || 'Explorador';
    if (elLast) {
      elLast.textContent = currentProfile.last_login 
        ? new Date(currentProfile.last_login).toLocaleString('pt-BR') 
        : 'Primeiro acesso';
    }
 
    if (elDisc) elDisc.textContent = currentProfile.discoveries_count ?? 0;
    if (elFavs) elFavs.textContent = currentProfile.favorites_count ?? 0;
    if (elAchv) elAchv.textContent = currentProfile.achievements_count ?? 0;

    // Nível e XP (enda assíncrono para não travar a UI)
    fetchUserProgress().then(progress => {
      if (!progress) return;
      currentProgress = progress;
      renderLevelUI(progress);
      const elTime = document.getElementById('stat-time-val');
      if (elTime) {
        const totalMin = Math.floor((progress.total_time_seconds || 0) / 60);
        elTime.textContent = totalMin >= 60
          ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}min`
          : `${totalMin} min`;
      }
    });
 
    if (elDevs) {
      elDevs.innerHTML = (currentProfile.passkeys || [])
        .map(p => `<li><strong>${esc(p.device_name)}</strong> (Registrado em: ${new Date(p.created_at).toLocaleDateString('pt-BR')})</li>`)
        .join('');
    }
 
    if (btnAuth) btnAuth.style.border = '2px solid #2ecc71';
  } else {
    if (authUnlogged) authUnlogged.style.display = 'block';
    if (authLogged) authLogged.style.display = 'none';
    if (btnAuth) btnAuth.style.border = 'none';
  }
}

// ─── RENDERIZAÇÃO DE NÍVEL E XP ──────────────────────────────────────────────
function renderLevelUI(progress) {
  if (!progress) return;
  const elLevel = document.getElementById('stat-level-val');
  const elSym = document.getElementById('stat-level-symbol');
  const elXpVal = document.getElementById('stat-xp-val');
  const elXpBar = document.getElementById('stat-xp-bar');
  const elXpNext = document.getElementById('stat-xp-next');

  const xpInto = progress.xp_into_level ?? 0;
  const xpNeed = progress.xp_needed_for_next ?? 100;
  const pct = Math.min(100, Math.max(0, Math.round((xpInto / Math.max(1, xpNeed)) * 100)));

  const level = progress.level ?? 1;
  if (elLevel) elLevel.textContent = level;
  if (elSym) elSym.textContent = levelSymbol(level);
  if (elXpVal) elXpVal.textContent = `${progress.xp ?? 0} XP`;
  if (elXpBar) elXpBar.style.width = `${pct}%`;
  if (elXpNext) {
    const restante = Math.max(0, xpNeed - xpInto);
    elXpNext.textContent = `${restante} XP até o nível ${level + 1}`;
  }

  // Ajusta o plano de fundo conforme o nível liberado conta
  ensureBackground();
}

// Garante um fundo adequado: aplica o selecionado se liberado, senão o melhor disponível p/ o nível
function ensureBackground() {
  const level = currentProgress?.level || currentProfile?.level || 1;
  console.log('[Fundo] ensureBackground | nível:', level, '| selecionado:', _selectedBgId, '| logged:', !!currentProfile);
  // Se já há um fundo selecionado E ainda está liberado no nível atual, mantém.
  if (_selectedBgId) {
    const sel = LEVEL_BACKGROUNDS.find(b => b.id === _selectedBgId);
    if (sel && level >= sel.level) {
      if (!document.body.style.background) {
        const bg = LEVEL_BACKGROUNDS.find(b => b.id === _selectedBgId);
        if (bg) {
          document.body.style.cssText = bg.css + '; background-color: #07070f;';
          if (bg.interactive) startInteractiveBackground();
          startPulse(bg.id);
        }
      }
      return;
    }
    // Fundo selecionado deixou de ser válido (nunca deveria acontecer em subida)
    _selectedBgId = null;
    localStorage.removeItem('tol_selected_bg');
  }
  // Sem seleção válida: pega o fundo de maior nível liberado (progresso progressivo)
  const unlocked = unlockedBackgrounds(level);
  const best = unlocked[unlocked.length - 1];
  if (best) {
    console.log('[Fundo] Selecionando melhor fundo p/ nível', level, '→', best.id, best.name);
    _selectedBgId = best.id;
    localStorage.setItem('tol_selected_bg', best.id);
    document.body.style.cssText = best.css + '; background-color: #07070f;';
    if (best.interactive) startInteractiveBackground();
    else stopInteractiveBackground();
    startPulse(best.id);
  }
}

function showLevelUpToast(level) {
  const toast = notifToast;
  if (!toast) return;
  toast.textContent = `🎉 Nível ${level} alcançado! Continue explorando.`;
  toast.classList.remove('hidden');
  toast.classList.add('visible');
  clearTimeout(window._levelToastTimer);
  window._levelToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('hidden');
  }, 4500);
}
 
if (btnAuth) {
  btnAuth.addEventListener('click', async () => {
    sounds.playSFX('click');
    await updateAuthUI();
    if (authModal) authModal.classList.remove('hidden');
  });
}
 
if (closeAuthBtn) {
  closeAuthBtn.addEventListener('click', () => {
    if (authModal) authModal.classList.add('hidden');
  });
}
 
if (btnRegisterPasskey) {
  btnRegisterPasskey.addEventListener('click', async () => {
    const dispNameEl = document.getElementById('auth-display-name');
    const passEl = document.getElementById('auth-password');
    const devNameEl = document.getElementById('auth-device-name');

    const dispName = dispNameEl ? dispNameEl.value.trim() : '';
    const password = passEl ? passEl.value : '';
    const devName = (devNameEl && devNameEl.value.trim()) || 'Navegador Web';

    if (!dispName) return alert('Por favor, escolha um nick.');
    if (!password) return alert('Defina uma senha para sua conta.');
    if (BANNED_NICKWORDS.some(w => _normNick(dispName).includes(w))) {
      return alert('Este apelido contém termos não permitidos.');
    }

    try {
      await registerPasskey(dispName, password, devName);
      sounds.playSFX('success');
      alert('Conta criada com sucesso!');
      await updateAuthUI();
    } catch (err) {
      alert(`Falha no registro: ${err.message}`);
    }
  });
}

if (btnLoginPasskey) {
  btnLoginPasskey.addEventListener('click', async () => {
    const dispNameEl = document.getElementById('auth-display-name');
    const passEl = document.getElementById('auth-password');

    const dispName = dispNameEl ? dispNameEl.value.trim() : '';
    const password = passEl ? passEl.value : '';

    if (!dispName) return alert('Digite seu nick.');
    if (!password) return alert('Digite sua senha.');

    try {
      await loginPasskey(dispName, password);
      sounds.playSFX('success');
      alert('Autenticado com sucesso!');
      await updateAuthUI();
    } catch (err) {
      alert(`Erro na autenticação: ${err.message}`);
    }
  });
}
 
if (btnAddDevice) {
  btnAddDevice.addEventListener('click', async () => {
    const inputEl = document.getElementById('add-device-input');
    const devName = (inputEl && inputEl.value.trim()) || 'Novo Dispositivo';
    try {
      await addPasskeyDevice(devName);
      alert('Novo dispositivo cadastrado!');
      if (inputEl) inputEl.value = '';
      await updateAuthUI();
    } catch (err) {
      alert(`Erro ao adicionar dispositivo: ${err.message}`);
    }
  });
}
 
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await logoutUser();
    await updateAuthUI();
    alert('Sessão encerrada.');
  });
}
 
if (btnFavTaxon) {
  btnFavTaxon.addEventListener('click', async () => {
    if (!currentSelectedNode) return alert('Selecione um táxon primeiro.');
    if (!currentProfile) return alert('Autentique-se com uma Passkey para salvar favoritos.');

    const result = await saveFavorite(currentSelectedNode.rank || 'taxon', currentSelectedNode.name);
    if (result && result.ok) {
      sounds.playSFX('click');
      if (result.achievements && result.achievements.length > 0) {
        result.achievements.forEach(code => {
          showAchievementNotification(code, ACHIEVEMENT_NAMES[code] || code, ACHIEVEMENT_DESCRIPTIONS[code] || '');
        });
      }
      if (result.level && result.level.leveled_up) {
        showLevelUpToast(result.level.new_level);
      }
      await updateAuthUI();
    }
  });
}
 
document.body.addEventListener('click', () => {
  try {
    if (sounds && typeof sounds.playPlaylist === 'function') {
      sounds.playPlaylist(['/music/musica1.mp3', '/music/musica2.mp3', '/music/musica3.mp3', '/music/musica4.mp3']);
    }
    if (sounds && typeof sounds.resumeMusic === 'function') {
      sounds.resumeMusic();
    }
  } catch (e) {
    console.warn('Erro ao inicializar o áudio da página', e);
  }
}, { once: true });

// ─── SLIDERS DE ÁUDIO ────────────────────────────────────────────────────────
if (musicSlider) {
  musicSlider.addEventListener('input', (e) => {
    sounds.setMusicVolume(parseFloat(e.target.value));
  });
}
if (sfxSlider) {
  sfxSlider.addEventListener('input', (e) => {
    sounds.setSFXVolume(parseFloat(e.target.value));
  });
}

// ─── CONTROLES DE INTERFACE ──────────────────────────────────────────────────
if (btnZoomIn) btnZoomIn.addEventListener('click', () => renderer?.zoomBy?.(1.25));
if (btnZoomOut) btnZoomOut.addEventListener('click', () => renderer?.zoomBy?.(0.8));
if (btnReset) btnReset.addEventListener('click', () => rootNode && renderer?.focusOnNode?.(rootNode, 1.0));
if (btnSources && statsPanel) btnSources.addEventListener('click', () => statsPanel.classList.toggle('hidden'));
if (btnHelp && helpModal) btnHelp.addEventListener('click', () => helpModal.classList.remove('hidden'));
if (closeHelpBtn && helpModal) closeHelpBtn.addEventListener('click', () => helpModal.classList.add('hidden'));

// ─── BARRA SUPERIOR MINIMIZÁVEL ────────────────────────────────────────────
const topBar = document.querySelector('.top-bar');
const btnCollapse = document.getElementById('btn-collapse-bar');
function setBarCollapsed(collapsed) {
  if (!topBar) return;
  topBar.classList.toggle('collapsed', collapsed);
  const btn = document.getElementById('btn-collapse-bar');
  if (btn) btn.title = collapsed ? 'Expandir barra' : 'Minimizar barra';
  localStorage.setItem('tol_bar_collapsed', collapsed ? '1' : '0');
}
if (btnCollapse) {
  btnCollapse.addEventListener('click', () => {
    if (topBar) setBarCollapsed(!topBar.classList.contains('collapsed'));
  });
  btnCollapse.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (topBar) setBarCollapsed(!topBar.classList.contains('collapsed'));
    }
  });
  // Restaura estado salvo (default: colapsada no mobile, expandida no desktop)
  const saved = localStorage.getItem('tol_bar_collapsed');
  const mobileByDefault = window.matchMedia('(max-width: 640px)').matches;
  if (saved !== null) setBarCollapsed(saved === '1');
  else if (mobileByDefault) setBarCollapsed(true);
}

const btnValidateLineage = document.getElementById('btn-validate-lineage');
const btnTestValidator = document.getElementById('btn-test-validator');
if (btnValidateLineage) btnValidateLineage.addEventListener('click', () => {
  document.getElementById('lineage-progress').textContent = '🔬 Validando linhagens…';
  validateTreeLineage().then(r => {
    document.getElementById('lineage-progress').textContent = `✅ ${r.checked} verificados, ${r.correct} corretos, ${r.corrected.length} corrigidos, ${r.manual.length} manuais`;
  });
});
if (btnTestValidator) btnTestValidator.addEventListener('click', () => {
  document.getElementById('lineage-progress').textContent = '🧪 Executando testes…';
  runValidationTests().then(r => {
    document.getElementById('lineage-progress').textContent = `🧪 ${r.passed} passaram, ${r.failed} falharam`;
    if (r.failed > 0) console.error('Falhas:', r.errors);
  });
});

const btnBioFilter = document.getElementById('btn-bio-filter');
const bioFilterInfo = document.getElementById('bio-filter-info');
function updateBioFilterUI() {
  if (!btnBioFilter) return;
  const on = window._bioFilterEnabled;
  btnBioFilter.textContent = on ? '🌿 Filtro Biológico: ON' : '🌿 Filtro Biológico: OFF';
  btnBioFilter.style.background = on ? 'rgba(46, 204, 113, 0.25)' : 'rgba(231, 76, 60, 0.25)';
  btnBioFilter.style.borderColor = on ? 'rgba(46, 204, 113, 0.5)' : 'rgba(231, 76, 60, 0.5)';
  if (bioFilterInfo) {
    bioFilterInfo.textContent = on
      ? `${window._bioFilterCount || 0} nome(s)/descrição(ões) não-biológico(s) removido(s)`
      : 'Todos os nomes do TSV foram carregados (filtro desligado)';
  }
}
if (btnBioFilter) btnBioFilter.addEventListener('click', () => {
  window._bioFilterEnabled = !window._bioFilterEnabled;
  updateBioFilterUI();
  if (window._bioFilterEnabled) {
    pruneNonBiological();
    if (renderer) {
      if (typeof renderer._recomputeLayout === 'function') renderer._recomputeLayout();
      if (typeof renderer._requestRender === 'function') renderer._requestRender();
    }
  } else {
    initTree(true);
  }
});
updateBioFilterUI();
 
if (closeInfoBtn) {
  closeInfoBtn.addEventListener('click', () => {
    if (infoPanel) infoPanel.classList.add('hidden');
    currentSelectedNode = null;
  });
}
 
// ─── NOTIFICAÇÃO DE CONQUISTA ────────────────────────────────────────────────
function showAchievementNotification(code, name, description) {
  sounds.playSFX('achievement');
  if (notifToast) {
    const titleEl = document.getElementById('notif-ach-title');
    const descEl = document.getElementById('notif-ach-desc');
    if (titleEl) titleEl.textContent = `🏆 ${name}`;
    if (descEl) descEl.textContent = description || '';
    notifToast.classList.remove('hidden');
    notifToast.classList.add('visible');
    setTimeout(() => {
      notifToast.classList.remove('visible');
      notifToast.classList.add('hidden');
    }, 5000);
  }
}


document.addEventListener('DOMContentLoaded', () => {
    const logo = document.getElementById('tree-logo');
    if (!logo) return;

    const spans = logo.querySelectorAll('span');

    function triggerJumpSequence() {
        let delay = 0;
        // Adiciona a classe 'jump' a cada span sequencialmente
        spans.forEach((span, index) => {
            // Adiciona um pequeno atraso progressivo para cada letra
            setTimeout(() => {
                span.classList.add('jump');
                // Remove a classe após a animação terminar para permitir repetição
                setTimeout(() => {
                    span.classList.remove('jump');
                }, 600); // Tempo ligeiramente maior que a duração da animação CSS (0.5s)
            }, delay);
            delay += 50; // Atraso de 50ms entre o início do pulo de cada letra
        });
    }

    // Sincroniza o início do pulo com o fim da passagem da luz diagonal
    // A luz diagonal leva 4s, então disparamos o pulo logo em seguida (a cada 4.1s)
    triggerJumpSequence(); // Inicia imediatamente
    setInterval(triggerJumpSequence, 4100); // Repete no mesmo ritmo da luz diagonal
});


// Novos Elementos de Áudio
const btnNextMusic = document.getElementById('btn-next-music');
const selectMusic  = document.getElementById('select-music');

// Evento para Pular Música
if (btnNextMusic) {
  btnNextMusic.addEventListener('click', () => {
    sounds.playSFX('click');
    if (typeof sounds.nextTrack === 'function') {
      sounds.nextTrack(); // Certifique-se de que sua classe SoundManager possui esse método
    }
  });
}

// Evento para Escolher uma Música Específica
if (selectMusic) {
  selectMusic.addEventListener('change', (e) => {
    const selectedTrack = e.target.value;
    if (typeof sounds.playTrack === 'function') {
      sounds.playTrack(selectedTrack); // Certifique-se de que sua classe SoundManager possui esse método
    }
  });
}

// ─── PÁGINA DE FAVORITOS ─────────────────────────────────────────────────────
async function openFavoritesPage() {
  if (!currentProfile) return alert('Autentique-se para ver seus favoritos.');
  const favs = await fetchFavorites();
  if (favsModal) favsModal.classList.remove('hidden');
  if (favsList) {
    favsList.innerHTML = '';
    if (!favs || favs.length === 0) {
      favsList.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">Nenhum favorito ainda. Clique em ⭐ Favoritar em um táxon para adicionar.</p>';
    } else {
      const groups = {};
      for (const f of favs) {
        const type = f.item_type || 'taxon';
        if (!groups[type]) groups[type] = [];
        groups[type].push(f);
      }
      for (const [type, items] of Object.entries(groups)) {
        const section = document.createElement('div');
        section.style.marginBottom = '16px';
        section.innerHTML = `<h4 style="color: #38bdf8; margin-bottom: 8px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">${esc(type)}</h4>`;
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '4px';
        items.forEach(f => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '8px 10px';
          item.style.background = 'rgba(255,255,255,0.05)';
          item.style.borderRadius = '6px';
          item.innerHTML = `
            <span style="font-size: 13px;"><strong>${esc(f.item_id || '—')}</strong></span>
            <button class="remove-fav-btn" data-item="${escAttr(f.item_id)}" style="background: #e74c3c; border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Remover</button>
          `;
          list.appendChild(item);
        });
        section.appendChild(list);
        favsList.appendChild(section);
      }
      favsList.querySelectorAll('.remove-fav-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = btn.getAttribute('data-item');
          await removeFavorite(itemId);
          await updateAuthUI();
          openFavoritesPage();
        });
      });
    }
  }
}

if (btnFavsPage) {
  btnFavsPage.addEventListener('click', () => {
    sounds.playSFX('click');
    openFavoritesPage();
  });
}
if (closeFavsBtn && favsModal) {
  closeFavsBtn.addEventListener('click', () => {
    favsModal.classList.add('hidden');
  });
}
if (favsModal) {
  favsModal.addEventListener('click', (e) => {
    if (e.target === favsModal) favsModal.classList.add('hidden');
  });
}

// ─── PÁGINA DE CONQUISTAS ────────────────────────────────────────────────────
const ACHIEVEMENT_ICONS = {
  PRIMEIRA_DESCOBERTA: '🔍',
  CINCO_DESCOBERTAS: '🔭',
  DEZ_DESCOBERTAS: '🧪',
  VINTE_CINCO_DESCOBERTAS: '🗺️',
  CINQUENTA_DESCOBERTAS: '🧬',
  CEM_DESCOBERTAS: '🏅',
  DUZENTAS_DESCOBERTAS: '📚',
  QUINHENTAS_DESCOBERTAS: '🛡️',
  MIL_DESCOBERTAS: '👑',
  PRIMEIRO_FAVORITO: '⭐',
  CINCO_FAVORITOS: '📌',
  DEZ_FAVORITOS: '💎',
  VINTE_CINCO_FAVORITOS: '🗃️',
  CINQUENTA_FAVORITOS: '🏛️',
  TREINTA_MINUTOS: '⏱️',
  UMA_HORA: '⏳',
  DUAS_HORAS: '🔥',
  CINCO_HORAS: '🎯',
  DEZ_HORAS: '🚀',
  TODOS_REINOS: '🌍',
  KONAMI: '🥷',
  QUINZE_MINUTOS: '⏱️',
  QUARENTA_CINCO_MINUTOS: '🧠',
  TRES_HORAS: '⏰',
  QUARENTA_FAVORITOS: '🧾',
  CEM_FAVORITOS: '📦',
  TREZENTAS_DESCOBERTAS: '🔬',
  SETECENTAS_DESCOBERTAS: '🚁',
  NIVEL_TRES: '⭐',
  NIVEL_CINCO: '🌟',
  NIVEL_DEZ: '🌌'
};

// Conquistas secretas: ficam ocultas (pretas) até serem desbloqueadas
const SECRET_ACHIEVEMENTS = new Set(['KONAMI']);

async function openAchievementsPage() {
  if (achievementsModal) achievementsModal.classList.remove('hidden');
  if (!achievementsList) return;

  achievementsList.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">Carregando…</p>';

  let achievements = [];
  if (currentProfile) {
    achievements = await fetchAchievements();
  }

  const unlocked = new Set(
    (achievements || []).filter(a => a.unlocked).map(a => a.code)
  );

  const allCodes = Object.keys(ACHIEVEMENT_NAMES);
  const ordered = allCodes.length > 0 ? allCodes : (achievements || []).map(a => a.code);

  achievementsList.innerHTML = '';
  if (ordered.length === 0) {
    achievementsList.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">Nenhuma conquista definida ainda.</p>';
    return;
  }

  for (const code of ordered) {
    const name = ACHIEVEMENT_NAMES[code] || code;
    const howTo = ACHIEVEMENT_DESCRIPTIONS[code] || 'Explore o site para descobrir como obter esta conquista.';
    const isUnlocked = unlocked.has(code);
    const meta = (achievements || []).find(a => a.code === code);
    const dateStr = isUnlocked && meta && meta.unlocked_at
      ? new Date(meta.unlocked_at).toLocaleString('pt-BR')
      : null;

    // Conquista secreta bloqueada: cartão preto sem revelar nome/descrição
    if (SECRET_ACHIEVEMENTS.has(code) && !isUnlocked) {
      const item = document.createElement('div');
      item.className = 'achievement-item secret locked';
      item.style.cssText = 'display:flex; align-items:center; gap:14px; padding:12px 14px; margin-bottom:8px; background:#000; border:1px solid #1a1a1a; border-radius:8px; opacity:1;';
      item.innerHTML = `
        <div style="font-size: 24px; flex-shrink: 0; width: 44px; text-align: center; color:#333;">🕵️</div>
        <div style="flex:1; min-width:0;">
          <strong style="font-size:14px; color:#333;">?????</strong>
          <div style="font-size:12px; color:#444; margin-top:3px; line-height:1.4;">Conquista secreta — bloqueada.</div>
        </div>
        <div style="font-size:11px; padding:2px 8px; border-radius:10px; background:#1a1a1a; color:#555;">🔒 ????</div>
      `;
      achievementsList.appendChild(item);
      continue;
    }

    const item = document.createElement('div');
    item.className = 'achievement-item' + (isUnlocked ? ' unlocked' : ' locked');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '14px';
    item.style.padding = '12px 14px';
    item.style.marginBottom = '8px';
    item.style.background = isUnlocked ? 'rgba(46, 204, 113, 0.10)' : 'rgba(255,255,255,0.04)';
    item.style.border = isUnlocked ? '1px solid rgba(46, 204, 113, 0.4)' : '1px solid rgba(255,255,255,0.08)';
    item.style.borderRadius = '8px';
    item.style.opacity = isUnlocked ? '1' : '0.6';

item.innerHTML = `
      <div style="font-size: 28px; flex-shrink: 0; width: 44px; text-align: center; filter: ${isUnlocked ? 'none' : 'grayscale(1)'};">${ACHIEVEMENT_ICONS[code] || '🏆'}</div>
      <div style="flex: 1; min-width: 0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size: 14px; color: ${isUnlocked ? '#2ecc71' : '#cbd5e1'};">${esc(name)}</strong>
          <span style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: ${isUnlocked ? 'rgba(46,204,113,0.2)' : 'rgba(148,163,184,0.15)'}; color: ${isUnlocked ? '#2ecc71' : '#94a3b8'};">${isUnlocked ? '✅ Concluída' : '🔒 Bloqueada'}</span>
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 3px; line-height: 1.4;">
          🎯 <em>Como obter:</em> ${esc(howTo)}
        </div>
        </div>
        ${isUnlocked && dateStr ? `<div style="font-size: 11px; color: #64748b; margin-top: 3px;">📅 Liberada em: ${esc(dateStr)}</div>` : ''}
      </div>
    `;
    achievementsList.appendChild(item);
  }

  if (!currentProfile) {
    const notice = document.createElement('p');
    notice.style.cssText = 'color: #94a3b8; text-align: center; padding: 12px; font-size: 12px; margin-top: 10px;';
    notice.textContent = '🔑 Entre na sua conta (botão 🔑) para acompanhar suas conquistas desbloqueadas.';
    achievementsList.appendChild(notice);
  }
}

if (btnAchievementsPage) {
  btnAchievementsPage.addEventListener('click', () => {
    sounds.playSFX('click');
    openAchievementsPage();
  });
}
if (closeAchievementsBtn && achievementsModal) {
  closeAchievementsBtn.addEventListener('click', () => {
    achievementsModal.classList.add('hidden');
  });
}
if (achievementsModal) {
  achievementsModal.addEventListener('click', (e) => {
    if (e.target === achievementsModal) achievementsModal.classList.add('hidden');
  });
}

// ─── PÁGINA DE FUNDOS DE TELA ───────────────────────────────────────────────
function openBackgroundsPage() {
  if (!backgroundsModal) return;
  const userLevel = currentProgress?.level || currentProfile?.level || 1;
  console.log('[Fundo] openBackgroundsPage | nível:', userLevel, '| selecionado:', _selectedBgId, '| total fundos:', LEVEL_BACKGROUNDS.length);
  const bgs = LEVEL_BACKGROUNDS;
  if (backgroundsGrid) {
    backgroundsGrid.innerHTML = bgs.map(bg => {
      const unlocked = userLevel >= bg.level;
      const selected = _selectedBgId === bg.id;
      const interactive = bg.interactive ? ' ✨' : '';
      const lockLabel = unlocked ? '' : `🔒 Nível ${bg.level}`;
      const safeName = esc(bg.name);
      const safeCss = escAttr(bg.css);
      return `
        <div class="bg-card ${unlocked ? '' : 'locked'} ${selected ? 'selected' : ''}" data-id="${escAttr(bg.id)}" ${unlocked ? 'title="Clique para aplicar"' : ''} style="${unlocked ? '' : 'cursor:not-allowed;'}">
          <div class="bg-preview" style="${safeCss}"></div>
          <div class="bg-meta">
            <span class="bg-name">${safeName}${interactive}</span>
            <span class="bg-lock">${selected ? '✅' : (unlocked ? '' : lockLabel)}</span>
          </div>
        </div>`;
    }).join('');

    backgroundsGrid.querySelectorAll('.bg-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const bg = LEVEL_BACKGROUNDS.find(b => b.id === id);
        console.log('[Fundo] Clique no cartão:', id, '| unlocked:', bg ? (userLevel >= bg.level) : 'n/a', '| nivel:', userLevel);
        if (!bg) return;
        if (userLevel < bg.level) {
          sounds.playSFX('denied');
          return;
        }
        sounds.playSFX('click');
        applyBackground(id);
        // Atualiza a seleção visual sem re-render total
        backgroundsGrid.querySelectorAll('.bg-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }
  backgroundsModal.classList.remove('hidden');
}

if (btnBackgroundsPage) {
  btnBackgroundsPage.addEventListener('click', () => {
    sounds.playSFX('click');
    if (currentProfile) updateAuthUI().then(openBackgroundsPage);
    else openBackgroundsPage();
  });
}
if (closeBackgroundsBtn && backgroundsModal) {
  closeBackgroundsBtn.addEventListener('click', () => {
    backgroundsModal.classList.add('hidden');
  });
}
const btnToggleLight = document.getElementById('btn-toggle-light');
if (btnToggleLight) {
  const label = document.getElementById('light-toggle-label');
  if (label) label.textContent = _lightEnabled ? '💡 Iluminação: Ligada' : '💡 Iluminação: Desligada';
  btnToggleLight.addEventListener('click', () => {
    sounds.playSFX('click');
    toggleLight();
  });
}
if (backgroundsModal) {
  backgroundsModal.addEventListener('click', (e) => {
    if (e.target === backgroundsModal) backgroundsModal.classList.add('hidden');
  });
}

// ─── FECHAR MENUS/PAINÉIS COM TECLA ESC ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAllMenus();
});

// ─── NAVEGAÇÃO POR TECLADO (PC): setas movem, +/- zoom, 0 centraliza ────────
document.addEventListener('keydown', (e) => {
  // Não interfere quando o usuário está digitando na busca ou em inputs
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (typing && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

  if (!renderer || !renderer.world) return;

  const k = e.key;

  // Seta para cima/baixo: também usada por inputs (select). Se há input focado,
  // deixa o comportamento padrão; caso contrário, pan na árvore.
  if (!typing && (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight')) {
    e.preventDefault();
    const SPAN = 60 / (renderer.world.scale.x || 1);
    if (k === 'ArrowLeft')  renderer.world.x += SPAN;
    if (k === 'ArrowRight') renderer.world.x -= SPAN;
    if (k === 'ArrowUp')    renderer.world.y += SPAN;
    if (k === 'ArrowDown')  renderer.world.y -= SPAN;
    renderer._requestRender();
    return;
  }

  if (!typing) {
    if (k === '+' || k === '=') { e.preventDefault(); renderer.zoomBy(1.25); return; }
    if (k === '-' || k === '_') { e.preventDefault(); renderer.zoomBy(0.8); return; }
    if (k === '0' || k === 'Home') { e.preventDefault(); renderer.resetView(); return; }
  }
});

function closeAllMenus() {
  if (infoPanel) infoPanel.classList.add('hidden');
  if (helpModal) helpModal.classList.add('hidden');
  if (authModal) authModal.classList.add('hidden');
  if (favsModal) favsModal.classList.add('hidden');
  if (achievementsModal) achievementsModal.classList.add('hidden');
  if (backgroundsModal) backgroundsModal.classList.add('hidden');
  if (statsPanel) statsPanel.classList.add('hidden');
  currentSelectedNode = null;
  closeAutocomplete();
}

// ─── CÓDIGO KONAMI (CONQUISTA SECRETA) ──────────────────────────────────────
const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a'
];
let konamiIndex = 0;
let konamiToastTimer = null;

document.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const expected = KONAMI_SEQUENCE[konamiIndex];
  if (key === expected) {
    konamiIndex++;
    if (konamiIndex === KONAMI_SEQUENCE.length) {
      konamiIndex = 0;
      handleKonamiCode();
    }
  } else {
    konamiIndex = key === KONAMI_SEQUENCE[0] ? 1 : 0;
  }
});

async function handleKonamiCode() {
  if (!currentProfile) {
    showAchievementNotification('', '🕵️ Código Secreto', 'Autentique-se (botão 🔑) para poder desbloquear a conquista secreta!');
    return;
  }
  const result = await unlockAchievement('KONAMI');
  if (result.status === 'success') {
    sounds.playSFX('achievement');
    showAchievementNotification('KONAMI', '🥷 Código Secreto', 'Conquista secreta desbloqueada! Você dominou o código Konami.');
    updateAuthUI();
  } else if (result.status === 'already_unlocked') {
    showAchievementNotification('', '🥷 Código Secreto', 'Você já desbloqueou esta conquista secreta.');
  } else {
    showAchievementNotification('', '🥷 Código Secreto', 'Erro ao desbloquear conquista. Tente novamente.');
  }
}

function dismissHint() {
  if (!hintEl) return;
  hintEl.classList.add('hidden');
  setTimeout(() => hintEl?.remove(), 900);
}
setTimeout(dismissHint, 7000);

// ─── COMANDO DE DEV: "0909" SOBE 10 NÍVEIS ──────────────────────────────────
const DEV_CODE = '0909';
let devCodeBuffer = '';
document.addEventListener('keydown', (e) => {
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  const char = e.key;
  if (/\d/.test(char)) {
    devCodeBuffer = (devCodeBuffer + char).slice(-DEV_CODE.length);
    if (devCodeBuffer === DEV_CODE) {
      devCodeBuffer = '';
      handleDevCheat();
    }
  } else {
    devCodeBuffer = '';
  }
});

async function handleDevCheat() {
  const levels = 10;
  if (!currentProfile) {
    showAchievementNotification('', '🧪 Modo Dev', 'Autentique-se (botão 🔑) para poder usar o comando de desenvolvedor!');
    return;
  }
  const result = await devLevelUp(levels);
  if (result.status === 'success') {
    sounds.playSFX('achievement');
    showAchievementNotification('', '🧪 Modo Dev', `Nível ${result.old_level} → ${result.new_level}! (+${result.xp_gained} XP)`);
    await updateAuthUI();
  } else {
    showAchievementNotification('', '🧪 Modo Dev', 'Erro ao usar comando de desenvolpedor. Tente novamente.');
  }
}
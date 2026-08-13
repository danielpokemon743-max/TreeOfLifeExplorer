// 🌟 fx.js - Animações, luzes dinâmicas e sons para a UI
import { sounds } from './SoundManager.js';

// ───────────────────────────────────────────────────────────────────────────
// ABRIR / FECHAR MODAIS (animação + som distinto)
// ───────────────────────────────────────────────────────────────────────────
const ANIM_IN = 'fxModalIn';
const ANIM_OUT = 'fxModalOut';

export function openModal(el, sound = 'open') {
  if (!el) return;
  if (!el.classList.contains('modal-overlay')) {
    el.classList.remove('hidden');
    if (sound) sounds.playSFX(sound);
    return;
  }
  el.classList.remove('hidden', 'fx-modal-leave', 'fx-modal-enter');
  void el.offsetWidth; // força reflow para reanimar
  el.classList.add('fx-modal-enter');
  el.addEventListener('animationend', function onIn(e) {
    if (e.animationName === ANIM_IN && e.target === el) {
      el.classList.remove('fx-modal-enter');
      el.removeEventListener('animationend', onIn);
    }
  });
  if (sound) sounds.playSFX(sound);
}

export function closeModal(el, sound = 'close') {
  if (!el || el.classList.contains('hidden')) return;
  if (sound) sounds.playSFX(sound);
  if (!el.classList.contains('modal-overlay')) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('fx-modal-enter');
  el.classList.add('fx-modal-leave');
  el.addEventListener('animationend', function onOut(e) {
    if (e.animationName === ANIM_OUT && e.target === el) {
      el.classList.remove('fx-modal-leave');
      el.classList.add('hidden');
      el.removeEventListener('animationend', onOut);
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// LUZ GLOBAL QUE SEGUE O PONTEIRO (mouse / dedo no mobile)
// ───────────────────────────────────────────────────────────────────────────
let _cursorGlow = null;
let _cursorRAF = null;
let _glowTX = 0, _glowTY = 0, _glowCX = 0, _glowCY = 0;

function initCursorGlow() {
  if (_cursorGlow) return;
  _cursorGlow = document.createElement('div');
  _cursorGlow.id = 'cursor-glow';
  document.body.appendChild(_cursorGlow);

  _glowTX = _glowCX = window.innerWidth / 2;
  _glowTY = _glowCY = window.innerHeight / 2;

  const tick = () => {
    _glowCX += (_glowTX - _glowCX) * 0.2;
    _glowCY += (_glowTY - _glowCY) * 0.2;
    _cursorGlow.style.setProperty('--gx', _glowCX.toFixed(1) + 'px');
    _cursorGlow.style.setProperty('--gy', _glowCY.toFixed(1) + 'px');
    if (Math.abs(_glowTX - _glowCX) > 0.4 || Math.abs(_glowTY - _glowCY) > 0.4) {
      _cursorRAF = requestAnimationFrame(tick);
    } else {
      _cursorRAF = null;
    }
  };
  const move = (x, y) => {
    _glowTX = x; _glowTY = y;
    _cursorGlow.classList.remove('idle');
    if (!_cursorRAF) _cursorRAF = requestAnimationFrame(tick);
  };

  window.addEventListener('mousemove', e => move(e.clientX, e.clientY), { passive: true });
  window.addEventListener('mouseleave', () => _cursorGlow.classList.add('idle'));
  window.addEventListener('touchmove', e => { if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('touchstart', e => { if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('touchend', () => _cursorGlow.classList.add('idle'));
}

// ───────────────────────────────────────────────────────────────────────────
// LUZ DINÂMICA POR ELEMENTO (botões, barra de busca, etc.)
// Segue o ponteiro DENTRO do próprio elemento via --lx / --ly
// ───────────────────────────────────────────────────────────────────────────
export function applyLighting(el) {
  if (!el || el.dataset.litReady) return;
  el.dataset.litReady = '1';
  el.classList.add('fx-lit');

  const setPos = (clientX, clientY) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lx', (clientX - r.left) + 'px');
    el.style.setProperty('--ly', (clientY - r.top) + 'px');
  };

  el.addEventListener('mousemove', e => setPos(e.clientX, e.clientY), { passive: true });
  el.addEventListener('mouseenter', () => el.classList.add('fx-lit-on'));
  el.addEventListener('mouseleave', () => el.classList.remove('fx-lit-on'));

  el.addEventListener('touchstart', e => { if (e.touches[0]) { setPos(e.touches[0].clientX, e.touches[0].clientY); el.classList.add('fx-lit-on'); } }, { passive: true });
  el.addEventListener('touchmove', e => { if (e.touches[0]) setPos(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  el.addEventListener('touchend', () => el.classList.remove('fx-lit-on'));
}

function initElementLighting() {
  document.querySelectorAll(
    '.ctrl-btn, #search-input, .action-btn, .ranking-sort-btn, .ranking-tab, ' +
    '.modal-content .close-btn, .btn-toggle-light, .light-toggle-btn, .collapse-btn, ' +
    '#auth-modal input, #auth-modal select, #admin-ban-ip, #admin-ban-ip-reason, ' +
    '.chat-tab, .chat-send, #chat-input'
  ).forEach(applyLighting);
}

// ───────────────────────────────────────────────────────────────────────────
// FEIXE DE LUZ AO DIGITAR NA BARRA DE BUSCA
// ───────────────────────────────────────────────────────────────────────────
function initTypeFX() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const spark = () => {
    input.classList.remove('fx-typing');
    void input.offsetWidth;
    input.classList.add('fx-typing');
  };
  input.addEventListener('keydown', () => {
    spark();
    sounds.playSFX('type');
  });
}

// ───────────────────────────────────────────────────────────────────────────
// SOM DE "PASSAR O MOUSE" NOS BOTÕES DE CONTROLE
// ───────────────────────────────────────────────────────────────────────────
function initHoverSound() {
  document.querySelectorAll('.ctrl-btn, .action-btn, .ranking-sort-btn, .ranking-tab, .btn-toggle-light, .chat-tab, .chat-send')
    .forEach(el => {
      el.addEventListener('mouseenter', () => sounds.playSFX('hover'));
    });
}

// ───────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO GERAL
// ───────────────────────────────────────────────────────────────────────────
export function initFX() {
  initCursorGlow();
  initElementLighting();
  initTypeFX();
  initHoverSound();
}

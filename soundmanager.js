// 🎛️ SoundManager.js - Sintetizador + Player de Música de Fundo
class SoundManager {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.3;     // Volume dos efeitos (0.0 a 1.0)
    this.musicVolume = 0.2;   // Volume da música (0.0 a 1.0)
    this.isMuted = false;

    // Player de Música
    this.bgMusic = new Audio();
    this.bgMusic.loop = true;
    this.bgMusic.volume = this.musicVolume;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 🔊 Efeitos Sonoros (Sintetizados)
  playSFX(type) {
    if (this.isMuted) return;
    this._initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    switch (type) {
      case 'click':
        this._playTone(800, 0.04, 'sine', 0.08, now);
        break;

      case 'expand':
        this._playSweep(250, 650, 0.12, 'triangle', 0.12, now);
        break;

      case 'search':
        this._playTone(523.25, 0.15, 'sine', 0.08, now);
        this._playTone(659.25, 0.18, 'sine', 0.08, now + 0.05);
        this._playTone(783.99, 0.22, 'sine', 0.1,  now + 0.10);
        break;

      case 'error':
        this._playTone(200, 0.1, 'sawtooth', 0.08, now);
        this._playTone(140, 0.15, 'sawtooth', 0.08, now + 0.07);
        break;
    }
  }

  _playTone(freq, duration, type = 'sine', volume = 0.1, startTime = this.ctx.currentTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(volume * this.sfxVolume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  _playSweep(startFreq, endFreq, duration, type = 'sine', volume = 0.1, startTime = this.ctx.currentTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

    gain.gain.setValueAtTime(volume * this.sfxVolume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // 🎶 MÚSICA DE FUNDO (A FUNÇÃO QUE ESTAVA FALTANDO!)
  playMusic(url, loop = true) {
    this._initContext();

    if (url && !this.bgMusic.src.includes(encodeURI(url))) {
      this.bgMusic.src = url;
    }

    this.bgMusic.loop = loop;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;

    this.bgMusic.play().catch(err => {
      console.warn('🎵 Aguardando interação do usuário para tocar a música.');
    });
  }

  pauseMusic() {
    this.bgMusic.pause();
  }

  stopMusic() {
    this.bgMusic.pause();
    this.bgMusic.currentTime = 0;
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (!this.isMuted) {
      this.bgMusic.volume = this.musicVolume;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    return this.isMuted;
  }
}

export const sounds = new SoundManager();
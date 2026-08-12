class SoundManager {
  constructor() {
    this.ctx = null;
    this.sfxVolume = parseFloat(localStorage.getItem('sfxVolume') || '0.8');
    this.musicVolume = parseFloat(localStorage.getItem('musicVolume') || '0.1');
    this.isMuted = false;

    this.bgMusic = new Audio();
    this.bgMusic.loop = false;
    this.bgMusic.volume = this.musicVolume;

    this.playlist = [];
    this.currentTrackIndex = 0;

    this.bgMusic.addEventListener('ended', () => {
      this.playNextTrack();
    });
  }

  // Tocar uma música específica escolhida no <select>
  playTrack(url) {
    this.bgMusic.pause();
    this.bgMusic.src = url;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    
    // Atualiza o índice atual com base na escolha
    const index = this.playlist.indexOf(url);
    if (index !== -1) {
      this.currentTrackIndex = index;
    }
    
    this.bgMusic.play().catch(e => console.log("Autoplay bloqueado pelo navegador:", e));
  }

  // Pular para a próxima música da lista
  nextTrack() {
    if (this.playlist.length === 0) return;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
    const nextUrl = this.playlist[this.currentTrackIndex];
    this.playTrack(nextUrl);
    
    // Atualiza o elemento <select> na tela, se existir
    const selectMusic = document.getElementById('select-music');
    if (selectMusic) {
      selectMusic.value = nextUrl;
    }
  }


  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playSFX(type) {
    if (this.isMuted) return;
    this._initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    switch (type) {
      case 'click':
        this._playTone(800, 0.04, 'sine', 0.08, now);
        break;
      case 'hover':
        this._playTone(600, 0.03, 'sine', 0.05, now);
        break;
      case 'type':
        this._playTone(900, 0.025, 'sine', 0.04, now);
        break;
      case 'open':
        this._playTone(392.00, 0.10, 'sine', 0.07, now);
        this._playTone(523.25, 0.15, 'sine', 0.07, now + 0.05);
        break;
      case 'close':
        this._playTone(523.25, 0.10, 'sine', 0.07, now);
        this._playTone(392.00, 0.16, 'sine', 0.07, now + 0.06);
        break;
      case 'podium':
        this._playTone(523.25, 0.10, 'sine', 0.08, now);
        this._playTone(659.25, 0.12, 'sine', 0.08, now + 0.10);
        this._playTone(783.99, 0.15, 'sine', 0.08, now + 0.20);
        this._playTone(1046.50, 0.25, 'sine', 0.10, now + 0.30);
        break;
      case 'expand':
        this._playSweep(250, 650, 0.12, 'triangle', 0.12, now);
        break;
      case 'search':
        this._playTone(523.25, 0.15, 'sine', 0.08, now);
        this._playTone(659.25, 0.18, 'sine', 0.08, now + 0.05);
        this._playTone(783.99, 0.22, 'sine', 0.1, now + 0.10);
        break;
      case 'error':
        this._playTone(200, 0.1, 'sawtooth', 0.08, now);
        this._playTone(140, 0.15, 'sawtooth', 0.08, now + 0.07);
        break;
      case 'denied':
        this._playTone(180, 0.08, 'square', 0.06, now);
        this._playTone(120, 0.14, 'square', 0.06, now + 0.09);
        break;
      case 'success':
        this._playTone(523.25, 0.1, 'sine', 0.06, now);
        this._playTone(659.25, 0.12, 'sine', 0.06, now + 0.06);
        this._playTone(783.99, 0.15, 'sine', 0.08, now + 0.12);
        break;
      case 'achievement':
        this._playTone(523.25, 0.15, 'sine', 0.08, now);
        this._playTone(659.25, 0.18, 'sine', 0.08, now + 0.10);
        this._playTone(783.99, 0.22, 'sine', 0.10, now + 0.20);
        this._playTone(1046.50, 0.30, 'sine', 0.12, now + 0.30);
        break;
    }
  }

  _playTone(freq, duration, type = 'sine', volume = 0.1, startTime) {
    const t = startTime !== undefined ? startTime : this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  _playSweep(startFreq, endFreq, duration, type = 'sine', volume = 0.1, startTime) {
    const t = startTime !== undefined ? startTime : this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(volume * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  playPlaylist(urls) {
    this._initContext();
    this.playlist = urls.filter(Boolean);
    this.currentTrackIndex = 0;
    if (this.playlist.length > 0) {
      this._playCurrentTrack();
    }
  }

  _playCurrentTrack() {
    if (this.playlist.length === 0) return;
    const url = this.playlist[this.currentTrackIndex];
    this.bgMusic.src = url;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    this.bgMusic.play().catch(() => {});
  }

  playNextTrack() {
    if (this.playlist.length === 0) return;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
    this._playCurrentTrack();
  }

  pauseMusic() {
    this.bgMusic.pause();
  }

  resumeMusic() {
    if (this.playlist.length > 0) this.bgMusic.play().catch(() => {});
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, parseFloat(volume)));
    if (!this.isMuted) this.bgMusic.volume = this.musicVolume;
    localStorage.setItem('musicVolume', String(this.musicVolume));
  }

  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, parseFloat(volume)));
    localStorage.setItem('sfxVolume', String(this.sfxVolume));
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    return this.isMuted;
  }
}

export const sounds = new SoundManager();

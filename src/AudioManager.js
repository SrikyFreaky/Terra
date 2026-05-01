/**
 * Procedural Audio System using Web Audio API
 * Synthesizes sounds in real-time without external assets.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isStarted = false;

    // Background drones
    this.droneOsc = null;
    this.bossOsc = null;

    // External Audio Tracks
    this.ambientMusic = null;
    this.gameOverMusic = null;
  }

  init() {
    if (this.isStarted) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.4;
    this.isStarted = true;

    this.#startAtmosphere();
    this.#loadExternalMusic();
  }

  #loadExternalMusic() {
    this.ambientMusic = new Audio('/Music/dragon-studio-deep-sea-underwater-ambience-482888.mp3');
    this.ambientMusic.loop = true;
    this.ambientMusic.volume = 0.4;

    this.gameOverMusic = new Audio('/Music/alphix-game-over-417465.mp3');
    this.gameOverMusic.volume = 0.7;

    this.winSound = new Audio('/Music/puyopuyomegafan1234-winner-game-sound-404167.mp3');
    this.winSound.volume = 0.6;
    
    // Pre-load the fire sound to prevent lag
    this.fireSound = new Audio('/Music/Laser-single-shot.mp3');
    this.fireSound.volume = 0.35;
  }

  startAmbience() {
    if (!this.isStarted) return;
    this.ambientMusic.play().catch(e => console.warn("Ambient music blocked:", e));
  }

  stopAmbience() {
    if (this.ambientMusic) this.ambientMusic.pause();
  }

  playGameOver() {
    if (!this.isStarted) return;
    this.stopAmbience();
    this.stopBossMusic();
    this.gameOverMusic.play().catch(e => console.warn("Game over music blocked:", e));
  }

  // ── Ambience ──────────────────────────────────────────────────
  #startAtmosphere() {
    // Keep low procedural rumble as layer 2
    this.droneOsc = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 45;
    this.droneGain.gain.value = 0.03;
    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    this.droneOsc.start();
  }

  setLayerDepth(layer) {
    if (!this.isStarted) return;
    const freq = 45 - (layer * 8);
    this.droneOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 2);
  }

  // ── UI Sounds ─────────────────────────────────────────────────
  playClick() {
    if (!this.isStarted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.1, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // ── Boss Sounds ───────────────────────────────────────────────
  playBossEntry() {
    if (!this.isStarted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(50, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(150, this.ctx.currentTime + 2);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.5);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 2.5);
  }

  startBossMusic() {
    if (!this.isStarted || this.bossOsc) return;
    this.bossOsc = this.ctx.createOscillator();
    this.bossGain = this.ctx.createGain();
    this.bossOsc.type = 'triangle';
    this.bossOsc.frequency.value = 40;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 2.5; 
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(this.bossOsc.frequency);
    this.bossGain.gain.value = 0.08;
    this.bossOsc.connect(this.bossGain);
    this.bossGain.connect(this.masterGain);
    lfo.start();
    this.bossOsc.start();
  }

  stopBossMusic() {
    if (!this.bossOsc) return;
    this.bossGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
    setTimeout(() => {
      if (this.bossOsc) this.bossOsc.stop();
      this.bossOsc = null;
    }, 1000);
  }

  // ── Gameplay SFX ──────────────────────────────────────────────
  playFire() {
    if (!this.isStarted || !this.fireSound) return;
    // Rapid fire: clone the node so multiple shots can overlap
    const shot = this.fireSound.cloneNode();
    shot.volume = this.fireSound.volume;
    shot.play().catch(() => {
      // Procedural fallback if needed
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.05, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(); osc.stop(this.ctx.currentTime + 0.1);
    });
  }

  playWin() {
    if (!this.isStarted || !this.winSound) return;
    this.stopAmbience();
    this.winSound.play().catch(e => console.warn("Win sound blocked:", e));
  }

  playRestoration() {
    if (!this.isStarted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + Math.random() * 200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.3);
    g.gain.setValueAtTime(0.05, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playImpact() {
    if (!this.isStarted) return;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start();
  }

  playPlayerHurt() {
    if (!this.isStarted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.2, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}

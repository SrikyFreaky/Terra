// ── Upgrade Shop ─────────────────────────────────────────────────────
// Press U to open. Spend Restoration Points (RP) earned from cleaning.

const UPGRADES = [
  {
    id: 'radius_boost',
    name: 'Wider Reach',
    icon: '⟳',
    desc: 'Increases cleaning radius by 25% per level.',
    baseCost: 30,
    maxLevel: 4,
    effect: 'radius',
  },
  {
    id: 'speed_boost',
    name: 'Swift Currents',
    icon: '⚡',
    desc: 'Increases movement speed by 20% per level.',
    baseCost: 25,
    maxLevel: 4,
    effect: 'speed',
  },
  {
    id: 'auto_pulse',
    name: 'Bio-Pulse',
    icon: '✦',
    desc: 'Auto-cleans the closest dirty tile every 3s.',
    baseCost: 60,
    maxLevel: 3,
    effect: 'auto',
  },
  {
    id: 'drop_rate',
    name: 'Rich Sediment',
    icon: '◈',
    desc: 'Boosts material drop chance by 30% per level.',
    baseCost: 35,
    maxLevel: 3,
    effect: 'drop',
  },
];

export class UpgradeShop {
  constructor() {
    this.rp = 0;
    this.isOpen = false;
    this.levels = {};
    for (const u of UPGRADES) this.levels[u.id] = 0;
    this.selectedIndex = 0;

    this.#buildDOM();
  }

  // ── Computed upgrade values ─────────────────────────────────────
  get radiusMultiplier() {
    return 1 + this.levels.radius_boost * 0.25;
  }

  get speedMultiplier() {
    return 1 + this.levels.speed_boost * 0.20;
  }

  get autoPulseLevel() {
    return this.levels.auto_pulse;
  }

  get dropMultiplier() {
    return 1 + this.levels.drop_rate * 0.30;
  }

  // ── RP earning ──────────────────────────────────────────────────
  addRP(amount) {
    this.rp += amount;
    this.#updateRPDisplay();
  }

  // ── DOM ─────────────────────────────────────────────────────────
  #buildDOM() {
    // RP display (always visible, top-right)
    this.rpDisplay = document.createElement('div');
    this.rpDisplay.style.cssText = `
      position:fixed;top:0;right:0;z-index:10;padding:12px 18px;
      font-family:'Chakra Petch',sans-serif;font-size:12px;font-weight:700;
      color:#3abaaa;letter-spacing:1px;pointer-events:none;
      background:rgba(6,14,20,.85);border:1px solid rgba(42,138,122,.18);
      border-top:none;border-right:none;border-radius:0 0 0 10px;
      backdrop-filter:blur(10px);
    `;
    this.rpDisplay.innerHTML = `<span style="opacity:.6;font-weight:400;">RP</span> <span id="rp-value">0</span>
      <span style="font-size:9px;opacity:.45;margin-left:8px;font-family:IBM Plex Mono,monospace;">[U] Shop</span>`;
    document.body.appendChild(this.rpDisplay);

    // Shop panel
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position:fixed;top:50%;right:24px;transform:translateY(-50%);
      z-index:20;width:320px;padding:20px 22px;
      background:rgba(6,14,20,.94);border:1px solid rgba(42,138,122,.2);
      border-radius:12px;font-family:'IBM Plex Mono',monospace;
      backdrop-filter:blur(14px);display:none;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    header.innerHTML = `
      <div style="font-family:'Chakra Petch',sans-serif;font-size:16px;font-weight:700;color:#3abaaa;letter-spacing:2px;">UPGRADES</div>
      <div style="font-size:10px;color:#3a5a6a;">U to close</div>
    `;
    this.panel.appendChild(header);

    this.upgradeButtons = new Map();
    for (const upg of UPGRADES) {
      const btn = document.createElement('div');
      btn.className = 'upgrade-btn';
      btn.style.cssText = `
        padding:12px 14px;margin-bottom:9px;border-radius:8px;cursor:pointer;
        border:1px solid rgba(42,138,122,.18);background:rgba(42,138,122,.05);
        transition:border-color .15s,background .15s;
      `;
      btn.addEventListener('click', () => this.#purchase(upg.id));
      btn.addEventListener('mouseenter', () => btn.style.borderColor = 'rgba(58,186,170,.4)');
      btn.addEventListener('mouseleave', () => btn.style.borderColor = 'rgba(42,138,122,.18)');
      this.panel.appendChild(btn);
      this.upgradeButtons.set(upg.id, btn);
    }

    document.body.appendChild(this.panel);
    this.#renderButtons();
  }

  #updateRPDisplay() {
    const el = document.getElementById('rp-value');
    if (el) el.textContent = this.rp;
  }

  #cost(upg) {
    return Math.round(upg.baseCost * Math.pow(1.6, this.levels[upg.id]));
  }

  #purchase(id) {
    const upg = UPGRADES.find((u) => u.id === id);
    if (!upg) return;
    const lvl = this.levels[id];
    if (lvl >= upg.maxLevel) return;
    const cost = this.#cost(upg);
    if (this.rp < cost) return;
    this.rp -= cost;
    this.levels[id] += 1;
    this.#updateRPDisplay();
    this.#renderButtons();
  }

  #renderButtons() {
    for (const upg of UPGRADES) {
      const btn = this.upgradeButtons.get(upg.id);
      const lvl = this.levels[upg.id];
      const maxed = lvl >= upg.maxLevel;
      const cost = maxed ? '—' : this.#cost(upg);
      const canBuy = !maxed && this.rp >= this.#cost(upg);
      const stars = '★'.repeat(lvl) + '☆'.repeat(upg.maxLevel - lvl);
      btn.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-family:'Chakra Petch',sans-serif;font-size:12px;font-weight:700;color:${maxed ? '#3abaaa' : '#c0dae8'};">
            ${upg.icon} ${upg.name}
          </span>
          <span style="font-size:10px;color:${canBuy ? '#3abaaa' : maxed ? '#3abaaa' : '#c44a4a'};font-weight:700;">
            ${maxed ? 'MAX' : `${cost} RP`}
          </span>
        </div>
        <div style="font-size:9px;color:#3a5a6a;margin:3px 0;">${upg.desc}</div>
        <div style="font-size:11px;color:#7a9aaa;letter-spacing:2px;">${stars}</div>
      `;
      btn.style.opacity = canBuy || maxed ? '1' : '0.55';
    }
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) this.#renderButtons();
  }

  close() {
    this.isOpen = false;
    this.panel.style.display = 'none';
  }
}

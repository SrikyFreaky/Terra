export class HUD {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hud';

    // Progress bar
    const pbWrap = document.createElement('div');
    pbWrap.style.cssText = 'margin-bottom:8px;';
    this.progressLabel = this._el('div', 'hud-label', 'PURIFICATION');
    this.progressBarOuter = document.createElement('div');
    this.progressBarOuter.className = 'hud-bar-outer';
    this.progressBarFill = document.createElement('div');
    this.progressBarFill.className = 'hud-bar-fill';
    this.progressBarFill.style.width = '0%';
    this.progressBarOuter.appendChild(this.progressBarFill);
    pbWrap.append(this.progressLabel, this.progressBarOuter);

    this.layerElement     = this._el('div', 'hud-layer');
    this.cleanedElement   = this._el('div', 'hud-stat');
    this.timerElement     = this._el('div', 'hud-stat');
    this.ammoElement      = this._el('div', 'hud-stat', 'Ammo: 40 / 40');
    this.activeToolElement= this._el('div', 'hud-stat');
    this.warningElement   = this._el('div', 'hud-warning');
    this.warningElement.style.display = 'none';

    const invTitle = this._el('div', 'hud-section-title', 'Inventory');

    // Dynamic inventory rows — updated by updateInventory()
    this.invRows = document.createElement('div');

    this.element.append(
      this.layerElement,
      pbWrap,
      this.cleanedElement,
      this.timerElement,
      this.ammoElement,
      this.activeToolElement,
      this.warningElement,
      invTitle,
      this.invRows,
    );
    document.body.appendChild(this.element);

    // Key hints bar
    this.hintsEl = document.createElement('div');
    this.hintsEl.className = 'hud-hints';
    this.hintsEl.innerHTML =
      `<span class="kh">WASD</span> Move &nbsp;`+
      `<span class="kh">SPACE</span> Fire &nbsp;`+
      `<span class="kh">C</span> Armory &nbsp;`+
      `<span class="kh">1-4</span> Emotes`;
    document.body.appendChild(this.hintsEl);

    // Visor Overlay
    this.scanlines = document.createElement('div');
    this.scanlines.className = 'scanlines';
    document.body.appendChild(this.scanlines);

    this.update(0);
    this.updateLayerName('The Deep');
    this.updateActiveTool('standard_blaster');
    this.updateBossWarning('');
    this.updateInventory({});

    // 🏆 Vibe Jam Portal Button
    this.portalBtn = document.createElement('a');
    this.portalBtn.className = 'jam-portal-btn';
    this.portalBtn.href = 'https://vibej.am/2026/next';
    this.portalBtn.target = '_blank';
    this.portalBtn.innerHTML = '<span>DISCOVER MORE GAMES ➔</span>';
    document.body.appendChild(this.portalBtn);
  }

  _el(tag, cls, text = '') {
    const el = document.createElement(tag);
    el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  update(cleanedPercent, elapsedSeconds = 0) {
    const pct = Math.min(100, cleanedPercent);
    this.progressBarFill.style.width = `${pct}%`;
    this.cleanedElement.textContent  = `Purification: ${pct.toFixed(1)}%`;
    if (elapsedSeconds > 0) {
      this.timerElement.textContent = `Timer: ${this.#formatTime(elapsedSeconds)}`;
    }
  }

  updatePurification(pct) {
    this.update(pct);
  }

  updateAmmo(current, max) {
    this.ammoElement.textContent = `Ammo: ${current} / ${max}`;
    this.ammoElement.classList.toggle('ammo-low', current === 0);
  }

  updateLayerName(name) {
    this.layerElement.textContent = name;
  }

  updateInventory(items) {
    // Only show non-zero items + a short form
    const LABELS = {
      stone:'Stone', driftwood:'Driftwood', seaweed:'Seaweed', iron_ore:'Iron Ore',
      shell:'Shell', coral_fragment:'Coral', kelp:'Kelp', sand_dollar:'Sand $',
      bark:'Bark', petal:'Petal', compost:'Compost',
    };
    this.invRows.innerHTML = '';
    for (const [key, label] of Object.entries(LABELS)) {
      const val = items[key] ?? 0;
      if (val === 0) continue;
      const row = document.createElement('div');
      row.className = 'hud-stat hud-inv';
      row.textContent = `${label}: ${val}`;
      this.invRows.appendChild(row);
    }
    if (!this.invRows.children.length) {
      const empty = document.createElement('div');
      empty.className = 'hud-stat hud-inv';
      empty.textContent = 'Nothing yet…';
      this.invRows.appendChild(empty);
    }
  }

  updateActiveTool(id) {
    const LABELS = {
      standard_blaster: 'Standard Blaster',
      ion_rifle: 'Ion Rifle',
      plasma_cannon: 'Plasma Cannon'
    };
    this.activeToolElement.textContent = `Weapon: ${LABELS[id] ?? 'Blaster'}`;
  }

  showWarning(message, duration = 3000) {
    this.warningElement.textContent = message;
    this.warningElement.style.display = 'block';
    
    if (this.warningTimeout) clearTimeout(this.warningTimeout);
    
    this.warningTimeout = setTimeout(() => {
      this.warningElement.style.display = 'none';
      this.warningTimeout = null;
    }, duration);
  }

  updateBossWarning(message, tone = 'warning') {
    if (this.warningTimeout) clearTimeout(this.warningTimeout);
    this.warningElement.textContent = message;
    this.warningElement.classList.toggle('success', tone === 'success');
    this.warningElement.style.display = message ? 'block' : 'none';
  }

  #formatTime(s) {
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }
}

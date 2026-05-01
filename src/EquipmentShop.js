const SKINS = [
  { id: 'default', name: 'Classic Diver', cost: 0, color: 0x3a7a8a, desc: 'Balanced restoration suit' },
  { id: 'biolume', name: 'Biolume Suit', cost: 100, color: 0x3abaaa, desc: 'Teal glow' },
  { id: 'mecha', name: 'Mecha Suit', cost: 250, color: 0xc44a4a, desc: 'Heavy armor' },
  { id: 'ghost', name: 'Ghost Diver', cost: 500, color: 0x88ddee, desc: 'Translucent' }
];

const WEAPONS = [
  { id: 'none', name: 'Bare Hands', cost: 0, color: 0xc8a030, desc: 'No gear bonus' },
  { id: 'ion_saber', name: 'Ion Wand', cost: 150, color: 0x72fff0, desc: 'A compact purifier. Cleaning radius +5%' },
  { id: 'bubble_gun', name: 'Bubble Sprayer', cost: 300, color: 0x9defff, desc: 'Aerates pollution. Cleaning radius +8%' },
  { id: 'vortex', name: 'Vortex Purifier', cost: 600, color: 0xb08cff, desc: 'Pulls grime loose. Cleaning radius +12%' }
];

export class EquipmentShop {
  constructor(inventory, player) {
    this.inventory = inventory;
    this.player = player;
    this.isOpen = false;
    this.selectedIndex = 0;
    this.activeTab = 'skins'; // 'skins' or 'weapons'
    this.ownedSkins = new Set(['default']);
    this.ownedWeapons = new Set(['none']);

    this.#buildDOM();
  }

  #buildDOM() {
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%, -50%);
      width:400px; padding:25px; background:rgba(6,14,20,0.95);
      border:1px solid #3abaaa; border-radius:12px; z-index:100;
      font-family:'Chakra Petch', sans-serif; color:#c0dae8; display:none;
      backdrop-filter: blur(15px);
    `;
    
    this.panel.innerHTML = `
      <h2 style="color:#3abaaa; margin-top:0;">EQUIPMENT DEPOT</h2>
      <div id="shop-tabs" style="display:flex; gap:10px; margin-bottom:15px;">
        <button id="tab-skins" style="flex:1; background:#1a3a3a; color:white; border:none; padding:8px; cursor:pointer;">COSTUMES</button>
        <button id="tab-weapons" style="flex:1; background:#0a1a1a; color:white; border:none; padding:8px; cursor:pointer;">GEAR</button>
      </div>
      <div id="shop-items" style="display:flex; flex-direction:column; gap:10px;"></div>
      <div style="margin-top:20px; font-size:12px; text-align:center; opacity:0.6;">[G] CLOSE SHOP</div>
    `;

    document.body.appendChild(this.panel);

    this.panel.querySelector('#tab-skins').onclick = () => { this.activeTab = 'skins'; this.render(); };
    this.panel.querySelector('#tab-weapons').onclick = () => { this.activeTab = 'weapons'; this.render(); };
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) this.render();
  }

  render() {
    const itemsDiv = this.panel.querySelector('#shop-items');
    itemsDiv.innerHTML = '';
    const list = this.activeTab === 'skins' ? SKINS : WEAPONS;
    const owned = this.activeTab === 'skins' ? this.ownedSkins : this.ownedWeapons;
    const activeId = this.activeTab === 'skins' ? this.player.activeSkin : this.player.activeWeapon;
    this.panel.querySelector('#tab-skins').style.background = this.activeTab === 'skins' ? '#1a3a3a' : '#0a1a1a';
    this.panel.querySelector('#tab-weapons').style.background = this.activeTab === 'weapons' ? '#1a3a3a' : '#0a1a1a';

    list.forEach(item => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        background:rgba(58,186,170,0.1); border:1px solid #3abaaa; color:white;
        padding:12px; text-align:left; display:flex; justify-content:space-between;
        cursor:pointer; transition: 0.2s; border-radius:8px; gap:12px;
      `;
      btn.onmouseover = () => btn.style.background = 'rgba(58,186,170,0.2)';
      btn.onmouseout = () => btn.style.background = 'rgba(58,186,170,0.1)';
      
      const isOwned = owned.has(item.id);
      const isEquipped = activeId === item.id;
      const status = isEquipped ? 'EQUIPPED' : isOwned ? 'EQUIP' : `${item.cost} GOLD`;
      
      btn.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="
            width:18px; height:18px; border-radius:50%; flex:0 0 auto;
            background:#${item.color.toString(16).padStart(6, '0')};
            box-shadow:0 0 12px #${item.color.toString(16).padStart(6, '0')};
          "></span>
          <div>
          <div style="font-weight:700; color:${isEquipped ? '#7dffe9' : '#ffffff'};">${item.name}</div>
          <div style="font-size:10px; opacity:0.6;">${item.desc}</div>
          </div>
        </div>
        <div style="color:${isEquipped ? '#7dffe9' : '#ffd700'}; white-space:nowrap;">${status}</div>
      `;

      btn.onclick = () => this.buy(item);
      itemsDiv.appendChild(btn);
    });
  }

  buy(item) {
    const owned = this.activeTab === 'skins' ? this.ownedSkins : this.ownedWeapons;
    const activeId = this.activeTab === 'skins' ? this.player.activeSkin : this.player.activeWeapon;
    if (activeId === item.id) return;

    if (owned.has(item.id) || this.inventory.items.gold >= item.cost) {
      if (!owned.has(item.id)) {
        this.inventory.items.gold -= item.cost;
        owned.add(item.id);
      }
      if (this.activeTab === 'skins') {
        this.player.applySkin(item);
      } else {
        this.player.equipWeapon(item);
      }
      this.render();
    } else {
      alert("NOT ENOUGH GOLD!");
    }
  }
}

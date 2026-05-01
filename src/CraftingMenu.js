// ── Weapon Systems — Unlocked per progress ─────────────────────────────
const ALL_RECIPES = [
  {
    id: 'standard_blaster', name: 'Standard Blaster', layer: 1,
    desc: 'Default issue. Reliable but low damage.',
    cost: { stone: 0 },
    unlockPct: 0,
  },
  {
    id: 'ion_rifle', name: 'Ion Rifle', layer: 1,
    desc: 'High velocity. Increased damage and fire rate.',
    cost: { stone: 5, seaweed: 3 },
    unlockPct: 25,
  },
  {
    id: 'plasma_cannon', name: 'Plasma Cannon', layer: 1,
    desc: 'Massive firepower. Devastating damage and fast firing.',
    cost: { stone: 10, coral_fragment: 5, iron_ore: 2 },
    unlockPct: 60,
  },
];

const MATERIAL_LABELS = {
  stone: 'Stone', driftwood: 'Driftwood', seaweed: 'Seaweed', iron_ore: 'Iron Ore',
  shell: 'Shell', coral_fragment: 'Coral', kelp: 'Kelp', sand_dollar: 'Sand $',
  bark: 'Bark', petal: 'Petal', compost: 'Compost',
};

export class CraftingMenu {
  constructor(inventory, tools, onCraft) {
    this.inventory = inventory;
    this.tools = tools;
    this.onCraft = onCraft;
    this.isOpen = false;
    this.selectedIndex = 0;
    this.currentLayer = 1;
    this.cleanedPercent = 0;
    this.visibleRecipeIds = '';
    this.recipeElements = new Map();

    this.element = document.createElement('div');
    this.element.className = 'crafting-menu hidden';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    const title = document.createElement('h2');
    title.textContent = 'Weapon Systems';
    title.style.margin = '0';
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:9px;color:#3a5a6a;font-family:IBM Plex Mono,monospace;';
    hint.textContent = '↑↓ navigate · Enter equip · C close';
    header.append(title, hint);
    this.element.appendChild(header);

    this.recipesContainer = document.createElement('div');
    this.element.appendChild(this.recipesContainer);

    document.body.appendChild(this.element);
    this.setLayer(1);
  }

  setLayer(layer) {
    this.currentLayer = layer;
    this.#rebuildRecipes();
  }

  setProgress(cleanedPercent) {
    this.cleanedPercent = cleanedPercent;
    const nextIds = this.#visibleRecipes().map((recipe) => recipe.id).join('|');
    if (nextIds !== this.visibleRecipeIds) this.#rebuildRecipes();
    else if (this.isOpen) this.update();
  }

  #rebuildRecipes() {
    const recipes = this.#visibleRecipes();
    this.visibleRecipeIds = recipes.map((recipe) => recipe.id).join('|');

    // Rebuild recipe buttons
    this.recipesContainer.innerHTML = '';
    this.recipeElements.clear();

    for (const recipe of recipes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-button';
      button.addEventListener('mouseenter', () => {
        this.selectedIndex = recipes.indexOf(recipe);
        this.update();
      });
      button.addEventListener('click', () => {
        this.selectedIndex = recipes.indexOf(recipe);
        this.#craft(recipe);
      });
      this.recipeElements.set(recipe.id, button);
      this.recipesContainer.appendChild(button);
    }

    this.selectedIndex = 0;
    this.update();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.element.classList.toggle('hidden', !this.isOpen);
    this.update();
  }

  handleKey(key) {
    const recipes = this.#visibleRecipes();
    if (key === 'w' || key === 'arrowup')   { this.#moveSelection(-1, recipes.length); return true; }
    if (key === 's' || key === 'arrowdown') { this.#moveSelection(1, recipes.length);  return true; }
    if (key === 'enter' || key === ' ')     { this.#craft(recipes[this.selectedIndex]); return true; }
    return false;
  }

  update() {
    const recipes = this.#visibleRecipes();
    for (let i = 0; i < recipes.length; i++) {
      const recipe = recipes[i];
      const button = this.recipeElements.get(recipe.id);
      if (!button) continue;
      const crafted  = this.tools.has(recipe.id);
      const canCraft = this.inventory.has(recipe.cost) && !crafted;
      button.classList.toggle('unavailable', !canCraft && !crafted);
      button.classList.toggle('crafted', crafted);
      button.classList.toggle('selected', i === this.selectedIndex);
      button.innerHTML = `
        <strong>${recipe.name}</strong>
        <span style="font-size:10px;color:#3abaaa;opacity:.7;">${recipe.desc}</span>
        <span>${this.#formatCost(recipe.cost)}</span>
        <em>${crafted ? '✓ Equipped' : canCraft ? '⚡ Ready to equip' : '✗ Missing materials'}</em>
      `;
    }
  }

  #craft(recipe) {
    if (!recipe || this.tools.has(recipe.id) || !this.inventory.spend(recipe.cost)) return;
    this.tools.craft(recipe.id);
    this.onCraft(recipe.id);
    this.update();
  }

  #visibleRecipes() {
    return ALL_RECIPES.filter((r) => {
      if (r.layer < this.currentLayer) return true;
      if (r.layer > this.currentLayer) return false;
      return this.cleanedPercent >= (r.unlockPct ?? 0);
    });
  }

  #moveSelection(dir, len) {
    this.selectedIndex = ((this.selectedIndex + dir) + len) % len;
    this.update();
  }

  #formatCost(cost) {
    return Object.entries(cost)
      .map(([m, a]) => `${MATERIAL_LABELS[m] ?? m}: ${a}`)
      .join(' + ');
  }
}

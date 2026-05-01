// ── Materials available per layer ────────────────────────────────────
// L1 drops: stone, driftwood, seaweed, iron_ore, shell, coral_fragment
// L2 drops: stone, driftwood, shell, kelp, sand_dollar
// L3 drops: stone, bark, petal, compost, iron_ore

const DEFAULT_INVENTORY = {
  stone: 0, driftwood: 0, seaweed: 0, iron_ore: 0,
  shell: 0, coral_fragment: 0,
  kelp: 0, sand_dollar: 0,
  bark: 0, petal: 0, compost: 0,
  gold: 0,
};

// Drop table per layer
const LAYER_DROPS = {
  1: [
    { mat: 'stone',          weight: 20 },
    { mat: 'driftwood',      weight: 15 },
    { mat: 'seaweed',        weight: 18 },
    { mat: 'iron_ore',       weight: 5  },
    { mat: 'shell',          weight: 10 },
    { mat: 'coral_fragment', weight: 8  },
    { mat: null,             weight: 24 },
  ],
  2: [
    { mat: 'stone',       weight: 15 },
    { mat: 'driftwood',   weight: 10 },
    { mat: 'shell',       weight: 20 },
    { mat: 'kelp',        weight: 18 },
    { mat: 'sand_dollar', weight: 10 },
    { mat: 'iron_ore',    weight: 5  },
    { mat: null,          weight: 22 },
  ],
  3: [
    { mat: 'stone',    weight: 15 },
    { mat: 'bark',     weight: 20 },
    { mat: 'petal',    weight: 18 },
    { mat: 'compost',  weight: 15 },
    { mat: 'iron_ore', weight: 8  },
    { mat: null,       weight: 24 },
  ],
};

export function rollMaterialDrop(layer = 1) {
  const table = LAYER_DROPS[layer] ?? LAYER_DROPS[1];
  const total = table.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.mat;
  }
  return null;
}

export class Inventory {
  constructor() {
    this.items = { ...DEFAULT_INVENTORY };
  }

  add(material) {
    if (!material || !(material in this.items)) return;
    this.items[material] += 1;
  }

  has(cost) {
    return Object.entries(cost).every(([mat, amt]) => (this.items[mat] ?? 0) >= amt);
  }

  spend(cost) {
    if (!this.has(cost)) return false;
    for (const [mat, amt] of Object.entries(cost)) this.items[mat] -= amt;
    return true;
  }
}

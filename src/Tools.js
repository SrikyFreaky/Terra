export const TOOL_RADII = {
  bare_hands:        1.2,
  stone_scraper:     2.0,
  woven_basket:      2.6,
  coral_drill:       3.2,
  tide_net:          4.0,
  sand_filter:       3.0,
  seed_pouch:        2.8,
  compost_spreader:  4.2,
};

const DEFAULT_TOOLS = {
  bare_hands: true,
  stone_scraper: false,
  woven_basket: false,
  coral_drill: false,
  tide_net: false,
  sand_filter: false,
  seed_pouch: false,
  compost_spreader: false,
};

export class Tools {
  constructor() {
    this.items = { ...DEFAULT_TOOLS };
    this.activeTool = 'bare_hands';
  }

  has(toolId) {
    return Boolean(this.items[toolId]);
  }

  craft(toolId) {
    if (this.has(toolId)) return false;
    this.items[toolId] = true;
    return true;
  }

  setActiveTool(toolId) {
    if (!this.has(toolId)) { this.activeTool = 'bare_hands'; return; }
    this.activeTool = toolId;
  }

  getRadius(upgradeMultiplier = 1) {
    return (TOOL_RADII[this.activeTool] ?? 1.2) * upgradeMultiplier;
  }
}

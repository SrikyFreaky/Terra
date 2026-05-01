console.log('TERRA BOOTING...');
import * as THREE from 'three';
import './style.css';
import {
  BARE_HANDS_RADIUS,
  CAMERA_FOLLOW_SPEED,
  CAMERA_OFFSET,
  DREDGER_SPAWN_PERCENT,
  SLICK_SPAWN_PERCENT,
  SLICK_DEFEAT_RANGE,
  SMOG_GIANT_SPAWN_PERCENT,
  SMOG_GIANT_DEFEAT_RANGE,
  PLAYER_SPEED,
} from './config.js';
import { CompletionScreen }        from './CompletionScreen.js';
import { CraftingMenu }            from './CraftingMenu.js';
import { Dredger }                 from './Dredger.js';
import { EnvironmentAssets }       from './EnvironmentAssets.js';
import { Fish, Jellyfish, SeaTurtle, Butterfly, FishSchool } from './Fish.js';
import { HUD }                     from './HUD.js';
import { Inventory, rollMaterialDrop } from './Inventory.js';
import { LayerTransitionScreen }   from './LayerTransitionScreen.js';
import { Player }                  from './Player.js';
import { Slick }                   from './Slick.js';
import { TrashSlime }              from './Enemies.js';
import { SmogGiant }               from './SmogGiant.js';
import { GameOverScreen }           from './GameOverScreen.js';
import { TileGrid }                 from './TileGrid.js';

import { Tools }                   from './Tools.js';
import { UpgradeShop }             from './UpgradeShop.js';
import { FXSystem }                from './FXSystem.js';
import { EquipmentShop }           from './EquipmentShop.js';
import { AudioManager }            from './AudioManager.js';
import { spawnLayer1Artifacts, updateLayer1RestorationQueue } from './Layer1Artifacts.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const GlobalAssets = {
  player: null,
  trashSlime: null,
  weapon: null,
  seaweed: null,
  corals: null,
};

localStorage.removeItem('terra_inventory');
localStorage.removeItem('terra_tools');

const audio = new AudioManager();
window.audio = audio;
const overlay = document.createElement('div');
overlay.id = 'audio-start';
overlay.innerHTML = `
  <div class="content">
    <h1>TERRA</h1>
    <p>SAVE YOUR PLANET</p>
    <div class="menu-buttons">
      <button id="start-btn" class="main-menu-btn">NEW MISSION</button>
      <button id="settings-btn" class="main-menu-btn secondary">SYSTEM CONFIG</button>
    </div>
    <div class="controls-hint">
      WASD - Move | SPACE - Fire | C - Armory | 1-4 - Emotes
    </div>
  </div>`;
document.body.appendChild(overlay);

const startBtn = document.getElementById('start-btn');
startBtn.textContent = 'LOADING ASSETS...';
startBtn.disabled = true;

const loader = new GLTFLoader();
let loadedCount = 0;
const checkLoadComplete = () => {
  loadedCount++;
  if (loadedCount >= 5) {
    startBtn.textContent = 'ENGAGE SYSTEMS';
    startBtn.disabled = false;
  }
};

const safeLoad = (path, targetKey) => {
  loader.load(path, 
    (gltf) => { GlobalAssets[targetKey] = gltf; checkLoadComplete(); },
    undefined,
    (e) => { console.warn(`Failed to load ${path}, using fallback.`); checkLoadComplete(); }
  );
};

safeLoad('./glb/player.glb', 'player');
safeLoad('./glb/Adventurer.glb', 'playerL3');
safeLoad('./glb/trashslime.glb', 'trashSlime');
safeLoad('./glb/weapon.glb', 'weapon');
safeLoad('./glb/seaweed.glb', 'seaweed');
safeLoad('./glb/rocks.glb', 'corals'); // Use rocks as fallback for missing corals


startBtn.onclick = () => {
  player.initModel(GlobalAssets.player, GlobalAssets.weapon, GlobalAssets.playerL3);
  environmentAssets.initRestorable(GlobalAssets.seaweed, GlobalAssets.corals);
  audio.init();
  audio.startAmbience();
  overlay.style.display = 'none';
  gameStarted = true;
};

const settingsBtn = document.getElementById('settings-btn');
settingsBtn.onclick = () => {
  alert('Settings: Audio 100% | Sensitivity 1.0 | Subtitles ON');
};

const LAYERS = {
  1: {
    name:'The Deep', dirtyColor:0x0f2a2f, cleanColor:0x0a6b6c,
    fishColor:0x3a9fb0, fogColor:0x041c2d, fogDensity:0.024,
    ambColor:0x1b6f8a, ambInt:1.0, dirColor:0x8deaff, dirInt:1.0, bgColor:0x06283a,
  },
  2: {
    name:'The Shallows', dirtyColor:0x2a3e4a, cleanColor:0x40e0d0,
    fishColor:0x42e0c2, fogColor:0x124a5a, fogDensity:0.012,
    ambColor:0x1b4f6a, ambInt:2.0, dirColor:0x50c0e0, dirInt:1.8, bgColor:0x124a5a,
  },
  3: {
    name:'The Surface', dirtyColor:0x1a2e1a, cleanColor:0x39ff14, 
    fishColor:0xffffff, fogColor:0x87ceeb, fogDensity:0.0015, // Ultra low fog for clarity
    ambColor:0x909090, ambInt:2.4, dirColor:0xfffaf0, dirInt:2.8, bgColor:0x87ceeb,
  },
};

let currentLayer = 1;
window.currentLayer = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060e14);
scene.fog = new THREE.Fog(0x060e14, 8, 38);
const fxSystem = new FXSystem(scene);
window.fxSystem = fxSystem; // Global access for environmental vents and player boosters
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
camera.lookAt(0, 0.45, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const ambientLight = new THREE.AmbientLight(0x334455, 2.5);
const hemiLight = new THREE.HemisphereLight(0x1a3a5a, 0x0a1a2a, 2.0); // sky / ground
const directionalLight = new THREE.DirectionalLight(0x7ab8d4, 1.8);
directionalLight.position.set(5, 15, 8);
const playerLight = new THREE.PointLight(0x44aacc, 1.8, 20);
scene.add(ambientLight, hemiLight, directionalLight, playerLight);

function applyLayerLighting(layer) {
  const cfg = LAYERS[layer];
  ambientLight.color.set(cfg.ambColor);
  ambientLight.intensity = cfg.ambInt * 3.2;
  hemiLight.color.set(cfg.dirColor);
  hemiLight.groundColor.set(cfg.bgColor);
  hemiLight.intensity = Math.max(1.4, cfg.ambInt * 2.2);
  directionalLight.color.set(cfg.dirColor);
  directionalLight.intensity = cfg.dirInt * 2.2;
  scene.background.set(cfg.bgColor);
  scene.fog.color.set(cfg.fogColor);
  
  if (layer === 3) {
    scene.fog.near = 30;
    scene.fog.far = 120; // Clear view for land
  } else {
    scene.fog.near = layer === 1 ? 14 : 10;
    scene.fog.far = layer === 1 ? 62 : 38;
  }
}

function updateLayerAtmosphere() {
  const cfg = LAYERS[currentLayer];
  const cleanT = 0; // Temporary stub
  scene.fog.near = THREE.MathUtils.lerp(12, 22, cleanT);
  scene.fog.far = THREE.MathUtils.lerp(48, 76, cleanT);
  const dirtyBg = new THREE.Color(cfg.fogColor).multiplyScalar(0.52);
  const vibrantBg = new THREE.Color(cfg.bgColor).lerp(new THREE.Color(cfg.cleanColor), 0.42).multiplyScalar(1.35);
  scene.background.lerpColors(dirtyBg, vibrantBg, 0.18 + cleanT * 0.82);
  ambientLight.intensity = cfg.ambInt * THREE.MathUtils.lerp(1.7, 5.2, cleanT);
  hemiLight.intensity = Math.max(1.2, cfg.ambInt * THREE.MathUtils.lerp(1.8, 3.3, cleanT));
  directionalLight.intensity = cfg.dirInt * THREE.MathUtils.lerp(1.2, 3.7, cleanT);
  playerLight.intensity = THREE.MathUtils.lerp(1.45, 2.75, cleanT);
}

const environmentAssets = new EnvironmentAssets(scene);
const inventory = new Inventory();
const mapBounds = { minX: -24, maxX: 24, minZ: -24, maxZ: 24 };
const tileGrid = new TileGrid(scene, mapBounds);
tileGrid.setLayerColors(LAYERS[currentLayer].dirtyColor, LAYERS[currentLayer].cleanColor, currentLayer);
environmentAssets.populateLayer(currentLayer, mapBounds);

let layer1Artifacts = [];
// Spawn Layer 1 artifacts
layer1Artifacts = spawnLayer1Artifacts(scene, mapBounds, (pos) => {
  inventory.items.gold += 50;
  fxSystem.spawnImpact(pos, 0xffd700, 20);
  audio.playRestoration();
});
const player = new Player(mapBounds);
scene.add(player.mesh);

const hud = new HUD();
const tools = new Tools();
const upgradeShop = new UpgradeShop();
const equipmentShop = new EquipmentShop(inventory, player);
const craftingMenu = new CraftingMenu(inventory, tools, (id) => {
  player.equipWeapon(id);
  hud.updateAmmo(player.ammo, player.maxAmmo);
  hud.showWarning(`EQUIPPED: ${player.weapons[player.weaponLevel].name}`, 2000);
});
const completionScreen = new CompletionScreen();
const layerTransitionScreen = new LayerTransitionScreen();
const gameOverScreen = new GameOverScreen();

const clock = new THREE.Clock();
let elapsedSeconds = 0;
let dredger = null, dredgerHasSpawned = false;
let slick = null, slickHasSpawned = false;
let smogGiant = null, smogGiantHasSpawned = false;
let dredgerDefeated = false, slickDefeated = false, smogGiantDefeated = false;
let gameWon = false, isTransitioningLayer = false, gameStarted = false;

let purificationPct = 0;
const enemies = [];
const drops = [];
let enemySpawnTimer = 0;

let fish = [], jellyfish = [], seaTurtles = [], butterflies = [], octopuses = [], anglerfish = [], mantaRays = [], eels = [], schools = [];
let fishWave = 0;
const projectiles = [], bossProjectiles = [];
const PROJ_SPEED = 18, ATTACK_RANGE = 7, ATTACK_DAMAGE = 2;
let autoPulseTimer = 0, lastCleanedPct = 0, restorationSoundCooldown = 0;
let cleaningPulseTimer = 0, cleaningPulseCooldown = 0;
const cameraTarget = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
let cameraShakeIntensity = 0;
let frameErrorElement = null;

let isMouseDown = false;
let mouseTargetPos = null;
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

function showFrameError(error) {
  if (!frameErrorElement) {
    frameErrorElement = document.createElement('pre');
    frameErrorElement.style.cssText = `
      position:fixed;left:16px;right:16px;bottom:48px;z-index:2000;
      max-height:45vh;overflow:auto;margin:0;padding:14px 16px;
      color:#ffd6d6;background:rgba(30,6,8,.94);border:1px solid #c44a4a;
      border-radius:8px;font:12px/1.45 IBM Plex Mono,monospace;white-space:pre-wrap;
    `;
    document.body.appendChild(frameErrorElement);
  }
  frameErrorElement.textContent = `Render loop stopped:\n${error?.stack ?? error}`;
}

function shakeCamera(intensity) { cameraShakeIntensity = Math.max(cameraShakeIntensity, intensity); }

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
    else child.material?.dispose();
  });
  object.parent?.remove(object);
}

function clearLayerActors() {
  const creatures = [fish, jellyfish, seaTurtles, butterflies, octopuses, anglerfish, mantaRays, eels, schools];
  for (const list of creatures) {
    for (const creature of list) disposeObject(creature.mesh);
    list.length = 0;
  }

  for (const art of layer1Artifacts) {
    disposeObject(art.mesh);
    if (art.restoredPatch) disposeObject(art.restoredPatch);
  }
  layer1Artifacts = [];

  for (const projectile of [...projectiles, ...bossProjectiles]) disposeObject(projectile);
  projectiles.length = 0;
  bossProjectiles.length = 0;

  for (const boss of [dredger, slick, smogGiant]) {
    if (boss?.mesh?.parent) disposeObject(boss.mesh);
    boss?.hpBar?.remove?.();
  }
  dredger = null;
  slick = null;
  smogGiant = null;
}

function isCurrentBossDefeated() {
  if (currentLayer === 1) return dredgerDefeated;
  if (currentLayer === 2) return slickDefeated;
  if (currentLayer === 3) return smogGiantDefeated;
  return true;
}

function bossNameForLayer(layer) {
  return layer === 1 ? 'Dredger' : layer === 2 ? 'The Slick' : 'Smog Giant';
}

function canClearSlick() {
  return ['woven_basket', 'tide_net', 'sand_filter'].includes(tools.activeTool);
}

function isAreaMostlyClean(position, radius = 2.2, required = 0.7) {
  // Temporary stub for ARPG transition
  return true;
}

function markBossDefeated(layer) {
  if (layer === 1 && !dredgerDefeated) {
    dredgerDefeated = true;
    hud.updateBossWarning('Dredger destroyed - Layer 1 secure', 'success');
  } else if (layer === 2 && !slickDefeated) {
    slickDefeated = true;
    hud.updateBossWarning('The Slick dispersed - Layer 2 secure', 'success');
  } else if (layer === 3 && !smogGiantDefeated) {
    smogGiantDefeated = true;
    hud.updateBossWarning('Smog Giant destroyed - Layer 3 secure', 'success');
  }
}

function maybeCompleteLayer() {
  if (isTransitioningLayer || gameWon) return;

  if (purificationPct < 100) return;

  if (!isCurrentBossDefeated()) {
    hud.updateBossWarning(`100% restored - destroy ${bossNameForLayer(currentLayer)} to advance`);
    return;
  }

  if (currentLayer >= 3) {
    gameWon = true;
    hud.updateBossWarning('All layers restored', 'success');
    audio.playWin();
    completionScreen.show(elapsedSeconds, 'Ocean Restored');
    return;
  }

  const nextLayer = currentLayer + 1;
  isTransitioningLayer = true;
  hud.updateBossWarning(`${LAYERS[currentLayer].name} restored - entering ${LAYERS[nextLayer].name}`, 'success');
  layerTransitionScreen.show(`${LAYERS[currentLayer].name} restored. Entering ${LAYERS[nextLayer].name}.`);

  setTimeout(() => {
    clearLayerActors();
    currentLayer = nextLayer;
    window.currentLayer = nextLayer;
    fishWave = 0;
    lastCleanedPct = 0;
    purificationPct = 0;
    hud.updatePurification(0);
    tileGrid.resetAllTiles();
    tileGrid.setLayerColors(LAYERS[currentLayer].dirtyColor, LAYERS[currentLayer].cleanColor, currentLayer);
    environmentAssets.clear();
    environmentAssets.populateLayer(currentLayer, tileGrid.getBounds());
    applyLayerLighting(currentLayer);
    player.resetPosition();
    player.clearKeys();
    craftingMenu.setLayer(currentLayer);
    hud.updateLayerName(LAYERS[currentLayer].name);
    hud.updateBossWarning('');
    layerTransitionScreen.hide();
    isTransitioningLayer = false;
    dredgerHasSpawned = false;
    slickHasSpawned = false;
    smogGiantHasSpawned = false;
  }, 1800);
}

function advanceToNextLayerDev() {
  if (isTransitioningLayer || gameWon) return;

  if (currentLayer >= 3) {
    gameWon = true;
    hud.updateBossWarning('Dev skip - completion reached', 'success');
    audio.playWin();
    completionScreen.show(elapsedSeconds, 'Ocean Restored');
    return;
  }

  const nextLayer = currentLayer + 1;
  isTransitioningLayer = true;
  
  // Update HUD Title INSTANTLY so user sees the change
  hud.updateLayerName(LAYERS[nextLayer].name);
  hud.updateBossWarning(`Dev skip - entering ${LAYERS[nextLayer].name}`, 'success');
  layerTransitionScreen.show(`Dev skip: entering ${LAYERS[nextLayer].name}.`);

  setTimeout(() => {
    try {
      // 1. Update Global States FIRST
      currentLayer = nextLayer;
      window.currentLayer = nextLayer;
      
      // 2. Clear everything
      clearLayerActors();
      
      fishWave = 0;
      lastCleanedPct = 0;
      purificationPct = 0;
      
      // 3. Reset World Systems
      tileGrid.resetAllTiles();
      tileGrid.setLayerColors(LAYERS[currentLayer].dirtyColor, LAYERS[currentLayer].cleanColor, currentLayer);
      environmentAssets.clear();
      environmentAssets.populateLayer(currentLayer, tileGrid.getBounds());
      
      // 4. Update UI & Player
      hud.updatePurification(0);
      hud.updateLayerName(LAYERS[currentLayer].name);
      hud.updateBossWarning('');
      player.updateForLayer(currentLayer);
      player.resetPosition();
      player.clearKeys();
      player.setPaused(false);
      craftingMenu.setLayer(currentLayer);
      
      // 5. Apply Visuals
      applyLayerLighting(currentLayer);
      
      // 6. Reset Boss Flags
      dredgerHasSpawned = false;
      slickHasSpawned = false;
      smogGiantHasSpawned = false;
      dredgerDefeated = false;
      slickDefeated = false;
      smogGiantDefeated = false;
    } catch (e) {
      console.error("Transition Error:", e);
    } finally {
      // ALWAYS hide and unfreeze
      layerTransitionScreen.hide();
      isTransitioningLayer = false;
    }
  }, 1500);
}

function updateCamera(dt) {
  // Keep player light at player position
  playerLight.position.copy(player.mesh.position).add(new THREE.Vector3(0, 2, 0));

  cameraPosition.set(
    player.mesh.position.x + CAMERA_OFFSET.x,
    player.mesh.position.y + CAMERA_OFFSET.y + Math.sin(elapsedSeconds * 0.85) * 0.08,
    player.mesh.position.z + CAMERA_OFFSET.z,
  );
  if (cameraShakeIntensity > 0) {
    cameraPosition.x += (Math.random() - 0.5) * cameraShakeIntensity;
    cameraPosition.y += (Math.random() - 0.5) * cameraShakeIntensity;
    cameraPosition.z += (Math.random() - 0.5) * cameraShakeIntensity;
    cameraShakeIntensity *= 0.9;
  }
  camera.position.copy(cameraPosition);
  cameraTarget.copy(player.mesh.position);
  camera.lookAt(cameraTarget);
}

function fireBossProjectile(from, to, phase) {
  // phase 99 = contact ram (no projectile, just damage pulse)
  if (phase === 99) return; // handled in animate loop
  
  const color = phase === 3 ? 0xff1100 : phase === 2 ? 0xff6600 : 0xff4400;
  const size  = phase === 3 ? 0.28 : 0.2;
  const spread = phase === 3 ? 0.35 : 0; // Phase 3 adds slight spread

  const fireOne = (angleOffset = 0) => {
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    if (angleOffset !== 0) {
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);
    }
    const bolt = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    bolt.position.copy(from).add(new THREE.Vector3(0, 0.5, 0));
    const pLight = new THREE.PointLight(color, 2, 3);
    bolt.add(pLight);
    bolt.userData = { dir, life: 2.2 };
    scene.add(bolt);
    bossProjectiles.push(bolt);
  };

  fireOne();
  if (phase === 3) {
    fireOne(spread); fireOne(-spread);
  }
}

function maybeSpawnDredger() {
  if (currentLayer !== 1 || dredgerHasSpawned || purificationPct < 90) return;
  dredgerHasSpawned = true;
  dredger = new Dredger(mapBounds);
  scene.add(dredger.mesh);
  dredger.showHPBar();
  audio.playBossEntry();
  audio.startBossMusic();
  hud.updateBossWarning('Warning: Dredger active - destroy it to win!');
}
function maybeSpawnSlick() {
  if (currentLayer !== 2 || slickHasSpawned || purificationPct < 90) return;
  slickHasSpawned = true;
  slick = new Slick(scene, mapBounds);
  slick.showHPBar();
  audio.playBossEntry();
  audio.startBossMusic();
  hud.updateBossWarning('Warning: The Slick detected - neutralize the blobs!');
}

function maybeSpawnSmogGiant() {
  if (currentLayer !== 3 || smogGiantHasSpawned || purificationPct < 90) return;
  smogGiantHasSpawned = true;
  smogGiant = new SmogGiant(scene, mapBounds);
  smogGiant.showHPBar();
  audio.playBossEntry();
  audio.startBossMusic();
  hud.updateBossWarning('Final Threat: Smog Giant active - finish the mission!');
}

function spawnCreature(Cls, arr, count, extraArgs = []) {
  for (let i = 0; i < count; i++) {
    const c = new Cls(mapBounds, ...extraArgs);
    arr.push(c); scene.add(c.mesh);
  }
}

function maybeSpawnCreatures() {
  if (isTransitioningLayer || !gameStarted) return;
  
  // ── Restoration Check: No life in toxic environments ──
  if (purificationPct < 20) return; 
  
  // Scale spawn probability based on purification (max at 60%)
  const restorationFactor = Math.min(1.0, (purificationPct - 20) / 40);
  const isLand = currentLayer === 3;
  
  if (isLand) {
    // Only butterflies on surface, scaling with land restoration
    if (butterflies.length < 15 && Math.random() < 0.06 * restorationFactor) {
      spawnCreature(Butterfly, butterflies, 1);
    }
  } else {
    // Sea life return to restored waters
    if (fish.length < 20 && Math.random() < 0.12 * restorationFactor) spawnCreature(Fish, fish, 1);
    if (jellyfish.length < 6 && Math.random() < 0.04 * restorationFactor) spawnCreature(Jellyfish, jellyfish, 1);
    if (seaTurtles.length < 3 && Math.random() < 0.015 * restorationFactor) spawnCreature(SeaTurtle, seaTurtles, 1);
  }
}

window.addEventListener('keydown', (e) => {
  if (gameWon || isTransitioningLayer) return;
  const key = e.key.toLowerCase();
  if (key === 'c') { craftingMenu.toggle(); player.setPaused(craftingMenu.isOpen); }
  if (key === 'u') { upgradeShop.toggle(); player.setPaused(upgradeShop.isOpen); }
  if (key === 'g') { equipmentShop.toggle(); player.setPaused(equipmentShop.isOpen); }
  if (key === 'k') { advanceToNextLayerDev(); return; }
  if (key === 'e') {
    cleaningPulseTimer = Math.max(cleaningPulseTimer, 0.28);
    if (currentLayer === 1 && dredger?.isAlive) {
      const closeEnough = player.mesh.position.distanceTo(dredger.mesh.position) < 3.2;
      if (closeEnough && isAreaMostlyClean(dredger.mesh.position, 2.5, 0.65)) {
        dredger.defeat(scene);
        markBossDefeated(1);
        fxSystem.spawnPulse(dredger.mesh.position, 5, 0x66eaff);
        shakeCamera(0.5);
      } else {
        hud.updateBossWarning('Clean the tiles around the Dredger, then shut it down nearby');
      }
    }
    if (currentLayer === 2 && slick?.isAlive) {
      if (canClearSlick() && slick.defeatBlobNear(player.mesh.position, SLICK_DEFEAT_RANGE)) {
        fxSystem.spawnPulse(player.mesh.position, 8, 0x7060d0); shakeCamera(0.8);
        if (!slick.isAlive) markBossDefeated(2);
      } else if (!canClearSlick()) {
        hud.updateBossWarning('Use Woven Basket, Tide Net, or Sand Filter to clear Slick blobs');
      } else {
        hud.updateBossWarning('Move closer to a Slick blob, then press E');
      }
    }
    if (currentLayer === 3 && smogGiant?.isAlive) {
       const hasTools = tools.has('stone_scraper') && tools.has('woven_basket');
       const closeEnough = player.mesh.position.distanceTo(smogGiant.mesh.position) < SMOG_GIANT_DEFEAT_RANGE;
       if (hasTools && closeEnough) {
        smogGiant.defeat(scene);
        markBossDefeated(3);
        fxSystem.spawnPulse(smogGiant.mesh.position, 7, 0x80ff20);
        shakeCamera(0.6);
       } else {
        hud.updateBossWarning(hasTools ? 'Stand closer to purify the Smog Giant' : 'Craft Stone Scraper and Woven Basket to purify the Smog Giant');
       }
    }
  }
  const idx = parseInt(key) - 1;
  if (idx >= 0 && idx < 8) tools.setActiveTool(['bare_hands','stone_scraper','woven_basket','coral_drill','tide_net','sand_filter','seed_pouch','compost_spreader'][idx]);
});

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05); // cap dt at 50ms
  if (!gameWon && !isTransitioningLayer) elapsedSeconds += dt;
  const paused = gameWon || isTransitioningLayer || craftingMenu.isOpen || upgradeShop.isOpen || equipmentShop.isOpen;

  if (!paused && gameStarted) {
    // Game Over Check
    if (player.hp <= 0 && !gameWon && !isTransitioningLayer) {
      if (gameOverScreen.element.classList.contains('hidden')) {
        gameOverScreen.show(elapsedSeconds);
        audio.playGameOver();
      }
      return; 
    }

    player.update(dt, upgradeShop.speedMultiplier, mouseTargetPos, fxSystem);
    
    // Manual Fire (Spacebar or Mouse)
    if (player.keys.has(' ')) {
      player.fire(projectiles, scene, hud, null, fxSystem);
    } else if (isMouseDown && mouseTargetPos) {
      player.fire(projectiles, scene, hud, mouseTargetPos, fxSystem);
    }
    
    // ARPG Phase 1: Spawn TrashSlimes
    enemySpawnTimer -= dt;
    const bossIsDefeated = (currentLayer === 1 && dredgerDefeated) || (currentLayer === 2 && slickDefeated) || (currentLayer === 3 && smogGiantDefeated);
    const stopSpawning = bossIsDefeated || purificationPct >= 100;

    if (enemySpawnTimer <= 0 && enemies.length < 3 && !stopSpawning) {
      enemySpawnTimer = 5.0 + Math.random() * 4.0;
      const slime = new TrashSlime(mapBounds, null, GlobalAssets.trashSlime);
      enemies.push(slime);
      scene.add(slime.mesh);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      enemy.update(dt, elapsedSeconds, player.mesh.position);
      
      if (enemy.mesh.position.distanceTo(player.mesh.position) < 0.8) {
        if (enemy.damageCooldown <= 0) {
          player.takeDamage(10);
          enemy.damageCooldown = 1.0;
        }
      }

      if (!enemy.isAlive) {
        // Drop gold
        const drop = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.15, 0),
          new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3, metalness: 0.8 })
        );
        drop.position.copy(enemy.mesh.position);
        drop.position.y = 0.2;
        scene.add(drop);
        drops.push(drop);

        fxSystem.spawnEnemyDeath(enemy.mesh.position, 0x3abaaa);
        environmentAssets.reviveNearest(enemy.mesh.position);
        
        scene.remove(enemy.mesh);
        enemies.splice(i, 1);
        
        const oldPct = purificationPct;
        purificationPct = Math.min(100, purificationPct + 2.5);
        hud.updatePurification(purificationPct);
        
        player.checkWeaponUnlock(purificationPct, hud);

        // Progressively Spawn Marine Life
        if (oldPct < 20 && purificationPct >= 20) {
          for(let k=0; k<3; k++) { const j = new Jellyfish(mapBounds); jellyfish.push(j); scene.add(j.mesh); }
        }
        if (oldPct < 40 && purificationPct >= 40) {
          const f = new FishSchool(mapBounds, 0x88ccdd); schools.push(f); scene.add(f.mesh);
        }
        if (oldPct < 60 && purificationPct >= 60) {
          for(let k=0; k<5; k++) { const f = new Fish(mapBounds, 0x3abaaa); fish.push(f); scene.add(f.mesh); }
          for(let k=0; k<3; k++) { const j = new Jellyfish(mapBounds); jellyfish.push(j); scene.add(j.mesh); }
          const f = new FishSchool(mapBounds, 0xaaffff); schools.push(f); scene.add(f.mesh);
        }
        if (oldPct < 80 && purificationPct >= 80) {
          const f = new FishSchool(mapBounds, 0xffcc33); schools.push(f); scene.add(f.mesh);
        }
      }
    }

    // ARPG Phase 1: Update Drops (Magnetize and Collect)
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      const dist = drop.position.distanceTo(player.mesh.position);
      if (dist < 4.0) {
        const dir = new THREE.Vector3().subVectors(player.mesh.position, drop.position).normalize();
        drop.position.addScaledVector(dir, 8.0 * dt);
      }
      if (dist < 0.6) {
        inventory.items.gold += 5;
        player.ammo = player.maxAmmo;
        hud.updateAmmo(player.ammo, player.maxAmmo);
        audio.playRestoration();
        scene.remove(drop);
        drop.geometry.dispose();
        drop.material.dispose();
        drops.splice(i, 1);
      }
    }

    maybeSpawnDredger();
    maybeSpawnSlick();
    maybeSpawnSmogGiant();
    maybeSpawnCreatures();
    dredger?.update(dt, elapsedSeconds, null, player.mesh.position, () => {});
    slick?.update(dt, null);
    smogGiant?.update(dt, elapsedSeconds, null);

    // Update Boss Projectiles
    for (let i = bossProjectiles.length - 1; i >= 0; i--) {
      const b = bossProjectiles[i]; b.userData.life -= dt;
      b.position.addScaledVector(b.userData.dir, 10 * dt);
      if (b.position.distanceTo(player.mesh.position) < 0.8) {
        player.takeDamage(10);
        audio.playPlayerHurt();
        shakeCamera(0.5);
        scene.remove(b); b.geometry.dispose(); b.material.dispose();
        bossProjectiles.splice(i, 1);
      } else if (b.userData.life <= 0) {
        scene.remove(b); b.geometry.dispose(); b.material.dispose();
        bossProjectiles.splice(i, 1);
      }
    }

    // Update Player Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const bolt = projectiles[i]; bolt.userData.life -= dt;
      if (bolt.userData.velocity) {
        bolt.position.addScaledVector(bolt.userData.velocity, dt);
      } else {
        bolt.position.addScaledVector(bolt.userData.dir, PROJ_SPEED * dt);
      }
      
      let hitEnemy = false;
      for (const enemy of enemies) {
        if (enemy.isAlive && bolt.position.distanceTo(enemy.mesh.position) < 0.8) {
          enemy.takeDamage(bolt.userData.damage || ATTACK_DAMAGE);
          fxSystem.spawnImpact(bolt.position, 0x88ffff);
          shakeCamera(0.2);
          scene.remove(bolt); projectiles.splice(i, 1);
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy) continue;

      if (dredger?.isAlive && bolt.position.distanceTo(dredger.mesh.position) < 1.5) {
        dredger.takeDamage(ATTACK_DAMAGE); fxSystem.spawnImpact(bolt.position, 0xeedd66);
        scene.remove(bolt); projectiles.splice(i, 1);
        if (dredger.hp <= 0) {
          dredger.defeat(scene);
          markBossDefeated(1);
          shakeCamera(1.0);
          maybeCompleteLayer();
        }
      } else if (slick?.isAlive && bolt.position.distanceTo(slick.mesh.position) < 1.5) {
        slick.takeDamage(ATTACK_DAMAGE); fxSystem.spawnImpact(bolt.position, 0x66ff66);
        scene.remove(bolt); projectiles.splice(i, 1);
        if (slick.hp <= 0) {
          slick.defeat(scene);
          markBossDefeated(2);
          shakeCamera(1.0);
          maybeCompleteLayer();
        }
      } else if (smogGiant?.isAlive && bolt.position.distanceTo(smogGiant.mesh.position) < 2.0) {
        smogGiant.takeDamage(ATTACK_DAMAGE);
        fxSystem.spawnImpact(bolt.position, 0x80ff20);
        scene.remove(bolt); projectiles.splice(i, 1);
        if (smogGiant.hp <= 0) {
          smogGiant.defeat(scene);
          markBossDefeated(3);
          shakeCamera(1.0);
          maybeCompleteLayer();
        }
      } else if (bolt.userData.life <= 0) { scene.remove(bolt); projectiles.splice(i, 1); }
    }

    maybeCompleteLayer();
  }

  [...fish, ...jellyfish, ...seaTurtles, ...butterflies, ...octopuses, ...anglerfish, ...mantaRays, ...eels, ...schools]
    .forEach(c => {
      // Reactive Behavior: Scatter if player is close
      const dToP = c.mesh.position.distanceTo(player.mesh.position);
      if (dToP < 3.5) {
        const away = new THREE.Vector3().subVectors(c.mesh.position, player.mesh.position).normalize();
        c.mesh.position.addScaledVector(away, 5.0 * dt);
      }
      c.update(dt, elapsedSeconds, player.mesh.position);
    });
  environmentAssets.update(elapsedSeconds, null, dt);
  
  // Artifacts (only Layer 1 ones exist for now)
  if (currentLayer === 1) {
    for (const art of layer1Artifacts) {
      art.update(dt, elapsedSeconds, player.mesh.position, null);
    }
    updateLayer1RestorationQueue(dt);
  }
  fxSystem.update(dt);
  updateLayerAtmosphere();
  hud.update(purificationPct, elapsedSeconds);
  hud.updateInventory(inventory.items);
  craftingMenu.setProgress(purificationPct);
  updateCamera(dt);
  renderer.render(scene, camera);
}

applyLayerLighting(1);
updateCamera(1);
renderer.render(scene, camera);

function frame(timestamp) {
  try {
    animate(timestamp);
    renderer.render(scene, camera);
  } catch (error) {
    console.error(error);
    showFrameError(error);
    renderer.setAnimationLoop(null);
  }
}

renderer.setAnimationLoop(frame);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// Mouse aiming logic
function updateMouseTarget(e) {
  mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.45);
  if (!mouseTargetPos) mouseTargetPos = new THREE.Vector3();
  raycaster.ray.intersectPlane(floorPlane, mouseTargetPos);
}

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isMouseDown = true;
    updateMouseTarget(e);
  }
});
window.addEventListener('mousemove', (e) => {
  updateMouseTarget(e);
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) isMouseDown = false;
});

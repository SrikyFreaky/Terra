import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();
const RESTORE_CHECK_INTERVAL = 0.28;
const RESTORE_SWAP_INTERVAL = 0.12;
let restoreSwapCooldown = 0;
const restoreQueue = [];

const RESTORE_MATS = {
  grass: [0x2f8a58, 0x3ab06b, 0x1f6f50, 0x55c878].map((color) => new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
  })),
  coral: [0xff7a70, 0xffb35c, 0x6ad7d0, 0xd878d8].map((color) => new THREE.MeshLambertMaterial({ color })),
};
const GRASS_GEO = new THREE.PlaneGeometry(0.08, 1);
const CORAL_BRANCH_GEO = new THREE.CylinderGeometry(0.025, 0.045, 1, 6);

/**
 * Layer 1 stationary artifacts:
 *  - TreasureChest  (glows when idle, opens on proximity)
 *  - ShipwreckHull  (collapsed old wooden vessel)
 *  - AnchorRuins    (iron anchor embedded in rock)
 *  - SunkenCrate    (scattered cargo)
 *  - PortholePillar (stone column with round window)
 */

function rndFloat(a, b) { return a + Math.random() * (b - a); }
function rndPos(bounds, margin = 4) {
  return new THREE.Vector3(
    rndFloat(bounds.minX + margin, bounds.maxX - margin),
    0,
    rndFloat(bounds.minZ + margin, bounds.maxZ - margin),
  );
}

function isCleanPatch(tileGrid, position, radius = 1.4) {
  if (!tileGrid) return false;
  const nearby = tileGrid.getNearbyTileIndices(position, radius);
  if (!nearby.length) return false;
  const cleanCount = nearby.filter((index) => tileGrid.tiles[index]?.state === 'clean').length;
  return cleanCount / nearby.length >= 0.55;
}

function makeRestoredReefPatch() {
  const group = new THREE.Group();
  group.visible = false;
  group.scale.setScalar(0.12);
  group.userData = { restoreAge: 0 };

  for (let i = 0; i < 12; i++) {
    const h = rndFloat(0.35, 0.9);
    const mat = RESTORE_MATS.grass[Math.floor(Math.random() * RESTORE_MATS.grass.length)];
    const blade = new THREE.Mesh(GRASS_GEO, mat);
    blade.scale.y = h;
    blade.position.set(rndFloat(-1.2, 1.2), h / 2, rndFloat(-1.2, 1.2));
    blade.rotation.y = Math.random() * Math.PI;
    blade.userData = { type: 'grass', baseX: blade.rotation.x, phase: Math.random() * Math.PI * 2 };
    group.add(blade);
  }

  for (let i = 0; i < 5; i++) {
    const mat = RESTORE_MATS.coral[Math.floor(Math.random() * RESTORE_MATS.coral.length)];
    const coral = new THREE.Group();
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < branches; j++) {
      const h = rndFloat(0.18, 0.45);
      const branch = new THREE.Mesh(CORAL_BRANCH_GEO, mat);
      branch.scale.y = h;
      branch.position.set(rndFloat(-0.12, 0.12), h / 2, rndFloat(-0.12, 0.12));
      branch.rotation.set(rndFloat(-0.35, 0.35), 0, rndFloat(-0.35, 0.35));
      coral.add(branch);
    }
    coral.position.set(rndFloat(-1, 1), 0, rndFloat(-1, 1));
    coral.userData = { type: 'coral', phase: Math.random() * Math.PI * 2 };
    group.add(coral);
  }

  const lifeMat = new THREE.MeshLambertMaterial({ color: 0x66e0cc });
  const finMat = new THREE.MeshLambertMaterial({ color: 0x2b8f86, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 5), lifeMat);
    body.scale.set(0.75, 0.45, 1.4);
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), finMat);
    tail.position.z = -0.11;
    fish.add(body, tail);
    fish.position.set(rndFloat(-1.4, 1.4), rndFloat(0.35, 1.0), rndFloat(-1.4, 1.4));
    fish.userData = { type: 'life', phase: Math.random() * Math.PI * 2, radius: rndFloat(0.25, 0.55) };
    group.add(fish);
  }

  const glow = new THREE.PointLight(0x55e0c8, 0, 3.2);
  glow.position.y = 0.75;
  glow.userData = { type: 'restoreGlow' };
  group.add(glow);

  return group;
}

function updateRestoredPatch(patch, elapsed) {
  if (!patch?.visible) return;
  patch.userData.restoreAge = Math.min(1, (patch.userData.restoreAge ?? 0) + 0.035);
  const bloom = Math.sin(patch.userData.restoreAge * Math.PI);
  patch.scale.setScalar(THREE.MathUtils.lerp(patch.scale.x, 1 + bloom * 0.12, 0.18));

  patch.children.forEach((child) => {
    if (child.userData.type === 'grass') {
      child.rotation.z = Math.sin(elapsed * 1.7 + child.userData.phase) * 0.12;
    } else if (child.userData.type === 'coral') {
      child.rotation.z = Math.sin(elapsed + child.userData.phase) * 0.035;
    } else if (child.userData.type === 'life') {
      child.position.x += Math.sin(elapsed * 1.7 + child.userData.phase) * 0.003;
      child.position.z += Math.cos(elapsed * 1.4 + child.userData.phase) * 0.003;
      child.rotation.y = Math.sin(elapsed * 2 + child.userData.phase) * 0.5;
    } else if (child.userData.type === 'restoreGlow') {
      child.intensity = 0.22 + bloom * 0.8;
    }
  });
}

function prepareRestorableArtifact(artifact) {
  artifact.restored = false;
  artifact.restoreQueued = false;
  artifact.restoreCheckTimer = Math.random() * RESTORE_CHECK_INTERVAL;
  artifact.restoredPatch = makeRestoredReefPatch();
  artifact.restoredPatch.position.copy(artifact.mesh.position);
  artifact.restoredPatch.rotation.y = artifact.mesh.rotation.y;
}

function attachRestoredPatch(artifact) {
  if (!artifact.mesh.parent || artifact.restoredPatch.parent) return;
  artifact.mesh.parent.add(artifact.restoredPatch);
}

function queueRestoration(artifact) {
  if (artifact.restoreQueued) return;
  artifact.restoreQueued = true;
  restoreQueue.push(artifact);
}

export function updateLayer1RestorationQueue(dt) {
  restoreSwapCooldown = Math.max(0, restoreSwapCooldown - dt);
  if (restoreSwapCooldown > 0 || !restoreQueue.length) return;

  const artifact = restoreQueue.shift();
  artifact.restored = true;
  artifact.restoreQueued = false;
  artifact.mesh.visible = false;
  artifact.restoredPatch.visible = true;
  artifact.restoredPatch.scale.setScalar(0.12);
  artifact.restoredPatch.userData.restoreAge = 0;
  restoreSwapCooldown = RESTORE_SWAP_INTERVAL;
}

function restoreRuinIfClean(artifact, tileGrid, elapsed, dt) {
  attachRestoredPatch(artifact);

  if (artifact.restored) {
    updateRestoredPatch(artifact.restoredPatch, elapsed);
    return true;
  }

  if (artifact.restoreQueued) return false;

  artifact.restoreCheckTimer -= dt;
  if (artifact.restoreCheckTimer > 0) return false;
  artifact.restoreCheckTimer = RESTORE_CHECK_INTERVAL + Math.random() * RESTORE_CHECK_INTERVAL;

  if (!isCleanPatch(tileGrid, artifact.mesh.position)) return false;
  queueRestoration(artifact);
  return true;
}

// ── Treasure Chest ───────────────────────────────────────────────────
export class TreasureChest {
  constructor(position, onCollect) {
    this.onCollect = onCollect;
    this.collected = false;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    this._age = 0;
    this.lid = null;
    this.glow = new THREE.PointLight(0xffd060, 1.2, 3.5);
    this.glow.position.set(0, 0.8, 0);
    this.mesh.add(this.glow);
    this.#buildProceduralChest();

    // Try real GLB after the procedural chest is already playable.
    _loader.load(
      '/glb/pixellabs-treasure-chest-4062.glb',
      (gltf) => {
        this.#clearModel();
        this.lid = null;
        const model = gltf.scene;
        model.scale.setScalar(0.6);
        model.position.y = 0;
        this.mesh.add(model);
        // Find the lid mesh by name for open animation
        model.traverse(c => {
          if (c.name?.toLowerCase().includes('lid') || c.name?.toLowerCase().includes('top')) {
            this.lid = c;
          }
        });
        // If no named lid found, just use whole model
        if (!this.lid) this.lid = model;
      },
      undefined,
      undefined,
    );
  }

  #clearModel() {
    for (const child of [...this.mesh.children]) {
      if (child === this.glow) continue;
      child.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose());
        else obj.material?.dispose();
      });
      this.mesh.remove(child);
    }
  }

  #buildProceduralChest() {
    const wood  = new THREE.MeshLambertMaterial({ color: 0x5a3820 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x8a7030 });
    const band  = new THREE.MeshLambertMaterial({ color: 0x605020 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.48, 0.52), wood);
    body.position.y = 0.24;
    this.mesh.add(body);

    // Lid (domed half-cylinder)
    const lidGeo = new THREE.CylinderGeometry(0.275, 0.275, 0.22, 14, 1, false, 0, Math.PI);
    lidGeo.rotateZ(Math.PI / 2);
    lidGeo.rotateY(Math.PI / 2);
    this.lid = new THREE.Mesh(lidGeo, wood);
    this.lid.position.y = 0.48;
    this.mesh.add(this.lid);

    // Metal bands
    for (const y of [0.12, 0.36]) {
      const bandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.54), band);
      bandMesh.position.set(0, y, 0);
      this.mesh.add(bandMesh);
    }

    // Lock
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), metal);
    lock.position.set(0, 0.34, 0.28);
    this.mesh.add(lock);

    // Gold coins spilling out
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
    for (let i = 0; i < 5; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 8), coinMat);
      coin.position.set((Math.random() - 0.5) * 0.5, 0.01, (Math.random() - 0.5) * 0.5);
      coin.rotation.x = Math.random() * 0.5;
      this.mesh.add(coin);
    }
  }

  update(dt, elapsed, playerPos) {
    this._age += dt;
    if (this.collected) return;

    // Pulse glow
    this.glow.intensity = 0.8 + Math.sin(elapsed * 3) * 0.5;

    // Open when player is close
    const dist = this.mesh.position.distanceTo(playerPos);
    if (!this.lid) return;

    if (dist < 2.2) {
      // Swing lid open
      this.lid.rotation.x = Math.max(this.lid.rotation.x - dt * 3, -Math.PI * 0.55);
      if (this.lid.rotation.x <= -Math.PI * 0.5 && !this.collected) {
        this.collected = true;
        this.glow.color.set(0xffffff);
        this.glow.intensity = 3;
        setTimeout(() => { this.glow.intensity = 0; }, 600);
        this.onCollect?.();
      }
    } else {
      // Reset if player leaves (before collected)
      if (this.lid.rotation.x < 0) {
        this.lid.rotation.x = Math.max(this.lid.rotation.x + dt * 2, 0);
      }
    }
  }
}

// ── Shipwreck Hull ───────────────────────────────────────────────────
export class ShipwreckHull {
  constructor(position) {
    this.mesh = this.#build();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    // Tilt like it sank sideways
    this.mesh.rotation.z = rndFloat(-0.25, -0.1);
    prepareRestorableArtifact(this);
  }

  #build() {
    const g = new THREE.Group();
    const plank  = new THREE.MeshLambertMaterial({ color: 0x3a2510 });
    const dark   = new THREE.MeshLambertMaterial({ color: 0x1a100a });
    const rust   = new THREE.MeshLambertMaterial({ color: 0x4a2210 });
    const rope   = new THREE.MeshLambertMaterial({ color: 0x5a4a30 });

    // Main keel (long plank)
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 6.0), plank);
    keel.position.y = 0.15;
    g.add(keel);

    // Hull ribs sticking up
    for (let z = -2.4; z <= 2.4; z += 0.8) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.16), dark);
      rib.position.set(0, 0.4 + Math.random() * 0.3, z);
      rib.rotation.z = rndFloat(-0.15, 0.15);
      g.add(rib);

      // Vertical planks on ribs
      for (const sx of [-1, 1]) {
        const vp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7 + Math.random() * 0.5, 0.12), plank);
        vp.position.set(sx * (0.8 + Math.random() * 0.4), 0.7, z);
        vp.rotation.z = sx * rndFloat(0.1, 0.3);
        g.add(vp);
      }
    }

    // Broken mast stump
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 7), dark);
    mast.position.set(-0.1, 0.9, -1.5);
    mast.rotation.z = -0.4;
    g.add(mast);

    // Dangling rope
    const ropeM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), rope);
    ropeM.position.set(-0.4, 1.2, -1.5);
    ropeM.rotation.z = 0.3;
    g.add(ropeM);

    // Rusty cannon
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), rust);
    cannon.rotation.z = Math.PI / 2;
    cannon.position.set(1.0, 0.2, 0.8);
    g.add(cannon);

    // Algae glow
    const algae = new THREE.PointLight(0x204040, 0.4, 4);
    algae.position.set(0, 1, 0);
    g.add(algae);

    return g;
  }

  update(dt, elapsed, playerPos, tileGrid) {
    restoreRuinIfClean(this, tileGrid, elapsed, dt);
  }
}

// ── Iron Anchor in Rock ──────────────────────────────────────────────
export class AnchorRuins {
  constructor(position) {
    this.mesh = this.#build();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    prepareRestorableArtifact(this);
  }

  #build() {
    const g = new THREE.Group();
    const iron  = new THREE.MeshLambertMaterial({ color: 0x2a2f35 });
    const rust2 = new THREE.MeshLambertMaterial({ color: 0x5a3020 });
    const rock  = new THREE.MeshLambertMaterial({ color: 0x2a3038 });

    // Rock base
    const rockBase = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), rock);
    rockBase.scale.y = 0.55;
    rockBase.position.y = 0.2;
    g.add(rockBase);

    // Anchor shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), iron);
    shaft.position.y = 1.2;
    shaft.rotation.z = -0.2;
    g.add(shaft);

    // Anchor ring at top
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12), rust2);
    ring.position.set(0.3, 2.05, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    // Anchor flukes (two arms at bottom)
    for (const sx of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.15), rust2);
      fluke.position.set(sx * 0.3, 0.55, 0);
      fluke.rotation.z = sx * 0.4;
      g.add(fluke);
    }

    // Chains around base
    for (let i = 0; i < 6; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 5, 8), iron);
      link.position.set(
        Math.cos(i * 1.05) * 0.55,
        0.08 + i * 0.08,
        Math.sin(i * 1.05) * 0.55,
      );
      link.rotation.y = i * 0.5;
      g.add(link);
    }

    return g;
  }

  update(dt, elapsed, playerPos, tileGrid) {
    restoreRuinIfClean(this, tileGrid, elapsed, dt);
  }
}

// ── Sunken Cargo Crates ──────────────────────────────────────────────
export class SunkenCrates {
  constructor(position) {
    this.mesh = this.#build();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    prepareRestorableArtifact(this);
  }

  #build() {
    const g = new THREE.Group();
    const wood  = new THREE.MeshLambertMaterial({ color: 0x4a3018 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x384048 });

    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const w = 0.4 + Math.random() * 0.3;
      const h = 0.3 + Math.random() * 0.25;
      const d = 0.35 + Math.random() * 0.3;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      crate.position.set(
        rndFloat(-0.5, 0.5),
        h / 2 + i * 0.05,
        rndFloat(-0.5, 0.5),
      );
      crate.rotation.set(
        rndFloat(-0.1, 0.1),
        rndFloat(0, Math.PI),
        rndFloat(-0.1, 0.1),
      );
      g.add(crate);

      // Metal corner brackets
      const bkt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, 0.04), metal);
      bkt.position.copy(crate.position);
      bkt.position.y += 0.02;
      g.add(bkt);
    }

    return g;
  }

  update(dt, elapsed, playerPos, tileGrid) {
    restoreRuinIfClean(this, tileGrid, elapsed, dt);
  }
}

// ── Stone Pillar with Porthole ───────────────────────────────────────
export class PortholePillar {
  constructor(position) {
    this.mesh = this.#build();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    prepareRestorableArtifact(this);
  }

  #build() {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
    const brass = new THREE.MeshLambertMaterial({ color: 0x7a6020 });
    const glass = new THREE.MeshBasicMaterial({ color: 0x204040, transparent: true, opacity: 0.5 });

    // Broken pillar base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), stone);
    base.position.y = 0.2;
    g.add(base);

    // Main pillar shaft (broken top)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.8, 8), stone);
    shaft.position.y = 1.3;
    g.add(shaft);

    // Brass porthole ring on pillar face
    const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), brass);
    portRing.position.set(0, 1.4, 0.31);
    portRing.rotation.y = Math.PI;
    g.add(portRing);

    // Glass lens
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), glass);
    lens.position.set(0, 1.4, 0.34);
    g.add(lens);

    // Glow behind porthole
    this.portLight = new THREE.PointLight(0x40a0a0, 0.6, 2.5);
    this.portLight.position.set(0, 1.4, 0.1);
    g.add(this.portLight);

    // Rough cap at broken top
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), stone);
    cap.scale.y = 0.5;
    cap.position.y = 2.25;
    g.add(cap);

    return g;
  }

  update(dt, elapsed, playerPos, tileGrid) {
    if (restoreRuinIfClean(this, tileGrid, elapsed, dt)) return;

    if (this.portLight) {
      this.portLight.intensity = 0.4 + Math.sin(elapsed * 1.5) * 0.25;
    }
  }
}

// ── Factory: spawn a set of Layer 1 artifacts ────────────────────────
export function spawnLayer1Artifacts(scene, bounds, onChestCollect) {
  const artifacts = [];

  // 3-4 Treasure chests in random spots
  const chestCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < chestCount; i++) {
    const pos = rndPos(bounds, 5);
    const chest = new TreasureChest(pos, () => onChestCollect?.(pos));
    scene.add(chest.mesh);
    artifacts.push(chest);
  }

  // 2 Shipwrecks
  for (let i = 0; i < 2; i++) {
    const sw = new ShipwreckHull(rndPos(bounds, 6));
    scene.add(sw.mesh);
    artifacts.push(sw);
  }

  // 3 Anchor ruins
  for (let i = 0; i < 3; i++) {
    const ar = new AnchorRuins(rndPos(bounds, 4));
    scene.add(ar.mesh);
    artifacts.push(ar);
  }

  // 5 Cargo crate clusters
  for (let i = 0; i < 5; i++) {
    const sc = new SunkenCrates(rndPos(bounds, 3));
    scene.add(sc.mesh);
    artifacts.push(sc);
  }

  // 4 Porthole pillars
  for (let i = 0; i < 4; i++) {
    const pp = new PortholePillar(rndPos(bounds, 4));
    scene.add(pp.mesh);
    artifacts.push(pp);
  }

  return artifacts;
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Procedural palettes (Layer 2 / 3 still use these) ───────────────
const L1 = {
  coral: [0xff1f16, 0xff7a22, 0xff5c9a, 0xa25cff],
  seaweed: [0x1d8a63, 0x2bbf88, 0x187c79, 0x3ac18f],
  rock: [0x061018, 0x082027, 0x0b2a2f],
  highlight: [0x4fb7bd, 0x7bded9, 0x2d8d91],
  ray: 0xd4ffff,
  bubble: 0xa8f0ff,
};
const L2 = { coral1:0xe05060,coral2:0xf09030,coral3:0x50c0e0,coral4:0xd060c0, rock:0x4a6070, seagrass:0x2a8050, star:0xf06030 };
const L3 = { bark:0x5a3a1a,leaf:0x2d7a20,leaf2:0x4aaa30,flower1:0xff6090,flower2:0xffcc30,grass:0x3a8a20 };

const SHOW_SKY_DOME = true;
const SHOW_TERRAIN = true;
const DEBUG_TERRAIN_VISIBLE = false;

function randFloat(a, b) { return a + Math.random() * (b - a); }
function jitter(v, s) { return v + (Math.random() - 0.5) * 2 * s; }

// 🛡️ Safety placement: ensures objects don't spawn on top of the player's start position (0,0)
function safePosition(bounds, minDistance = 4.0) {
  let pos = new THREE.Vector3();
  let attempts = 0;
  do {
    pos.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
    attempts++;
  } while (pos.lengthSq() < minDistance * minDistance && attempts < 10);
  return pos;
}

function edgeBiasedPosition(bounds, margin = 2.5) {
  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? randFloat(bounds.minX, bounds.minX + margin)
    : side === 1 ? randFloat(bounds.maxX - margin, bounds.maxX)
    : randFloat(bounds.minX, bounds.maxX);
  const z = side === 2 ? randFloat(bounds.minZ, bounds.minZ + margin)
    : side === 3 ? randFloat(bounds.maxZ - margin, bounds.maxZ)
    : randFloat(bounds.minZ, bounds.maxZ);
  return new THREE.Vector3(x, 0, z);
}

export class EnvironmentAssets {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.animatedObjects = [];
    this.scene.add(this.group);
    this._loader = new GLTFLoader();
    this._loadedGLBs = {}; // cache by filename
    this._currentLayer = 1;
    this._bounds = null;
    this.restorableObjects = [];
    this.restoreQueue = [];
    this.restoreCooldown = 0;
    this.growthObjects = [];
  }

  // ── Public API ────────────────────────────────────────────────────
  async load() { /* assets loaded lazily in populateLayer */ }

  initRestorable(seaweedGltf, coralsGltf) {
    if (!this._bounds) return;
    this.#placeLayer1RestorablePoints(this._bounds, seaweedGltf, coralsGltf);
  }

  populateLayer(layer, bounds) {
    this.clear();
    this._currentLayer = layer;
    this._bounds = bounds;

    if (layer === 1) {
      this.#buildOceanFloor(bounds);
      this.#loadLayer1GLB(bounds);
      this.#placeLayer1Rocks(bounds);
      this.#placeBubbleVents(bounds);
    } else if (layer === 2) {
      this.#buildLayer2(bounds);
    } else if (layer === 3) {
      this.#buildLayer3(bounds);
    }
  }

  clear() {
    this.animatedObjects = [];
    this.restorableObjects = [];
    this.restoreQueue = [];
    this.growthObjects = [];
    while (this.group.children.length) {
      const c = this.group.children[0];
      this.group.remove(c);
      c.traverse(o => { 
        if (o.isMesh) { 
          o.geometry?.dispose(); 
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose(); 
        } 
      });
    }
  }

  update(elapsed, tileGrid = null, dt = 0.016) {
    const camPos = window.camera?.position;
    
    for (const obj of this.animatedObjects) {
      if (camPos && obj.position.distanceToSquared(camPos) > 1600) continue; 
      const d = obj.userData;
      if (d.type === 'seaweed' || d.type === 'glbSeaweed') {
        obj.rotation.z = Math.sin(elapsed * d.ss + d.so) * 0.14;
        obj.rotation.x = Math.cos(elapsed * d.ss * 0.7 + d.so) * 0.06;
      } else if (d.type === 'bubble') {
        obj.position.y += d.spd * 0.016;
        obj.position.x += Math.sin(elapsed * 0.8 + d.so) * (d.drift ?? 0.02) * 0.01;
        if (obj.position.y > (d.maxY ?? 5)) obj.position.y = d.minY ?? 0;
      } else if (d.type === 'coral') {
        obj.rotation.z = Math.sin(elapsed * 0.6 + d.so) * 0.04;
      } else if (d.type === 'lightRay') {
        obj.material.opacity = d.baseOpacity + Math.sin(elapsed * 0.45 + d.so) * 0.025;
      }
    }
    this.#updateRestorableObjects(tileGrid, dt);
    this.#updateGrowthObjects(tileGrid);

    // Update Layer 1 Restored Animations
    for (const obj of this.restorableObjects) {
      if (obj.isRestored) {
        if (camPos && obj.position.distanceToSquared(camPos) > 1600) continue;
        if (obj.userData.type === 'seaweed') {
          obj.rotation.z = Math.sin(elapsed * 0.9 + obj.userData.so) * 0.15;
          obj.rotation.x = Math.cos(elapsed * 0.7 + obj.userData.so) * 0.06;
        } else if (obj.userData.type === 'corals') {
          obj.rotation.z = Math.sin(elapsed * 0.4 + obj.userData.so) * 0.05;
        }
      }
    }

    // Update Bubble Vents (ONLY in Layer 1 - The Deep)
    if (this._currentLayer === 1 && this.bubbleVents) {
      for (const vent of this.bubbleVents) {
        vent.timer -= dt;
        if (vent.timer <= 0) {
          vent.timer = 0.4 + Math.random() * 0.8;
          // Global reference to fxSystem needs careful handling
          if (window.fxSystem) window.fxSystem.spawnBubbleBurst(vent.position, 1);
        }
      }
    }
  }

  // ── Restoration Logic ──────────────────────────────────────────
  reviveNearest(position) {
    if (!position) return false;
    let nearest = null;
    let minDist = Infinity;

    for (const item of this.restorableObjects) {
      if (!item || !item.position || item.isRestored) continue;
      const dist = item.position.distanceTo(position);
      if (dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    }

    if (nearest) {
      this.#restoreObject(nearest);
      console.log(`[EnvironmentAssets] Revived nearest ${nearest.userData.type} at distance ${minDist.toFixed(2)}`);
      return true;
    }
    console.warn(`[EnvironmentAssets] No dormant objects found within search range!`);
    return false;
  }

  #restoreObject(obj) {
    obj.isRestored = true;
    // Restore original materials
    obj.traverse(child => {
      if (child.isMesh && child.userData.originalMat) {
        child.material = child.userData.originalMat;
      }
    });
    // Add glow
    const light = new THREE.PointLight(0x3abaaa, 1.2, 5);
    light.position.y = 0.5;
    obj.add(light);
    
    // Add to animated objects so it sways
    if (!this.animatedObjects.includes(obj)) {
      this.animatedObjects.push(obj);
    }
    
    // Growth animation
    obj.scale.setScalar(0.01);
    const targetScale = obj.userData.targetScale || 1.0;
    
    const animateGrowth = () => {
      obj.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
      if (obj.scale.x < targetScale * 0.99) {
        requestAnimationFrame(animateGrowth);
      }
    };
    animateGrowth();
  }

  // ── LAYER 1 — Solid 3D Ocean Floor ────────────────────────
  #buildOceanFloor(bounds) {
    const floorGroup = new THREE.Group();
    floorGroup.name = 'layer-1-ocean-floor';
    this.group.add(floorGroup);

    // 1. Solid seabed floor
    const floorGeo = new THREE.PlaneGeometry(150, 150, 32, 32);
    // Add some very subtle vertex displacement so it's not perfectly flat
    const posAttribute = floorGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y = posAttribute.getY(i); // This is Z in world space before rotation
      const wave = Math.sin(x * 0.2) * Math.cos(y * 0.2) * 0.15;
      posAttribute.setZ(i, wave);
    }
    floorGeo.computeVertexNormals();

    const floorMat = new THREE.MeshStandardMaterial({ 
      color: 0x061c21, // Dark deep sea color
      roughness: 0.9,
      metalness: 0.1
    });
    
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1; // Slightly below y=0 to avoid z-fighting with placed objects
    floorGroup.add(floor);

    // 2. Transparent cyan light rays from above
    const rayMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.08, 
      depthWrite: false, 
      blending: THREE.AdditiveBlending 
    });
    for (let i = 0; i < 12; i++) {
      const w = randFloat(2, 6);
      const h = randFloat(40, 80);
      const rayGeo = new THREE.PlaneGeometry(w, h);
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.rotation.x = -Math.PI / 2;
      ray.rotation.z = randFloat(-0.3, 0.3);
      ray.position.set(
        randFloat(bounds.minX, bounds.maxX), 
        0.5 + Math.random() * 0.1,
        randFloat(bounds.minZ, bounds.maxZ)
      );
      ray.renderOrder = -60;
      floorGroup.add(ray);
    }
  }

  #buildLayer1Depth(bounds, group) {
    if (SHOW_SKY_DOME) {
      const skyGeo = new THREE.SphereGeometry(100, 32, 20);
      const skyColors = [];
      const top = new THREE.Color(0x1f7f8f);
      const mid = new THREE.Color(0x0b3e49);
      const bottom = new THREE.Color(0x020b14);
      const pos = skyGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) + 100) / 200, 0, 1);
        const color = t < 0.48
          ? bottom.clone().lerp(mid, t / 0.48)
          : mid.clone().lerp(top, (t - 0.48) / 0.52);
        skyColors.push(color.r, color.g, color.b);
      }
      skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
      const sky = new THREE.Mesh(
        skyGeo,
        new THREE.MeshBasicMaterial({
          side: THREE.BackSide,
          vertexColors: true,
          fog: false,
          depthWrite: false,
        }),
      );
      sky.name = 'underwater-sky-dome';
      sky.position.y = 2;
      sky.renderOrder = -10;
      group.add(sky);
    }

    if (!SHOW_TERRAIN) return;

    const width = 70;
    const depth = 70;
    const terrainGeo = new THREE.PlaneGeometry(width, depth, 32, 32);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainPos = terrainGeo.attributes.position;
    const terrainColors = [];
    const low = new THREE.Color(DEBUG_TERRAIN_VISIBLE ? 0x0b695d : 0x061112);
    const high = new THREE.Color(DEBUG_TERRAIN_VISIBLE ? 0x22c8a5 : 0x0f2a2a);
    for (let i = 0; i < terrainPos.count; i++) {
      const x = terrainPos.getX(i);
      const z = terrainPos.getZ(i);
      const wave = Math.sin(x * 0.27) * Math.cos(z * 0.21) * 0.065 + Math.sin((x + z) * 0.09) * 0.045;
      terrainPos.setY(i, THREE.MathUtils.clamp(wave, -0.1, 0.1));
      const shade = THREE.MathUtils.clamp((wave + 0.12) / 0.24, 0, 1);
      const color = low.clone().lerp(high, shade);
      terrainColors.push(color.r, color.g, color.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
    terrainGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72 }),
    );
    terrain.name = 'subtle-underwater-terrain';
    terrain.position.y = -0.2;
    terrain.renderOrder = -2;
    group.add(terrain);
  }

  #placeLayer1LightRays(bounds, group) {
    const rayMat = new THREE.MeshBasicMaterial({
      color: L1.ray,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(randFloat(3.0, 5.0), randFloat(20, 32)), rayMat.clone());
      ray.position.set(
        bounds.maxX - 3 - i * 4.2,
        randFloat(5.5, 8.5),
        bounds.minZ + 3 + i * 4.8,
      );
      ray.rotation.set(-0.38, -0.5, randFloat(-0.08, 0.08));
      ray.userData = { type: 'lightRay', baseOpacity: randFloat(0.08, 0.16), so: Math.random() * Math.PI * 2 };
      this.animatedObjects.push(ray);
      group.add(ray);
    }
  }

  #placeLayer1ReefSilhouettes(bounds, group) {
    const edgeAnchors = [
      { x: bounds.minX - 3.8, z: bounds.minZ + 5, sx: 4.8, sz: 8.5, h: 2.4 },
      { x: bounds.minX - 3.5, z: bounds.maxZ - 6, sx: 5.5, sz: 9.5, h: 2.8 },
      { x: bounds.maxX + 3.2, z: bounds.minZ + 7, sx: 5.2, sz: 9.0, h: 2.6 },
      { x: bounds.maxX + 3.6, z: bounds.maxZ - 5, sx: 5.8, sz: 8.8, h: 3.0 },
      { x: bounds.minX + 5, z: bounds.minZ - 3.2, sx: 9.0, sz: 4.8, h: 2.2 },
      { x: bounds.maxX - 4, z: bounds.maxZ + 3.5, sx: 10.0, sz: 5.2, h: 2.4 },
    ];

    for (const anchor of edgeAnchors) {
      const root = new THREE.Group();
      const lumps = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < lumps; i++) {
        const color = L1.rock[Math.floor(Math.random() * L1.rock.length)];
        const lump = new THREE.Mesh(
          new THREE.IcosahedronGeometry(randFloat(0.9, 1.8), 1),
          new THREE.MeshLambertMaterial({ color }),
        );
        lump.position.set(jitter(0, anchor.sx * 0.45), randFloat(0.1, anchor.h), jitter(0, anchor.sz * 0.45));
        lump.scale.set(randFloat(1.2, 2.7), randFloat(0.5, 1.5), randFloat(1.2, 2.9));
        lump.rotation.set(randFloat(-0.25, 0.25), Math.random() * Math.PI, randFloat(-0.25, 0.25));
        root.add(lump);
      }

      const accents = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < accents; i++) {
        const accent = new THREE.Mesh(
          new THREE.PlaneGeometry(randFloat(0.5, 1.4), randFloat(0.08, 0.16)),
          new THREE.MeshBasicMaterial({
            color: L1.highlight[Math.floor(Math.random() * L1.highlight.length)],
            transparent: true,
            opacity: 0.62,
            side: THREE.DoubleSide,
          }),
        );
        accent.position.set(jitter(0, anchor.sx * 0.42), randFloat(0.55, anchor.h + 0.35), jitter(0, anchor.sz * 0.42));
        accent.rotation.set(randFloat(-0.4, 0.4), Math.random() * Math.PI, randFloat(-0.75, 0.75));
        root.add(accent);
      }

      root.position.set(anchor.x, 0, anchor.z);
      root.rotation.y = Math.random() * Math.PI * 2;
      group.add(root);
    }
  }

  #placeLayer1CoralClusters(bounds, group) {
    const anchors = Array.from({ length: 12 }, () => edgeBiasedPosition(bounds, 6.2));

    for (const anchor of anchors) {
      const clusterCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < clusterCount; i++) {
      const cluster = new THREE.Group();
      const pieces = 3 + Math.floor(Math.random() * 6);
      for (let j = 0; j < pieces; j++) {
        const mat = new THREE.MeshLambertMaterial({ color: L1.coral[Math.floor(Math.random() * L1.coral.length)] });
        const h = randFloat(0.25, 0.85);
        let piece;
        const shapePick = Math.random();
        if (shapePick < 0.45) {
          piece = new THREE.Mesh(new THREE.ConeGeometry(randFloat(0.07, 0.16), h, 7), mat);
        } else if (shapePick < 0.8) {
          piece = new THREE.Mesh(new THREE.CylinderGeometry(randFloat(0.025, 0.055), randFloat(0.045, 0.09), h, 6), mat);
        } else {
          piece = new THREE.Mesh(new THREE.SphereGeometry(randFloat(0.08, 0.18), 8, 6), mat);
          piece.scale.y = randFloat(0.6, 1.5);
        }
        piece.position.set(jitter(0, 0.55), h / 2, jitter(0, 0.55));
        piece.rotation.set(jitter(0, 0.28), Math.random() * Math.PI, jitter(0, 0.28));
        piece.userData = { type: 'coral', so: Math.random() * Math.PI * 2 };
        this.animatedObjects.push(piece);
        cluster.add(piece);
      }
        cluster.position.set(
          THREE.MathUtils.clamp(jitter(anchor.x, 2.5), bounds.minX, bounds.maxX),
          0,
          THREE.MathUtils.clamp(jitter(anchor.z, 2.5), bounds.minZ, bounds.maxZ),
        );
      cluster.rotation.y = Math.random() * Math.PI * 2;
      group.add(cluster);
    }
    }
  }

  #placeLayer1Seaweed(bounds, group) {
    const mats = L1.seaweed.map((color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    const makeClump = (anchor, spread) => {
      const clump = new THREE.Group();
      const blades = 4 + Math.floor(Math.random() * 6);
      for (let j = 0; j < blades; j++) {
        const h = randFloat(0.8, 2.4);
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(randFloat(0.08, 0.16), h, 3, 5), mats[Math.floor(Math.random() * mats.length)]);
        blade.position.set(jitter(0, 0.45), h / 2, jitter(0, 0.25));
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.z = jitter(0, 0.15);
        blade.userData = { type: 'seaweed', so: Math.random() * Math.PI * 2, ss: randFloat(0.45, 0.95) };
        this.animatedObjects.push(blade);
        clump.add(blade);
      }
      clump.position.set(
        THREE.MathUtils.clamp(jitter(anchor.x, spread), bounds.minX, bounds.maxX),
        0,
        THREE.MathUtils.clamp(jitter(anchor.z, spread), bounds.minZ, bounds.maxZ),
      );
      group.add(clump);
    };

    const patchAnchors = Array.from({ length: 12 }, () => edgeBiasedPosition(bounds, 6));
    patchAnchors.push(
      new THREE.Vector3(randFloat(bounds.minX + 5, bounds.maxX - 5), 0, randFloat(bounds.minZ + 5, bounds.maxZ - 5)),
      new THREE.Vector3(randFloat(bounds.minX + 5, bounds.maxX - 5), 0, randFloat(bounds.minZ + 5, bounds.maxZ - 5)),
    );
    for (const anchor of patchAnchors) {
      const clumps = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < clumps; i++) makeClump(anchor, 2.2);
    }
  }

  #placeLayer1Bubbles(bounds, group) {
    const bubMat = new THREE.MeshBasicMaterial({ color: L1.bubble, transparent: true, opacity: 0.28, depthWrite: false });
    for (let i = 0; i < 54; i++) {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(randFloat(0.025, 0.075), 8, 6), bubMat);
      bubble.position.set(randFloat(bounds.minX, bounds.maxX), randFloat(0.2, 5.8), randFloat(bounds.minZ, bounds.maxZ));
      bubble.userData = {
        type: 'bubble',
        spd: randFloat(0.18, 0.52),
        minY: randFloat(0.05, 0.6),
        maxY: randFloat(4.8, 7.5),
        drift: randFloat(0.02, 0.08),
        so: Math.random() * Math.PI * 2,
      };
      this.animatedObjects.push(bubble);
      group.add(bubble);
    }
  }

  // ── LAYER 1 — GLB Loading ─────────────────────────────────────────

  #loadLayer1GLB(bounds) {
    // Try loading the_deep_scene.glb first (has named nodes)
    this.#loadGLB('/glb/the_deep_scene.glb', (gltf) => {
      this.#placeScene(gltf.scene, bounds);
    }, () => {
      // Fallback: load individual files
      this.#loadIndividualL1(bounds);
    });
  }

  #placeLayer1RestorablePoints(bounds, seaweedGltf, coralsGltf) {
    const counts = { seaweed: 25, corals: 20 };
    const deadMat = new THREE.MeshStandardMaterial({ color: 0x3a4a4a, roughness: 0.8, metalness: 0.2 });

    const assets = { seaweed: seaweedGltf, corals: coralsGltf };

    for (const [type, count] of Object.entries(counts)) {
      const root = assets[type]?.scene;
      if (!root) continue;
      
      let src = null;
      root.traverse(c => { if (!src && (c.isMesh || c.isGroup)) src = c; });
      if (!src) continue;

      for (let i = 0; i < count; i++) {
        const clone = src.clone(true);
        clone.isRestored = false;
        clone.userData = { type, so: Math.random() * Math.PI * 2, targetScale: 0.6 + Math.random() * 0.8 };
        
        clone.position.set(
          randFloat(bounds.minX, bounds.maxX),
          0.05,
          randFloat(bounds.minZ, bounds.maxZ)
        );
        clone.rotation.y = Math.random() * Math.PI * 2;
        clone.scale.setScalar(0.01); // Start tiny/dormant

        // Make it look "Dormant" but visible
        clone.traverse(child => {
          if (child.isMesh) {
            child.userData.originalMat = child.material;
            child.material = deadMat.clone();
          }
        });

        this.group.add(clone);
        this.restorableObjects.push(clone);
      }
    }
  }

  #placeLayer1Rocks(bounds) {
    this.#loadGLB('/glb/rocks.glb', (gltf) => {
      const src = gltf.scene;
      for (let i = 0; i < 15; i++) {
        const clone = src.clone(true);
        clone.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
        clone.rotation.y = Math.random() * Math.PI * 2;
        clone.scale.setScalar(0.8 + Math.random() * 1.5);
        this.group.add(clone);
      }
    });
  }

  #placeBubbleVents(bounds) {
    this.bubbleVents = [];
    for (let i = 0; i < 8; i++) {
      this.bubbleVents.push({
        position: new THREE.Vector3(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ)),
        timer: Math.random()
      });
    }
  }

  #loadGLB(path, onSuccess, onError) {
    if (this._loadedGLBs[path]) {
      onSuccess(this._loadedGLBs[path]);
      return;
    }
    this._loader.load(path,
      (gltf) => { this._loadedGLBs[path] = gltf; onSuccess(gltf); },
      undefined,
      (err) => { console.warn(`GLB load failed: ${path}`, err); onError?.(); },
    );
  }

  // Place the scene GLB — spread instances across the grid
  #placeScene(root, bounds) {
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;

    // Group named nodes
    const nodeMap = {};
    root.traverse(child => {
      if (child.isMesh || child.isGroup) {
        const key = child.name?.split('_')[0]?.toLowerCase() || 'misc';
        if (!nodeMap[key]) nodeMap[key] = [];
        nodeMap[key].push(child);
      }
    });

    // How many instances of each type to scatter
    const spawnRules = {
      seaweed: 35, rocks: 20, corals: 18, debris: 25, bubbles: 18,
      // fallback for merged / unnamed
      mesh: 20, default: 15,
    };

    for (const [key, meshes] of Object.entries(nodeMap)) {
      const count = spawnRules[key] ?? spawnRules.default;
      const src   = meshes[0]; // use first mesh of this type as template
      for (let i = 0; i < count; i++) {
        const clone = src.clone(true);
        const px = randFloat(bounds.minX, bounds.maxX);
        const pz = randFloat(bounds.minZ, bounds.maxZ);
        const scale = 0.6 + Math.random() * 0.8;
        clone.position.set(px, 0, pz);
        clone.rotation.y = Math.random() * Math.PI * 2;
        clone.scale.setScalar(scale);
        this.group.add(clone);

        // Mark for animation
        if (key === 'seaweed') {
          clone.userData = { type: 'glbSeaweed', so: Math.random() * Math.PI * 2, ss: 0.5 + Math.random() * 0.5 };
          this.animatedObjects.push(clone);
        } else if (key === 'bubbles') {
          clone.userData = { type: 'bubble', spd: 0.15 + Math.random() * 0.35 };
          clone.position.y = Math.random() * 3;
          this.animatedObjects.push(clone);
        } else if (key === 'corals') {
          clone.userData = { type: 'coral', so: Math.random() * Math.PI * 2 };
          this.animatedObjects.push(clone);
        }
      }
    }

    console.log(`[EnvironmentAssets] Layer 1 GLB loaded. Node groups: ${Object.keys(nodeMap).join(', ')}`);
  }

  // Individual GLB fallback
  #loadIndividualL1(bounds) {
    const files = ['seaweed', 'rocks', 'corals', 'debris', 'bubbles'];
    const counts = { seaweed: 35, rocks: 20, corals: 18, debris: 25, bubbles: 18 };

    for (const name of files) {
      this.#loadGLB(`/glb/${name}.glb`, (gltf) => {
        this.#scatterGLB(gltf.scene, counts[name] ?? 15, bounds, name);
      });
    }
  }

  #scatterGLB(root, count, bounds, type) {
    // Find the first mesh or group
    let src = null;
    root.traverse(c => { if (!src && (c.isMesh || c.isGroup)) src = c; });
    if (!src) return;

    for (let i = 0; i < count; i++) {
      const clone = src.clone(true);
      const scale = 0.5 + Math.random() * 0.9;
      clone.position.set(
        randFloat(bounds.minX, bounds.maxX),
        type === 'bubbles' ? Math.random() * 3 : 0,
        randFloat(bounds.minZ, bounds.maxZ),
      );
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.scale.setScalar(scale);
      this.group.add(clone);

      if (type === 'seaweed') {
        clone.userData = { type: 'glbSeaweed', so: Math.random() * Math.PI * 2, ss: 0.5 + Math.random() * 0.6 };
        this.animatedObjects.push(clone);
      } else if (type === 'bubbles') {
        clone.userData = { type: 'bubble', spd: 0.12 + Math.random() * 0.4 };
        this.animatedObjects.push(clone);
      } else if (type === 'corals') {
        clone.userData = { type: 'coral', so: Math.random() * Math.PI * 2 };
        this.animatedObjects.push(clone);
      }
    }
  }

  // ── LAYER 2 — Coastal Reef (procedural) ──────────────────────────
  #buildLayer2(bounds) {
    this.#placeCoralFans(bounds);
    this.#placeSeagrass(bounds);
    this.#placeRocks(bounds, L2.rock, 0x384a58, 22);
    this.#placeStarfish(bounds);
    this.#placeSandRipples(bounds);
    this.#placeLayer2Pollution(bounds);
  }

  #placeLayer2Pollution(bounds) {
    const sludgeMat = new THREE.MeshBasicMaterial({ color: 0x111018, transparent: true, opacity: 0.68 });
    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x31241d });

    for (let i = 0; i < 14; i++) {
      const root = new THREE.Group();
      const polluted = new THREE.Group();
      const slick = new THREE.Mesh(new THREE.CylinderGeometry(randFloat(0.45, 0.9), randFloat(0.55, 1.05), 0.035, 16), sludgeMat);
      slick.position.y = 0.04;
      polluted.add(slick);

      for (let j = 0; j < 2 + Math.floor(Math.random() * 3); j++) {
        const debris = new THREE.Mesh(new THREE.BoxGeometry(randFloat(0.12, 0.28), 0.06, randFloat(0.25, 0.55)), debrisMat);
        debris.position.set(jitter(0, 0.65), 0.08, jitter(0, 0.65));
        debris.rotation.y = Math.random() * Math.PI;
        polluted.add(debris);
      }

      const restored = this.#makeLayer2RestoredPatch();
      root.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
      root.rotation.y = Math.random() * Math.PI * 2;
      root.add(polluted, restored);
      this.group.add(root);
      this.restorableObjects.push({
        root,
        polluted,
        restored,
        restoredDone: false,
        queued: false,
        checkTimer: Math.random() * 0.35,
      });
    }
  }

  #makeLayer2RestoredPatch() {
    const group = new THREE.Group();
    group.visible = false;
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x38a86a, side: THREE.DoubleSide });
    const coralMats = [L2.coral1, L2.coral2, L2.coral3, L2.coral4].map((color) => new THREE.MeshLambertMaterial({ color }));

    for (let i = 0; i < 10; i++) {
      const h = randFloat(0.25, 0.75);
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.07, h), grassMat);
      blade.position.set(jitter(0, 0.9), h / 2, jitter(0, 0.9));
      blade.rotation.y = Math.random() * Math.PI;
      blade.userData = { type: 'seaweed', so: Math.random() * Math.PI * 2, ss: randFloat(0.8, 1.3) };
      group.add(blade);
      this.animatedObjects.push(blade);
    }

    for (let i = 0; i < 4; i++) {
      const h = randFloat(0.25, 0.48);
      const coral = new THREE.Mesh(
        new THREE.ConeGeometry(randFloat(0.12, 0.22), h, 7),
        coralMats[Math.floor(Math.random() * coralMats.length)],
      );
      coral.position.set(jitter(0, 0.7), h / 2, jitter(0, 0.7));
      coral.rotation.z = jitter(0, 0.25);
      coral.userData = { type: 'coral', so: Math.random() * Math.PI * 2 };
      group.add(coral);
      this.animatedObjects.push(coral);
    }

    return group;
  }

  #updateRestorableObjects(tileGrid, dt) {
    if (!this.restorableObjects.length) return;

    this.restoreCooldown = Math.max(0, this.restoreCooldown - dt);
    if (this.restoreCooldown <= 0 && this.restoreQueue.length) {
      const item = this.restoreQueue.shift();
      item.restoredDone = true;
      item.queued = false;
      item.polluted.visible = false;
      item.restored.visible = true;
      this.restoreCooldown = 0.1;
    }

    if (!tileGrid) return;

    for (const item of this.restorableObjects) {
      if (item.restoredDone || item.queued) continue;
      item.checkTimer -= dt;
      if (item.checkTimer > 0) continue;
      item.checkTimer = 0.25 + Math.random() * 0.25;
      if (!this.#isCleanPatch(tileGrid, item.root.position, 1.3)) continue;
      item.queued = true;
      this.restoreQueue.push(item);
    }
  }

  #isCleanPatch(tileGrid, position, radius) {
    const nearby = tileGrid.getNearbyTileIndices(position, radius);
    if (!nearby.length) return false;
    const cleanCount = nearby.filter((index) => tileGrid.tiles[index]?.state === 'clean').length;
    return cleanCount / nearby.length >= 0.55;
  }

  #placeCoralFans(bounds) {
    const cols = [L2.coral1, L2.coral2, L2.coral3, L2.coral4];
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const col = cols[Math.floor(Math.random() * cols.length)];
      const mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
      const h = 0.5 + Math.random() * 0.8;
      for (let j = 0; j < 5 + Math.floor(Math.random() * 4); j++) {
        const a = (j / 9) * Math.PI * 1.6 - 0.8;
        const fan = new THREE.Mesh(new THREE.CircleGeometry(h * 0.5, 6), mat);
        fan.position.set(Math.cos(a) * 0.05, h * 0.5, Math.sin(a) * 0.05);
        fan.rotation.y = a;
        fan.userData = { type: 'coral', so: Math.random() * Math.PI * 2 };
        this.animatedObjects.push(fan);
        g.add(fan);
      }
      g.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
      g.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(g);
    }
  }

  #placeSeagrass(bounds) {
    const mat = new THREE.MeshLambertMaterial({ color: L2.seagrass, side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 3 + Math.floor(Math.random() * 4); j++) {
        const h = 0.3 + Math.random() * 0.5;
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.08, h), mat);
        blade.position.set(jitter(0, 0.1), h / 2, jitter(0, 0.05));
        blade.rotation.y = Math.random() * Math.PI;
        blade.userData = { type: 'seaweed', so: Math.random() * Math.PI * 2, ss: 0.6 + Math.random() * 0.5 };
        this.animatedObjects.push(blade);
        g.add(blade);
      }
      g.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
      this.group.add(g);
    }
  }

  #placeStarfish(bounds) {
    const mat = new THREE.MeshLambertMaterial({ color: L2.star });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      for (let arm = 0; arm < 5; arm++) {
        const a = (arm / 5) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.05, 5), mat);
        m.scale.z = 3;
        m.position.set(Math.cos(a) * 0.12, 0.025, Math.sin(a) * 0.12);
        m.rotation.y = a + Math.PI / 2;
        g.add(m);
      }
      g.position.set(randFloat(bounds.minX, bounds.maxX), 0.01, randFloat(bounds.minZ, bounds.maxZ));
      g.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(g);
    }
  }

  #placeSandRipples(bounds) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a7a60, side: THREE.DoubleSide });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.4 + Math.random() * 0.5, 0.03, 4, 20), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(randFloat(bounds.minX, bounds.maxX), 0.02, randFloat(bounds.minZ, bounds.maxZ));
      this.group.add(m);
    }
  }

  // ── LAYER 3 — Surface / Land (procedural) ────────────────────────
  #buildLayer3(bounds) {
    this.#placeTrees(bounds);
    this.#placeBushes(bounds);
    this.#placeFlowers(bounds);
    this.#placeGrassTufts(bounds);
    this.#placeRocks(bounds, 0x5a5a4a, 0x4a4a3a, 12);
    this.#placeLayer3Growth(bounds);
  }

  #placeBushes(bounds) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a7a30 });
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const r = 0.2 + Math.random() * 0.25;
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat);
        b.position.set(jitter(0, 0.2), r * 0.7, jitter(0, 0.2));
        g.add(b);
      }
      g.position.copy(safePosition(bounds));
      this.group.add(g);
    }
  }

  #placeLayer3Growth(bounds) {
    const leafMats = [0x2d9a42, 0x43b84f, 0x6bcf55].map((color) => new THREE.MeshLambertMaterial({ color }));
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x6a4524 });

    for (let i = 0; i < 28; i++) {
      const plant = new THREE.Group();
      const isTree = i % 3 === 0;
      if (isTree) {
        const h = randFloat(0.75, 1.35);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, h, 6), barkMat);
        trunk.position.y = h / 2;
        plant.add(trunk);
        for (let j = 0; j < 2; j++) {
          const crown = new THREE.Mesh(
            new THREE.ConeGeometry(randFloat(0.22, 0.36), randFloat(0.55, 0.8), 7),
            leafMats[Math.floor(Math.random() * leafMats.length)],
          );
          crown.position.y = h + j * 0.28;
          plant.add(crown);
        }
      } else {
        for (let j = 0; j < 4 + Math.floor(Math.random() * 4); j++) {
          const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(randFloat(0.12, 0.22), 7, 5),
            leafMats[Math.floor(Math.random() * leafMats.length)],
          );
          leaf.scale.set(randFloat(0.8, 1.4), randFloat(0.45, 0.8), randFloat(0.8, 1.4));
          leaf.position.set(jitter(0, 0.35), randFloat(0.12, 0.42), jitter(0, 0.35));
          plant.add(leaf);
        }
      }

      plant.position.copy(safePosition(bounds));
      plant.rotation.y = Math.random() * Math.PI * 2;
      plant.scale.setScalar(0.01);
      plant.visible = false;
      plant.userData = {
        targetScale: randFloat(0.8, 1.25),
        unlockPct: 18 + (i / 27) * 78,
      };
      this.group.add(plant);
      this.growthObjects.push(plant);
    }
  }

  #updateGrowthObjects(tileGrid) {
    if (!tileGrid || !this.growthObjects.length) return;
    const pct = tileGrid.cleanedPercent;
    for (const plant of this.growthObjects) {
      if (pct < plant.userData.unlockPct) continue;
      plant.visible = true;
      const target = plant.userData.targetScale;
      plant.scale.lerp(new THREE.Vector3(target, target, target), 0.035);
    }
  }

  #placeTrees(bounds) {
    const barkMat = new THREE.MeshLambertMaterial({ color: L3.bark });
    const leafCols = [L3.leaf, L3.leaf2];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const h = 1.0 + Math.random() * 1.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, h, 6), barkMat);
      trunk.position.y = h / 2;
      g.add(trunk);
      const leafMat = new THREE.MeshLambertMaterial({ color: leafCols[Math.floor(Math.random() * 2)] });
      for (let t = 0; t < 2 + Math.floor(Math.random() * 2); t++) {
        const r = 0.3 + Math.random() * 0.3;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2, 7), leafMat);
        cone.position.y = h + t * r * 0.8;
        g.add(cone);
      }
      g.position.copy(safePosition(bounds));
      g.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(g);
    }
  }

  #placeFlowers(bounds) {
    const cols = [L3.flower1, L3.flower2];
    for (let i = 0; i < 35; i++) {
      const g = new THREE.Group();
      const col = cols[Math.floor(Math.random() * 2)];
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x4a8a30 });
      const stemH = 0.2 + Math.random() * 0.3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, stemH, 4), stemMat);
      stem.position.y = stemH / 2;
      g.add(stem);
      const petalMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.CircleGeometry(0.07, 5), petalMat);
        petal.position.set(Math.cos(a) * 0.06, stemH + 0.01, Math.sin(a) * 0.06);
        petal.rotation.x = -Math.PI / 2;
        g.add(petal);
      }
      const center = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8),
        new THREE.MeshBasicMaterial({ color: 0xffee00 }));
      center.position.set(0, stemH + 0.015, 0);
      center.rotation.x = -Math.PI / 2;
      g.add(center);
      g.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
      this.group.add(g);
    }
  }

  #placeGrassTufts(bounds) {
    const mat = new THREE.MeshLambertMaterial({ color: L3.grass, side: THREE.DoubleSide });
    for (let i = 0; i < 55; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4 + Math.floor(Math.random() * 5); j++) {
        const h = 0.12 + Math.random() * 0.22;
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), mat);
        blade.position.set(jitter(0, 0.1), h / 2, jitter(0, 0.05));
        blade.rotation.y = Math.random() * Math.PI;
        blade.userData = { type: 'seaweed', so: Math.random() * Math.PI * 2, ss: 1.0 + Math.random() };
        this.animatedObjects.push(blade);
        g.add(blade);
      }
      g.position.set(randFloat(bounds.minX, bounds.maxX), 0, randFloat(bounds.minZ, bounds.maxZ));
      this.group.add(g);
    }
  }

  // ── Shared ────────────────────────────────────────────────────────
  #placeRocks(bounds, colA, colB, count) {
    for (let i = 0; i < count; i++) {
      const r = 0.15 + Math.random() * 0.28;
      const col = Math.random() > 0.5 ? colA : colB;
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      const cs = [];
      const c = new THREE.Color(col);
      for (let ii = 0; ii < p.count; ii++) {
        p.setY(ii, p.getY(ii) * (0.4 + Math.random() * 0.3));
        const sh = c.clone().lerp(new THREE.Color(0x0a1a25), Math.random() * 0.15);
        cs.push(sh.r, sh.g, sh.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
      g.computeVertexNormals();
      const me = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      me.position.set(randFloat(bounds.minX, bounds.maxX), r * 0.3, randFloat(bounds.minZ, bounds.maxZ));
      me.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.2);
      this.group.add(me);
    }
  }
}

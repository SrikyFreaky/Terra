import * as THREE from 'three';
import {
  SLICK_MAX_BLOBS,
  SLICK_REPOLLUTE_INTERVAL,
  SLICK_REPOLLUTE_RADIUS,
  SLICK_SPLIT_INTERVAL,
  SLICK_SPEED,
} from './config.js';

export const SLICK_MAX_HP = SLICK_MAX_BLOBS; // 1 HP per blob

// ── Visual palette ─────────────────────────────────────────────────
const BLOB_COLOR   = 0x1a1a2e;
const BLOB_OUTLINE = 0x4a3a8a;
const BLOB_LIGHT   = 0x6040c0;

export class Slick {
  constructor(bounds) {
    this.bounds = bounds;
    this.isAlive = true;
    this.repolluteTimer = 0;
    this.splitTimer = 0;
    this.blobs = [];
    this.dissolvingBlobs = [];

    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0.06, 0);

    // Start with 1 blob; it splits up to SLICK_MAX_BLOBS
    this.#addBlob(bounds.maxX - 5, bounds.minZ + 5, -0.7, 1);

    // DOM HP bar
    this.#buildHPBar();
  }

  #buildHPBar() {
    this.hpBar = document.createElement('div');
    this.hpBar.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      z-index:10;text-align:center;opacity:0;transition:opacity .5s;pointer-events:none;
    `;
    this.hpBar.innerHTML = `
      <div style="font-family:'Chakra Petch',sans-serif;font-size:11px;font-weight:700;
        letter-spacing:2px;text-transform:uppercase;color:#7060d0;margin-bottom:5px;
        text-shadow:0 0 8px #7060d0">THE SLICK</div>
      <div style="width:280px;height:7px;background:#0a081e;border-radius:4px;
        border:1px solid rgba(100,70,200,.3);overflow:hidden;">
        <div id="slick-hp-fill" style="height:100%;width:100%;border-radius:4px;
          background:linear-gradient(90deg,#3a2080,#7060d0);
          transition:width .3s;box-shadow:0 0 6px #7060d0;"></div>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a5a6a;
        margin-top:4px;">Use <span style="background:rgba(42,138,122,.08);border:1px solid
        rgba(42,138,122,.15);border-radius:3px;padding:1px 5px;">Basket / Net / Sand Filter</span>
        then press <span style="background:rgba(42,138,122,.08);border:1px solid
        rgba(42,138,122,.15);border-radius:3px;padding:1px 5px;">E</span> near a blob</div>
    `;
    document.body.appendChild(this.hpBar);
  }

  showHPBar() {
    this.hpBar.style.opacity = '1';
  }

  #updateHPBar() {
    const fill = document.getElementById('slick-hp-fill');
    if (fill) fill.style.width = `${(this.blobs.length / SLICK_MAX_BLOBS) * 100}%`;
  }

  update(deltaTime, tileGrid) {
    if (!this.isAlive) return;

    this.#move(deltaTime);
    this.#updateDissolvingBlobs(deltaTime);
    this.repolluteTimer += deltaTime;
    this.splitTimer += deltaTime;

    if (this.splitTimer >= SLICK_SPLIT_INTERVAL && this.blobs.length < SLICK_MAX_BLOBS) {
      this.splitTimer = 0;
      this.#splitBlob();
    }

    if (this.repolluteTimer >= SLICK_REPOLLUTE_INTERVAL) {
      this.repolluteTimer = 0;
      for (const blob of this.blobs) {
        const wp = new THREE.Vector3();
        blob.mesh.getWorldPosition(wp);
        tileGrid.dirtyNearbyCleanTile(wp, SLICK_REPOLLUTE_RADIUS);
      }
    }

    // Pulse blob opacity
    for (const blob of this.blobs) {
      const disc = blob.mesh.children[0];
      if (disc?.material) {
        disc.material.opacity = 0.55 + Math.sin(Date.now() * 0.003 + blob.phase) * 0.25;
      }
      const core = blob.mesh.children.find((child) => child.userData.type === 'slickCore');
      if (core) {
        core.position.y = Math.sin(Date.now() * 0.004 + blob.phase) * 0.08;
        core.rotation.y = Math.sin(Date.now() * 0.002 + blob.phase) * 0.28;
      }
    }
  }

  defeatBlobNear(playerPosition, range) {
    let closest = null;
    let closestDist = Infinity;

    for (const blob of this.blobs) {
      const wp = new THREE.Vector3();
      blob.mesh.getWorldPosition(wp);
      const d = playerPosition.distanceTo(wp);
      if (d <= range && d < closestDist) { closest = blob; closestDist = d; }
    }

    if (!closest) return false;

    this.dissolvingBlobs.push(closest.mesh);
    this.blobs = this.blobs.filter((b) => b !== closest);
    this.#updateHPBar();

    if (this.blobs.length === 0) {
      this.isAlive = false;
      this.hpBar.style.opacity = '0';
      setTimeout(() => this.hpBar.remove(), 600);
      console.log('The Slick is defeated!');
    }

    return true;
  }

  #updateDissolvingBlobs(deltaTime) {
    for (let i = this.dissolvingBlobs.length - 1; i >= 0; i--) {
      const blob = this.dissolvingBlobs[i];
      blob.scale.multiplyScalar(1 - deltaTime * 3.5);
      blob.position.y += deltaTime * 0.2;
      blob.traverse((child) => {
        if (!child.material) return;
        child.material.transparent = true;
        child.material.opacity = Math.max(0, (child.material.opacity ?? 1) - deltaTime * 2.5);
      });
      if (blob.scale.x < 0.08) {
        this.mesh.remove(blob);
        this.dissolvingBlobs.splice(i, 1);
      }
    }
  }

  defeat(scene) {
    if (!this.isAlive) return;
    this.isAlive = false;
    scene.remove(this.mesh);
    this.hpBar.style.opacity = '0';
    setTimeout(() => this.hpBar.remove(), 600);
    console.log('The Slick is defeated!');
  }

  #move(deltaTime) {
    for (const blob of this.blobs) {
      blob.mesh.position.addScaledVector(blob.direction, SLICK_SPEED * deltaTime);

      if (blob.mesh.position.x <= this.bounds.minX || blob.mesh.position.x >= this.bounds.maxX) {
        blob.direction.x *= -1;
        blob.mesh.position.x = THREE.MathUtils.clamp(blob.mesh.position.x, this.bounds.minX, this.bounds.maxX);
      }
      if (blob.mesh.position.z <= this.bounds.minZ || blob.mesh.position.z >= this.bounds.maxZ) {
        blob.direction.z *= -1;
        blob.mesh.position.z = THREE.MathUtils.clamp(blob.mesh.position.z, this.bounds.minZ, this.bounds.maxZ);
      }
    }
  }

  #splitBlob() {
    const parent = this.blobs[this.blobs.length - 1];
    const pp = parent.mesh.position;
    const offset = new THREE.Vector3(parent.direction.z, 0, -parent.direction.x).multiplyScalar(2.4);
    const x = THREE.MathUtils.clamp(pp.x + offset.x, this.bounds.minX, this.bounds.maxX);
    const z = THREE.MathUtils.clamp(pp.z + offset.z, this.bounds.minZ, this.bounds.maxZ);
    this.#addBlob(x, z, -parent.direction.z, parent.direction.x);
  }

  #addBlob(x, z, dirX, dirZ) {
    const group = new THREE.Group();

    // Main disc
    const geo = new THREE.CylinderGeometry(1.1, 1.3, 0.18, 18);
    const mat = new THREE.MeshBasicMaterial({
      color: BLOB_COLOR, transparent: true, opacity: 0.75,
    });
    const disc = new THREE.Mesh(geo, mat);
    group.add(disc);

    const core = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x2d2455, transparent: true, opacity: 0.92 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), coreMat);
    head.scale.set(1.15, 0.72, 1);
    head.position.y = 0.34;
    core.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc6fff5 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x080416 });
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 5), eyeMat);
      eye.position.set(ex, 0.41, 0.28);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), pupilMat);
      pupil.position.set(ex, 0.41, 0.325);
      core.add(eye, pupil);
    }

    const antennaMat = new THREE.MeshBasicMaterial({ color: 0x7060d0, transparent: true, opacity: 0.75 });
    for (const ex of [-0.13, 0.13]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.38, 5), antennaMat);
      stalk.position.set(ex, 0.66, 0.03);
      stalk.rotation.z = ex * 1.8;
      core.add(stalk);
    }
    core.userData = { type: 'slickCore', phase: Math.random() * Math.PI * 2 };
    group.add(core);

    // Glowing ring on top
    const rGeo = new THREE.RingGeometry(1.05, 1.3, 18);
    const rMat = new THREE.MeshBasicMaterial({
      color: BLOB_OUTLINE, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    // Point light inside
    const light = new THREE.PointLight(BLOB_LIGHT, 0.6, 4);
    light.position.y = 0.5;
    group.add(light);

    group.position.set(x, 0, z);
    this.mesh.add(group);

    this.blobs.push({
      mesh: group,
      direction: new THREE.Vector3(dirX, 0, dirZ).normalize(),
      phase: Math.random() * Math.PI * 2,
    });
  }
}

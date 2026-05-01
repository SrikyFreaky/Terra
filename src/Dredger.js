import * as THREE from 'three';
import { DREDGER_SPEED, DREDGER_REPOLLUTE_INTERVAL } from './config.js';

export const DREDGER_MAX_HP = 60;

// Attack phases based on HP thresholds
// Phase 1 (>60%): slow single shots
// Phase 2 (30-60%): faster burst of 3
// Phase 3 (<30%): rapid spread + contact ram

export class Dredger {
  constructor(bounds) {
    this.bounds = bounds;
    this.isAlive = true;
    this.isShuttingDown = false;
    this.hp = DREDGER_MAX_HP;
    this.repolluteTimer = 0;
    this.attackTimer = 0;
    this.burstCount = 0;
    this.burstTimer = 0;
    this.isBursting = false;
    this.direction = new THREE.Vector3(1, 0, 0.6).normalize();
    this.elapsedTime = 0;

    this.mesh = this.#buildModel();
    this.mesh.position.set(bounds.minX + 6, 0, bounds.minZ + 6);
    this.#buildHPBar();
  }

  get phase() {
    const pct = this.hp / DREDGER_MAX_HP;
    if (pct > 0.6) return 1;
    if (pct > 0.3) return 2;
    return 3;
  }

  #buildModel() {
    const group = new THREE.Group();

    // ── Main chassis hull ──────────────────────────────────────────
    const hullMat  = new THREE.MeshLambertMaterial({ color: 0x2a2f35 });
    const rustMat  = new THREE.MeshLambertMaterial({ color: 0x6b3a22 });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x404850 });
    const warnMat  = new THREE.MeshLambertMaterial({ color: 0xcc8800 });
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x181c20 });

    // Main body — wide, low industrial slab
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 4.2), hullMat);
    hull.position.y = 0.45;
    group.add(hull);

    // Armored side plates
    for (const sx of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 4.0), steelMat);
      plate.position.set(sx * 1.55, 0.55, 0);
      group.add(plate);
      // Rivets row
      for (let rz = -1.5; rz <= 1.5; rz += 0.75) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), darkMat);
        rivet.position.set(sx * 1.67, 0.7, rz);
        group.add(rivet);
      }
    }

    // ── Cabin / control tower ──────────────────────────────────────
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.4), rustMat);
    cabin.position.set(0, 1.4, -1.0);
    group.add(cabin);

    // Cabin windows
    const winMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7 });
    for (const wx of [-0.4, 0.4]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), winMat);
      win.position.set(wx, 1.5, -0.285);
      group.add(win);
    }

    // Antenna
    const antMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), antMat);
    ant.position.set(0.5, 2.4, -1.0);
    group.add(ant);
    const antBulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xff2200 }));
    antBulb.position.set(0.5, 3.05, -1.0);
    group.add(antBulb);
    this.antBulb = antBulb; // for flashing

    // ── Drill arm (front, +Z) ──────────────────────────────────────
    const drillArmMat = new THREE.MeshLambertMaterial({ color: 0x383f48 });
    const drillArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.8), drillArmMat);
    drillArm.position.set(0, 0.55, 2.4);
    group.add(drillArm);

    // Drill cone
    const drillMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    this.drillMesh = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.4, 8), drillMat);
    this.drillMesh.rotation.x = -Math.PI / 2;
    this.drillMesh.position.set(0, 0.48, 3.6);
    group.add(this.drillMesh);

    // Drill tip glow
    this.drillLight = new THREE.PointLight(0xff4400, 0.9, 4);
    this.drillLight.position.set(0, 0.5, 4.2);
    group.add(this.drillLight);

    // ── Exhaust stacks ─────────────────────────────────────────────
    for (const ex of [-0.6, 0.6]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), darkMat);
      stack.position.set(ex, 1.7, -0.3);
      group.add(stack);
    }

    // ── Tracks / treads on bottom ──────────────────────────────────
    for (const tx of [-1.25, 1.25]) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 4.0), darkMat);
      tread.position.set(tx, -0.14, 0);
      group.add(tread);
      // Tread bolts
      for (let tz = -1.6; tz <= 1.6; tz += 0.5) {
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.06), steelMat);
        bolt.position.set(tx, -0.01, tz);
        group.add(bolt);
      }
    }

    // ── Warning stripes on front ───────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.04),
        i % 2 === 0 ? warnMat : darkMat);
      stripe.position.set(-0.33 + i * 0.22, 0.45, 2.12);
      group.add(stripe);
    }

    // ── Ambient glow under chassis ─────────────────────────────────
    this.hullLight = new THREE.PointLight(0xff3300, 0.7, 5);
    this.hullLight.position.set(0, -0.2, 0);
    group.add(this.hullLight);

    return group;
  }

  #buildHPBar() {
    this.hpBar = document.createElement('div');
    this.hpBar.style.cssText = `
      position:fixed; bottom:48px; left:50%; transform:translateX(-50%);
      z-index:10; text-align:center; opacity:0; transition:opacity .5s; pointer-events:none;
    `;
    this.hpBar.innerHTML = `
      <div style="font-family:'Chakra Petch',sans-serif;font-size:11px;font-weight:700;
        letter-spacing:2px;text-transform:uppercase;color:#ff4400;margin-bottom:5px;
        text-shadow:0 0 8px #ff4400">THE DREDGER</div>
      <div style="width:320px;height:8px;background:#0a0808;border-radius:4px;
        border:1px solid rgba(255,68,0,.3);overflow:hidden;">
        <div id="dredger-hp-fill" style="height:100%;width:100%;border-radius:4px;
          background:linear-gradient(90deg,#8a1a00,#ff4400);
          transition:width .3s;box-shadow:0 0 8px #ff4400;"></div>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a5a6a;margin-top:4px;">
        Clean around it, stand close, then press <span style="background:rgba(255,68,0,.1);border:1px solid rgba(255,68,0,.2);
        border-radius:3px;padding:1px 5px;">E</span></div>
    `;
    document.body.appendChild(this.hpBar);
  }

  showHPBar() { this.hpBar.style.opacity = '1'; }

  takeDamage(amt) {
    if (!this.isAlive) return;
    this.hp = Math.max(0, this.hp - amt);
    const fill = document.getElementById('dredger-hp-fill');
    if (fill) fill.style.width = `${(this.hp / DREDGER_MAX_HP) * 100}%`;
    // Color shifts red → dark as damaged
    if (this.phase === 3 && fill) fill.style.background = 'linear-gradient(90deg,#2a0000,#aa1100)';
  }

  update(deltaTime, elapsedSeconds, tileGrid, playerPos, onAttack) {
    if (this.isShuttingDown) {
      this.mesh.scale.multiplyScalar(1 - deltaTime * 1.8);
      this.mesh.position.y += deltaTime * 0.25;
      this.mesh.traverse((child) => {
        if (!child.material) return;
        child.material.transparent = true;
        child.material.opacity = Math.max(0, (child.material.opacity ?? 1) - deltaTime * 1.6);
      });
      if (this.hullLight) this.hullLight.intensity = Math.max(0, this.hullLight.intensity - deltaTime * 1.5);
      if (this.drillLight) this.drillLight.intensity = Math.max(0, this.drillLight.intensity - deltaTime * 2);
      return;
    }
    if (!this.isAlive) return;
    this.elapsedTime += deltaTime;

    // Speed ramps with phase
    const speedMult = this.phase === 3 ? 2.0 : this.phase === 2 ? 1.4 : 1.0;
    this.mesh.position.addScaledVector(this.direction, DREDGER_SPEED * speedMult * deltaTime);

    // Bounce bounds
    const p = this.mesh.position;
    if (p.x <= this.bounds.minX + 1 || p.x >= this.bounds.maxX - 1) this.direction.x *= -1;
    if (p.z <= this.bounds.minZ + 1 || p.z >= this.bounds.maxZ - 1) this.direction.z *= -1;

    // Face movement direction
    this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);

    // Animate drill spin
    this.drillMesh.rotation.z += deltaTime * (this.phase === 3 ? 8 : 4);

    // Drill light pulse
    this.drillLight.intensity = 0.6 + Math.sin(elapsedSeconds * 6) * 0.4;

    // Hull light flicker in phase 3
    if (this.phase === 3) {
      this.hullLight.intensity = 0.5 + Math.random() * 0.5;
      this.hullLight.color.set(0xff1100);
    }

    // Antenna blink
    this.antBulb.material.color.set(
      Math.sin(elapsedSeconds * 3) > 0 ? 0xff2200 : 0x331100
    );

    // ── Attack logic ───────────────────────────────────────────────
    const dist = p.distanceTo(playerPos);
    const attackInterval = this.phase === 3 ? 1.8 : this.phase === 2 ? 2.8 : 4.0;

    // Burst mode (phase 2+)
    if (this.isBursting) {
      this.burstTimer += deltaTime;
      if (this.burstTimer >= 0.28) {
        this.burstTimer = 0;
        this.burstCount--;
        onAttack(this.mesh.position.clone(), playerPos.clone(), this.phase);
        if (this.burstCount <= 0) this.isBursting = false;
      }
    } else {
      this.attackTimer += deltaTime;
      if (this.attackTimer >= attackInterval && dist < 18) {
        this.attackTimer = 0;
        const shots = this.phase === 3 ? 3 : this.phase === 2 ? 2 : 1;
        if (shots === 1) {
          onAttack(this.mesh.position.clone(), playerPos.clone(), this.phase);
        } else {
          this.isBursting = true;
          this.burstCount = shots - 1;
          this.burstTimer = 0;
          onAttack(this.mesh.position.clone(), playerPos.clone(), this.phase);
        }
      }
    }

    // Phase 3: ram damage at close range
    if (this.phase === 3 && dist < 2.2) {
      // Signal via onAttack with phase=99 (contact flag)
      onAttack(this.mesh.position.clone(), playerPos.clone(), 99);
    }
  }

  defeat(scene) {
    this.isAlive = false;
    this.isShuttingDown = true;
    this.hpBar.style.opacity = '0';
    setTimeout(() => this.hpBar.remove(), 700);
    setTimeout(() => scene.remove(this.mesh), 900);
  }
}

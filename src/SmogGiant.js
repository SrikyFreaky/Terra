import * as THREE from 'three';
import {
  SMOG_GIANT_REPOLLUTE_INTERVAL,
  SMOG_GIANT_SPEED,
  SMOG_GIANT_DEFEAT_RANGE,
} from './config.js';

export const SMOG_GIANT_MAX_HP = 8;

export class SmogGiant {
  constructor(bounds) {
    this.bounds = bounds;
    this.isAlive = true;
    this.isPurifying = false;
    this.hp = SMOG_GIANT_MAX_HP;
    this.repolluteTimer = 0;
    this.direction = new THREE.Vector3(-0.45, 0, 1).normalize();

    this.mesh = new THREE.Group();

    // ── Body — massive smoky cube structure ───────────────────────
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2030 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, 2.8), bodyMat);
    body.position.y = 1.2;
    this.mesh.add(body);

    // Shoulder plates
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x3a2840 });
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 2.2), plateMat);
      plate.position.set(side * 1.7, 1.6, 0);
      this.mesh.add(plate);
    }

    // Smog vents (cylinders on top)
    const ventMat = new THREE.MeshLambertMaterial({ color: 0x1a1820 });
    for (let i = 0; i < 3; i++) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.7, 6), ventMat);
      vent.position.set(-0.6 + i * 0.6, 2.95, 0);
      this.mesh.add(vent);
      this.vents = this.mesh.children.filter((c) => c !== body);
    }

    // Glowing toxic eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x80ff20 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), eyeMat);
    eyeL.position.set(-0.45, 1.8, 1.42);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), eyeMat);
    eyeR.position.set(0.45, 1.8, 1.42);
    this.mesh.add(eyeL, eyeR);

    // Smog particles group (animated wisps)
    this.smokeGroup = new THREE.Group();
    this.smokeParticles = [];
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x504860, transparent: true, opacity: 0.18,
    });
    for (let i = 0; i < 12; i++) {
      const r = 0.3 + Math.random() * 0.5;
      const sm = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), smokeMat.clone());
      sm.position.set(
        (Math.random() - 0.5) * 3,
        2.8 + Math.random() * 2,
        (Math.random() - 0.5) * 3,
      );
      sm.userData = {
        ox: sm.position.x, oz: sm.position.z,
        phase: Math.random() * Math.PI * 2,
        spd: 0.5 + Math.random() * 0.8,
      };
      this.smokeGroup.add(sm);
      this.smokeParticles.push(sm);
    }
    this.mesh.add(this.smokeGroup);

    // Ambient green glow
    this.bossLight = new THREE.PointLight(0x40ff20, 0, 8);
    this.bossLight.position.y = 1.5;
    this.mesh.add(this.bossLight);

    this.mesh.position.set(bounds.maxX - 5, 0, bounds.maxZ - 5);

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
        letter-spacing:2px;text-transform:uppercase;color:#60c020;margin-bottom:5px;
        text-shadow:0 0 8px #60c020">SMOG GIANT</div>
      <div style="width:300px;height:7px;background:#0a100a;border-radius:4px;
        border:1px solid rgba(80,200,30,.2);overflow:hidden;">
        <div id="smog-hp-fill" style="height:100%;width:100%;border-radius:4px;
          background:linear-gradient(90deg,#206010,#60c020);
          transition:width .3s;box-shadow:0 0 6px #60c020;"></div>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a5a6a;margin-top:4px;">
        Craft <span style="background:rgba(42,138,122,.08);border:1px solid rgba(42,138,122,.15);
        border-radius:3px;padding:1px 5px;">Stone Scraper</span> +
        <span style="background:rgba(42,138,122,.08);border:1px solid rgba(42,138,122,.15);
        border-radius:3px;padding:1px 5px;">Woven Basket</span>
        then press <span style="background:rgba(42,138,122,.08);border:1px solid
        rgba(42,138,122,.15);border-radius:3px;padding:1px 5px;">E</span></div>
    `;
    document.body.appendChild(this.hpBar);
  }

  showHPBar() {
    this.hpBar.style.opacity = '1';
    this.bossLight.intensity = 0.8;
  }

  takeDamage(amount) {
    if (!this.isAlive) return;
    this.hp = Math.max(0, this.hp - amount);
    const fill = document.getElementById('smog-hp-fill');
    if (fill) fill.style.width = `${(this.hp / SMOG_GIANT_MAX_HP) * 100}%`;
  }

  update(deltaTime, elapsedSeconds, tileGrid) {
    if (this.isPurifying) {
      this.mesh.scale.multiplyScalar(1 - deltaTime * 1.5);
      this.mesh.position.y += deltaTime * 0.35;
      this.mesh.traverse((child) => {
        if (!child.material) return;
        child.material.transparent = true;
        child.material.opacity = Math.max(0, (child.material.opacity ?? 1) - deltaTime * 1.4);
      });
      this.bossLight.intensity = Math.max(0, this.bossLight.intensity - deltaTime * 2);
      return;
    }
    if (!this.isAlive) return;

    this.#move(deltaTime);
    this.repolluteTimer += deltaTime;

    if (this.repolluteTimer >= SMOG_GIANT_REPOLLUTE_INTERVAL) {
      this.repolluteTimer = 0;
      tileGrid.dirtyRandomCleanTile();
    }

    // Animate smog wisps
    for (const sm of this.smokeParticles) {
      sm.position.y += 0.012;
      sm.position.x = sm.userData.ox + Math.sin(elapsedSeconds * sm.userData.spd + sm.userData.phase) * 0.4;
      sm.position.z = sm.userData.oz + Math.cos(elapsedSeconds * sm.userData.spd * 0.7 + sm.userData.phase) * 0.4;
      sm.material.opacity = 0.08 + Math.sin(elapsedSeconds * 1.5 + sm.userData.phase) * 0.08;
      if (sm.position.y > 5) sm.position.y = 2.6;
    }

    // Pulse light
    this.bossLight.intensity = 0.5 + Math.sin(elapsedSeconds * 3) * 0.3;
    this.mesh.position.y = Math.sin(elapsedSeconds * 0.8) * 0.15;
  }

  defeat(scene) {
    if (!this.isAlive) return;
    this.isAlive = false;
    this.isPurifying = true;
    this.hpBar.style.opacity = '0';
    setTimeout(() => this.hpBar.remove(), 600);
    setTimeout(() => scene.remove(this.mesh), 950);
    console.log('The Smog Giant is defeated!');
  }

  #move(deltaTime) {
    this.mesh.position.addScaledVector(this.direction, SMOG_GIANT_SPEED * deltaTime);

    if (this.mesh.position.x <= this.bounds.minX || this.mesh.position.x >= this.bounds.maxX) {
      this.direction.x *= -1;
      this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, this.bounds.minX, this.bounds.maxX);
    }
    if (this.mesh.position.z <= this.bounds.minZ || this.mesh.position.z >= this.bounds.maxZ) {
      this.direction.z *= -1;
      this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, this.bounds.minZ, this.bounds.maxZ);
    }
    if (this.direction.lengthSq() > 0) {
      this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    }
  }
}

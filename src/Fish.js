import * as THREE from 'three';

// Shared helper — keeps any creature inside bounds by wrapping
function wrapBounds(mesh, bounds, margin = 2) {
  const p = mesh.position;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  if (p.x > bounds.maxX + margin) p.x = bounds.minX - margin;
  if (p.x < bounds.minX - margin) p.x = bounds.maxX + margin;
  if (p.z > bounds.maxZ + margin) p.z = bounds.minZ - margin;
  if (p.z < bounds.minZ - margin) p.z = bounds.maxZ + margin;
}

// Random position inside bounds
function rndPos(bounds, y = 0.6) {
  return new THREE.Vector3(
    THREE.MathUtils.randFloat(bounds.minX + 2, bounds.maxX - 2),
    y,
    THREE.MathUtils.randFloat(bounds.minZ + 2, bounds.maxZ - 2),
  );
}

// ── Generic Fish ─────────────────────────────────────────────────────
export class Fish {
  constructor(bounds, color = 0x3a7a8a) {
    this.bounds = bounds;
    this.speed = THREE.MathUtils.randFloat(1.5, 3.0);
    this.turnTimer = Math.random() * 2;
    this.turnInterval = THREE.MathUtils.randFloat(1.5, 4.0);
    this.vx = (Math.random() - 0.5) * 2;
    this.vz = (Math.random() - 0.5) * 2;
    this._off = Math.random() * Math.PI * 2;

    const col = new THREE.Color(color);
    this.mesh = new THREE.Group();

    // Body — tapered cone pointing in +X
    const bodyMat = new THREE.MeshLambertMaterial({ color: col });
    const finMat = new THREE.MeshLambertMaterial({
      color: col.clone().multiplyScalar(0.72),
      side: THREE.DoubleSide,
    });
    const paleMat = new THREE.MeshLambertMaterial({ color: col.clone().lerp(new THREE.Color(0xd8f4ee), 0.45) });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), bodyMat);
    body.scale.set(0.72, 0.48, 1.55);
    this.mesh.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8), paleMat);
    belly.scale.set(0.55, 0.22, 1.0);
    belly.position.set(0, -0.09, 0.08);
    this.mesh.add(belly);

    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-0.28, 0.2);
    tailShape.lineTo(-0.22, 0);
    tailShape.lineTo(-0.28, -0.2);
    tailShape.lineTo(0, 0);
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), finMat);
    tail.position.z = -0.48;
    this.mesh.add(tail);
    this.tail = tail;

    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.32, 0.08);
    finShape.lineTo(0.08, -0.18);
    finShape.lineTo(0, 0);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape), finMat);
      fin.position.set(side * 0.16, -0.02, 0.02);
      fin.rotation.set(0.4, side * 0.8, side * 0.45);
      fin.scale.x = side;
      this.mesh.add(fin);
    }

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 3), finMat);
    dorsal.scale.set(1, 0.45, 0.55);
    dorsal.rotation.x = Math.PI / 2;
    dorsal.position.set(0, 0.2, -0.05);
    this.mesh.add(dorsal);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8ffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x061014 });
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
      eye.position.set(x, 0.06, 0.38);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), pupilMat);
      pupil.position.set(x, 0.06, 0.405);
      this.mesh.add(eye, pupil);
    }

    // Bioluminescent pattern
    for (let i = 0; i < 6; i++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0xb8ffff }));
      spot.position.set(Math.random() > 0.5 ? 0.22 : -0.22, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.8);
      this.mesh.add(spot);
    }

    // Bioluminescent glow
    this.glow = new THREE.PointLight(col, 0.8, 3.5);
    this.mesh.add(this.glow);

    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(0.4, 1.8)));
  }

  update(dt, elapsed, playerPosition = null) {
    // Periodically change direction
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = this.turnInterval;
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle);
      this.vz = Math.sin(angle);
    }

    if (playerPosition) {
      const awayX = this.mesh.position.x - playerPosition.x;
      const awayZ = this.mesh.position.z - playerPosition.z;
      const distSq = awayX * awayX + awayZ * awayZ;
      if (distSq > 0.001 && distSq < 18) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / Math.sqrt(18)) * 1.8;
        this.vx += (awayX / dist) * push * dt;
        this.vz += (awayZ / dist) * push * dt;
        const len = Math.hypot(this.vx, this.vz) || 1;
        this.vx /= len;
        this.vz /= len;
      }
    }

    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    // Gentle vertical sine
    this.mesh.position.y = 0.6 + Math.sin(elapsed * 2 + this._off) * 0.25;

    // Face movement direction
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    // Tail wag
    this.tail.rotation.y = Math.sin(elapsed * 8 + this._off) * 0.4;
    this.glow.intensity = 0.4 + Math.sin(elapsed * 3 + this._off) * 0.3;

    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Jellyfish ────────────────────────────────────────────────────────
export class Jellyfish {
  constructor(bounds) {
    this.bounds = bounds;
    this._off = Math.random() * Math.PI * 2;
    this.driftX = (Math.random() - 0.5) * 0.4;
    this.driftZ = (Math.random() - 0.5) * 0.4;
    this.mesh = new THREE.Group();

    const col = new THREE.Color().setHSL(0.75 + Math.random() * 0.2, 0.9, 0.55);
    const bellMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
    bell.rotation.x = Math.PI;
    this.mesh.add(bell);

    // Trailing tentacles
    const tMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.5 + Math.random() * 0.4, 3), tMat);
      t.position.set(Math.cos(a) * 0.12, -0.3 - Math.random() * 0.1, Math.sin(a) * 0.12);
      this.mesh.add(t);
    }

    this.light = new THREE.PointLight(col, 1.0, 3.5);
    this.mesh.add(this.light);
    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(1.2, 2.5)));
  }

  update(dt, elapsed) {
    this.mesh.position.y = 1.5 + Math.sin(elapsed * 1.2 + this._off) * 0.4;
    // Slow drift
    this.mesh.position.x += this.driftX * dt;
    this.mesh.position.z += this.driftZ * dt;
    this.light.intensity = 0.6 + Math.sin(elapsed * 2.5 + this._off) * 0.45;
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Octopus ──────────────────────────────────────────────────────────
export class Octopus {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 0.7;
    this.turnTimer = Math.random() * 3;
    this.turnInterval = THREE.MathUtils.randFloat(2.5, 5.0);
    this.vx = (Math.random() - 0.5);
    this.vz = (Math.random() - 0.5);
    this._off = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8a4a7a });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bodyMat);
    head.scale.y = 1.2;
    this.mesh.add(head);

    this.tentacles = [];
    const tMat = new THREE.MeshLambertMaterial({ color: 0x6a3a5a });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tGrp = new THREE.Group();
      const tGeo = new THREE.CylinderGeometry(0.05, 0.01, 0.8, 4);
      tGeo.translate(0, -0.4, 0);
      tGrp.add(new THREE.Mesh(tGeo, tMat));
      tGrp.position.set(Math.cos(a) * 0.25, -0.2, Math.sin(a) * 0.25);
      tGrp.rotation.z = Math.PI / 2; tGrp.rotation.y = a;
      this.mesh.add(tGrp);
      this.tentacles.push(tGrp);
    }
    this.mesh.add(new THREE.PointLight(0xaa44aa, 0.5, 3));
    this.mesh.position.copy(rndPos(bounds, 0.4));
  }

  update(dt, elapsed, playerPosition = null) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = this.turnInterval;
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    if (playerPosition) {
      const awayX = this.mesh.position.x - playerPosition.x;
      const awayZ = this.mesh.position.z - playerPosition.z;
      const distSq = awayX * awayX + awayZ * awayZ;
      if (distSq > 0.001 && distSq < 28) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / Math.sqrt(28)) * 1.35;
        this.vx += (awayX / dist) * push * dt;
        this.vz += (awayZ / dist) * push * dt;
        const len = Math.hypot(this.vx, this.vz) || 1;
        this.vx /= len;
        this.vz /= len;
      }
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 0.4 + Math.sin(elapsed * 1.5 + this._off) * 0.15;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    this.tentacles.forEach((t, i) => {
      t.rotation.x = Math.sin(elapsed * 2.5 + i * 0.8 + this._off) * 0.6;
    });
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Anglerfish ───────────────────────────────────────────────────────
export class Anglerfish {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 1.0;
    this.turnTimer = Math.random() * 2;
    this.turnInterval = THREE.MathUtils.randFloat(3, 6);
    this.vx = (Math.random() - 0.5);
    this.vz = (Math.random() - 0.5);
    this.mesh = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), bodyMat);
    body.scale.set(1.4, 0.9, 1.8);
    this.mesh.add(body);

    // Teeth
    const tMat = new THREE.MeshLambertMaterial({ color: 0xddddcc });
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 3), tMat);
      tooth.position.set((i - 2) * 0.1, -0.1, 0.55);
      tooth.rotation.x = Math.PI;
      this.mesh.add(tooth);
    }

    // Lure arm
    this.lureGrp = new THREE.Group();
    this.lureGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.55, 4), bodyMat));
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), bulbMat);
    bulb.position.y = 0.3;
    this.lureGrp.add(bulb);
    this.lureGrp.position.set(0, 0.5, 0.5);
    this.mesh.add(this.lureGrp);

    this.lureLight = new THREE.PointLight(0x00ffee, 2.0, 4);
    this.lureLight.position.set(0, 0.8, 0.7);
    this.mesh.add(this.lureLight);

    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(0.5, 1.5)));
  }

  update(dt, elapsed) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = this.turnInterval;
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    this.lureGrp.rotation.z = Math.sin(elapsed * 2) * 0.3;
    this.lureLight.intensity = 1.2 + Math.sin(elapsed * 5) * 0.9;
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Manta Ray ────────────────────────────────────────────────────────
export class MantaRay {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 2.2;
    this.vx = 1; this.vz = 0;
    this._off = Math.random() * Math.PI * 2;
    this.turnTimer = THREE.MathUtils.randFloat(3, 6);
    this.mesh = new THREE.Group();

    const mat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a, side: THREE.DoubleSide });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x0a1520, side: THREE.DoubleSide });

    // Body disc
    const body = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), mat);
    body.rotation.x = -Math.PI / 2;
    this.mesh.add(body);

    // Wings (two angled planes)
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.9, 6), mat);
      wing.rotation.x = -Math.PI / 2;
      wing.rotation.z = s * 0.35;
      wing.position.set(s * 0.7, 0, 0);
      this.mesh.add(wing);
      this[s < 0 ? 'wingL' : 'wingR'] = wing;
    }

    // Tail
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1.2, 4), darkMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -1.0;
    this.mesh.add(tail);

    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(0.5, 1.0)));
    this.mesh.position.y = THREE.MathUtils.randFloat(0.3, 1.2);
  }

  update(dt, elapsed) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = THREE.MathUtils.randFloat(3, 7);
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 0.7 + Math.sin(elapsed * 0.8 + this._off) * 0.3;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    // Wing flap
    const flap = Math.sin(elapsed * 2.5 + this._off) * 0.25;
    if (this.wingL && this.wingR) {
      this.wingL.rotation.z = 0.35 + flap;
      this.wingR.rotation.z = -(0.35 + flap);
    }
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Deep Eel ─────────────────────────────────────────────────────────
export class DeepEel {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 1.5;
    this.vx = (Math.random() - 0.5); this.vz = (Math.random() - 0.5);
    this._off = Math.random() * Math.PI * 2;
    this.turnTimer = Math.random() * 2;
    this.turnInterval = THREE.MathUtils.randFloat(2, 5);
    this.mesh = new THREE.Group();

    const mat = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });
    this.segments = [];
    for (let i = 0; i < 7; i++) {
      const r = 0.08 - i * 0.009;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, 0.025), 5, 5), mat);
      seg.position.z = -i * 0.2;
      this.mesh.add(seg);
      this.segments.push(seg);
    }
    // Glow eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (const ex of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyeMat);
      eye.position.set(ex, 0.04, 0.1);
      this.segments[0].add(eye);
    }
    this.mesh.add(new THREE.PointLight(0x40aa40, 0.4, 2.5));
    this.mesh.position.copy(rndPos(bounds, 0.3));
  }

  update(dt, elapsed) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = this.turnInterval;
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 0.3 + Math.sin(elapsed + this._off) * 0.15;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    // Undulate segments
    this.segments.forEach((s, i) => {
      s.position.x = Math.sin(elapsed * 4 + i * 0.9 + this._off) * i * 0.05;
    });
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Small fish school ────────────────────────────────────────────────
export class FishSchool {
  constructor(bounds, color = 0x88ccdd) {
    this.bounds = bounds;
    this.speed = 2.8;
    this.vx = (Math.random() - 0.5) * 2;
    this.vz = (Math.random() - 0.5) * 2;
    this.turnTimer = THREE.MathUtils.randFloat(1.5, 3.5);
    this._off = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const finMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), side: THREE.DoubleSide });
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-0.11, 0.08);
    tailShape.lineTo(-0.09, 0);
    tailShape.lineTo(-0.11, -0.08);
    tailShape.lineTo(0, 0);
    this.fishMeshes = [];
    for (let i = 0; i < 12; i++) {
      const f = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), bodyMat);
      body.scale.set(0.75, 0.45, 1.45);
      const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), finMat);
      tail.position.z = -0.13;
      f.add(body, tail);
      f.position.set(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 1.4,
      );
      f.userData.offset = Math.random() * Math.PI * 2;
      this.mesh.add(f);
      this.fishMeshes.push(f);
    }
    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(0.5, 2.0)));
  }

  update(dt, elapsed, playerPosition = null) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = THREE.MathUtils.randFloat(1.5, 3.5);
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    if (playerPosition) {
      const awayX = this.mesh.position.x - playerPosition.x;
      const awayZ = this.mesh.position.z - playerPosition.z;
      const distSq = awayX * awayX + awayZ * awayZ;
      if (distSq > 0.001 && distSq < 32) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / Math.sqrt(32)) * 1.5;
        this.vx += (awayX / dist) * push * dt;
        this.vz += (awayZ / dist) * push * dt;
        const len = Math.hypot(this.vx, this.vz) || 1;
        this.vx /= len;
        this.vz /= len;
      }
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 1.0 + Math.sin(elapsed * 1.5 + this._off) * 0.4;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    // Each fish bobs individually
    this.fishMeshes.forEach((f, i) => {
      f.position.y = (Math.random() - 0.5) * 0.02 + Math.sin(elapsed * 4 + f.userData.offset) * 0.08;
      if (f.children[1]) f.children[1].rotation.y = Math.sin(elapsed * 9 + i) * 0.45;
    });
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Sea Turtle ───────────────────────────────────────────────────────
export class SeaTurtle {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 0.8;
    this.vx = (Math.random() - 0.5); this.vz = (Math.random() - 0.5);
    this.turnTimer = THREE.MathUtils.randFloat(3, 7);
    this._off = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Group();

    const shellMat = new THREE.MeshLambertMaterial({ color: 0x2d6a30 });
    const skinMat  = new THREE.MeshLambertMaterial({ color: 0x4a7a40 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 5), shellMat);
    shell.scale.y = 0.45;
    this.mesh.add(shell);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), skinMat);
    head.position.set(0, 0, 0.5);
    this.mesh.add(head);

    // Flippers
    for (const [sx, sz] of [[-1, 0.1], [1, 0.1], [-0.6, -0.3], [0.6, -0.3]]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), skinMat);
      f.scale.set(1.5, 0.3, 0.8);
      f.position.set(sx * 0.4, 0, sz);
      this.mesh.add(f);
    }
    this.mesh.position.copy(rndPos(bounds, 0.2));
  }

  update(dt, elapsed) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = THREE.MathUtils.randFloat(3, 7);
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 0.2 + Math.sin(elapsed * 1.0 + this._off) * 0.12;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    wrapBounds(this.mesh, this.bounds);
  }
}

// ── Butterfly ────────────────────────────────────────────────────────
export class Butterfly {
  constructor(bounds) {
    this.bounds = bounds;
    this.speed = 2.5;
    this.vx = (Math.random() - 0.5) * 2;
    this.vz = (Math.random() - 0.5) * 2;
    this.turnTimer = THREE.MathUtils.randFloat(1, 3);
    this._off = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Group();

    const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.55);
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    this.wingL = new THREE.Mesh(new THREE.CircleGeometry(0.22, 6), mat);
    this.wingL.position.x = -0.18;
    this.wingR = new THREE.Mesh(new THREE.CircleGeometry(0.22, 6), mat);
    this.wingR.position.x = 0.18;
    this.mesh.add(this.wingL, this.wingR);
    this.mesh.position.copy(rndPos(bounds, THREE.MathUtils.randFloat(1.8, 3.0)));
  }

  update(dt, elapsed) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = THREE.MathUtils.randFloat(1, 3);
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vz = Math.sin(a);
    }
    this.mesh.position.x += this.vx * this.speed * dt;
    this.mesh.position.z += this.vz * this.speed * dt;
    this.mesh.position.y = 2.2 + Math.sin(elapsed * 3 + this._off) * 0.5;
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    const flap = Math.sin(elapsed * 12 + this._off) * 0.7;
    this.wingL.rotation.y = flap;
    this.wingR.rotation.y = -flap;
    wrapBounds(this.mesh, this.bounds);
  }
}

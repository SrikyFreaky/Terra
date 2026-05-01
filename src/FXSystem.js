import * as THREE from 'three';

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.pulses = []; // Array of { mesh, life, maxLife }
    this.particles = []; // Array of { mesh, velocity, life, maxLife }

    // Reusable geometries
    this.pulseGeo = new THREE.RingGeometry(0.8, 1.0, 32);
    this.pulseGeo.rotateX(-Math.PI / 2);
    
    this.particleGeo = new THREE.IcosahedronGeometry(0.05, 0);

    // Material Pool
    this.matPool = {};
    this.#getMat(0xffffff); // pre-warm white

    // Muzzle flash geometry (Cross shape)
    this.muzzleGeo = new THREE.PlaneGeometry(0.3, 0.3);
    this.muzzleMat = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.muzzleFlashes = []; // { mesh, life }

    // Bubble geometry
    this.bubbleGeo = new THREE.SphereGeometry(0.04, 8, 8);
    this.bubbleMat = new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 0.4 });
    this.bubbles = []; // { mesh, velocity, life }

    // 🚀 Booster Sprite Texture (Water Jet)
    this.boosterTex = this.#createBoosterTex();
    this.boosterParticles = []; // { sprite, velocity, life }
  }

  #createBoosterTex() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(0, 200, 255, 0.6)');
    grad.addColorStop(1, 'rgba(0, 100, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 128);
    return new THREE.CanvasTexture(canvas);
  }

  #getMat(color) {
    if (!this.matPool[color]) {
      this.matPool[color] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    }
    return this.matPool[color];
  }

  // ── Cleaning Pulse Effect ──────────────────────────────────────
  spawnPulse(position, radius, color = 0x3abaaa) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this.pulseGeo, mat);
    mesh.position.copy(position);
    mesh.position.y = 0.05;
    mesh.scale.setScalar(radius);
    
    this.scene.add(mesh);
    this.pulses.push({ mesh, life: 0.6, maxLife: 0.6, initialRadius: radius });
  }

  // ── Impact Particles ───────────────────────────────────────────
  spawnImpact(position, color = 0xffffff, count = 6) {
    const mat = this.#getMat(color);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(position);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 4,
        (Math.random() - 0.5) * 4,
      );
      
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 1.0, maxLife: 1.0 });
    }
  }

  spawnCleanBurst(position, color = 0x9fffea) {
    this.spawnImpact(
      new THREE.Vector3(position.x, 0.15, position.z),
      color,
      4,
    );
  }

  // ── Muzzle Flash ───────────────────────────────────────────────
  spawnMuzzleFlash(position, rotation) {
    const mesh = new THREE.Mesh(this.muzzleGeo, this.muzzleMat);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    // Add a second plane for a cross effect
    const mesh2 = mesh.clone();
    mesh2.rotation.y += Math.PI / 2;
    
    const group = new THREE.Group();
    group.add(mesh, mesh2);
    this.scene.add(group);
    
    this.muzzleFlashes.push({ mesh: group, life: 0.05, maxLife: 0.05 });
  }

  // ── Enemy Death ────────────────────────────────────────────────
  spawnEnemyDeath(position, color = 0x3abaaa) {
    // Large impact
    this.spawnImpact(position, color, 10);
    // Burst of bubbles
    this.spawnBubbleBurst(position, 6);
  }

  spawnBoosterTrail(position, direction) {
    const mat = new THREE.SpriteMaterial({ 
      map: this.boosterTex, 
      transparent: true, 
      opacity: 0.8, 
      blending: THREE.AdditiveBlending 
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(0.3, 0.6, 1);
    
    this.scene.add(sprite);
    this.boosterParticles.push({ 
      sprite, 
      velocity: direction.clone().multiplyScalar(-2), 
      life: 0.5 
    });
  }

  spawnBubbleBurst(position, count = 5) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      ));
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 0.5
      );
      this.scene.add(mesh);
      this.bubbles.push({ mesh, velocity, life: 1.2 + Math.random() * 0.8 });
    }
  }

  update(dt) {
    // Update Pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.life -= dt;
      const progress = 1 - (p.life / p.maxLife);
      p.mesh.scale.setScalar(p.initialRadius * (1 + progress * 0.5));
      p.mesh.material.opacity = 0.6 * (1 - progress);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.pulses.splice(i, 1);
      }
    }

    // Update Muzzle Flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const f = this.muzzleFlashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.children.forEach(c => c.material.dispose());
        this.muzzleFlashes.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= 9.8 * dt * 0.5; 
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.material.opacity = p.life / 1.0;
      const progress = 1 - (p.life / 1.0);
      p.mesh.scale.setScalar(1 - progress);
      if (p.life <= 0 || p.mesh.position.y < 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update Bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.mesh.material.opacity = b.life * 0.4;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bubbles.splice(i, 1);
      }
    }

    // Update Booster Particles
    for (let i = this.boosterParticles.length - 1; i >= 0; i--) {
      const p = this.boosterParticles[i];
      p.life -= dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.multiplyScalar(1.05); // Expansion
      p.sprite.material.opacity = p.life * 2;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.boosterParticles.splice(i, 1);
      }
    }
  }
}

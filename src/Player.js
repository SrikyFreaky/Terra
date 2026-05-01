import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_SPEED } from './config.js';

const C = {
  suit:       0x3a7a8a,
  suitDark:   0x2a5a6a,
  helm:       0x2a6a7a,
  visor:      0x88ddee,
  tank:       0x1a4a5a,
  limb:       0x2a5060,
  gold:       0xc8a030,
};

const SKIN_PALETTES = {
  default: {
    suit: C.suit, suitDark: C.suitDark, helm: C.helm, visor: C.visor,
    tank: C.tank, limb: C.limb, gold: C.gold, opacity: 1, glow: 0xffd060, glowIntensity: 0.5,
  },
  biolume: {
    suit: 0x2ed6c5, suitDark: 0x126f72, helm: 0x1aa0a8, visor: 0xb8ffff,
    tank: 0x0c4f5c, limb: 0x1c8391, gold: 0x7dffe9, opacity: 1, glow: 0x53fff1, glowIntensity: 1.15,
  },
  mecha: {
    suit: 0xbb4a44, suitDark: 0x4a2428, helm: 0x8a3030, visor: 0xffc060,
    tank: 0x303238, limb: 0x5a5558, gold: 0xd7a044, opacity: 1, glow: 0xff7040, glowIntensity: 0.85,
  },
  ghost: {
    suit: 0x95eaff, suitDark: 0x4a99aa, helm: 0xaeefff, visor: 0xffffff,
    tank: 0x6fc7dd, limb: 0x7fd7ea, gold: 0xc8ffff, opacity: 0.52, glow: 0xaaffff, glowIntensity: 1.35,
  },
};

const GEAR_RADIUS_MULTIPLIERS = {
  none: 1,
  ion_saber: 1.05,
  bubble_gun: 1.08,
  vortex: 1.12,
};

export class Player {
  constructor(bounds) {
    this.bounds = bounds;
    this.keys = new Set();
    this.isPaused = false;
    this.elapsedTime = 0;

    this.maxHp = 100;
    this.hp = 100;
    this.isDead = false;
    this.weaponLevel = 0;
    this.weapons = [
      { name: 'Standard Blaster', damage: 15, cooldown: 0.3, maxAmmo: 40, color: 0x3abaaa, spread: 0.05 },
      { name: 'Ion Rifle', damage: 25, cooldown: 0.2, maxAmmo: 60, color: 0x3a7a8a, spread: 0.03 },
      { name: 'Plasma Cannon', damage: 45, cooldown: 0.15, maxAmmo: 100, color: 0x88ddee, spread: 0.08 }
    ];
    this.ammo = this.weapons[0].maxAmmo;
    this.maxAmmo = this.weapons[0].maxAmmo;

    // Torch state
    this.torchOn = false;
    this.targetRotationY = 0;

    this.mesh = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    this.walkTimer = 0;

    this.#buildHealthBar();
    this.#createHurtOverlay();

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') this.jump();
      if (k === 't') this.toggleTorch();
      if (k === '1') this.playEmote('happy');
      if (k === '2') this.playEmote('angry');
      if (k === '3') this.playEmote('wave');
      if (k === '4') this.playEmote('heart');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    this.emotes = [];
    this.vy = 0;
    this.isJumping = false;
    this.#initEmoteAssets();
  }

  #initEmoteAssets() {
    this.emoteTextures = {};
    const icons = { happy: '😊', angry: '💢', wave: '👋', heart: '❤️' };
    
    for (const [key, icon] of Object.entries(icons)) {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, 32, 32);
      this.emoteTextures[key] = new THREE.CanvasTexture(canvas);
    }
  }

  // ── Model ──────────────────────────────────────────────────────
  initModel(gltf, weaponGltf, l3Gltf) {
    try {
      if (!gltf) return;
      this.model = gltf.scene;
      this.l3Model = l3Gltf ? l3Gltf.scene : null;
      
      // Setup Diver
      this.model.scale.set(1.8, 1.8, 1.8);
      this.model.position.y = 1.3;
      
      // Setup Adventurer (Layer 3)
      if (this.l3Model) {
        this.l3Model.scale.set(1.2, 1.2, 1.2); // Scaled down for land
        this.l3Model.position.y = 1.25;
        this.l3Model.visible = false;
        this.mesh.add(this.l3Model);
      }

      // We are attaching the weapon to the chest to bypass skeleton anomalies.
      this.blasterMesh = new THREE.Group();
      
      if (weaponGltf) {
        const weaponModel = weaponGltf.scene.clone();
        weaponModel.scale.set(0.4, 0.4, 0.4);
        weaponModel.position.set(0, 0, 0);
        const weaponWrapper = new THREE.Group();
        weaponWrapper.add(weaponModel);
        weaponWrapper.rotation.set(0, -Math.PI / 2, 0); 
        this.blasterMesh.add(weaponWrapper);
        weaponModel.traverse((child) => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
      } else {
        const blasterGeo = new THREE.BoxGeometry(0.1, 0.15, 0.6);
        const blasterMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        this.blasterMesh.add(new THREE.Mesh(blasterGeo, blasterMat));
      }

      this.muzzlePoint = new THREE.Object3D();
      this.muzzlePoint.position.set(0, 0, 1.2); 
      this.blasterMesh.add(this.muzzlePoint);
      this.blasterMesh.position.set(0.18, -0.4, 0.1); 
      this.model.add(this.blasterMesh);

      // Setup AnimationMixer for both
      this.mixer = new THREE.AnimationMixer(this.model);
      this.l3Mixer = this.l3Model ? new THREE.AnimationMixer(this.l3Model) : null;
      
      this.animations = {};
      this.l3Animations = {};

      if (gltf.animations) {
        gltf.animations.forEach((clip) => {
          if (clip.name) this.animations[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
        });
      }
      if (l3Gltf && l3Gltf.animations) {
        l3Gltf.animations.forEach((clip) => {
          if (clip.name) this.l3Animations[clip.name.toLowerCase()] = this.l3Mixer.clipAction(clip);
        });
      }

      const idleClip = this.animations['idle'] || (gltf.animations[0] ? this.mixer.clipAction(gltf.animations[0]) : null);
      if (idleClip) { idleClip.play(); this.currentAction = idleClip; }

      this.mesh.add(this.model);

      this.weaponLight = new THREE.PointLight(0x3abaaa, 1, 3);
      this.muzzlePoint.add(this.weaponLight);

      this.thrusters = new THREE.Group();
      const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.15), thrusterMat);
      bracket.position.set(0, -0.05, -0.15);
      this.thrusters.add(bracket);

      for (const sx of [-0.22, 0.22]) {
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 8), thrusterMat);
        jet.name = 'jet_port'; // Identifier for particle system
        jet.rotation.x = Math.PI / 2.1; 
        jet.position.set(sx, -0.05, -0.22);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        nozzle.position.y = -0.1;
        jet.add(nozzle);
        
        const tLight = new THREE.PointLight(0x00ffff, 1.5, 2);
        tLight.position.y = -0.15;
        jet.add(tLight);
        
        this.thrusters.add(jet);
      }
      this.model.add(this.thrusters);
    } catch (err) {
      console.error("Error in initModel:", err);
    }
  }

  updateForLayer(layer) {
    if (!this.model || !this.l3Model) return;
    const isLand = layer === 3;
    
    // Create Arc Reactor for Adventurer
    if (isLand && !this.chestCore) {
      this.chestCore = new THREE.Group();
      this.chestCore.position.set(0, 1.15, 0.22);
      
      // The glowing core (Red)
      const coreGeo = new THREE.SphereGeometry(0.1, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      this.chestCore.add(core);
      
      // The metallic ring
      const ringGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 24);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = 0;
      this.chestCore.add(ring);

      this.l3Model.add(this.chestCore);
      
      this.coreLight = new THREE.PointLight(0xff0000, 1.5, 3);
      this.chestCore.add(this.coreLight);
    }
    if (this.chestCore) this.chestCore.visible = isLand;

    // Handle weapon visibility and parenting
    if (isLand) {
      this.blasterMesh.visible = false;
      if (this.muzzlePoint) {
        this.chestCore.add(this.muzzlePoint);
        this.muzzlePoint.position.set(0, 0, 0.1);
      }
    } else {
      this.blasterMesh.visible = true;
      if (this.blasterMesh.parent !== this.model) {
        this.model.add(this.blasterMesh);
      }
      this.blasterMesh.position.set(0.18, -0.4, 0.1);
      this.blasterMesh.rotation.set(0, 0, 0);
      if (this.muzzlePoint) {
        this.blasterMesh.add(this.muzzlePoint);
        this.muzzlePoint.position.set(0, 0, 1.2);
      }
    }
    
    // Stop current animations and switch mixer
    if (this.currentAction) this.currentAction.stop();
    this.currentAction = null;
  }

  jump() {
    if (!this.isJumping) {
      this.vy = 0.18;
      this.isJumping = true;
    }
  }


  // ── Health UI ──────────────────────────────────────────────────
  #buildHealthBar() {
    this.healthBarWrap = document.createElement('div');
    this.healthBarWrap.style.cssText = `
      position:fixed; bottom:25px; left:50%; transform:translateX(-50%); width:220px; height:6px;
      background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.15);
      border-radius:3px; overflow:hidden; z-index:100;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
    `;
    const label = document.createElement('div');
    label.style.cssText = `
      position:fixed; bottom:34px; left:50%; transform:translateX(-50%);
      font-family:'Chakra Petch',sans-serif; font-size:10px; color:#c44a4a;
      letter-spacing:2px; opacity:.9; z-index:101; text-align:center; width:220px;
      text-transform:uppercase; font-weight:700;
    `;
    label.textContent = 'HULL INTEGRITY';
    this.healthFill = document.createElement('div');
    this.healthFill.style.cssText = `
      width:100%; height:100%; background:linear-gradient(90deg,#8a1a1a,#ff4444);
      transition:width .3s; box-shadow:0 0 10px rgba(255,68,68,.4);
    `;
    this.healthBarWrap.appendChild(this.healthFill);
    document.body.appendChild(label);
    document.body.appendChild(this.healthBarWrap);
  }

  #createHurtOverlay() {
    this.hurtOverlay = document.createElement('div');
    this.hurtOverlay.id = 'hurt-overlay';
    this.hurtOverlay.style.cssText = `
      position:fixed; top:0; left:0; width:100%; height:100%;
      pointer-events:none; z-index:99; opacity:0; transition:opacity 0.15s;
      background:radial-gradient(circle, transparent 40%, rgba(220,0,0,0.35) 100%);
    `;
    document.body.appendChild(this.hurtOverlay);
  }

  takeDamage(amt, fxSystem) {
    if (this.isDead || this.isPaused) return;
    this.hp = Math.max(0, this.hp - amt);
    this.healthFill.style.width = `${(this.hp / this.maxHp) * 100}%`;
    this.hurtOverlay.style.opacity = '1';
    setTimeout(() => this.hurtOverlay.style.opacity = '0', 180);
    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this.mesh.visible = false;
      if (fxSystem) {
        // Massive explosion when player dies
        fxSystem.spawnImpact(this.mesh.position, 0xff3333, 60);
      }
      const label = document.querySelector('.hud-label');
      if (label) label.textContent = 'SYSTEM FAILURE - HULL DESTROYED';
    }
  }

  // ── Manual Attack ──────────────────────────────────────────────
  fire(projectiles, scene, hud, targetPos = null, fxSystem = null) {
    if (this.attackCooldown > 0 || this.ammo <= 0 || this.isDead) return;

    const current = this.weapons[this.weaponLevel];
    this.attackCooldown = current.cooldown;
    this.ammo--;
    hud.updateAmmo(this.ammo, current.maxAmmo);

    // Recoil (Push back)
    if (this.blasterMesh) this.blasterMesh.position.z += 0.2;

    if (window.audio) window.audio.playFire();

    // Muzzle flash
    const flashQuat = new THREE.Quaternion();
    this.muzzlePoint.getWorldQuaternion(flashQuat);
    
    if (fxSystem) {
      const flashPos = new THREE.Vector3();
      this.muzzlePoint.getWorldPosition(flashPos);
      fxSystem.spawnMuzzleFlash(flashPos, new THREE.Euler().setFromQuaternion(flashQuat));
    }

    // Spawn Uni-Beam (Laser)
    const isLand = window.currentLayer === 3;
    const projColor = isLand ? 0xff0000 : current.color;
    
    // 🛸 Laser Beam Visuals
    let projectile;
    if (isLand) {
      const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      projectile = new THREE.Mesh(beamGeo, beamMat);
      // Rotate the cylinder so its 'height' points forward
      projectile.rotation.x = Math.PI / 2;
    } else {
      const projGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const projMat = new THREE.MeshBasicMaterial({ color: current.color });
      projectile = new THREE.Mesh(projGeo, projMat);
    }

    const startPos = new THREE.Vector3();
    this.muzzlePoint.getWorldPosition(startPos);
    
    // Combat Fix: On land, ensure we hit ground enemies
    if (isLand) startPos.y = 0.5;
    
    projectile.position.copy(startPos);

    const muzzleQuat = new THREE.Quaternion();
    this.muzzlePoint.getWorldQuaternion(muzzleQuat);
    
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(muzzleQuat);

    // Spread
    if (current.spread > 0) {
      direction.x += (Math.random() - 0.5) * current.spread;
      direction.z += (Math.random() - 0.5) * current.spread;
      direction.normalize();
    }

    // Orient the beam to face the direction of flight
    if (isLand) {
      projectile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      projectile.rotation.x += Math.PI / 2; // Adjust for cylinder orientation
    }

    projectile.userData = {
      velocity: direction.multiplyScalar(isLand ? 30 : 24), // Faster beams
      life: 2.2,
      damage: current.damage
    };

    // Add a light to the projectile for red flare
    const boltLight = new THREE.PointLight(projColor, 1.5, 3);
    projectile.add(boltLight);

    scene.add(projectile);
    projectiles.push(projectile);

    if (this.coreLight) this.coreLight.intensity = 5.0;
  }

  equipWeapon(id) {
    const levelMap = { 'standard_blaster': 0, 'ion_rifle': 1, 'plasma_cannon': 2 };
    const targetLevel = levelMap[id] ?? 0;
    
    this.weaponLevel = targetLevel;
    const current = this.weapons[this.weaponLevel];
    this.ammo = current.maxAmmo;
    this.maxAmmo = current.maxAmmo;

    if (this.blasterMesh) {
      this.blasterMesh.scale.setScalar(1 + targetLevel * 0.2);
      if (this.weaponLight) this.weaponLight.color.set(current.color);
    }
    console.log(`[Player] Equipped weapon: ${current.name}`);
  }

  playEmote(type) {
    const tex = this.emoteTextures[type];
    if (!tex) return;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.6, 0.6, 1);
    sprite.position.set(0, 2.5, 0); // Above head
    
    this.mesh.add(sprite);
    this.emotes.push({ sprite, life: 2.0 });
  }

  checkWeaponUnlock(purificationPct, hud) {
    let newLevel = 0;
    if (purificationPct >= 60) newLevel = 2;
    else if (purificationPct >= 25) newLevel = 1;

    if (newLevel > this.weaponLevel) {
      this.weaponLevel = newLevel;
      const current = this.weapons[this.weaponLevel];
      this.ammo = current.maxAmmo;
      this.maxAmmo = current.maxAmmo;
      hud.updateAmmo(this.ammo, this.maxAmmo);
      hud.showWarning(`WEAPON UPGRADED: ${current.name}`, 3000);
      return true;
    }
    return false;
  }

  // ── Update ─────────────────────────────────────────────────────
  update(deltaTime, speedMultiplier = 1, mouseTargetPos = null, fxSystem = null) {
    if (this.isDead) return;
    const layer = window.currentLayer || 1;
    const isLand = layer === 3;
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);
    this.elapsedTime += deltaTime;
    const activeMixer = isLand ? this.l3Mixer : this.mixer;
    if (activeMixer) activeMixer.update(deltaTime);

    // Update Emotes
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      e.life -= deltaTime;
      e.sprite.position.y += deltaTime * 0.4;
      e.sprite.material.opacity = Math.min(1, e.life * 2);
      if (e.life <= 0) {
        this.mesh.remove(e.sprite);
        e.sprite.material.dispose();
        this.emotes.splice(i, 1);
      }
    }

    const moving = !this.isPaused && (
      this.keys.has('w') || this.keys.has('s') ||
      this.keys.has('a') || this.keys.has('d') ||
      this.keys.has('arrowup') || this.keys.has('arrowdown') ||
      this.keys.has('arrowleft') || this.keys.has('arrowright')
    );

    // Weapon Recovery (Diver only)
    if (this.blasterMesh && !isLand) {
      const targetZ = 0.1;
      this.blasterMesh.position.z += (targetZ - this.blasterMesh.position.z) * 0.15;
      this.blasterMesh.position.set(0.18, -0.4, this.blasterMesh.position.z);
    }

    if (this.weaponLight) {
      this.weaponLight.intensity *= 0.85;
      this.weaponLight.intensity += (0.6 + Math.sin(this.elapsedTime * 8) * 0.2) * 0.1;
    }

    // 🚀 Dynamic Movement: Booster (L1/L2) vs Walk (L3)
    if (this.model) {
      if (this.thrusters) this.thrusters.visible = !isLand;

      if (!isLand) {
        // Booster Physics
        const targetLeanX = moving ? 0.35 : 0;
        const targetBobY = 1.3 + Math.sin(this.elapsedTime * 2.5) * 0.05;
        this.model.rotation.x += (targetLeanX - this.model.rotation.x) * 0.1;
        this.model.position.y += (targetBobY - this.model.position.y) * 0.1;
      } else {
        // Land Physics (Walk)
        this.model.rotation.x += (0 - this.model.rotation.x) * 0.1;
        this.model.position.y = 1.25; // Fixed height on ground
      }
      this.model.rotation.z += (0 - this.model.rotation.z) * 0.1;

      // Animation selection
      const activeAnims = isLand ? this.l3Animations : this.animations;
      if (activeMixer && Object.keys(activeAnims).length > 0) {
        const animKey = isLand ? (moving ? 'walk' : 'idle') : (moving ? 'swim' : 'idle');
        let targetClip = null;
        for (const name in activeAnims) {
          if (name.toLowerCase().includes(animKey)) {
            targetClip = activeAnims[name];
            break;
          }
        }
        if (!targetClip) targetClip = Object.values(activeAnims)[0];
        if (this.currentAction !== targetClip) {
          if (this.currentAction) this.currentAction.fadeOut(0.3);
          targetClip.reset().fadeIn(0.3).play();
          this.currentAction = targetClip;
        }
      }

      // Thruster Lights & Swivel
      if (this.thrusters && !isLand) {
        // Dynamic swivel based on horizontal movement
        let targetSwivelZ = 0;
        if (this.keys.has('a') || this.keys.has('arrowleft')) targetSwivelZ = 0.25;
        if (this.keys.has('d') || this.keys.has('arrowright')) targetSwivelZ = -0.25;
        this.thrusters.rotation.z += (targetSwivelZ - this.thrusters.rotation.z) * 0.15;

        this.thrusters.traverse(c => {
          if (c.isPointLight) {
            const targetInt = moving ? 2.5 + Math.random() * 1.5 : 0.5;
            c.intensity += (targetInt - c.intensity) * 0.2;
          }
        });
        
        // Spawn particles from each nozzle individually
        if (moving && fxSystem) {
          const jetDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
          
          this.thrusters.children.forEach(child => {
            if (child.name === 'jet_port' && Math.random() > 0.6) {
              const nozzlePos = new THREE.Vector3();
              child.getWorldPosition(nozzlePos);
              // Offset slightly to the tip of the jet
              const offset = new THREE.Vector3(0, -0.12, 0).applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()));
              nozzlePos.add(offset);

              fxSystem.spawnBoosterTrail(nozzlePos, jetDir);
              if (Math.random() > 0.85) fxSystem.spawnBubbleBurst(nozzlePos, 1);
            }
          });
        }
      }
    }

    if (this.coreLight) {
      this.coreLight.intensity *= 0.9;
      this.coreLight.intensity += (1.0 + Math.sin(this.elapsedTime * 10) * 0.4) * 0.1;
    }

    if (this.isPaused) return;

    // Gravity & Jump Physics
    if (this.isJumping) {
      this.mesh.position.y += this.vy;
      this.vy -= 0.008; // Gravity
      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.isJumping = false;
        this.vy = 0;
      }
    }

    const dir = new THREE.Vector3();
    if (this.keys.has('w') || this.keys.has('arrowup'))    dir.z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown'))  dir.z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft'))  dir.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(PLAYER_SPEED * speedMultiplier * deltaTime);
      this.mesh.position.add(dir);
      this.#clamp();
    }

    // Aiming
    if (mouseTargetPos) {
      const aimDir = new THREE.Vector3().subVectors(mouseTargetPos, this.mesh.position);
      aimDir.y = 0;
      if (aimDir.lengthSq() > 0.01) {
        this.targetRotationY = Math.atan2(aimDir.x, aimDir.z);
      }
    }

    const deltaY = this.targetRotationY - this.mesh.rotation.y;
    const wrappedY = ((deltaY + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.mesh.rotation.y += wrappedY * Math.min(1, deltaTime * 14);
  }

  #clamp() {
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, this.bounds.minX, this.bounds.maxX);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, this.bounds.minZ, this.bounds.maxZ);
  }

  resetPosition() { this.mesh.position.set(0, 0.45, 0); }
  setPaused(val)  { this.isPaused = val; }
  clearKeys()     { this.keys.clear(); }
}

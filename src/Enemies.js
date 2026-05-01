import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export class TrashSlime {
  constructor(bounds, initialPos, gltf) {
    this.bounds = bounds;
    this.hp = 30;
    this.maxHp = 30;
    this.speed = 1.8;
    this.isAlive = true;
    this.damageCooldown = 0;
    this.materials = [];
    this.mixer = null;

    this.mesh = new THREE.Group();

    if (gltf) {
      const model = SkeletonUtils.clone(gltf.scene);
      model.scale.set(1.5, 1.5, 1.5); // Tune scale
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            // Need to save original color for flash reset
            child.userData.originalColor = child.material.color.getHex();
            this.materials.push(child);
          }
        }
      });
      this.mesh.add(model);
      
      this.mixer = new THREE.AnimationMixer(model);
      if (gltf.animations && gltf.animations.length > 0) {
        const action = this.mixer.clipAction(gltf.animations[0]);
        action.play();
      }
    }
    
    if (initialPos) {
      this.mesh.position.copy(initialPos);
    } else {
      // Spawn at edges
      const angle = Math.random() * Math.PI * 2;
      const r = 20;
      this.mesh.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
    }
    this.mesh.position.y = 0.4;
    
    // Simple wobble animation state
    this.timeOffset = Math.random() * 10;
  }

  takeDamage(amount) {
    this.hp -= amount;
    // Flash red
    this.materials.forEach(child => {
      if (child.material.emissive) child.material.emissive.setHex(0xff0000);
      else child.material.color.setHex(0xff3333);
    });

    setTimeout(() => {
      if (this.isAlive) {
        this.materials.forEach(child => {
          if (child.material.emissive) child.material.emissive.setHex(0x000000);
          else child.material.color.setHex(child.userData.originalColor);
        });
      }
    }, 150);

    if (this.hp <= 0 && this.isAlive) {
      this.isAlive = false;
    }
  }

  update(dt, elapsed, playerPos) {
    if (!this.isAlive) return;

    this.damageCooldown -= dt;
    if (this.mixer) this.mixer.update(dt);

    // Chase player
    const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    if (dir.length() > 0.1) {
      dir.normalize();
      this.mesh.position.addScaledVector(dir, this.speed * dt);
      
      // Look at player (flip because mixamo models often face +Z or -Z depending)
      // Standard is facing +Z, atan2(x, z) points there. If backwards, use -dir.x, -dir.z
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }
}

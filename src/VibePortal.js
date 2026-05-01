import * as THREE from 'three';

export class VibePortal {
  constructor(scene, isExit = true) {
    this.scene = scene;
    this.isExit = isExit;
    this.mesh = this.#createPortalMesh();
    this.active = false;
    this.radius = 1.2;
    
    this.scene.add(this.mesh);
  }

  #createPortalMesh() {
    const group = new THREE.Group();

    // 🌀 The Vortex Ring
    const torusGeo = new THREE.TorusGeometry(1.5, 0.08, 16, 100);
    const torusMat = new THREE.MeshBasicMaterial({ 
      color: this.isExit ? 0xff3366 : 0x33ffcc, 
      transparent: true, 
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI / 2;
    group.add(torus);

    // ✨ Inner Glow
    const innerGeo = new THREE.CircleGeometry(1.4, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: this.isExit ? 0xff0044 : 0x00ffaa,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = Math.PI / 2;
    group.add(inner);

    // 💡 Point Light
    const light = new THREE.PointLight(this.isExit ? 0xff0044 : 0x00ffaa, 50, 8);
    light.position.y = 1.0;
    group.add(light);

    // 📝 Label (Floating Text using Sprite)
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Chakra Petch, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.isExit ? 'EXIT PORTAL' : 'ARRIVAL', 128, 40);
    
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.8;
    sprite.scale.set(2, 0.5, 1);
    group.add(sprite);

    return group;
  }

  spawn(pos) {
    this.mesh.position.copy(pos);
    this.active = true;
  }

  update(time) {
    if (!this.active) return;
    this.mesh.rotation.y += 0.02;
    // Pulsing effect
    const scale = 1.0 + Math.sin(time * 3) * 0.05;
    this.mesh.scale.set(scale, scale, scale);
  }

  checkCollision(playerPos) {
    if (!this.active) return false;
    const dist = playerPos.distanceTo(this.mesh.position);
    return dist < this.radius;
  }

  teleport() {
    if (!this.isExit) return;
    
    // Construct the Vibe Jam Portal URL
    const url = new URL('https://vibejam.cc/portal/2026');
    const params = new URLSearchParams(window.location.search);
    
    // Pass current context
    url.searchParams.set('ref', window.location.hostname);
    url.searchParams.set('portal', 'true');
    
    // Optional stats (if available)
    if (window.player) {
      url.searchParams.set('username', 'Terra Guardian');
      url.searchParams.set('color', '#ff3366');
      url.searchParams.set('hp', Math.floor(window.player.hp || 100));
    }

    console.log("Teleporting to Multiverse...", url.toString());
    window.location.href = url.toString();
  }

  remove() {
    this.scene.remove(this.mesh);
    this.active = false;
  }
}

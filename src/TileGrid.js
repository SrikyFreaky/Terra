import * as THREE from 'three';
import {
  CLEAN_DELAY,
  GRID_SIZE,
  TILE_SIZE,
} from './config.js';
import { rollMaterialDrop } from './Inventory.js';

export class TileGrid {
  constructor(inventory, layerColors) {
    this.inventory = inventory;
    this.dirtyColor = layerColors.dirtyColor;
    this.cleanColor = layerColors.cleanColor;
    this.currentLayer = layerColors.layer ?? 1;
    this.size = GRID_SIZE;
    this.tileSize = TILE_SIZE;
    this.totalTiles = this.size * this.size;
    this.cleanedCount = 0;
    this.cleanedPercent = 0;
    this.loggedNearbyDirty = false;
    this.tiles = Array.from({ length: this.totalTiles }, () => ({
      state: 'dirty',
      cleanProgress: 0,
    }));
    this.color = new THREE.Color();
    this.cleanColorObj = new THREE.Color(this.cleanColor);
    this.dirtyColorObj = new THREE.Color(this.dirtyColor);
    this.flashColor = new THREE.Color(0x9fffea);
    this.tilePositions = [];
    this.feedback = new Float32Array(this.totalTiles);
    this.activeFeedback = new Set();
    this.matrix = new THREE.Matrix4();

    const geometry = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.08, TILE_SIZE * 0.98);
    this.tileColors = new THREE.InstancedBufferAttribute(
      new Float32Array(this.totalTiles * 3),
      3,
    );
    this.tileColors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('tileColor', this.tileColors);

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 tileColor;
        varying vec3 vColor;

        void main() {
          vColor = tileColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.totalTiles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.#placeTiles();
  }

  #placeTiles() {
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color(this.dirtyColor);
    const offset = ((this.size - 1) * this.tileSize) / 2;

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        const index = this.getTileIndex(row, col);
        const position = new THREE.Vector3(
          col * this.tileSize - offset,
          -0.04,
          row * this.tileSize - offset,
        );
        this.tilePositions[index] = position;
        matrix.makeTranslation(position.x, position.y, position.z);

        this.mesh.setMatrixAt(index, matrix);
        color.toArray(this.tileColors.array, index * 3);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.tileColors.needsUpdate = true;
  }

  updateFeedback(deltaTime) {
    if (!this.activeFeedback.size) return;

    let matrixNeedsUpdate = false;
    const completed = [];

    for (const index of this.activeFeedback) {
      const next = Math.max(0, this.feedback[index] - deltaTime * 3.6);
      this.feedback[index] = next;
      this.#updateTileVisual(index);
      matrixNeedsUpdate = true;
      if (next <= 0) completed.push(index);
    }

    for (const index of completed) {
      this.activeFeedback.delete(index);
      this.#updateTileVisual(index);
    }

    this.tileColors.needsUpdate = true;
    if (matrixNeedsUpdate) this.mesh.instanceMatrix.needsUpdate = true;
  }

  updateCleaning(position, deltaTime, radius) {
    const nearbyTileIndices = this.getNearbyTileIndices(position, radius);
    let nearbyDirtyCount = 0;
    const cleanedPositions = [];

    for (const index of nearbyTileIndices) {
      const tile = this.tiles[index];

      if (tile.state === 'clean') {
        continue;
      }

      nearbyDirtyCount += 1;
      tile.cleanProgress += deltaTime;

      if (tile.cleanProgress >= CLEAN_DELAY) {
        const cleanedPosition = this.setTileState(index, 'clean');
        if (cleanedPosition) cleanedPositions.push(cleanedPosition);
      }
    }

    if (nearbyDirtyCount > 0 && !this.loggedNearbyDirty) {
      this.loggedNearbyDirty = true;
    }

    return cleanedPositions;
  }

  setTileState(index, state) {
    const tile = this.tiles[index];

    if (!tile || tile.state === state) {
      return;
    }

    tile.state = state;
    if (state === 'clean') {
      this.feedback[index] = 1;
      this.activeFeedback.add(index);
    } else {
      this.feedback[index] = 0;
      this.activeFeedback.delete(index);
    }
    this.#updateTileVisual(index);
    this.tileColors.needsUpdate = true;

    if (state === 'clean') {
      this.cleanedCount += 1;
      this.cleanedPercent = (this.cleanedCount / this.totalTiles) * 100;

      const material = rollMaterialDrop(this.currentLayer);
      this.inventory.add(material);
      return this.tilePositions[index]?.clone() ?? null;
    } else {
      tile.cleanProgress = 0;
      this.cleanedCount = Math.max(0, this.cleanedCount - 1);
      this.cleanedPercent = (this.cleanedCount / this.totalTiles) * 100;
    }

    return null;
  }

  getTileIndex(row, col) {
    return row * this.size + col;
  }

  getTileFromWorldPosition(x, z) {
    const offset = ((this.size - 1) * this.tileSize) / 2;
    const col = Math.round((x + offset) / this.tileSize);
    const row = Math.round((z + offset) / this.tileSize);

    if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
      return null;
    }

    const index = this.getTileIndex(row, col);

    return {
      index,
      row,
      col,
      tile: this.tiles[index],
    };
  }

  getNearbyTileIndices(position, radius) {
    const centerTile = this.getTileFromWorldPosition(position.x, position.z);

    if (!centerTile) {
      return [];
    }

    const nearbyTileIndices = [];
    const maxTileDistance = Math.ceil(radius);
    const radiusWorld = radius * this.tileSize;

    for (let row = centerTile.row - maxTileDistance; row <= centerTile.row + maxTileDistance; row += 1) {
      for (let col = centerTile.col - maxTileDistance; col <= centerTile.col + maxTileDistance; col += 1) {
        if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
          continue;
        }

        const tilePosition = this.#getTileWorldPosition(row, col);
        const distanceX = position.x - tilePosition.x;
        const distanceZ = position.z - tilePosition.z;
        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);

        if (distance <= radiusWorld) {
          nearbyTileIndices.push(this.getTileIndex(row, col));
        }
      }
    }

    return nearbyTileIndices;
  }

  getBounds() {
    const half = (this.size * this.tileSize) / 2 - this.tileSize / 2;

    return {
      minX: -half,
      maxX: half,
      minZ: -half,
      maxZ: half,
    };
  }

  dirtyNearbyCleanTile(position, radius) {
    const nearbyTileIndices = this.getNearbyTileIndices(position, radius);
    const cleanTileIndex = nearbyTileIndices.find((index) => {
      return this.tiles[index].state === 'clean';
    });

    if (cleanTileIndex === undefined) {
      return false;
    }

    this.setTileState(cleanTileIndex, 'dirty');
    return true;
  }

  dirtyRandomCleanTile() {
    const cleanTileIndices = [];

    for (let index = 0; index < this.tiles.length; index += 1) {
      if (this.tiles[index].state === 'clean') {
        cleanTileIndices.push(index);
      }
    }

    if (cleanTileIndices.length === 0) {
      return false;
    }

    const randomIndex = Math.floor(Math.random() * cleanTileIndices.length);
    this.setTileState(cleanTileIndices[randomIndex], 'dirty');

    return true;
  }

  resetAllTiles() {
    for (const tile of this.tiles) {
      tile.state = 'dirty';
      tile.cleanProgress = 0;
    }

    this.cleanedCount = 0;
    this.cleanedPercent = 0;
    this.loggedNearbyDirty = false;
    this.feedback.fill(0);
    this.activeFeedback.clear();
    this.#updateAllTileColors();
  }

  setLayerColors(dirtyColor, cleanColor, layer) {
    this.dirtyColor = dirtyColor;
    this.cleanColor = cleanColor;
    this.dirtyColorObj.set(dirtyColor);
    this.cleanColorObj.set(cleanColor);
    if (layer !== undefined) this.currentLayer = layer;
    this.#updateAllTileColors();
  }

  #updateAllTileColors() {
    for (let index = 0; index < this.tiles.length; index += 1) {
      this.#updateTileVisual(index);
    }

    this.tileColors.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  #updateTileVisual(index) {
    const tile = this.tiles[index];
    const pulse = this.feedback[index] ?? 0;
    const baseColor = tile.state === 'clean' ? this.cleanColorObj : this.dirtyColorObj;
    const flash = Math.sin(pulse * Math.PI);
    this.color.copy(baseColor).lerp(this.flashColor, flash * 0.45);
    this.color.multiplyScalar(1 + flash * 0.3);
    this.color.toArray(this.tileColors.array, index * 3);

    const position = this.tilePositions[index];
    if (!position) return;
    const scale = 1 + flash * 0.1;
    this.matrix.makeScale(scale, 1 + flash * 0.35, scale);
    this.matrix.setPosition(position.x, position.y + flash * 0.015, position.z);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  #getTileWorldPosition(row, col) {
    const offset = ((this.size - 1) * this.tileSize) / 2;

    return new THREE.Vector3(
      col * this.tileSize - offset,
      0,
      row * this.tileSize - offset,
    );
  }
}

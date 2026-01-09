import * as THREE from 'three';
import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 6) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; 

        this.chunks = new Map(); 
        
        // Cache
        this.lastChunkKey = '';
        this.lastChunk = null;

        this.lastUpdate = 0;
        this.chunkMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true
        });

        // Optimization: Reusable vectors for sorting math
        this._cameraForward = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        this.generationQueue = [];
    }

    reset() {
        for (const [key, chunk] of this.chunks) {
            chunk.dispose();
        }
        this.chunks.clear();
        this.lastChunk = null;
        this.lastChunkKey = '';
        this.generationQueue = [];
    }

    update(playerPos, camera) {
        const now = performance.now();
        const TIME_BUDGET = 4.0; // Milliseconds max per frame for generation

        // 1. Update the Load Queue (throttled to every 100ms)
        // We recalculate priorities less often than we generate
        if (now - this.lastUpdate > 100) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        // 2. Process Queue with Time Budget
        // Generate as many chunks as possible within the 4ms window
        // This ensures high FPS even on lower-end devices
        const workStart = performance.now();
        
        while (this.generationQueue.length > 0) {
            // Safety break if we exceed budget
            if (performance.now() - workStart > TIME_BUDGET) break;

            const req = this.generationQueue.shift();
            
            // Double check if chunk is still needed (player might have moved)
            if (!this.chunks.has(req.key)) {
                this.createChunk(req.x, req.z, req.key);
            }
        }
    }

    updateQueue(playerPos, camera) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        // Get camera direction for Frustum Priority
        if (camera) {
            camera.getWorldDirection(this._cameraForward);
            this._cameraForward.y = 0;
            this._cameraForward.normalize();
        }

        const activeKeys = new Set();
        const newQueue = [];

        // Scan area
        // We scan a slightly wider area than render distance to buffer turns
        const range = this.renderDistance;
        
        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                // Absolute World Position of chunk center
                const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);

                const distSq = (wx - playerPos.x)**2 + (wz - playerPos.z)**2;
                const maxDistSq = (this.renderDistance * this.chunkSize) ** 2;

                if (distSq > maxDistSq) continue;

                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    // --- Priority Calculation ---
                    // 1. Distance Score (Close = Low number = Higher Priority)
                    let score = distSq;

                    // 2. Frustum Bias
                    // If chunk is in front of camera, reduce score (increase priority) artificially.
                    // This ensures chunks the player is looking at load first.
                    if (camera) {
                        const dirX = wx - playerPos.x;
                        const dirZ = wz - playerPos.z;
                        
                        // Normalized direction to chunk (approx)
                        const len = Math.sqrt(distSq) || 1;
                        const ndx = dirX / len;
                        const ndz = dirZ / len;

                        // Dot Product: 1.0 = Straight Ahead, -1.0 = Behind
                        const dot = (ndx * this._cameraForward.x) + (ndz * this._cameraForward.z);

                        // If ahead (dot > 0), subtract huge value to prioritize.
                        // If behind (dot < 0), add penalty.
                        // Weight of 50000 ensures chunks 50m ahead load before chunks 10m behind.
                        score -= (dot * 50000);
                    }

                    newQueue.push({ x: chunkX, z: chunkZ, key, score });
                }
            }
        }

        // Unload old chunks
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                chunk.dispose();
                this.chunks.delete(key);
            }
        }

        // Sort queue by Score (Ascending)
        newQueue.sort((a, b) => a.score - b.score);
        this.generationQueue = newQueue;
    }

    createChunk(x, z, key) {
        const chunk = new Chunk(x, z, this.scene, this.racePath, this.chunkMaterial);
        this.chunks.set(key, chunk);
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        const key = `${cx},${cz}`;
        let chunk;

        if (key === this.lastChunkKey && this.lastChunk) {
            chunk = this.lastChunk;
        } else {
            chunk = this.chunks.get(key);
            this.lastChunk = chunk;
            this.lastChunkKey = key;
        }
        
        if (!chunk) return false; 
        
        const lx = Math.floor(x) - (cx * this.chunkSize);
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - (cz * this.chunkSize);
        
        return chunk.getBlock(lx, ly, lz);
    }
}
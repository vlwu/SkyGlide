import * as THREE from 'three';
import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 6) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; 

        this.chunks = new Map(); 
        this.lastChunkKey = '';
        this.lastChunk = null;

        this.chunkMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true
        });

        this._cameraForward = new THREE.Vector3();
        this.generationQueue = [];
        this.lastUpdate = 0;
        this.frameCounter = 0; // Optimization: For throttling updates

        // Culling optimizations
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        // Render distance in units (chunkSize * renderDistance) + margin, squared
        this.maxVisibleDistSq = (chunkSize * renderDistance + 32) ** 2;

        this.worker = new Worker(new URL('./ChunkWorker.js', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e) => {
            const { key } = e.data;
            const chunk = this.chunks.get(key);
            if (chunk) {
                chunk.applyMesh(e.data);
            }
        };
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

    hasChunk(cx, cz) {
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        return chunk && chunk.isLoaded;
    }

    update(playerPos, camera) {
        this.frameCounter++;
        const now = performance.now();
        
        // 1. Culling & Visibility Update
        // Update frustum from camera
        this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        for (const chunk of this.chunks.values()) {
            if (!chunk.mesh) continue;

            const dx = chunk.worldX - playerPos.x;
            const dz = chunk.worldZ - playerPos.z;
            const distSq = dx*dx + dz*dz;

            // Distance Culling: Skip rendering if beyond max visual range
            if (distSq > this.maxVisibleDistSq) {
                chunk.setVisible(false);
                continue;
            }

            // Frustum Culling: Skip if bbox is not in camera view
            if (!this.frustum.intersectsBox(chunk.bbox)) {
                chunk.setVisible(false);
                continue;
            }

            // If visible
            chunk.setVisible(true);

            // Shadow LOD (Throttled)
            if (this.frameCounter % 15 === 0) {
                chunk.update(distSq);
            }
        }

        // 2. Chunk Queue Update (Throttled)
        if (now - this.lastUpdate > 200) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        const JOBS_PER_FRAME = 2;
        let dispatched = 0;

        while (this.generationQueue.length > 0 && dispatched < JOBS_PER_FRAME) {
            const req = this.generationQueue.shift();
            
            if (this.chunks.has(req.key)) continue;

            const chunk = new Chunk(req.x, req.z, this.scene, this.chunkMaterial);
            this.chunks.set(req.key, chunk);

            const pathSegments = {};
            const startZ = req.z * this.chunkSize;
            
            // Optimization: Only checking segments relevant to this chunk size
            for (let z = 0; z < this.chunkSize; z++) {
                const wz = startZ + z;
                const points = this.racePath.getPointsAtZ(wz);
                if (points && points.length > 0) {
                    pathSegments[wz] = points.map(p => ({ x: p.x, y: p.y }));
                }
            }

            this.worker.postMessage({
                x: req.x,
                z: req.z,
                size: this.chunkSize,
                height: 96,
                pathSegments: pathSegments
            });

            dispatched++;
        }
    }

    updateQueue(playerPos, camera) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        if (camera) {
            camera.getWorldDirection(this._cameraForward);
            this._cameraForward.y = 0;
            this._cameraForward.normalize();
        }

        const activeKeys = new Set();
        const newQueue = [];
        const range = this.renderDistance;
        const rangeSq = (range * this.chunkSize) ** 2;

        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    // Optimization: Culling based on camera direction
                    const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                    const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                    
                    const dirX = wx - playerPos.x;
                    const dirZ = wz - playerPos.z;
                    const distSq = dirX*dirX + dirZ*dirZ;

                    // Skip if outside circular render distance
                    if (distSq > rangeSq * 1.2) continue;

                    let score = distSq;
                    
                    if ((chunkX >= -1 && chunkX <= 0) && (chunkZ >= -1 && chunkZ <= 0)) {
                        score = -99999999;
                    } else if (camera) {
                        const len = Math.sqrt(distSq) || 1;
                        const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                        score -= (dot * 50000); 
                    }
                    newQueue.push({ x: chunkX, z: chunkZ, key, score });
                }
            }
        }

        // Garbage Collect distant chunks
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                chunk.dispose();
                this.chunks.delete(key);
            }
        }

        newQueue.sort((a, b) => a.score - b.score);
        this.generationQueue = newQueue;
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        const key = `${cx},${cz}`;
        let chunk;

        // Optimization: LRU Cache of 1
        if (key === this.lastChunkKey && this.lastChunk) {
            chunk = this.lastChunk;
        } else {
            chunk = this.chunks.get(key);
            if (chunk) {
                this.lastChunk = chunk;
                this.lastChunkKey = key;
            }
        }
        
        if (!chunk || !chunk.isLoaded) return false; 
        
        const lx = Math.floor(x) - (cx * this.chunkSize);
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - (cz * this.chunkSize);
        
        return chunk.getBlock(lx, ly, lz);
    }
}
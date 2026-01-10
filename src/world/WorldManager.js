import * as THREE from 'three';
import { Chunk } from './Chunk.js';
import { CONFIG } from '../config/Config.js';

// Helper for bitwise packing of chunk coordinates to 32-bit int
const getChunkKey = (x, z) => (x & 0xFFFF) << 16 | (z & 0xFFFF);

export class WorldManager {
    constructor(scene, racePath) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = CONFIG.WORLD.CHUNK_SIZE;
        this.renderDistance = CONFIG.WORLD.RENDER_DISTANCE;

        // OPTIMIZATION: Use integer keys for map lookups
        this.chunks = new Map(); 
        this._chunkArray = [];
        
        // Cache for fast lookups
        this.chunkCache = []; 

        this.chunkMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true
        });

        this.waterMaterial = new THREE.MeshLambertMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide 
        });

        this._cameraForward = new THREE.Vector3();
        this.generationQueue = [];
        this.applyQueue = [];
        this.pendingRequests = new Set(); // Track chunks in-flight
        
        this.lastUpdate = 0;
        this.lastVisibilityUpdate = 0;
        this.frameCounter = 0; 

        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        
        this.updateMaxVisibleDist();
        this.precomputeLODTemplates(); 

        this.disposalQueue = [];

        // IMPROVEMENT: Worker Pool Optimization
        this.workerPool = [];
        this.freeWorkers = [];
        
        // Determine concurrency: Use logical cores - 1 (for main thread), min 2, max 6
        const concurrency = navigator.hardwareConcurrency || 4;
        const workerCount = Math.max(2, Math.min(6, concurrency - 1));
        
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker(new URL('./ChunkWorker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                const data = e.data;
                const key = getChunkKey(data.x, data.z);
                data.key = key;
                
                this.pendingRequests.delete(key);
                this.applyQueue.push(data);
                
                this.freeWorkers.push(worker);
            };
            this.workerPool.push(worker);
            this.freeWorkers.push(worker);
        }
    }

    setRenderDistance(dist) {
        if (this.renderDistance !== dist) {
            this.renderDistance = dist;
            this.updateMaxVisibleDist();
            this.precomputeLODTemplates();
            this.lastUpdate = 0;
        }
    }

    updateMaxVisibleDist() {
        this.maxVisibleDistSq = (this.chunkSize * this.renderDistance + 32) ** 2;
    }

    precomputeLODTemplates() {
        this.lodTemplates = [];
        const range = this.renderDistance;
        const lodLowRad = CONFIG.WORLD.LOD.DIST_LOW;
        const lodFarRad = CONFIG.WORLD.LOD.DIST_FAR;

        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const distChunks = Math.max(Math.abs(x), Math.abs(z));
                let targetLOD = 1;
                if (distChunks > lodFarRad) targetLOD = 4;
                else if (distChunks > lodLowRad) targetLOD = 2;
                
                this.lodTemplates.push({ dx: x, dz: z, lod: targetLOD });
            }
        }
    }

    reset() {
        const chunksToDispose = Array.from(this.chunks.values());
        for (const chunk of chunksToDispose) {
            chunk.dispose();
        }
        this.chunks.clear();
        this._chunkArray = [];
        this.chunkCache = [];
        
        this.generationQueue = [];
        this.applyQueue = [];
        this.disposalQueue = [];
        this.pendingRequests.clear();
    }

    hasChunk(cx, cz) {
        const key = getChunkKey(cx, cz);
        const chunk = this.chunks.get(key);
        return chunk && chunk.isLoaded;
    }

    update(player, camera) {
        this.frameCounter++;
        const now = performance.now();
        const playerPos = player.position;
        
        // 1. Process Apply Queue (Meshing)
        const applyStart = performance.now();
        // Budget 6ms for mesh application (increased from 4ms for better throughput)
        while (this.applyQueue.length > 0) {
             if (performance.now() - applyStart > 6) break;

             const data = this.applyQueue.shift();
             const chunk = this.chunks.get(data.key);
             
             if (chunk) {
                 chunk.applyMesh(data);
             }
        }

        // 2. Process Disposal
        while (this.disposalQueue.length > 0) {
            const chunk = this.disposalQueue.shift();
            chunk.dispose();
        }

        // 3. Visibility Culling (Every ~33ms / 30fps)
        if (now - this.lastVisibilityUpdate > 33) {
            this.lastVisibilityUpdate = now;

            this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

            if (camera) {
                camera.getWorldDirection(this._cameraForward);
            }

            const safeRadiusSq = CONFIG.WORLD.SAFE_RADIUS_SQ;
            const chunks = this._chunkArray;
            const len = chunks.length;

            for (let i = 0; i < len; i++) {
                const chunk = chunks[i];
                // Only update visibility for loaded meshes
                if (!chunk.mesh && !chunk.waterMesh) continue;

                const dx = chunk.worldX - playerPos.x;
                const dz = chunk.worldZ - playerPos.z;
                const distSq = dx*dx + dz*dz;

                let isVisible = false;

                if (distSq <= this.maxVisibleDistSq) {
                    if (distSq > safeRadiusSq) {
                        if (this.frustum.intersectsBox(chunk.bbox)) {
                            isVisible = true;
                        }
                    } else {
                        isVisible = true;
                    }
                }

                chunk.setVisible(isVisible);

                if (isVisible) {
                    chunk.update(distSq);
                }
            }
        }

        // 4. Update Generation Queue (Every 100ms) - Increased frequency
        if (now - this.lastUpdate > 100) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        // 5. Dispatch Workers
        while (this.generationQueue.length > 0 && this.freeWorkers.length > 0) {
            const req = this.generationQueue[0]; // Peek
            
            // Skip if already pending
            if (this.pendingRequests.has(req.key)) {
                this.generationQueue.shift();
                continue;
            }

            let chunk = this.chunks.get(req.key);
            
            // Check if work is actually needed
            if (chunk && chunk.isLoaded && chunk.lod === req.lod) {
                this.generationQueue.shift();
                continue;
            }

            // Create chunk placeholder if missing
            if (!chunk) {
                chunk = new Chunk(req.x, req.z, this.scene, this.chunkMaterial, this.waterMaterial);
                this.chunks.set(req.key, chunk);
                this._chunkArray.push(chunk);
            }

            // Consume request
            this.generationQueue.shift();
            this.pendingRequests.add(req.key);
            
            const worker = this.freeWorkers.pop();

            // Prepare path data for this chunk
            const pathSegments = {};
            const startZ = req.z * this.chunkSize;
            
            for (let z = 0; z < this.chunkSize; z++) {
                const wz = startZ + z;
                const points = this.racePath.getPointsAtZ(wz);
                if (points && points.length > 0) {
                    pathSegments[wz] = points.map(p => ({ x: p.x, y: p.y }));
                }
            }

            worker.postMessage({
                x: req.x,
                z: req.z,
                lod: req.lod,
                size: this.chunkSize,
                height: CONFIG.WORLD.CHUNK_HEIGHT,
                pathSegments: pathSegments
            });
        }
    }

    updateQueue(playerPos, camera) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();
        const newQueue = [];
        
        const templates = this.lodTemplates;
        const len = templates.length;

        for (let i = 0; i < len; i++) {
            const t = templates[i];
            const chunkX = centerChunkX + t.dx;
            const chunkZ = centerChunkZ + t.dz;
            const key = getChunkKey(chunkX, chunkZ);
            
            activeKeys.add(key);

            const chunk = this.chunks.get(key);
            
            // If chunk needs load/update and isn't currently pending
            if ((!chunk || !chunk.isLoaded || chunk.lod !== t.lod) && !this.pendingRequests.has(key)) {
                const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                
                const dirX = wx - playerPos.x;
                const dirZ = wz - playerPos.z;
                const distSq = dirX*dirX + dirZ*dirZ;

                let score = distSq;
                
                // Aggressive prioritization for chunks in front of camera
                if (camera) {
                    const len = Math.sqrt(distSq) || 1;
                    const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                    // Higher dot = more in front. Subtracting large value drastically increases priority.
                    score -= (dot * 100000); 
                }

                // Spawn priority
                if ((chunkX >= -1 && chunkX <= 0) && (chunkZ >= -1 && chunkZ <= 0)) {
                    score = -Number.MAX_SAFE_INTEGER;
                }
                
                newQueue.push({ x: chunkX, z: chunkZ, key, score, lod: t.lod });
            }
        }

        // Garbage collect distant chunks
        let reindex = false;
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                this.chunks.delete(key);
                this.disposalQueue.push(chunk);
                this.pendingRequests.delete(key);
                reindex = true;
            }
        }

        if (reindex) {
            this._chunkArray = Array.from(this.chunks.values());
            this.chunkCache = []; 
        }

        newQueue.sort((a, b) => a.score - b.score);
        this.generationQueue = newQueue;
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        // Check cache (LRU)
        for (let i = 0; i < this.chunkCache.length; i++) {
            const c = this.chunkCache[i];
            if (c.x === cx && c.z === cz) {
                if (c.isLoaded && c.data) {
                    if (i > 0) {
                        this.chunkCache.splice(i, 1);
                        this.chunkCache.unshift(c);
                    }
                    const lx = Math.floor(x) - (cx * this.chunkSize);
                    const ly = Math.floor(y);
                    const lz = Math.floor(z) - (cz * this.chunkSize);
                    
                    if (lx < 0 || lx >= this.chunkSize || ly < 0 || ly >= CONFIG.WORLD.CHUNK_HEIGHT || lz < 0 || lz >= this.chunkSize) return 0;
                    return c.data[lx + this.chunkSize * (ly + CONFIG.WORLD.CHUNK_HEIGHT * lz)];
                }
                return 0;
            }
        }

        const key = getChunkKey(cx, cz);
        const chunk = this.chunks.get(key);
        
        if (chunk && chunk.isLoaded && chunk.data) {
            this.chunkCache.unshift(chunk);
            if (this.chunkCache.length > 4) this.chunkCache.pop();

            const lx = Math.floor(x) - (cx * this.chunkSize);
            const ly = Math.floor(y);
            const lz = Math.floor(z) - (cz * this.chunkSize);

            if (lx < 0 || lx >= this.chunkSize || ly < 0 || ly >= CONFIG.WORLD.CHUNK_HEIGHT || lz < 0 || lz >= this.chunkSize) return 0;
            return chunk.data[lx + this.chunkSize * (ly + CONFIG.WORLD.CHUNK_HEIGHT * lz)];
        }
        
        return 0; 
    }
}
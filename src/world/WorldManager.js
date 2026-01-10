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
        
        this.lastUpdate = 0;
        this.lastVisibilityUpdate = 0;
        this.frameCounter = 0; 
        
        this.chunkCooldown = 0;

        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        
        this.updateMaxVisibleDist();
        this.precomputeLODTemplates(); // Initialize LOD rings

        this.disposalQueue = [];

        this.worker = new Worker(new URL('./ChunkWorker.js', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e) => {
            // Reconstruct key from x,z coordinates
            const data = e.data;
            data.key = getChunkKey(data.x, data.z);
            this.applyQueue.push(data);
        };
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

    // OPTIMIZATION: Pre-calculate relative coordinates for each LOD ring
    precomputeLODTemplates() {
        this.lodTemplates = [];
        const range = this.renderDistance;
        const lodLowRad = CONFIG.WORLD.LOD.DIST_LOW;
        const lodFarRad = CONFIG.WORLD.LOD.DIST_FAR;

        // Flatten grid into array with assigned LOD
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
        this.chunkCooldown = 0;
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
        
        // Process Apply Queue (Batch with time limit)
        const applyStart = performance.now();
        while (this.applyQueue.length > 0) {
             // 4ms budget for applying meshes to maintain frame rate
             if (performance.now() - applyStart > 4) break;

             const data = this.applyQueue.shift();
             const chunk = this.chunks.get(data.key);
             if (chunk) {
                 chunk.applyMesh(data);
             }
        }

        // Process Disposal Queue (Drain completely)
        // Disposal is necessary to free memory and happens when chunks go out of range
        while (this.disposalQueue.length > 0) {
            const chunk = this.disposalQueue.shift();
            chunk.dispose();
        }

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

        if (now - this.lastUpdate > 200) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        if (this.chunkCooldown > 0) {
            this.chunkCooldown--;
        } else if (this.generationQueue.length > 0) {
            const req = this.generationQueue.shift();
            let chunk = this.chunks.get(req.key);
            
            if (!chunk) {
                chunk = new Chunk(req.x, req.z, this.scene, this.chunkMaterial, this.waterMaterial);
                this.chunks.set(req.key, chunk);
                this._chunkArray.push(chunk);
            }

            if (!chunk.isLoaded || chunk.lod !== req.lod) {
                const pathSegments = {};
                const startZ = req.z * this.chunkSize;
                
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
                    lod: req.lod,
                    size: this.chunkSize,
                    height: CONFIG.WORLD.CHUNK_HEIGHT,
                    pathSegments: pathSegments
                });

                this.chunkCooldown = 2;
            }
        }
    }

    updateQueue(playerPos, camera) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();
        const newQueue = [];
        
        const templates = this.lodTemplates;
        const len = templates.length;

        // Iterate pre-calculated templates instead of nested loops
        for (let i = 0; i < len; i++) {
            const t = templates[i];
            const chunkX = centerChunkX + t.dx;
            const chunkZ = centerChunkZ + t.dz;
            const key = getChunkKey(chunkX, chunkZ);
            
            activeKeys.add(key);

            const chunk = this.chunks.get(key);
            
            // Check if chunk needs generation or update
            if (!chunk || !chunk.isLoaded || chunk.lod !== t.lod) {
                const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                
                const dirX = wx - playerPos.x;
                const dirZ = wz - playerPos.z;
                const distSq = dirX*dirX + dirZ*dirZ;

                let score = distSq;
                
                // Prioritize behind player less (culling simulation)
                if (camera) {
                    const len = Math.sqrt(distSq) || 1;
                    const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                    score -= (dot * 50000); 
                }

                // Keep spawn loaded with high priority
                if ((chunkX >= -1 && chunkX <= 0) && (chunkZ >= -1 && chunkZ <= 0)) {
                    score = -99999999;
                }
                
                newQueue.push({ x: chunkX, z: chunkZ, key, score, lod: t.lod });
            }
        }

        let reindex = false;
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                this.chunks.delete(key);
                this.disposalQueue.push(chunk);
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
        
        // OPTIMIZATION: Check cache first (LRU-ish)
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

        // Slow lookup
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
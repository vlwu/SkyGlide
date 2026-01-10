import * as THREE from 'three';
import { Chunk } from './Chunk.js';
import { CONFIG } from '../config/Config.js';

export class WorldManager {
    constructor(scene, racePath) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = CONFIG.WORLD.CHUNK_SIZE;
        this.renderDistance = CONFIG.WORLD.RENDER_DISTANCE;

        this.chunks = new Map(); 
        this._chunkArray = [];
        
        // OPTIMIZATION: Small cache of recent chunks to avoid Map lookup in tight loops
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

        this.disposalQueue = [];

        this.worker = new Worker(new URL('./ChunkWorker.js', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e) => {
            this.applyQueue.push(e.data);
        };
    }

    setRenderDistance(dist) {
        if (this.renderDistance !== dist) {
            this.renderDistance = dist;
            this.updateMaxVisibleDist();
            this.lastUpdate = 0;
        }
    }

    updateMaxVisibleDist() {
        this.maxVisibleDistSq = (this.chunkSize * this.renderDistance + 32) ** 2;
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
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        return chunk && chunk.isLoaded;
    }

    update(player, camera) {
        this.frameCounter++;
        const now = performance.now();
        const playerPos = player.position;
        
        if (this.applyQueue.length > 0) {
             const data = this.applyQueue.shift();
             const chunk = this.chunks.get(data.key);
             if (chunk) {
                 chunk.applyMesh(data);
             }
        }

        if (this.disposalQueue.length > 0) {
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
        const range = this.renderDistance;
        
        const lodLowRad = CONFIG.WORLD.LOD.DIST_LOW;
        const lodFarRad = CONFIG.WORLD.LOD.DIST_FAR;

        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                activeKeys.add(key);

                const distChunks = Math.max(Math.abs(x), Math.abs(z));
                let targetLOD = 1;
                if (distChunks > lodFarRad) targetLOD = 4;
                else if (distChunks > lodLowRad) targetLOD = 2;

                const chunk = this.chunks.get(key);
                
                if (!chunk || !chunk.isLoaded || chunk.lod !== targetLOD) {
                    const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                    const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                    
                    const dirX = wx - playerPos.x;
                    const dirZ = wz - playerPos.z;
                    const distSq = dirX*dirX + dirZ*dirZ;

                    let score = distSq;
                    
                    if ((chunkX >= -1 && chunkX <= 0) && (chunkZ >= -1 && chunkZ <= 0)) {
                        score = -99999999;
                    } else if (camera) {
                        const len = Math.sqrt(distSq) || 1;
                        const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                        score -= (dot * 50000); 
                    }
                    newQueue.push({ x: chunkX, z: chunkZ, key, score, lod: targetLOD });
                }
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
                    // Move to front if not already
                    if (i > 0) {
                        this.chunkCache.splice(i, 1);
                        this.chunkCache.unshift(c);
                    }
                    // Inline array indexing math
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
        const key = `${cx},${cz}`;
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
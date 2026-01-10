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
        
        // Optimization: Integer cache for fast lookups
        this.lastChunk = null;
        this.lastChunkKey = '';
        this.lastCX = null;
        this.lastCZ = null;

        this.chunkMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true
        });

        this._cameraForward = new THREE.Vector3();
        this.generationQueue = [];
        this.applyQueue = [];
        
        this.lastUpdate = 0;
        this.lastVisibilityUpdate = 0;
        this.frameCounter = 0; 

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
        
        this.lastChunk = null;
        this.lastChunkKey = '';
        this.lastCX = null;
        this.lastCZ = null;
        this.generationQueue = [];
        this.applyQueue = [];
        this.disposalQueue = [];
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
        
        // Batched mesh application (2/frame)
        let applyCount = 0;
        while (this.applyQueue.length > 0 && applyCount < 2) {
             const data = this.applyQueue.shift();
             const chunk = this.chunks.get(data.key);
             if (chunk) {
                 chunk.applyMesh(data);
             }
             applyCount++;
        }

        let disposalCount = 0;
        while (this.disposalQueue.length > 0 && disposalCount < 2) {
            const chunk = this.disposalQueue.shift();
            chunk.dispose();
            disposalCount++;
        }

        // OPTIMIZATION: Throttle visibility checks to ~33Hz (30FPS)
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
                if (!chunk.mesh) continue;

                const dx = chunk.worldX - playerPos.x;
                const dz = chunk.worldZ - playerPos.z;
                const distSq = dx*dx + dz*dz;

                let isVisible = false;

                if (distSq <= this.maxVisibleDistSq) {
                    // Culling: Safe radius always visible, otherwise check frustum
                    if (distSq > safeRadiusSq) {
                        if (this.frustum.intersectsBox(chunk.bbox)) {
                            isVisible = true;
                        }
                    } else {
                        isVisible = true;
                    }
                }

                if (chunk.mesh.visible !== isVisible) {
                    chunk.setVisible(isVisible);
                }

                if (isVisible) {
                    chunk.update(distSq);
                }
            }
        }

        // OPTIMIZATION: Update chunk generation queue less frequently
        if (now - this.lastUpdate > 200) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        const speed = player.velocity.length();
        let jobsPerFrame = 2;
        if (speed < 5) jobsPerFrame = 4;
        else if (speed > 20) jobsPerFrame = 1;

        let dispatched = 0;

        while (this.generationQueue.length > 0 && dispatched < jobsPerFrame) {
            const req = this.generationQueue.shift();
            
            let chunk = this.chunks.get(req.key);
            
            // If new chunk
            if (!chunk) {
                chunk = new Chunk(req.x, req.z, this.scene, this.chunkMaterial);
                this.chunks.set(req.key, chunk);
                this._chunkArray.push(chunk);
            }

            // Dispatch if new or LOD changed
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

                dispatched++;
            }
        }
    }

    updateQueue(playerPos, camera) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();
        const newQueue = [];
        const range = this.renderDistance;
        
        // Define LOD radii in chunks
        const lodLowRad = CONFIG.WORLD.LOD.DIST_LOW;
        const lodFarRad = CONFIG.WORLD.LOD.DIST_FAR;

        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                activeKeys.add(key);

                // Calculate distance in chunk units
                const distChunks = Math.max(Math.abs(x), Math.abs(z));
                let targetLOD = 1;
                if (distChunks > lodFarRad) targetLOD = 4;
                else if (distChunks > lodLowRad) targetLOD = 2;

                const chunk = this.chunks.get(key);
                
                // Add to queue if missing OR if LOD needs update
                if (!chunk || !chunk.isLoaded || chunk.lod !== targetLOD) {
                    const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                    const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                    
                    const dirX = wx - playerPos.x;
                    const dirZ = wz - playerPos.z;
                    const distSq = dirX*dirX + dirZ*dirZ;

                    let score = distSq;
                    
                    // Priority: Center > Near Camera > Far
                    if ((chunkX >= -1 && chunkX <= 0) && (chunkZ >= -1 && chunkZ <= 0)) {
                        score = -99999999;
                    } else if (camera) {
                        const len = Math.sqrt(distSq) || 1;
                        const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                        // Penalize chunks behind camera
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
        }

        newQueue.sort((a, b) => a.score - b.score);
        this.generationQueue = newQueue;
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        let chunk;

        if (this.lastChunk && this.lastCX === cx && this.lastCZ === cz) {
            chunk = this.lastChunk;
        } else {
            const key = `${cx},${cz}`;
            chunk = this.chunks.get(key);
            if (chunk) {
                this.lastChunk = chunk;
                this.lastChunkKey = key;
                this.lastCX = cx;
                this.lastCZ = cz;
            }
        }
        
        if (!chunk || !chunk.isLoaded) return false; 
        
        const lx = Math.floor(x) - (cx * this.chunkSize);
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - (cz * this.chunkSize);
        
        return chunk.getBlock(lx, ly, lz);
    }
}
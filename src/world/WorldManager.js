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

        // --- WORKER SETUP ---
        // Initialize the background worker
        this.worker = new Worker(new URL('./ChunkWorker.js', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e) => {
            const { key, data } = e.data;
            const chunk = this.chunks.get(key);
            if (chunk) {
                // Main thread receives data -> Carves Tunnel -> Uploads Mesh
                chunk.applyTerrainData(data);
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
        // Note: We don't terminate the worker, we keep it alive for reuse
    }

    update(playerPos, camera) {
        const now = performance.now();
        
        // Queue Update Frequency (200ms)
        // Reduced frequency because worker handles the load now, we don't need to spam updates
        if (now - this.lastUpdate > 200) {
            this.lastUpdate = now;
            this.updateQueue(playerPos, camera);
        }

        // --- WORKER DISPATCHER ---
        // Send a limited number of jobs to the worker per frame
        // This prevents flooding the message channel
        const JOBS_PER_FRAME = 2;
        let dispatched = 0;

        while (this.generationQueue.length > 0 && dispatched < JOBS_PER_FRAME) {
            const req = this.generationQueue.shift();
            
            // If chunk already exists (even if loading), skip
            if (this.chunks.has(req.key)) continue;

            const chunk = new Chunk(req.x, req.z, this.scene, this.racePath, this.chunkMaterial);
            this.chunks.set(req.key, chunk);

            // Send job to worker
            this.worker.postMessage({
                x: req.x,
                z: req.z,
                size: this.chunkSize,
                height: 96 // Fixed chunk height
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
        
        for (let z = -range; z <= range; z++) {
            for (let x = -range; x <= range; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                // Keep track of active chunks
                activeKeys.add(key);

                // If chunk doesn't exist, queue it
                if (!this.chunks.has(key)) {
                    const wx = (chunkX * this.chunkSize) + (this.chunkSize / 2);
                    const wz = (chunkZ * this.chunkSize) + (this.chunkSize / 2);
                    const distSq = (wx - playerPos.x)**2 + (wz - playerPos.z)**2;

                    // Frustum/Priority Logic
                    let score = distSq;
                    if (camera) {
                        const dirX = wx - playerPos.x;
                        const dirZ = wz - playerPos.z;
                        const len = Math.sqrt(distSq) || 1;
                        const dot = ((dirX/len) * this._cameraForward.x) + ((dirZ/len) * this._cameraForward.z);
                        score -= (dot * 50000); // Prioritize chunks in front
                    }
                    newQueue.push({ x: chunkX, z: chunkZ, key, score });
                }
            }
        }

        // Unload far chunks
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
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

        // Optimization: Use Lambert Material (Gouraud shading)
        this.chunkMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true
        });
    }

    reset() {
        for (const [key, chunk] of this.chunks) {
            chunk.dispose();
        }
        this.chunks.clear();
        this.lastChunk = null;
        this.lastChunkKey = '';
    }

    update(playerPos) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();
        const neededChunks = [];

        // Optimization: Reduced generation width from 3 to 2
        // This reduces active chunks from ~120 to ~80, saving draw calls and generation time
        const width = 2; 
        const backDist = Math.min(3, this.renderDistance);

        for (let z = -backDist; z <= this.renderDistance; z++) {
            for (let x = -width; x <= width; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                
                const key = `${chunkX},${chunkZ}`;
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    // Distance squared for sorting
                    const distSq = x*x + z*z;
                    neededChunks.push({ x: chunkX, z: chunkZ, key, dist: distSq });
                }
            }
        }

        // 1. Unload distant chunks
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                chunk.dispose();
                this.chunks.delete(key);
            }
        }

        // 2. Sort needed chunks by distance (closest first)
        neededChunks.sort((a, b) => a.dist - b.dist);

        // 3. Process generation queue
        const GENERATION_BUDGET = 2; // Keep budget tight
        let generated = 0;

        for (const req of neededChunks) {
            if (generated >= GENERATION_BUDGET) break;
            
            if (!this.chunks.has(req.key)) {
                this.createChunk(req.x, req.z, req.key);
                generated++;
            }
        }
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
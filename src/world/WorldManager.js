import * as THREE from 'three';
import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 6) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; 

        this.chunks = new Map(); 
        
        // Cache object to reduce string allocations in loop
        this.lastChunkKey = '';
        this.lastChunk = null;

        // Shared Material: Back to Standard for better lighting quality
        this.chunkMaterial = new THREE.MeshStandardMaterial({ 
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1
        });
    }

    reset() {
        // Dispose of all chunks to force regeneration on the new path
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

        // Limit generation width to create a "path" feel
        const width = 3; 
        
        // Dynamic generation window
        // Keep less chunks behind (performance) but enough to avoid voids when turning (4 chunks)
        const backDist = Math.min(4, this.renderDistance);

        for (let z = -backDist; z <= this.renderDistance; z++) {
            for (let x = -width; x <= width; x++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                
                const key = `${chunkX},${chunkZ}`;
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    this.createChunk(chunkX, chunkZ, key);
                }
            }
        }

        // Unload distant chunks
        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                chunk.dispose();
                this.chunks.delete(key);
            }
        }
    }

    createChunk(x, z, key) {
        // Pass the shared material
        const chunk = new Chunk(x, z, this.scene, this.racePath, this.chunkMaterial);
        this.chunks.set(key, chunk);
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        // Optimization: Simple cache for physics loops checking same chunk
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
        
        // Local coordinates
        const lx = Math.floor(x) - (cx * this.chunkSize);
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - (cz * this.chunkSize);
        
        return chunk.getBlock(lx, ly, lz);
    }
}
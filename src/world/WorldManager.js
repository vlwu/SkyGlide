import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 8) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; 

        this.chunks = new Map(); 
    }

    update(playerPos) {
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();

        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                
                if (Math.abs(chunkX) > 4) continue; 

                const key = `${chunkX},${chunkZ}`;
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    this.createChunk(chunkX, chunkZ, key);
                }
            }
        }

        for (const [key, chunk] of this.chunks) {
            if (!activeKeys.has(key)) {
                chunk.dispose();
                this.chunks.delete(key);
            }
        }
    }

    createChunk(x, z, key) {
        const chunk = new Chunk(x, z, this.scene, this.racePath);
        this.chunks.set(key, chunk);
    }

    // Returns true if the block at world coordinates (x,y,z) is solid
    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        
        // If chunk isn't loaded, assume safe (or dangerous? Safe prevents getting stuck on boundaries)
        if (!chunk) return false; 
        
        // Calculate local coordinates relative to chunk origin
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;

        const lx = Math.floor(x) - startX;
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - startZ;
        
        // Check bounds
        if (ly < 0 || ly >= chunk.height) return false;
        if (lx < 0 || lx >= this.chunkSize) return false; // Should not happen with correct math
        if (lz < 0 || lz >= this.chunkSize) return false;

        // chunk.data is [x][y][z]
        if (!chunk.data[lx] || !chunk.data[lx][ly]) return false;
        
        return chunk.data[lx][ly][lz];
    }
}
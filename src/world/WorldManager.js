import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 8) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; 

        this.chunks = new Map(); // Active chunks map
    }

    update(playerPos) {
        // Determine player chunk coordinates
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const activeKeys = new Set();

        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                
                // Restrict generation width
                if (Math.abs(chunkX) > 4) continue; 

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
        const chunk = new Chunk(x, z, this.scene, this.racePath);
        this.chunks.set(key, chunk);
    }

    // Check block solidity at world coordinates
    getBlock(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        
        // Treat unloaded chunks as empty
        if (!chunk) return false; 
        
        // Convert to local chunk coordinates
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;

        const lx = Math.floor(x) - startX;
        const ly = Math.floor(y); 
        const lz = Math.floor(z) - startZ;
        
        // Validate bounds
        if (ly < 0 || ly >= chunk.height) return false;
        if (lx < 0 || lx >= this.chunkSize) return false;
        if (lz < 0 || lz >= this.chunkSize) return false;

        if (!chunk.data[lx] || !chunk.data[lx][ly]) return false;
        
        return chunk.data[lx][ly][lz];
    }
}
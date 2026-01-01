import { Chunk } from './Chunk.js';

export class WorldManager {
    constructor(scene, racePath, chunkSize = 16, renderDistance = 8) {
        this.scene = scene;
        this.racePath = racePath;
        this.chunkSize = chunkSize;
        this.renderDistance = renderDistance; // Radius in chunks

        this.chunks = new Map(); // "x,z" -> Chunk instance
    }

    update(playerPos) {
        // Calculate player's current chunk coordinates
        const centerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        // Identify which chunks should be active
        const activeKeys = new Set();

        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                
                // Limit X width to keep the world like a "corridor" (optional optimization)
                // Remove this if you want a fully open world, but for a racer, 
                // we rarely need chunks far to the side.
                if (Math.abs(chunkX) > 4) continue; 

                const key = `${chunkX},${chunkZ}`;
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    this.createChunk(chunkX, chunkZ, key);
                }
            }
        }

        // Prune old chunks
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
}
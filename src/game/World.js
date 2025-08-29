import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk.js';

const CHUNK_SIZE = 200; // Size of each terrain chunk
const CHUNK_SEGMENTS = 50; // Resolution of each chunk
const VIEW_DISTANCE = 2; // In chunks, so a 5x5 grid (2+1+2) will be active

export class World {
    constructor(scene) {
        this.scene = scene;
        this.activeChunks = new Map();
        this.currentPlayerChunkX = null;
        this.currentPlayerChunkZ = null;
        
        // Obstacle pool remains for future use
        this.obstaclePool = [];
    }

    update(playerPosition) {
        const playerChunkX = Math.round(playerPosition.x / CHUNK_SIZE);
        const playerChunkZ = Math.round(playerPosition.z / CHUNK_SIZE);

        // Only update chunks if the player has moved to a new one
        if (playerChunkX !== this.currentPlayerChunkX || playerChunkZ !== this.currentPlayerChunkZ) {
            this.currentPlayerChunkX = playerChunkX;
            this.currentPlayerChunkZ = playerChunkZ;
            this.updateChunks();
        }
    }

    updateChunks() {
        const chunksToKeep = new Set();
        // Loop through the grid of chunks that should be visible
        for (let x = -VIEW_DISTANCE; x <= VIEW_DISTANCE; x++) {
            for (let z = -VIEW_DISTANCE; z <= VIEW_DISTANCE; z++) {
                const chunkX = this.currentPlayerChunkX + x;
                const chunkZ = this.currentPlayerChunkZ + z;
                const chunkId = `${chunkX},${chunkZ}`;
                chunksToKeep.add(chunkId);

                // If chunk doesn't exist, create it
                if (!this.activeChunks.has(chunkId)) {
                    const xOffset = chunkX * CHUNK_SIZE;
                    const zOffset = chunkZ * CHUNK_SIZE;
                    const newChunk = new TerrainChunk(this.scene, CHUNK_SIZE, CHUNK_SEGMENTS, xOffset, zOffset);
                    this.activeChunks.set(chunkId, newChunk);
                }
            }
        }

        // Remove chunks that are no longer in view
        for (const [chunkId, chunk] of this.activeChunks.entries()) {
            if (!chunksToKeep.has(chunkId)) {
                chunk.dispose();
                this.activeChunks.delete(chunkId);
            }
        }
    }

    getActiveTerrainMeshes() {
        return Array.from(this.activeChunks.values()).map(chunk => chunk.mesh).filter(mesh => mesh !== null);
    }

    reset() {
        // Clear all existing chunks
        for (const chunk of this.activeChunks.values()) {
            chunk.dispose();
        }
        this.activeChunks.clear();
        
        // Reset player chunk position to force re-generation on restart
        this.currentPlayerChunkX = null;
        this.currentPlayerChunkZ = null;
    }
}
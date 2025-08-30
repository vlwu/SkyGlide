import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk.js';

const CHUNK_SIZE = 200;
const CHUNK_SEGMENTS = 50;
const VIEW_DISTANCE = 3;

export class World {
    constructor(scene, hoopManager) {
        this.scene = scene;
        this.hoopManager = hoopManager;
        this.activeChunks = new Map();
        this.currentPlayerChunkX = null;
        this.currentPlayerChunkZ = null;

        this.terrainGeneratorWorker = new Worker(new URL('./TerrainGenerator.worker.js', import.meta.url), {
            type: 'module'
        });

        this.terrainGeneratorWorker.onmessage = (e) => {
            const chunkData = e.data;
            if (this.activeChunks.has(chunkData.chunkId)) {
                const chunk = this.activeChunks.get(chunkData.chunkId);

                if (chunk && chunk instanceof TerrainChunk) {
                    chunk.buildMeshes(chunkData);
                    if (this.hoopManager && chunkData.hoopLocations) {
                        this.hoopManager.addHoopLocations(chunkData.hoopLocations);
                    }
                }
            }
        };
    }

    update(playerPosition) {
        const playerChunkX = Math.round(playerPosition.x / CHUNK_SIZE);
        const playerChunkZ = Math.round(playerPosition.z / CHUNK_SIZE);

        if (playerChunkX !== this.currentPlayerChunkX || playerChunkZ !== this.currentPlayerChunkZ) {
            this.currentPlayerChunkX = playerChunkX;
            this.currentPlayerChunkZ = playerChunkZ;
            this.updateChunks();
        }
    }

    updateChunks() {
        const chunksToKeep = new Set();
        const chunksToLoad = [];

        for (let x = -VIEW_DISTANCE; x <= VIEW_DISTANCE; x++) {
            for (let z = -VIEW_DISTANCE; z <= VIEW_DISTANCE; z++) {
                const chunkX = this.currentPlayerChunkX + x;
                const chunkZ = this.currentPlayerChunkZ + z;
                const chunkId = `${chunkX},${chunkZ}`;
                chunksToKeep.add(chunkId);

                if (!this.activeChunks.has(chunkId)) {
                    chunksToLoad.push({ chunkX, chunkZ, chunkId });
                }
            }
        }

        chunksToLoad.forEach(({ chunkX, chunkZ, chunkId }) => {
            const xOffset = chunkX * CHUNK_SIZE;
            const zOffset = chunkZ * CHUNK_SIZE;
            const newChunk = new TerrainChunk(this.scene, xOffset, zOffset);
            this.activeChunks.set(chunkId, newChunk);

            this.terrainGeneratorWorker.postMessage({
                size: CHUNK_SIZE,
                segments: CHUNK_SEGMENTS,
                xOffset,
                zOffset,
                chunkId
            });
        });

        for (const [chunkId, chunk] of this.activeChunks.entries()) {
            if (!chunksToKeep.has(chunkId)) {
                chunk.dispose();
                this.activeChunks.delete(chunkId);
            }
        }
    }

    getActiveTerrainMeshes() {
        return Array.from(this.activeChunks.values())
            .map(chunk => chunk.mesh)
            .filter(mesh => mesh !== null);
    }

    getActiveWaterMeshes() {
        return Array.from(this.activeChunks.values())
            .map(chunk => chunk.waterMesh)
            .filter(mesh => mesh !== null);
    }

    reset() {
        for (const chunk of this.activeChunks.values()) {
            chunk.dispose();
        }
        this.activeChunks.clear();
        this.currentPlayerChunkX = null;
        this.currentPlayerChunkZ = null;
    }
}
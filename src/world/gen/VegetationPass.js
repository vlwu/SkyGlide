import { BLOCK, isTransparent } from '../BlockDefs.js';
import { noise3D } from '../BiomeUtils.js';
import { CONFIG } from '../../config/Config.js';

export class VegetationPass {
    static generate(data, startX, startZ, size, height) {
        const strideY = size;
        const strideZ = size * height;
        const WATER_LEVEL = CONFIG.WORLD.WATER_LEVEL;

        // 1. TREES
        const treeCheckRange = 3; 
        for (let lx = -treeCheckRange; lx < size + treeCheckRange; lx++) {
            const wx = startX + lx;
            for (let lz = -treeCheckRange; lz < size + treeCheckRange; lz++) {
                const wz = startZ + lz;

                const treeNoise = noise3D(wx * 0.8, 999, wz * 0.8);
                
                // Threshold for tree placement
                if (treeNoise > 0.75) {
                    if (lx >= 0 && lx < size && lz >= 0 && lz < size) {
                        // Find ground
                        let groundY = -1;
                        for (let y = height - 1; y > 0; y--) {
                            const idx = lx + lz * strideZ + y * strideY;
                            const b = data[idx];
                            if (b !== BLOCK.AIR && b !== BLOCK.WATER && !isTransparent(b)) {
                                if (y < 100) { // Limit tree altitude
                                    groundY = y;
                                    break;
                                }
                            }
                        }

                        // Ensure we aren't planting underwater or on beach near water
                        if (groundY > WATER_LEVEL + 1) {
                            const b = data[lx + lz * strideZ + groundY * strideY];
                            
                            // Check valid soil and choose tree type
                            if (b === BLOCK.GRASS || b === BLOCK.DIRT) {
                                this.placeOakTree(data, lx, groundY, lz, size, height, strideY, strideZ, treeNoise);
                            } else if (b === BLOCK.SNOW) {
                                this.placeSpruceTree(data, lx, groundY, lz, size, height, strideY, strideZ, treeNoise);
                            }
                        }
                    }
                }
            }
        }

        // 2. SMALL PLANTS (Grass, Flowers, Cacti)
        for (let lx = 0; lx < size; lx++) {
            const wx = startX + lx;
            for (let lz = 0; lz < size; lz++) {
                const wz = startZ + lz;
                
                for (let y = height - 2; y > 0; y--) {
                    const idx = lx + lz * strideZ + y * strideY;
                    const block = data[idx];
                    
                    // Don't plant on water or if below water level
                    if (y <= WATER_LEVEL) continue;

                    if (block !== BLOCK.AIR && block !== BLOCK.WATER && !isTransparent(block)) {
                        const aboveIdx = idx + strideY;
                        if (aboveIdx < data.length && data[aboveIdx] === BLOCK.AIR) {
                            this.placeGroundCover(data, aboveIdx, block, wx, y, wz, strideY, lx, lz, strideZ);
                        }
                    }
                }
            }
        }
    }

    // NEW: Generate stalagmites and stalactites in caves/tunnels
    static generateSpikes(data, startX, startZ, size, height) {
        const strideY = size;
        const strideZ = size * height;

        for (let lx = 0; lx < size; lx++) {
            const wx = startX + lx;
            for (let lz = 0; lz < size; lz++) {
                const wz = startZ + lz;

                // Noise-based cluster generation for natural look
                const spikeChance = noise3D(wx * 0.12, 1234, wz * 0.12);
                if (spikeChance < 0.3) continue; 

                const colOffset = lx + lz * strideZ;
                let inAir = (data[colOffset] === BLOCK.AIR);

                // Scan Y for ceiling/floor
                // Start a bit higher to avoid bedrock issues
                for (let y = 5; y < height - 5; y++) {
                    const idx = colOffset + y * strideY;
                    const block = data[idx];
                    const isAir = (block === BLOCK.AIR);

                    if (inAir && !isAir) {
                        // Found Floor (Air -> Block)
                        if (this.isStony(block)) {
                            // Stalagmite (UP)
                            this.placeSpike(data, idx, strideY, 1, block, wx, y, wz);
                        }
                    } else if (!inAir && isAir) {
                        // Found Ceiling (Block -> Air)
                        const ceilBlock = data[idx - strideY];
                        if (this.isStony(ceilBlock)) {
                            // Stalactite (DOWN)
                            // Start placing at current 'y' (which is air), going down
                            this.placeSpike(data, idx, -strideY, -1, ceilBlock, wx, y, wz);
                        }
                    }

                    inAir = isAir;
                }
            }
        }
    }

    static isStony(b) {
        return (b === BLOCK.STONE || b === BLOCK.GRANITE || b === BLOCK.BASALT || b === BLOCK.MARBLE || 
                b === BLOCK.MOSS_STONE || b === BLOCK.SANDSTONE || b === BLOCK.TERRACOTTA);
    }

    static placeSpike(data, startIdx, strideStep, dir, mat, wx, y, wz) {
        // Height 1 to 4 blocks
        const hNoise = Math.abs(noise3D(wx * 0.5, y * 0.5, wz * 0.5));
        const h = 1 + Math.floor(hNoise * 4.0); 

        for (let i = 0; i < h; i++) {
            const idx = startIdx + i * strideStep; 
            
            // Bounds check
            if (idx < 0 || idx >= data.length) break;

            if (data[idx] === BLOCK.AIR) {
                data[idx] = mat; 
            } else {
                // Hit something, stop spike
                break;
            }
        }
    }

    static placeOakTree(data, lx, groundY, lz, size, height, strideY, strideZ, rng) {
        const treeHeight = 4 + Math.floor((rng - 0.75) * 20); 
        const leafStart = groundY + treeHeight - 2;
        const leafEnd = groundY + treeHeight + 1;

        // Trunk
        for(let y = groundY + 1; y < groundY + treeHeight; y++) {
            if (y >= height) break;
            const tIdx = lx + lz * strideZ + y * strideY;
            if (tIdx < data.length) data[tIdx] = BLOCK.OAK_LOG;
        }

        // Leaves
        for(let ly = leafStart; ly <= leafEnd; ly++) {
            for(let bx = lx - 2; bx <= lx + 2; bx++) {
                for(let bz = lz - 2; bz <= lz + 2; bz++) {
                    if (bx >= 0 && bx < size && bz >= 0 && bz < size && ly < height) {
                        const dist = Math.abs(bx - lx) + Math.abs(bz - lz) + Math.abs(ly - (leafStart + 1));
                        if (dist <= 3) {
                            const lIdx = bx + bz * strideZ + ly * strideY;
                            if (data[lIdx] === BLOCK.AIR) data[lIdx] = BLOCK.OAK_LEAVES;
                        }
                    }
                }
            }
        }
    }

    static placeSpruceTree(data, lx, groundY, lz, size, height, strideY, strideZ, rng) {
        const treeHeight = 6 + Math.floor((rng - 0.75) * 30); 
        
        // Trunk
        for(let y = groundY + 1; y < groundY + treeHeight; y++) {
            if (y >= height) break;
            const tIdx = lx + lz * strideZ + y * strideY;
            if (tIdx < data.length) data[tIdx] = BLOCK.SPRUCE_LOG;
        }

        // Leaves (Conical)
        const leafStart = groundY + 3;
        const leafEnd = groundY + treeHeight + 1;

        for (let ly = leafStart; ly <= leafEnd; ly++) {
            if (ly >= height) break;
            
            // Radius gets smaller as we go up
            // Normalized height from 0 (bottom of leaves) to 1 (top)
            const h = (ly - leafStart) / (leafEnd - leafStart);
            let radius = 2 - Math.floor(h * 2.5); 
            if (radius < 0) radius = 0;
            
            // Make layers sparse for spruce look
            if (radius > 0 && ly % 2 === 0 && ly !== leafEnd) {
                 // Skip every other layer for the wide parts to look "layered"
                 // but keep the top continuous
                 if (radius > 1) radius = 1;
            }

            for (let bx = lx - radius; bx <= lx + radius; bx++) {
                for (let bz = lz - radius; bz <= lz + radius; bz++) {
                    if (bx >= 0 && bx < size && bz >= 0 && bz < size) {
                        const d = Math.abs(bx - lx) + Math.abs(bz - lz);
                        if (d <= radius || (radius === 0 && d === 0)) {
                            const lIdx = bx + bz * strideZ + ly * strideY;
                            // Don't overwrite trunk
                            if (data[lIdx] === BLOCK.AIR) data[lIdx] = BLOCK.SPRUCE_LEAVES;
                        }
                    }
                }
            }
        }
        
        // Top tip
        if (leafEnd < height) {
            const tipIdx = lx + lz * strideZ + leafEnd * strideY;
            if (data[tipIdx] === BLOCK.AIR) data[tipIdx] = BLOCK.SPRUCE_LEAVES;
        }
    }

    static placeGroundCover(data, idx, soilBlock, wx, y, wz, strideY, lx, lz, strideZ) {
        const plantNoise = noise3D(wx * 0.9, y * 0.9, wz * 0.9);

        if (soilBlock === BLOCK.GRASS) {
            if (plantNoise > 0.5) {
                if (plantNoise > 0.75) data[idx] = BLOCK.RED_FLOWER;
                else if (plantNoise > 0.60) data[idx] = BLOCK.YELLOW_FLOWER;
                else data[idx] = BLOCK.TALL_GRASS;
            }
        } else if (soilBlock === BLOCK.SAND || soilBlock === BLOCK.RED_SAND || soilBlock === BLOCK.TERRACOTTA) {
            if (plantNoise > 0.6) {
                if (plantNoise > 0.85) {
                    // Check isolation for Cactus
                    let neighborCactus = false;
                    const yAbove = y + 1;
                    
                    if (lx > 0) {
                        const leftIdx = (lx - 1) + lz * strideZ + yAbove * strideY;
                        if (data[leftIdx] === BLOCK.CACTUS) neighborCactus = true;
                    }
                    if (lz > 0) {
                        const backIdx = lx + (lz - 1) * strideZ + yAbove * strideY;
                        if (data[backIdx] === BLOCK.CACTUS) neighborCactus = true;
                    }

                    if (!neighborCactus) {
                        data[idx] = BLOCK.CACTUS;
                        // Stack cactus
                        if (plantNoise > 0.88 && idx + strideY < data.length) {
                            data[idx + strideY] = BLOCK.CACTUS;
                            if (plantNoise > 0.94 && idx + strideY * 2 < data.length) {
                                data[idx + strideY * 2] = BLOCK.CACTUS;
                            }
                        }
                    }
                } else if (plantNoise > 0.70) {
                    data[idx] = BLOCK.DEAD_BUSH;
                }
            }
        }
    }
}
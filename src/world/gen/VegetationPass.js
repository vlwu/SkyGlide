import { BLOCK, isTransparent } from '../BlockDefs.js';
import { noise3D } from '../BiomeUtils.js';

export class VegetationPass {
    static generate(data, startX, startZ, size, height) {
        const strideY = size;
        const strideZ = size * height;

        // 1. TREES
        // We check a slightly larger area to allow trees from neighbors to overhang
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
                            if (data[idx] !== BLOCK.AIR && !isTransparent(data[idx])) {
                                if (y < 100) { // Limit tree altitude
                                    groundY = y;
                                    break;
                                }
                            }
                        }

                        if (groundY > 10) {
                            const b = data[lx + lz * strideZ + groundY * strideY];
                            // Check valid soil
                            if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.SNOW) {
                                this.placeOakTree(data, lx, groundY, lz, size, height, strideY, strideZ, treeNoise);
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
                    
                    if (block !== BLOCK.AIR && !isTransparent(block)) {
                        const aboveIdx = idx + strideY;
                        if (aboveIdx < data.length && data[aboveIdx] === BLOCK.AIR) {
                            this.placeGroundCover(data, aboveIdx, block, wx, y, wz, strideY, lx, lz, strideZ);
                        }
                    }
                }
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
                            // Only replace AIR
                            if (data[lIdx] === BLOCK.AIR) data[lIdx] = BLOCK.OAK_LEAVES;
                        }
                    }
                }
            }
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
        } else if (soilBlock === BLOCK.SAND) {
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
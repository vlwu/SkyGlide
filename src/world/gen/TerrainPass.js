import { BLOCK } from '../BlockDefs.js';
import { noise3D, getBiome, getBiomeBlock, smoothstep, mix } from '../BiomeUtils.js';
import { CONFIG } from '../../config/Config.js';

export class TerrainPass {
    static generate(data, startX, startZ, size, height) {
        const strideY = size;
        const strideZ = size * height;
        const WATER_LEVEL = CONFIG.WORLD.WATER_LEVEL;

        const scaleBase = 0.02;
        const scaleMount = 0.015; 
        const scaleDetail = 0.1;
        
        const islandBaseScale = 0.012; 
        const islandCenterY = 100;
        const islandBand = 50; 
        const biomeScale = 0.002;

        for (let lx = 0; lx < size; lx++) {
            const wx = startX + lx;
            for (let lz = 0; lz < size; lz++) {
                const wz = startZ + lz;

                // --- Biome & Height Calculation ---
                const bVal = noise3D(wx * biomeScale, 0, wz * biomeScale);
                const tVal = noise3D(wx * biomeScale * 0.5, 500, wz * biomeScale * 0.5);

                const wMount = smoothstep(0.2, 0.6, bVal);
                const wTundra = smoothstep(-0.3, -0.7, tVal) * (1.0 - wMount * 0.5);
                const wDesert = smoothstep(-0.2, -0.6, bVal) * smoothstep(0.2, -0.2, tVal) * (1.0 - wMount);

                let hBase = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
                const mNoise = noise3D(wx * scaleMount, 100, wz * scaleMount);
                
                if (mNoise > 0.3) hBase += (mNoise - 0.3) * 30;

                const ridge = 1.0 - Math.abs(noise3D(wx * 0.03, 200, wz * 0.03));
                const hMountVal = hBase + (mNoise > 0 ? mNoise * 50 : 0) + (ridge * ridge * 60);
                const dunes = Math.abs(noise3D(wx * 0.05, 300, wz * 0.05));
                const hDesertVal = hBase * 0.6 + dunes * 15;
                const hTundraVal = hBase * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;

                let h = hBase;
                if (wDesert > 0) h = mix(h, hDesertVal, wDesert);
                if (wTundra > 0) h = mix(h, hTundraVal, wTundra);
                if (wMount > 0)  h = mix(h, hMountVal, wMount);

                // --- River Carving ---
                // Ridged noise for river channels
                const riverScale = 0.005;
                const riverNoise = Math.abs(noise3D(wx * riverScale, 888, wz * riverScale));
                // If value is close to 0, it's a river center
                const riverThresh = 0.08;
                if (riverNoise < riverThresh) {
                    const depth = (riverThresh - riverNoise) / riverThresh; // 0 to 1
                    // Dig down, ensuring we go below water level to create a river
                    h -= depth * 15;
                }

                const groundHeight = Math.floor(h);

                // --- Biome Jitter ---
                const jitterScale = 0.1;
                const jitterAmt = 8.0;
                const jx = noise3D(wx * jitterScale, 50, wz * jitterScale) * jitterAmt;
                const jz = noise3D(wx * jitterScale, -50, wz * jitterScale) * jitterAmt;
                const biome = getBiome(wx + jx, wz + jz);

                // --- Fill Loop ---
                for (let y = 0; y < height; y++) {
                    let blockType = BLOCK.AIR;
                    
                    // Ground Layer
                    if (y <= groundHeight) {
                        const depth = groundHeight - y;
                        blockType = getBiomeBlock(biome, depth, y, groundHeight);
                        
                        // Beaches: Sand near water level if not in extreme biomes
                        if (y >= WATER_LEVEL - 2 && y <= WATER_LEVEL + 1) {
                            if (biome !== 'tundra' && biome !== 'mountain' && biome !== 'volcanic') {
                                if (blockType === BLOCK.GRASS || blockType === BLOCK.DIRT) {
                                    blockType = BLOCK.SAND;
                                }
                            }
                        }

                        // Underwater floor fixes (e.g. Grass underwater -> Dirt/Gravel)
                        if (y < WATER_LEVEL && blockType === BLOCK.GRASS) {
                             blockType = BLOCK.DIRT;
                        }

                        if (depth === 0) {
                            const detail = noise3D(wx * scaleDetail, y * scaleDetail, wz * scaleDetail);
                            if (biome === 'plains' && detail > 0.6 && y > WATER_LEVEL + 2) blockType = BLOCK.MOSS_STONE;
                            if (biome === 'mountain' && groundHeight > 80 && detail < -0.5) blockType = BLOCK.SNOW;
                        }
                    } 
                    // Water Generation
                    else if (y <= WATER_LEVEL) {
                        // Freeze water in tundra
                        if (biome === 'tundra') {
                            blockType = BLOCK.ICE;
                        } else {
                            blockType = BLOCK.WATER;
                        }
                    }
                    
                    // Floating Islands
                    if (y > 70) {
                        const dist = Math.abs(y - islandCenterY);
                        const densityGradient = Math.max(0, 1.0 - (dist / islandBand));
                        
                        if (densityGradient > 0) {
                            const n1 = noise3D(wx * islandBaseScale, y * 0.02, wz * islandBaseScale);
                            const n2 = noise3D(wx * 0.05, y * 0.05, wz * 0.05) * 0.15;
                            const noiseVal = n1 + n2;
                            const threshold = 0.2 + (1.0 - densityGradient) * 0.6;
                            
                            if (noiseVal > threshold) {
                                if (y > 130) blockType = BLOCK.SNOW;
                                else if (y > 125) blockType = BLOCK.PACKED_ICE;
                                else if (noiseVal > threshold + 0.15 && densityGradient > 0.8) {
                                    blockType = BLOCK.GRASS;
                                } else {
                                    blockType = BLOCK.STONE;
                                    if (noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0.3) blockType = BLOCK.MOSS_STONE;
                                }
                            }
                        }
                    }

                    if (blockType !== BLOCK.AIR) {
                        data[lx + lz * strideZ + y * strideY] = blockType; 
                    }
                }
            }
        }
    }
}
import { createNoise3D } from 'simplex-noise';
import { BLOCK } from './BlockDefs.js';

// Shared noise instance for consistency
export const noise3D = createNoise3D();

// --- Math Helpers ---
export function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

export function mix(a, b, t) {
    return a * (1 - t) + b * t;
}
// --------------------

export function getBiome(wx, wz) {
    const biomeScale = 0.002;
    const biomeNoise = noise3D(wx * biomeScale, 0, wz * biomeScale);
    const tempNoise = noise3D(wx * biomeScale * 0.5, 500, wz * biomeScale * 0.5);
    
    if (biomeNoise > 0.4) return 'mountain';
    if (biomeNoise < -0.4 && tempNoise < 0) return 'desert';
    if (tempNoise < -0.5) return 'tundra';
    if (biomeNoise < -0.2 && tempNoise > 0.3) return 'volcanic';
    return 'plains';
}

export function getBiomeBlock(biome, depth, y, groundHeight) {
    if (biome === 'desert') {
        if (depth === 0) return BLOCK.SAND;
        if (depth < 4) return BLOCK.SANDSTONE;
        if (depth < 8) return BLOCK.CLAY;
        return BLOCK.STONE;
    }
    if (biome === 'tundra') {
        if (depth === 0) return BLOCK.SNOW;
        if (depth < 2) return BLOCK.PACKED_ICE;
        if (depth < 5) return BLOCK.GRAVEL;
        return BLOCK.STONE;
    }
    if (biome === 'mountain') {
        if (groundHeight > 70) {
            if (depth === 0) return BLOCK.SNOW;
            if (depth < 3) return BLOCK.PACKED_ICE;
            return BLOCK.GRANITE;
        }
        if (depth === 0) return BLOCK.GRAVEL;
        if (depth < 5) return BLOCK.GRANITE;
        return BLOCK.STONE;
    }
    if (biome === 'volcanic') {
        if (depth === 0) return BLOCK.BASALT;
        if (depth < 3) return BLOCK.GRAVEL;
        if (depth < 7) return BLOCK.GRANITE;
        return BLOCK.STONE;
    }
    
    // PLAINS
    if (depth === 0) return BLOCK.GRASS;
    if (depth < 3) return BLOCK.DIRT;
    if (depth < 8) {
        const mixVal = noise3D(y * 0.3, depth * 0.5, y * 0.3);
        if (mixVal > 0.3) return BLOCK.GRAVEL;
        if (mixVal < -0.3) return BLOCK.CLAY;
        return BLOCK.DIRT;
    }
    return BLOCK.STONE;
}
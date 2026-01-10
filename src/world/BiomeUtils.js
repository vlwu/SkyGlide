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

// Calculates ground height (ignoring floating islands)
export function getTerrainHeightMap(wx, wz) {
    const scaleBase = 0.02;
    const scaleMount = 0.015; 
    const biomeScale = 0.002;

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

    return h;
}

// Calculates max terrain height including potential islands
export function getMaxTerrainHeight(wx, wz) {
    const groundH = getTerrainHeightMap(wx, wz);
    
    const islandBaseScale = 0.012; 
    // Check center of island band (Y=100)
    const n1 = noise3D(wx * islandBaseScale, 2.0, wz * islandBaseScale); // 100 * 0.02 = 2.0
    
    // Threshold from TerrainPass (approx)
    // threshold = 0.2 + (1.0 - density) * 0.6. Center density is 1.0, so threshold ~0.2.
    if (n1 > 0.2) {
        // Islands exist, usually top out around 140-150
        return Math.max(groundH, 150);
    }
    
    return groundH;
}
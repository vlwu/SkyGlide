import { createNoise3D } from 'simplex-noise';
import { BLOCK } from './BlockDefs.js';

// Deterministic PRNG to ensure all workers generate identical terrain
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// Shared noise instance with fixed seed
export const noise3D = createNoise3D(mulberry32(1337));

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
    
    // Adjusted thresholds to include Badlands
    if (biomeNoise > 0.5) return 'mountain';
    
    // Badlands: Moderate biome noise, hot temp
    if (biomeNoise > 0.1 && biomeNoise <= 0.5 && tempNoise > 0.1) return 'badlands';

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
    if (biome === 'badlands') {
        if (depth === 0) return BLOCK.RED_SAND;
        
        // Stratified layers based on world height (y) for canyon look
        const layer = y % 15;
        if (depth < 3) return BLOCK.RED_SANDSTONE;
        
        // Terracotta bands
        if (layer < 2) return BLOCK.TERRACOTTA_BROWN;
        if (layer < 5) return BLOCK.TERRACOTTA_RED;
        if (layer < 6) return BLOCK.TERRACOTTA_YELLOW;
        if (layer < 10) return BLOCK.TERRACOTTA;
        return BLOCK.TERRACOTTA_BROWN;
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

    const wMount = smoothstep(0.4, 0.7, bVal); // Adjusted for new biome range
    
    // Badlands Weight
    let wBadlands = 0;
    if (bVal > 0.1 && bVal <= 0.5 && tVal > 0.1) {
        // Simple rectangular window approximation with smooth edges
        const wb = smoothstep(0.1, 0.2, bVal) * smoothstep(0.5, 0.4, bVal);
        const wt = smoothstep(0.1, 0.2, tVal);
        wBadlands = wb * wt;
    }

    const wTundra = smoothstep(-0.3, -0.7, tVal) * (1.0 - wMount * 0.5);
    const wDesert = smoothstep(-0.2, -0.6, bVal) * smoothstep(0.2, -0.2, tVal) * (1.0 - wMount);

    let hBase = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
    const mNoise = noise3D(wx * scaleMount, 100, wz * scaleMount);
    
    if (mNoise > 0.3) hBase += (mNoise - 0.3) * 30;

    const ridge = 1.0 - Math.abs(noise3D(wx * 0.03, 200, wz * 0.03));
    const hMountVal = hBase + (mNoise > 0 ? mNoise * 50 : 0) + (ridge * ridge * 60);
    
    // Desert: Much flatter now
    const dunes = Math.abs(noise3D(wx * 0.05, 300, wz * 0.05));
    // Base 25 ensures it stays above standard water level (18) mostly, + small dunes
    const hDesertVal = 25 + dunes * 8; 

    // Badlands: High Plateaus
    const plateauNoise = noise3D(wx * 0.01, 123, wz * 0.01);
    const hBadlandsVal = 65 + plateauNoise * 15; 

    const hTundraVal = hBase * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;

    let h = hBase;
    if (wDesert > 0) h = mix(h, hDesertVal, wDesert);
    if (wTundra > 0) h = mix(h, hTundraVal, wTundra);
    if (wBadlands > 0) h = mix(h, hBadlandsVal, wBadlands);
    if (wMount > 0)  h = mix(h, hMountVal, wMount);

    return h;
}

// Calculates max terrain height including potential islands
export function getMaxTerrainHeight(wx, wz) {
    const groundH = getTerrainHeightMap(wx, wz);
    
    const islandBaseScale = 0.012; 
    // Check center of island band (Y=100)
    const n1 = noise3D(wx * islandBaseScale, 2.0, wz * islandBaseScale); // 100 * 0.02 = 2.0
    
    if (n1 > 0.2) {
        return Math.max(groundH, 150);
    }
    
    return groundH;
}
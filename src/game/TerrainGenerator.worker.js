import { createNoise2D } from 'simplex-noise';

const MAX_HEIGHT = 40;
const ELEVATION_NOISE_SCALE = 0.02;
const MOISTURE_NOISE_SCALE = 0.05;

const BIOMES = {
    OCEAN: { color: { r: 0.27, g: 0.51, b: 0.70 } },
    SAND: { color: { r: 0.94, g: 0.90, b: 0.55 } },
    GRASSLAND: { color: { r: 0.30, g: 0.69, b: 0.31 }, foliage: true, foliageDensity: 0.05 },
    FOREST: { color: { r: 0.13, g: 0.55, b: 0.13 }, foliage: true, foliageDensity: 0.3 },
    ROCK: { color: { r: 0.5, g: 0.5, b: 0.5 } },
    SNOW: { color: { r: 1.0, g: 1.0, b: 1.0 } },
};

const elevationNoise = createNoise2D();
const moistureNoise = createNoise2D();

function getBiome(e, m) {
    if (e < 0.2) return BIOMES.OCEAN;
    if (e < 0.25) return BIOMES.SAND;
    if (e > 0.75) {
        if (m < 0.5) return BIOMES.ROCK;
        return BIOMES.SNOW;
    }
    if (e > 0.5) {
        if (m < 0.5) return BIOMES.GRASSLAND;
        return BIOMES.FOREST;
    }
    if (m < 0.33) return BIOMES.SAND;
    if (m < 0.66) return BIOMES.GRASSLAND;
    return BIOMES.FOREST;
}

function getOctaveNoise(x, z, octaves, persistence, lacunarity, initialFrequency, initialAmplitude) {
    let total = 0;
    let frequency = initialFrequency;
    let amplitude = initialAmplitude;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += elevationNoise(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return total / maxValue;
}

self.onmessage = function(e) {
    const { size, segments, xOffset, zOffset, chunkId } = e.data;

    const segmentSize = size / segments;
    const vertexCount = (segments + 1) * (segments + 1);

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const foliage = {
        leaves: [],
        trunks: []
    };

    for (let i = 0, z = -size / 2; z <= size / 2; z += segmentSize) {
        for (let x = -size / 2; x <= size / 2; x += segmentSize, i++) {
            const worldX = x + xOffset;
            const worldZ = z + zOffset;

            const moisture = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
            const noiseValue = getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.005, 1);
            const elevation = (noiseValue + 1) / 2;
            const scaledElevation = Math.pow(elevation, 2.5);
            const y = scaledElevation * MAX_HEIGHT;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const biome = getBiome(scaledElevation, moisture);
            colors[i * 3] = biome.color.r;
            colors[i * 3 + 1] = biome.color.g;
            colors[i * 3 + 2] = biome.color.b;
        }
    }

    const treeCount = 500;
    for (let i = 0; i < treeCount; i++) {
        const x = Math.random() * size - size / 2;
        const z = Math.random() * size - size / 2;

        const worldX = x + xOffset;
        const worldZ = z + zOffset;

        const noiseValue = getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.005, 1);
        const e = Math.pow((noiseValue + 1) / 2, 2.5);
        const m = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
        const biome = getBiome(e, m);

        if (biome.foliage && Math.random() < biome.foliageDensity) {
            const y = Math.pow((getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.005, 1) + 1) / 2, 2.5) * MAX_HEIGHT;
            
            foliage.leaves.push(x, y + 2, z);
            foliage.trunks.push(x, y + 1, z);
        }
    }

    const foliageLeavesMatrix = new Float32Array(foliage.leaves);
    const foliageTrunksMatrix = new Float32Array(foliage.trunks);

    const transferable = [positions.buffer, colors.buffer, foliageLeavesMatrix.buffer, foliageTrunksMatrix.buffer];

    self.postMessage({
        positions,
        colors,
        foliageLeavesMatrix,
        foliageTrunksMatrix,
        chunkId
    }, transferable);
};
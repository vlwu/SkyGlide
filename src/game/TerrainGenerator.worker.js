import { createNoise2D } from 'simplex-noise';

const MAX_HEIGHT = 160;
const MOISTURE_NOISE_SCALE = 0.05;
const WATER_LEVEL = 0.22 * MAX_HEIGHT;

const BIOMES = {
    SAND: { color: { r: 0.99, g: 0.85, b: 0.21 } },
    GRASSLAND: { color: { r: 0.49, g: 0.70, b: 0.26 }, foliage: true, foliageDensity: 0.05 },
    FOREST: { color: { r: 0.22, g: 0.56, b: 0.24 }, foliage: true, foliageDensity: 0.3 },
    ROCK: { color: { r: 0.5, g: 0.5, b: 0.5 } },
    SNOW: { color: { r: 0.96, g: 0.96, b: 0.96 } },
};

const elevationNoise = createNoise2D();
const moistureNoise = createNoise2D();

function getBiome(e, m) {
    // e = elevation, normalized 0-1
    // Water level is at e = 0.22

    if (e < 0.24) return BIOMES.SAND; // Creates ocean floor and beaches up to e = 0.24
    if (e > 0.75) { // High altitude
        if (m < 0.5) return BIOMES.ROCK;
        return BIOMES.SNOW;
    }
    if (e > 0.5) { // Medium-high altitude
        if (m < 0.5) return BIOMES.GRASSLAND;
        return BIOMES.FOREST;
    }
    // Low altitude (just above the beach)
    if (m < 0.33) return BIOMES.GRASSLAND;
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


            const baseElevation = getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.0015, 1);


            const mountainNoise = getOctaveNoise(worldX, worldZ, 6, 0.45, 2.2, 0.009, 1);



            let combinedElevation = baseElevation + (baseElevation > 0 ? mountainNoise * (baseElevation * 0.8) : 0);



            let elevation = (combinedElevation + 1) / 2;
            elevation = Math.pow(elevation, 2.0);

            const y = elevation * MAX_HEIGHT;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const moisture = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
            const biome = getBiome(elevation, moisture);
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

        const baseElevation = getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.0015, 1);
        const mountainNoise = getOctaveNoise(worldX, worldZ, 6, 0.45, 2.2, 0.009, 1);
        let combinedElevation = baseElevation + (baseElevation > 0 ? mountainNoise * (baseElevation * 0.8) : 0);
        let e = (combinedElevation + 1) / 2;
        e = Math.pow(e, 2.0);

        const m = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
        const biome = getBiome(e, m);

        if (biome.foliage && Math.random() < biome.foliageDensity) {
            const y = e * MAX_HEIGHT;
            if (y > WATER_LEVEL) {
                 foliage.leaves.push(x, y + 2, z);
                 foliage.trunks.push(x, y + 1, z);
            }
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
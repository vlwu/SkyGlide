import { createNoise2D } from 'simplex-noise';
import { HOOP_CONFIG, UPDRAFT_CONFIG } from './config.js';

const MAX_HEIGHT = 160;
const MOISTURE_NOISE_SCALE = 0.008;
const TEMPERATURE_NOISE_SCALE = 0.005;
const WATER_TABLE_NOISE_SCALE = 0.0001;
const MIN_WATER_LEVEL_FACTOR = 0.18;
const MAX_WATER_LEVEL_FACTOR = 0.28;


const BIOMES = {
    SAND: { color: { r: 0.99, g: 0.85, b: 0.21 } },
    GRASSLAND: { color: { r: 0.49, g: 0.70, b: 0.26 }, foliage: { profile: 'deciduous_green', density: 0.03 } },
    FOREST: { color: { r: 0.22, g: 0.56, b: 0.24 }, foliage: { profile: 'deciduous_green', density: 0.4 } },
    ROCK: { color: { r: 0.5, g: 0.5, b: 0.5 } },
    SNOW: { color: { r: 0.96, g: 0.96, b: 0.96 } },
    SAVANNA: { color: { r: 0.76, g: 0.69, b: 0.42 }, foliage: { profile: 'savanna', density: 0.02 } },
    AUTUMNAL_FOREST: { color: { r: 0.8, g: 0.4, b: 0.1 }, foliage: { profile: 'deciduous_autumn', density: 0.35 } },
    TAIGA: { color: { r: 0.1, g: 0.4, b: 0.2 }, foliage: { profile: 'pine', density: 0.4 } },
    TUNDRA: { color: { r: 0.6, g: 0.6, b: 0.55 } },
    SWAMP: { color: { r: 0.2, g: 0.3, b: 0.25 }, foliage: { profile: 'deciduous_green', density: 0.1 } },
};


const elevationNoise = createNoise2D();
const moistureNoise = createNoise2D();
const temperatureNoise = createNoise2D();
const waterTableNoise = createNoise2D();

function getBiome(e, m, t, waterLevel) {
    if (e < (waterLevel / MAX_HEIGHT) + 0.02) {
        if (t > 0.5 && m > 0.5) return BIOMES.SWAMP;
        return BIOMES.SAND;
    }

    if (e > 0.75) {
        if (m < 0.5) return BIOMES.ROCK;
        return BIOMES.SNOW;
    }

    if (t < 0.3) {
         if (m > 0.4) return BIOMES.TAIGA;
         return BIOMES.TUNDRA;
    }

    if (t > 0.7) {
        if (m < 0.4) return BIOMES.SAVANNA;
        return BIOMES.FOREST;
    }


    if (m < 0.33) return BIOMES.GRASSLAND;
    if (m < 0.66) return BIOMES.AUTUMNAL_FOREST;
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

function calculateElevation(worldX, worldZ) {
    const baseElevation = getOctaveNoise(worldX, worldZ, 4, 0.5, 2, 0.0015, 1);
    const mountainNoise = getOctaveNoise(worldX, worldZ, 6, 0.45, 2.2, 0.009, 1);

    const mountainMask = Math.max(0, (baseElevation - 0.1) / 0.9);
    const smoothMountainMask = mountainMask * mountainMask * (3.0 - 2.0 * mountainMask);

    const ridgedMountain = (1.0 - Math.abs(mountainNoise)) * 1.5 - 0.5;
    const combinedElevation = baseElevation + (ridgedMountain * smoothMountainMask);

    let finalElevation = (combinedElevation + 1) / 2;
    finalElevation = Math.pow(finalElevation, 1.8);

    return finalElevation * MAX_HEIGHT;
}

self.onmessage = function(e) {
    const { size, segments, xOffset, zOffset, chunkId } = e.data;

    const segmentSize = size / segments;
    const vertexCount = (segments + 1) * (segments + 1);
    const segmentsPlusOne = segments + 1;

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const foliageData = {};
    const hoopLocations = [];
    const updraftLocations = [];
    const waterfallData = [];
    const vertexElevations = new Float32Array(vertexCount);

    const waterTableNoiseVal = (waterTableNoise(xOffset * WATER_TABLE_NOISE_SCALE, zOffset * WATER_TABLE_NOISE_SCALE) + 1) / 2;
    const waterTableHeight = (MIN_WATER_LEVEL_FACTOR + waterTableNoiseVal * (MAX_WATER_LEVEL_FACTOR - MIN_WATER_LEVEL_FACTOR)) * MAX_HEIGHT;


    for (let i = 0, z = -size / 2; z <= size / 2; z += segmentSize) {
        for (let x = -size / 2; x <= size / 2; x += segmentSize, i++) {
            const worldX = x + xOffset;
            const worldZ = z + zOffset;

            const y = calculateElevation(worldX, worldZ);
            vertexElevations[i] = y;
            const normalizedY = y / MAX_HEIGHT;

            const moisture = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
            const temperature = (temperatureNoise(worldX * TEMPERATURE_NOISE_SCALE, worldZ * TEMPERATURE_NOISE_SCALE) + 1) / 2;
            const biome = getBiome(normalizedY, moisture, temperature, waterTableHeight);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            colors[i * 3] = biome.color.r;
            colors[i * 3 + 1] = biome.color.g;
            colors[i * 3 + 2] = biome.color.b;

            const finalTerrainY = y - 25;

            if (y > MAX_HEIGHT * 0.6 && Math.random() < 0.002) {
                hoopLocations.push(worldX, finalTerrainY + HOOP_CONFIG.RADIUS * 3.0, worldZ);
            }
            else if (y > waterTableHeight && y < waterTableHeight + 15 && Math.random() < 0.002) {
                const waterWorldY = waterTableHeight - 25;
                hoopLocations.push(worldX, waterWorldY + HOOP_CONFIG.RADIUS * 2.0, worldZ);
            }
            else if (y > waterTableHeight + 15 && Math.random() < 0.0003) {
                hoopLocations.push(worldX, finalTerrainY + HOOP_CONFIG.RADIUS * 3.5, worldZ);
            }

            if ((biome === BIOMES.GRASSLAND || biome === BIOMES.SAVANNA) && Math.random() < UPDRAFT_CONFIG.GENERATION_CHANCE) {
                updraftLocations.push(worldX, finalTerrainY, worldZ);
            }
        }
    }

    // Pass 2: Identify waterfalls on cliffs
    for (let z = 0; z < segments; z++) {
        for (let x = 0; x < segmentsPlusOne; x++) {
            const current_idx = z * segmentsPlusOne + x;
            const below_idx = (z + 1) * segmentsPlusOne + x;

            const y_current = vertexElevations[current_idx];
            const y_below = vertexElevations[below_idx];

            const heightDiff = y_current - y_below;

            // New, more reliable condition for waterfalls
            if (heightDiff > 25 && y_current < MAX_HEIGHT * 0.7) { // On steep cliffs below the snow line
                const worldX = positions[current_idx * 3] + xOffset;
                const worldZ = positions[current_idx * 3 + 2] + zOffset;
                const moisture = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;

                // Waterfalls are more likely in moist areas
                if (moisture > 0.6 && Math.random() < 0.2) { // Increased probability to 20%
                    const waterfallHeight = y_current - y_below;
                    const vX = positions[current_idx * 3];
                    const vZ = positions[current_idx * 3 + 2];
                    waterfallData.push(vX, y_current, vZ, waterfallHeight);
                }
            }
        }
    }

    const treeCount = 500;
    for (let i = 0; i < treeCount; i++) {
        const x = Math.random() * size - size / 2;
        const z = Math.random() * size - size / 2;

        const worldX = x + xOffset;
        const worldZ = z + zOffset;

        const y = calculateElevation(worldX, worldZ);
        const normalizedY = y / MAX_HEIGHT;

        const m = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
        const t = (temperatureNoise(worldX * TEMPERATURE_NOISE_SCALE, worldZ * TEMPERATURE_NOISE_SCALE) + 1) / 2;
        const biome = getBiome(normalizedY, m, t, waterTableHeight);

        if (biome.foliage && Math.random() < biome.foliage.density) {
            if (y > waterTableHeight) {
                 const profileName = biome.foliage.profile;
                 if (!foliageData[profileName]) {
                     foliageData[profileName] = [];
                 }
                 foliageData[profileName].push(x, y, z);
            }
        }
    }

    const hoopLocationsBuffer = new Float32Array(hoopLocations);
    const updraftLocationsBuffer = new Float32Array(updraftLocations);
    const waterfallDataBuffer = new Float32Array(waterfallData);

    const transferable = [positions.buffer, colors.buffer, hoopLocationsBuffer.buffer, updraftLocationsBuffer.buffer, waterfallDataBuffer.buffer];
    const finalFoliageData = {};

    for (const profileName in foliageData) {
        const buffer = new Float32Array(foliageData[profileName]);
        finalFoliageData[profileName] = buffer;
        transferable.push(buffer.buffer);
    }

    self.postMessage({
        positions,
        colors,
        foliageData: finalFoliageData,
        hoopLocations: hoopLocationsBuffer,
        updraftLocations: updraftLocationsBuffer,
        waterfallData: waterfallDataBuffer,
        waterTableHeight,
        chunkId
    }, transferable);
};
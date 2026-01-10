export const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7,
    CLAY: 8,
    GRAVEL: 9,
    SANDSTONE: 10,
    GRANITE: 11,
    MARBLE: 12,
    BASALT: 13,
    MOSS_STONE: 14,
    PACKED_ICE: 15,
    // Vegetation
    OAK_LOG: 16,
    OAK_LEAVES: 17,
    TALL_GRASS: 18,
    RED_FLOWER: 19,
    YELLOW_FLOWER: 20,
    CACTUS: 21,
    DEAD_BUSH: 22,
    SPRUCE_LOG: 23,
    SPRUCE_LEAVES: 24,
    // Liquids
    WATER: 25
};

// Face order: Right, Left, Top, Bottom, Front, Back
export const FACE_DIRS = [
    1, 0, 0,
    -1, 0, 0,
    0, 1, 0,
    0, -1, 0,
    0, 0, 1,
    0, 0, -1
];

export const FACE_CORNERS = [
    [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], // Right
    [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], // Left
    [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], // Top
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], // Bottom
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], // Front
    [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]  // Back
];

export function isWater(type) {
    return type === BLOCK.WATER;
}

export function isTransparent(type) {
    return type === BLOCK.AIR || 
           type === BLOCK.WATER ||
           type === BLOCK.TALL_GRASS || 
           type === BLOCK.RED_FLOWER || 
           type === BLOCK.YELLOW_FLOWER ||
           type === BLOCK.DEAD_BUSH;
}

export function isPlant(type) {
    return type === BLOCK.TALL_GRASS || 
           type === BLOCK.RED_FLOWER || 
           type === BLOCK.YELLOW_FLOWER ||
           type === BLOCK.DEAD_BUSH;
}
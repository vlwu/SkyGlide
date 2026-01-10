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
    PACKED_ICE: 15
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
import { BLOCK } from './BlockDefs.js';

export function fastColor(type, rand, out, yRatio = 0.5) {
    let r, g, b;
    switch (type) {
        case BLOCK.GRASS: 
            r = 0.1 + rand * 0.1; g = 0.5 + rand * 0.15; b = 0.1 + rand * 0.1; break;
        case BLOCK.DIRT: 
            r = 0.35 + rand * 0.1; g = 0.25 + rand * 0.05; b = 0.15 + rand * 0.05; break;
        case BLOCK.STONE: 
            r = g = b = 0.4 + rand * 0.15; break;
        case BLOCK.SNOW: 
            r = g = b = 0.9 + rand * 0.1; break;
        case BLOCK.SAND: 
            r = 0.75 + rand * 0.1; g = 0.7 + rand * 0.1; b = 0.4 + rand * 0.1; break;
        case BLOCK.ICE: 
            r = 0.5 + rand * 0.05; g = 0.7 + rand * 0.05; b = 0.9 + rand * 0.05; break;
        case BLOCK.CLAY:
            r = 0.55 + rand * 0.1; g = 0.45 + rand * 0.1; b = 0.40 + rand * 0.1; break;
        case BLOCK.GRAVEL:
            r = g = b = 0.35 + rand * 0.2; break;
        case BLOCK.SANDSTONE:
            r = 0.70 + rand * 0.1; g = 0.60 + rand * 0.1; b = 0.35 + rand * 0.1; break;
        case BLOCK.GRANITE:
            r = 0.50 + rand * 0.1; g = 0.35 + rand * 0.1; b = 0.30 + rand * 0.1; break;
        case BLOCK.MARBLE:
            r = g = b = 0.85 + rand * 0.15; break;
        case BLOCK.BASALT:
            r = 0.20 + rand * 0.1; g = 0.20 + rand * 0.1; b = 0.23 + rand * 0.1; break;
        case BLOCK.MOSS_STONE:
            r = 0.25 + rand * 0.1; g = 0.40 + rand * 0.1; b = 0.25 + rand * 0.1; break;
        case BLOCK.PACKED_ICE:
            r = 0.65 + rand * 0.05; g = 0.75 + rand * 0.05; b = 0.95 + rand * 0.05; break;
        case BLOCK.SPAWN: 
            r = 1.0; g = 0.84; b = 0.0; break;
        case BLOCK.CACTUS:
            r = 0.1 + rand * 0.1; g = 0.5 + rand * 0.1; b = 0.1 + rand * 0.05; break;
        
        // Vegetation
        case BLOCK.OAK_LOG:
            r = 0.4 + rand * 0.1; g = 0.3 + rand * 0.05; b = 0.2 + rand * 0.05; break;
        case BLOCK.OAK_LEAVES:
            r = 0.1 + rand * 0.1; g = 0.4 + rand * 0.1; b = 0.1 + rand * 0.05; break;
        case BLOCK.TALL_GRASS:
            // Gradient from dark green (bottom) to lighter green (top)
            {
                const mix = yRatio * 0.5 + 0.5; // 0.5 to 1.0
                r = 0.1 * mix; g = 0.5 * mix + rand * 0.1; b = 0.1 * mix; 
            }
            break;
        case BLOCK.RED_FLOWER:
            if (yRatio > 0.6) { // Top is flower
                r = 0.9; g = 0.1; b = 0.1;
            } else { // Bottom is stem
                r = 0.1; g = 0.5; b = 0.1;
            }
            break;
        case BLOCK.YELLOW_FLOWER:
            if (yRatio > 0.6) {
                r = 0.9; g = 0.9; b = 0.1;
            } else {
                r = 0.1; g = 0.5; b = 0.1;
            }
            break;
        case BLOCK.DEAD_BUSH:
            r = 0.4 + rand * 0.1; g = 0.25 + rand * 0.05; b = 0.1 + rand * 0.05; break;

        default: 
            r = 1.0; g = 0.0; b = 1.0;
    }
    out[0] = r; out[1] = g; out[2] = b;
}
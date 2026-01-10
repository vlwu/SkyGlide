import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7
};

// Face order: Right, Left, Top, Bottom, Front, Back
const FACE_DIRS = [
    1, 0, 0,
    -1, 0, 0,
    0, 1, 0,
    0, -1, 0,
    0, 0, 1,
    0, 0, -1
];

const FACE_CORNERS = [
    [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], // Right
    [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], // Left
    [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], // Top
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], // Bottom
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], // Front
    [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]  // Back
];

const MAX_VERTICES = 40000;
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

function fastColor(type, rand, out) {
    let r, g, b;
    switch (type) {
        case BLOCK.GRASS: 
            r = 0.1 + rand * 0.1; 
            g = 0.5 + rand * 0.15; 
            b = 0.1 + rand * 0.1;
            break;
        case BLOCK.DIRT: 
            r = 0.35 + rand * 0.1; 
            g = 0.25 + rand * 0.05; 
            b = 0.15 + rand * 0.05;
            break;
        case BLOCK.STONE: 
            r = g = b = 0.4 + rand * 0.15;
            break;
        case BLOCK.SNOW: 
            r = g = b = 0.9 + rand * 0.1;
            break;
        case BLOCK.SAND: 
            r = 0.75 + rand * 0.1; 
            g = 0.7 + rand * 0.1; 
            b = 0.4 + rand * 0.1;
            break;
        case BLOCK.ICE: 
            r = 0.5; g = 0.7; b = 0.9;
            break;
        case BLOCK.SPAWN: 
            r = 1.0; g = 0.84; b = 0.0;
            break;
        default: 
            r = 1.0; g = 0.0; b = 1.0;
    }
    out[0] = r; out[1] = g; out[2] = b;
}

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments } = e.data;
    
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    
    const strideY = size;          
    const strideZ = size * height; 
    
    // 1. GENERATE TERRAIN
    const scaleBase = 0.02;
    const scaleMount = 0.04;
    const scaleIsland = 0.04;

    for (let lx = 0; lx < size; lx++) {
        const wx = startX + lx;
        for (let lz = 0; lz < size; lz++) {
            const wz = startZ + lz;

            let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
            const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
            if (mountain > 0) h += mountain * 35;
            const groundHeight = Math.floor(h);

            const colBase = lx + lz * strideZ;

            // OPTIMIZATION: Early exit loop
            // Don't loop all the way to 'height' (96) if ground is only at 30.
            // Add padding for floating islands (approx max height 90)
            const loopMax = Math.min(height, Math.max(groundHeight + 2, 90));

            for (let y = 0; y < loopMax; y++) {
                let blockType = BLOCK.AIR;
                
                if (y <= groundHeight) {
                    const depth = groundHeight - y;
                    if (groundHeight > 58) {
                        blockType = (depth === 0) ? BLOCK.SNOW : (depth < 3 ? BLOCK.STONE : BLOCK.STONE);
                    } else if (groundHeight < 22) {
                        blockType = (depth < 3) ? BLOCK.SAND : BLOCK.STONE;
                    } else {
                        blockType = (depth === 0) ? BLOCK.GRASS : (depth < 3 ? BLOCK.DIRT : BLOCK.STONE);
                    }
                } else if (y > 45) {
                    const islandNoise = noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland);
                    if (islandNoise > 0.45) {
                        if (y > 80) blockType = BLOCK.ICE;
                        else if (y > 78) blockType = BLOCK.SNOW;
                        else blockType = BLOCK.STONE;
                        if (y < 70 && islandNoise < 0.5 && noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0) {
                            blockType = BLOCK.GRASS;
                        }
                    }
                }
                
                if (blockType !== BLOCK.AIR) {
                    data[colBase + y * strideY] = blockType; 
                }
            }
        }
    }

    // 2. CARVE TUNNEL
    for (let lz = 0; lz < size; lz++) {
        const wz = startZ + lz;
        const points = pathSegments[wz];
        if (!points) continue;
        const strideZ_lz = lz * strideZ;

        for (let lx = 0; lx < size; lx++) {
            const wx = startX + lx;
            let tunnelMinY = 999, tunnelMaxY = -999;

            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const dx = wx - p.x;
                const dxSq = dx * dx;
                if (dxSq < 81) { 
                    const dySpan = Math.sqrt(81 - dxSq);
                    if (p.y - dySpan < tunnelMinY) tunnelMinY = p.y - dySpan;
                    if (p.y + dySpan > tunnelMaxY) tunnelMaxY = p.y + dySpan;
                }
            }

            if (tunnelMaxY > tunnelMinY) {
                const iMin = Math.max(0, Math.floor(tunnelMinY));
                const iMax = Math.min(height, Math.ceil(tunnelMaxY));
                const colBase = lx + strideZ_lz;
                for (let y = iMin; y < iMax; y++) {
                    data[colBase + y * strideY] = BLOCK.AIR;
                }
            }
        }
    }

    // 3. FORCE SPAWN
    const minWx = -2, maxWx = 2;
    const minWz = -2, maxWz = 2;
    const loopMinX = Math.max(0, minWx - startX);
    const loopMaxX = Math.min(size - 1, maxWx - startX);
    const loopMinZ = Math.max(0, minWz - startZ);
    const loopMaxZ = Math.min(size - 1, maxWz - startZ);

    if (loopMinX <= loopMaxX && loopMinZ <= loopMaxZ) {
        for(let lz = loopMinZ; lz <= loopMaxZ; lz++) {
            const zOffset = lz * strideZ;
            for(let lx = loopMinX; lx <= loopMaxX; lx++) {
                data[lx + strideY * 14 + zOffset] = BLOCK.SPAWN;
                for(let y = 15; y <= 20; y++) {
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // 4. MESH GENERATION - OPTIMIZED
    let vertCount = 0;
    let indexCount = 0;
    const rgb = [0,0,0];

    const OFFSETS = [1, -1, strideY, -strideY, strideZ, -strideZ];
    
    // Pre-compute neighbor checks for entire chunk to enable early culling
    const neighborCache = new Uint8Array(size * height * size * 6);
    
    for (let lz = 0; lz < size; lz++) {
        const lzStride = lz * strideZ;
        for (let y = 0; y < height; y++) {
            const yStride = y * strideY;
            const baseIdx = yStride + lzStride;

            for (let lx = 0; lx < size; lx++) {
                const idx = baseIdx + lx;
                const type = data[idx];
                if (type === BLOCK.AIR) continue;

                const cacheBase = idx * 6;
                let hasExposedFace = false;

                // Check all 6 neighbors
                for (let f = 0; f < 6; f++) {
                    const nx = lx + FACE_DIRS[f*3];
                    const ny = y + FACE_DIRS[f*3+1];
                    const nz = lz + FACE_DIRS[f*3+2];

                    let exposed = false;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                        if (data[idx + OFFSETS[f]] === BLOCK.AIR) {
                            exposed = true;
                        }
                    } else {
                        exposed = true; // Edge faces are exposed
                    }

                    neighborCache[cacheBase + f] = exposed ? 1 : 0;
                    if (exposed) hasExposedFace = true;
                }

                // Skip blocks with no exposed faces entirely
                if (!hasExposedFace) continue;

                const wx = startX + lx;
                const wz = startZ + lz;
                
                let h = (wx * 374761393) ^ (y * 668265263) ^ (wz * 963469177);
                h = (h ^ (h >> 13)) * 1274124933;
                const rand = ((h >>> 0) / 4294967296); 
                
                fastColor(type, rand, rgb);

                for (let f = 0; f < 6; f++) {
                    if (neighborCache[cacheBase + f] === 0) continue;

                    let shade = 0.9;
                    const dy = FACE_DIRS[f * 3 + 1];
                    if (dy < 0) shade = 0.6;
                    else if (dy > 0) shade = 1.1;
                    else if (FACE_DIRS[f * 3] !== 0) shade = 0.85;

                    const vBase = vertCount;
                    const cOffset = f * 4;
                    
                    for (let c = 0; c < 4; c++) {
                        const corner = FACE_CORNERS[cOffset + c];
                        const dst = vertCount * 3;
                        
                        BUFFER_POS[dst] = lx + corner[0];
                        BUFFER_POS[dst+1] = y + corner[1];
                        BUFFER_POS[dst+2] = lz + corner[2];

                        BUFFER_NORM[dst] = FACE_DIRS[f*3];
                        BUFFER_NORM[dst+1] = FACE_DIRS[f*3+1];
                        BUFFER_NORM[dst+2] = FACE_DIRS[f*3+2];

                        BUFFER_COL[dst] = rgb[0] * shade;
                        BUFFER_COL[dst+1] = rgb[1] * shade;
                        BUFFER_COL[dst+2] = rgb[2] * shade;

                        vertCount++;
                    }

                    BUFFER_IND[indexCount++] = vBase;
                    BUFFER_IND[indexCount++] = vBase + 1;
                    BUFFER_IND[indexCount++] = vBase + 2;
                    BUFFER_IND[indexCount++] = vBase + 2;
                    BUFFER_IND[indexCount++] = vBase + 3;
                    BUFFER_IND[indexCount++] = vBase;
                    
                    if (vertCount >= MAX_VERTICES - 4) break; 
                }
                if (vertCount >= MAX_VERTICES - 4) break;
            }
            if (vertCount >= MAX_VERTICES - 4) break;
        }
        if (vertCount >= MAX_VERTICES - 4) break;
    }

    const posOut = BUFFER_POS.slice(0, vertCount * 3);
    const normOut = BUFFER_NORM.slice(0, vertCount * 3);
    const colOut = BUFFER_COL.slice(0, vertCount * 3);
    const indOut = BUFFER_IND.slice(0, indexCount);

    self.postMessage({ 
        key: `${x},${z}`,
        data: data,
        geometry: {
            position: posOut,
            normal: normOut,
            color: colOut,
            index: indOut
        }
    }, [data.buffer, posOut.buffer, normOut.buffer, colOut.buffer, indOut.buffer]);
};
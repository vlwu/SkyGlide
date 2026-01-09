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

// Optimization: Unrolled face data for faster iteration
// Face order: Right, Left, Top, Bottom, Front, Back
const FACE_DIRS = [
    1, 0, 0,
    -1, 0, 0,
    0, 1, 0,
    0, -1, 0,
    0, 0, 1,
    0, 0, -1
];

// Corners for each face (relative to x,y,z)
const FACE_CORNERS = [
    // Right
    [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1],
    // Left
    [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0],
    // Top
    [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0],
    // Bottom
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
    // Front
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1],
    // Back
    [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]
];

const MAX_VERTICES = 40000;
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

// Helper for color (replacing THREE.Color)
function setHSL(h, s, l, out) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let r=0, g=0, b=0;

    if (0 <= h * 6 && h * 6 < 1) { r = c; g = x; b = 0; }
    else if (1 <= h * 6 && h * 6 < 2) { r = x; g = c; b = 0; }
    else if (2 <= h * 6 && h * 6 < 3) { r = 0; g = c; b = x; }
    else if (3 <= h * 6 && h * 6 < 4) { r = 0; g = x; b = c; }
    else if (4 <= h * 6 && h * 6 < 5) { r = x; g = 0; b = c; }
    else if (5 <= h * 6 && h * 6 < 6) { r = c; g = 0; b = x; }

    out[0] = r + m;
    out[1] = g + m;
    out[2] = b + m;
}

function setColor(type, rand, out) {
    switch (type) {
        case BLOCK.GRASS: setHSL(0.25 + rand * 0.05, 0.6, 0.4 + rand * 0.1, out); break;
        case BLOCK.DIRT: setHSL(0.08, 0.4, 0.3 + rand * 0.1, out); break;
        case BLOCK.STONE: setHSL(0.6, 0.05, 0.4 + rand * 0.1, out); break;
        case BLOCK.SNOW: setHSL(0.6, 0.2, 0.9 + rand * 0.1, out); break;
        case BLOCK.SAND: setHSL(0.12, 0.5, 0.7 + rand * 0.1, out); break;
        case BLOCK.ICE: setHSL(0.5, 0.7, 0.8, out); break;
        case BLOCK.SPAWN: out[0]=1; out[1]=0.84; out[2]=0; break;
        default: out[0]=1; out[1]=0; out[2]=1;
    }
}

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments } = e.data;
    
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    
    // 1. GENERATE TERRAIN
    const scaleBase = 0.02;
    const scaleMount = 0.04;
    const scaleIsland = 0.04;

    // Optimization: Pre-calculate strides
    const strideY = size;          
    const strideZ = size * height; 

    for (let lx = 0; lx < size; lx++) {
        for (let lz = 0; lz < size; lz++) {
            const wx = startX + lx;
            const wz = startZ + lz;

            let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
            const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
            if (mountain > 0) h += mountain * 35;
            const groundHeight = Math.floor(h);

            const colBase = lx + lz * strideZ;

            // Fill Column
            for (let y = 0; y < height; y++) {
                let blockType = BLOCK.AIR;
                
                if (y <= groundHeight) {
                    blockType = BLOCK.STONE; 
                    const depth = groundHeight - y;
                    if (groundHeight > 58) {
                        if (depth === 0) blockType = BLOCK.SNOW;
                        else if (depth < 3) blockType = BLOCK.STONE;
                    } else if (groundHeight < 22) {
                        if (depth < 3) blockType = BLOCK.SAND;
                    } else {
                        if (depth === 0) blockType = BLOCK.GRASS;
                        else if (depth < 3) blockType = BLOCK.DIRT;
                    }
                } else if (y > 45 && y < 90) {
                    // Floating Islands
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
            let tunnelMinY = 999;
            let tunnelMaxY = -999;

            // Simple distance check against path points
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const dx = wx - p.x;
                const dxSq = dx * dx;
                if (dxSq < 81) {
                    const dySpan = Math.sqrt(81 - dxSq);
                    const top = p.y + dySpan;
                    const bottom = p.y - dySpan;
                    if (bottom < tunnelMinY) tunnelMinY = bottom;
                    if (top > tunnelMaxY) tunnelMaxY = top;
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
                // Create platform
                data[lx + strideY * 14 + zOffset] = BLOCK.SPAWN;
                
                // Clear area above platform (Safety buffer)
                for(let y = 15; y <= 20; y++) {
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // 4. MESH GENERATION (OPTIMIZED)
    let vertCount = 0;
    let indexCount = 0;
    const rgb = [0,0,0];

    // Iterating Y outer loop might be better for cache line if data is Y-major?
    // Current layout: data[lx + y * 16 + lz * 16 * 96]
    // Inner-most should vary lx (stride 1).
    // So order: lz -> y -> lx is correct for sequential access.

    for (let lz = 0; lz < size; lz++) {
        const lzStride = lz * strideZ;
        
        for (let y = 0; y < height; y++) {
            const yStride = y * strideY;
            const baseIdx = yStride + lzStride;

            for (let lx = 0; lx < size; lx++) {
                const type = data[baseIdx + lx];
                if (type === BLOCK.AIR) continue;

                // Color gen
                const wx = startX + lx;
                const wz = startZ + lz;
                let h = (wx * 374761393) ^ (y * 668265263) ^ (wz * 963469177);
                h = (h ^ (h >> 13)) * 1274124933;
                const rand = ((h >>> 0) / 4294967296); 
                setColor(type, rand, rgb);

                // Check 6 faces
                for (let f = 0; f < 6; f++) {
                    const nx = lx + FACE_DIRS[f * 3];
                    const ny = y + FACE_DIRS[f * 3 + 1];
                    const nz = lz + FACE_DIRS[f * 3 + 2];

                    let neighbor = BLOCK.AIR;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                        neighbor = data[nx + ny * strideY + nz * strideZ];
                    }

                    if (neighbor !== BLOCK.AIR) continue;

                    let shade = 0.9;
                    const dy = FACE_DIRS[f * 3 + 1];
                    if (dy < 0) shade = 0.6;
                    else if (dy > 0) shade = 1.1;
                    else if (FACE_DIRS[f * 3] !== 0) shade = 0.85;

                    const vBase = vertCount;
                    const cOffset = f * 4;
                    
                    for (let c = 0; c < 4; c++) {
                        const corner = FACE_CORNERS[cOffset + c];
                        const idx = vertCount * 3;
                        
                        BUFFER_POS[idx] = lx + corner[0];
                        BUFFER_POS[idx+1] = y + corner[1];
                        BUFFER_POS[idx+2] = lz + corner[2];

                        BUFFER_NORM[idx] = FACE_DIRS[f*3];
                        BUFFER_NORM[idx+1] = FACE_DIRS[f*3+1];
                        BUFFER_NORM[idx+2] = FACE_DIRS[f*3+2];

                        BUFFER_COL[idx] = rgb[0] * shade;
                        BUFFER_COL[idx+1] = rgb[1] * shade;
                        BUFFER_COL[idx+2] = rgb[2] * shade;

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
        }
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
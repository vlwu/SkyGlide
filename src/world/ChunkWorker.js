import { BLOCK, isTransparent, isPlant, isWater } from './BlockDefs.js';
import { fastColor } from './BlockStyles.js';
import { TerrainPass } from './gen/TerrainPass.js';
import { VegetationPass } from './gen/VegetationPass.js';

let MAX_VERTICES = 40000;
let BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
let BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
let BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
let BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

let MAX_VERTICES_W = 10000;
let BUFFER_POS_W = new Float32Array(MAX_VERTICES_W * 3);
let BUFFER_NORM_W = new Float32Array(MAX_VERTICES_W * 3);
let BUFFER_COL_W = new Float32Array(MAX_VERTICES_W * 3);
let BUFFER_IND_W = new Uint16Array(MAX_VERTICES_W * 1.5);

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments, lod = 1 } = e.data;
    
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    const strideY = size;          
    const strideZ = size * height; 
    
    // --- Generation Passes ---
    TerrainPass.generate(data, startX, startZ, size, height);
    VegetationPass.generate(data, startX, startZ, size, height);
    
    // --- Path Carving ---
    for (let lz = 0; lz < size; lz++) {
        const wz = startZ + lz;
        const points = pathSegments[wz];
        if (!points) continue;
        const strideZ_lz = lz * strideZ;
        for (let lx = 0; lx < size; lx++) {
            const wx = startX + lx;
            let tunnelMinY = 9999, tunnelMaxY = -9999;
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

    // --- Spawn Override ---
    const minWx = -2, maxWx = 2, minWz = -2, maxWz = 2;
    const loopMinX = Math.max(0, minWx - startX);
    const loopMaxX = Math.min(size - 1, maxWx - startX);
    const loopMinZ = Math.max(0, minWz - startZ);
    const loopMaxZ = Math.min(size - 1, maxWz - startZ);

    if (loopMinX <= loopMaxX && loopMinZ <= loopMaxZ) {
        for(let lz = loopMinZ; lz <= loopMaxZ; lz++) {
            const zOffset = lz * strideZ;
            for(let lx = loopMinX; lx <= loopMaxX; lx++) {
                data[lx + strideY * 35 + zOffset] = BLOCK.SPAWN;
                for(let y = 36; y <= 50; y++) { 
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // --- Meshing (Simple Culling) ---
    let vertCount = 0;
    let indexCount = 0;
    let vertCountW = 0;
    let indexCountW = 0;
    const rgb = [0,0,0];

    const step = lod;
    const lSize = Math.ceil(size / step);
    const lHeight = Math.ceil(height / step);

    const ensureBufferCapacity = (needed, isWater) => {
        if (isWater) {
             if (vertCountW + needed >= MAX_VERTICES_W) {
                MAX_VERTICES_W = Math.floor(MAX_VERTICES_W * 1.5);
                const newPos = new Float32Array(MAX_VERTICES_W * 3); newPos.set(BUFFER_POS_W); BUFFER_POS_W = newPos;
                const newNorm = new Float32Array(MAX_VERTICES_W * 3); newNorm.set(BUFFER_NORM_W); BUFFER_NORM_W = newNorm;
                const newCol = new Float32Array(MAX_VERTICES_W * 3); newCol.set(BUFFER_COL_W); BUFFER_COL_W = newCol;
                const newInd = new Uint16Array(MAX_VERTICES_W * 1.5); newInd.set(BUFFER_IND_W); BUFFER_IND_W = newInd;
            }
        } else {
            if (vertCount + needed >= MAX_VERTICES) {
                MAX_VERTICES = Math.floor(MAX_VERTICES * 1.5);
                const newPos = new Float32Array(MAX_VERTICES * 3); newPos.set(BUFFER_POS); BUFFER_POS = newPos;
                const newNorm = new Float32Array(MAX_VERTICES * 3); newNorm.set(BUFFER_NORM); BUFFER_NORM = newNorm;
                
                // FIXED: Used MAX_VERTICES instead of MAX_VERTICES_W for opaque color buffer
                const newCol = new Float32Array(MAX_VERTICES * 3); newCol.set(BUFFER_COL); BUFFER_COL = newCol;
                
                const newInd = new Uint16Array(MAX_VERTICES * 1.5); newInd.set(BUFFER_IND); BUFFER_IND = newInd;
            }
        }
    };

    const getBlock = (x, y, z) => {
        if (x < 0 || x >= size || y < 0 || y >= height || z < 0 || z >= size) return BLOCK.AIR;
        return data[x + z * strideZ + y * strideY];
    };

    // Pre-calculated face normals and vertices offset
    // 0:Right, 1:Left, 2:Top, 3:Bottom, 4:Front, 5:Back
    const F_NORM = [
        [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
    ];
    // Quad vertices for each face [x,y,z] relative to block origin
    const F_VERTS = [
        [[1,0,1], [1,0,0], [1,1,0], [1,1,1]], // Right
        [[0,0,0], [0,0,1], [0,1,1], [0,1,0]], // Left
        [[0,1,1], [1,1,1], [1,1,0], [0,1,0]], // Top
        [[0,0,0], [1,0,0], [1,0,1], [0,0,1]], // Bottom
        [[0,0,1], [1,0,1], [1,1,1], [0,1,1]], // Front
        [[1,0,0], [0,0,0], [0,1,0], [1,1,0]]  // Back
    ];

    for (let y = 0; y < lHeight; y++) {
        const wy = y * step;
        for (let z = 0; z < lSize; z++) {
            const wz = z * step;
            for (let x = 0; x < lSize; x++) {
                const wx = x * step;
                
                const type = data[wx + wz * strideZ + wy * strideY];
                if (type === BLOCK.AIR) continue;

                // --- Plant Meshing (Billboard - 4 Vertices) ---
                if (isPlant(type)) {
                    // Only high LOD
                    if (lod === 1) {
                        const worldX = startX + wx;
                        const worldZ = startZ + wz;
                        let seedH = (worldX * 374761393) ^ (wy * 668265263) ^ (worldZ * 963469177);
                        seedH = (seedH ^ (seedH >> 13)) * 1274124933;
                        const rand = ((seedH >>> 0) / 4294967296);

                        fastColor(type, rand, rgb, wy);
                        ensureBufferCapacity(4, false);

                        const vBase = vertCount;
                        const dst = vBase * 3;
                        
                        // Single diagonal quad (0,0) to (1,1)
                        BUFFER_POS[dst]   = worldX + 0.15; BUFFER_POS[dst+1] = wy;       BUFFER_POS[dst+2] = worldZ + 0.15;
                        BUFFER_POS[dst+3] = worldX + 0.85; BUFFER_POS[dst+4] = wy;       BUFFER_POS[dst+5] = worldZ + 0.85;
                        BUFFER_POS[dst+6] = worldX + 0.85; BUFFER_POS[dst+7] = wy + 0.8; BUFFER_POS[dst+8] = worldZ + 0.85;
                        BUFFER_POS[dst+9] = worldX + 0.15; BUFFER_POS[dst+10]= wy + 0.8; BUFFER_POS[dst+11]= worldZ + 0.15;

                        // Upward normals
                        for(let k=0; k<4; k++) {
                            BUFFER_NORM[dst + k*3] = 0; BUFFER_NORM[dst + k*3 + 1] = 1; BUFFER_NORM[dst + k*3 + 2] = 0;
                            BUFFER_COL[dst + k*3] = rgb[0]; BUFFER_COL[dst + k*3 + 1] = rgb[1]; BUFFER_COL[dst + k*3 + 2] = rgb[2];
                        }
                        
                        BUFFER_IND[indexCount++] = vBase; BUFFER_IND[indexCount++] = vBase+1; BUFFER_IND[indexCount++] = vBase+2;
                        BUFFER_IND[indexCount++] = vBase+2; BUFFER_IND[indexCount++] = vBase+3; BUFFER_IND[indexCount++] = vBase;
                        // Double side
                        BUFFER_IND[indexCount++] = vBase; BUFFER_IND[indexCount++] = vBase+3; BUFFER_IND[indexCount++] = vBase+2;
                        BUFFER_IND[indexCount++] = vBase+2; BUFFER_IND[indexCount++] = vBase+1; BUFFER_IND[indexCount++] = vBase;
                        
                        vertCount += 4;
                    }
                    continue; // Skip cube meshing for plants
                }

                // --- Cube Meshing ---
                const isWaterBlock = isWater(type);
                const isTrans = isTransparent(type);

                // Check 6 neighbors
                for (let d = 0; d < 6; d++) {
                    const nx = wx + F_NORM[d][0] * step;
                    const ny = wy + F_NORM[d][1] * step;
                    const nz = wz + F_NORM[d][2] * step;

                    const nType = getBlock(nx, ny, nz);
                    let drawFace = false;

                    if (isWaterBlock) {
                        // Water draws if neighbor is NOT water (Air, Solid, etc)
                        drawFace = !isWater(nType);
                        if (drawFace && nType !== BLOCK.AIR && !isTransparent(nType)) {
                            drawFace = false; // Cull water against solid ground
                        }
                    } else {
                        // Solid block
                        const nTrans = isTransparent(nType);
                        const nWater = isWater(nType);
                        if (nTrans || nWater) {
                            drawFace = true;
                        }
                    }

                    if (drawFace) {
                        ensureBufferCapacity(4, isWaterBlock);

                        const POS = isWaterBlock ? BUFFER_POS_W : BUFFER_POS;
                        const NORM = isWaterBlock ? BUFFER_NORM_W : BUFFER_NORM;
                        const COL = isWaterBlock ? BUFFER_COL_W : BUFFER_COL;
                        const IND = isWaterBlock ? BUFFER_IND_W : BUFFER_IND;
                        
                        let vBase = isWaterBlock ? vertCountW : vertCount;
                        let iBase = isWaterBlock ? indexCountW : indexCount;
                        
                        // Seed for color variation
                        const worldX = startX + wx;
                        const worldZ = startZ + wz;
                        let seedH = (worldX * 374761393) ^ (wy * 668265263) ^ (worldZ * 963469177);
                        seedH = (seedH ^ (seedH >> 13)) * 1274124933;
                        const rand = ((seedH >>> 0) / 4294967296);

                        fastColor(type, rand, rgb);
                        
                        // Fake AO / Shading
                        let shade = 1.0;
                        if (d === 3) shade = 0.6; // Bottom
                        else if (d === 1 || d === 5) shade = 0.85; // Sides
                        else if (d === 0 || d === 4) shade = 0.9;
                        
                        // Water specific color
                        if (isWaterBlock) {
                            rgb[0] = 0.2; rgb[1] = 0.5; rgb[2] = 0.8;
                            shade = 1.0;
                        }

                        const verts = F_VERTS[d];
                        const nxVal = F_NORM[d][0], nyVal = F_NORM[d][1], nzVal = F_NORM[d][2];

                        for(let k=0; k<4; k++) {
                            const dst = vBase * 3;
                            POS[dst]   = startX + wx + verts[k][0] * step;
                            POS[dst+1] = wy + verts[k][1] * step;
                            POS[dst+2] = startZ + wz + verts[k][2] * step;
                            
                            NORM[dst]   = nxVal;
                            NORM[dst+1] = nyVal;
                            NORM[dst+2] = nzVal;
                            
                            COL[dst]   = rgb[0] * shade;
                            COL[dst+1] = rgb[1] * shade;
                            COL[dst+2] = rgb[2] * shade;
                            
                            vBase++;
                        }

                        // Indices
                        const vb = isWaterBlock ? vertCountW : vertCount;
                        IND[iBase++] = vb;     IND[iBase++] = vb + 1; IND[iBase++] = vb + 2;
                        IND[iBase++] = vb + 2; IND[iBase++] = vb + 3; IND[iBase++] = vb;

                        if (isWaterBlock) {
                            vertCountW = vBase;
                            indexCountW = iBase;
                        } else {
                            vertCount = vBase;
                            indexCount = iBase;
                        }
                    }
                }
            }
        }
    }

    const posOut = BUFFER_POS.slice(0, vertCount * 3);
    const normOut = BUFFER_NORM.slice(0, vertCount * 3);
    const colOut = BUFFER_COL.slice(0, vertCount * 3);
    const indOut = BUFFER_IND.slice(0, indexCount);

    const posOutW = BUFFER_POS_W.slice(0, vertCountW * 3);
    const normOutW = BUFFER_NORM_W.slice(0, vertCountW * 3);
    const colOutW = BUFFER_COL_W.slice(0, vertCountW * 3);
    const indOutW = BUFFER_IND_W.slice(0, indexCountW);

    const transferList = [
        data.buffer, 
        posOut.buffer, normOut.buffer, colOut.buffer, indOut.buffer,
        posOutW.buffer, normOutW.buffer, colOutW.buffer, indOutW.buffer
    ];

    // OPTIMIZATION: Return raw coordinates (x, z) instead of string key
    self.postMessage({ 
        x: x,
        z: z,
        lod: lod,
        data: data,
        geometry: { position: posOut, normal: normOut, color: colOut, index: indOut },
        waterGeometry: { position: posOutW, normal: normOutW, color: colOutW, index: indOutW }
    }, transferList);
};
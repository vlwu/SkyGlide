import { BLOCK, isTransparent, isPlant } from './BlockDefs.js';
import { fastColor } from './BlockStyles.js';
import { TerrainPass } from './gen/TerrainPass.js';
import { VegetationPass } from './gen/VegetationPass.js';

let MAX_VERTICES = 40000;
let BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
let BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
let BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
let BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments, lod = 1 } = e.data;
    
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    const strideY = size;          
    const strideZ = size * height; 
    
    // --- 1. Terrain Pass ---
    TerrainPass.generate(data, startX, startZ, size, height);

    // --- 2. Vegetation Pass ---
    VegetationPass.generate(data, startX, startZ, size, height);
    
    // --- 3. Path/Structure Pass (Carving) ---
    // Keep path carving here or move to another pass if it gets complex
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

    // --- 4. Spawn Area Override ---
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
                data[lx + strideY * 15 + zOffset] = BLOCK.SPAWN;
                for(let y = 16; y <= 30; y++) { 
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // --- 5. Meshing (Greedy + Plants) ---
    // (Logic below remains largely identical but uses imported helpers)
    let vertCount = 0;
    let indexCount = 0;
    const rgb = [0,0,0];

    const step = lod;
    const lSize = Math.ceil(size / step);
    const lHeight = Math.ceil(height / step);

    const getLODBlock = (lx, ly, lz) => {
        const x = lx * step;
        const y = ly * step;
        const z = lz * step;
        if (x >= size || y >= height || z >= size) return BLOCK.AIR;
        return data[x + z * strideZ + y * strideY];
    };

    const mask = new Int32Array(Math.max(lSize, lHeight) * Math.max(lSize, lHeight));

    const ensureBufferCapacity = (needed) => {
        if (vertCount + needed >= MAX_VERTICES) {
            MAX_VERTICES = Math.floor(MAX_VERTICES * 1.5);
            const newPos = new Float32Array(MAX_VERTICES * 3); newPos.set(BUFFER_POS); BUFFER_POS = newPos;
            const newNorm = new Float32Array(MAX_VERTICES * 3); newNorm.set(BUFFER_NORM); BUFFER_NORM = newNorm;
            const newCol = new Float32Array(MAX_VERTICES * 3); newCol.set(BUFFER_COL); BUFFER_COL = newCol;
            const newInd = new Uint16Array(MAX_VERTICES * 1.5); newInd.set(BUFFER_IND); BUFFER_IND = newInd;
        }
    };

    // Standard Block Meshing
    for (let d = 0; d < 3; d++) {
        let i, j, k, l, w, h, u = (d + 1) % 3, v = (d + 2) % 3;
        const x = [0, 0, 0];
        const q = [0, 0, 0];
        
        const dims = [lSize, lHeight, lSize];
        q[d] = 1;

        for (x[d] = -1; x[d] < dims[d]; ) {
            let n = 0;
            for (x[v] = 0; x[v] < dims[v]; x[v]++) {
                for (x[u] = 0; x[u] < dims[u]; x[u]++) {
                    const b1 = (x[d] >= 0) ? getLODBlock(x[0], x[1], x[2]) : BLOCK.AIR;
                    const b2 = (x[d] < dims[d] - 1) ? getLODBlock(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : BLOCK.AIR;
                    let faceType = 0;
                    const t1 = isTransparent(b1);
                    const t2 = isTransparent(b2);
                    if (!t1 && t2) faceType = b1;      
                    else if (t1 && !t2) faceType = -b2; 
                    mask[n++] = faceType;
                }
            }
            x[d]++;
            n = 0;
            for (j = 0; j < dims[v]; j++) {
                for (i = 0; i < dims[u]; ) {
                    const c = mask[n];
                    if (c !== 0) {
                        for (w = 1; c === mask[n + w] && i + w < dims[u]; w++) {}
                        let done = false;
                        for (h = 1; j + h < dims[v]; h++) {
                            for (k = 0; k < w; k++) {
                                if (c !== mask[n + k + h * dims[u]]) { done = true; break; }
                            }
                            if (done) break;
                        }
                        x[u] = i; x[v] = j;
                        const du = [0, 0, 0]; du[u] = w;
                        const dv = [0, 0, 0]; dv[v] = h;
                        const vBase = vertCount;
                        const start = [x[0] * step, x[1] * step, x[2] * step];
                        const spanU = [du[0] * step, du[1] * step, du[2] * step];
                        const spanV = [dv[0] * step, dv[1] * step, dv[2] * step];
                        const corners = [[0, 0, 0], spanU, [spanU[0]+spanV[0], spanU[1]+spanV[1], spanU[2]+spanV[2]], spanV];
                        const type = Math.abs(c);
                        const isBack = c < 0;
                        const wx = startX + start[0];
                        const wz = startZ + start[2];
                        let seedH = (wx * 374761393) ^ (start[1] * 668265263) ^ (wz * 963469177);
                        seedH = (seedH ^ (seedH >> 13)) * 1274124933;
                        const rand = ((seedH >>> 0) / 4294967296);
                        
                        fastColor(type, rand, rgb);
                        let shade = 1.0;
                        if (d === 1) shade = isBack ? 0.6 : 1.1; 
                        else if (d === 0) shade = 0.85; 
                        else shade = 0.9; 

                        ensureBufferCapacity(4);
                        for (let k = 0; k < 4; k++) {
                            const p = isBack ? corners[3-k] : corners[k];
                            const dst = vertCount * 3;
                            BUFFER_POS[dst] = startX + start[0] + p[0];
                            BUFFER_POS[dst+1] = start[1] + p[1];
                            BUFFER_POS[dst+2] = startZ + start[2] + p[2];
                            BUFFER_NORM[dst] = q[0] * (isBack ? -1 : 1);
                            BUFFER_NORM[dst+1] = q[1] * (isBack ? -1 : 1);
                            BUFFER_NORM[dst+2] = q[2] * (isBack ? -1 : 1);
                            BUFFER_COL[dst] = rgb[0] * shade;
                            BUFFER_COL[dst+1] = rgb[1] * shade;
                            BUFFER_COL[dst+2] = rgb[2] * shade;
                            vertCount++;
                        }
                        BUFFER_IND[indexCount++] = vBase; BUFFER_IND[indexCount++] = vBase + 1; BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 2; BUFFER_IND[indexCount++] = vBase + 3; BUFFER_IND[indexCount++] = vBase;

                        for (l = 0; l < h; ++l) { for (k = 0; k < w; ++k) { mask[n + k + l * dims[u]] = 0; } }
                        i += w; n += w;
                    } else { i++; n++; }
                }
            }
        }
    }

    // Plant Meshing
    if (lod === 1) {
        for (let lx = 0; lx < size; lx++) {
            for (let ly = 0; ly < height; ly++) {
                for (let lz = 0; lz < size; lz++) {
                    const idx = lx + lz * strideZ + ly * strideY;
                    const type = data[idx];
                    
                    if (isPlant(type)) {
                        const wx = startX + lx;
                        const wz = startZ + lz;
                        let seedH = (wx * 374761393) ^ (ly * 668265263) ^ (wz * 963469177);
                        seedH = (seedH ^ (seedH >> 13)) * 1274124933;
                        const rand = ((seedH >>> 0) / 4294967296); 

                        ensureBufferCapacity(8);
                        const vBase = vertCount;
                        
                        const pushVert = (vx, vy, vz, nx, ny, nz) => {
                            const dst = vertCount * 3;
                            BUFFER_POS[dst] = startX + lx + vx; BUFFER_POS[dst+1] = ly + vy; BUFFER_POS[dst+2] = startZ + lz + vz;
                            BUFFER_NORM[dst] = nx; BUFFER_NORM[dst+1] = ny; BUFFER_NORM[dst+2] = nz;
                            fastColor(type, rand, rgb, vy); 
                            BUFFER_COL[dst] = rgb[0]; BUFFER_COL[dst+1] = rgb[1]; BUFFER_COL[dst+2] = rgb[2];
                            vertCount++;
                        };

                        pushVert(0.15, 0, 0.15, 0.7, 0, 0.7); pushVert(0.85, 0, 0.85, 0.7, 0, 0.7);
                        pushVert(0.85, 0.8, 0.85, 0.7, 0, 0.7); pushVert(0.15, 0.8, 0.15, 0.7, 0, 0.7);
                        pushVert(0.15, 0, 0.85, 0.7, 0, -0.7); pushVert(0.85, 0, 0.15, 0.7, 0, -0.7);
                        pushVert(0.85, 0.8, 0.15, 0.7, 0, -0.7); pushVert(0.15, 0.8, 0.85, 0.7, 0, -0.7);

                        for(let i=0; i<2; i++) {
                            const base = vBase + i * 4;
                            BUFFER_IND[indexCount++] = base; BUFFER_IND[indexCount++] = base + 1; BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 2; BUFFER_IND[indexCount++] = base + 3; BUFFER_IND[indexCount++] = base;
                            BUFFER_IND[indexCount++] = base; BUFFER_IND[indexCount++] = base + 3; BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 2; BUFFER_IND[indexCount++] = base + 1; BUFFER_IND[indexCount++] = base;
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

    self.postMessage({ 
        key: `${x},${z}`,
        lod: lod,
        data: data,
        geometry: { position: posOut, normal: normOut, color: colOut, index: indOut }
    }, [data.buffer, posOut.buffer, normOut.buffer, colOut.buffer, indOut.buffer]);
};
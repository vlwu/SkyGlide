// src/world/ChunkWorker.js
import { BLOCK, FACE_DIRS, FACE_CORNERS, isTransparent, isPlant } from './BlockDefs.js';
import { fastColor, getBiome, getBiomeBlock, noise3D } from './BiomeUtils.js';

const MAX_VERTICES = 40000;
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments, lod = 1 } = e.data;
    
    // Always generate full resolution data for consistency
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    
    const strideY = size;          
    const strideZ = size * height; 
    
    // 1. GENERATE TERRAIN
    const scaleBase = 0.02;
    const scaleMount = 0.04;
    const scaleIsland = 0.04;
    const scaleDetail = 0.1;

    for (let lx = 0; lx < size; lx++) {
        const wx = startX + lx;
        for (let lz = 0; lz < size; lz++) {
            const wz = startZ + lz;
            const biome = getBiome(wx, wz);

            let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
            
            const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
            if (mountain > 0) h += mountain * 35;
            
            if (biome === 'mountain') {
                h += noise3D(wx * scaleMount * 0.5, 200, wz * scaleMount * 0.5) * 20;
            } else if (biome === 'desert') {
                const dunes = noise3D(wx * 0.05, 300, wz * 0.05);
                h = h * 0.7 + dunes * 8;
            } else if (biome === 'tundra') {
                h = h * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;
            }
            
            const groundHeight = Math.floor(h);
            const colBase = lx + lz * strideZ;
            const loopMax = Math.min(height, Math.max(groundHeight + 2, 90));

            for (let y = 0; y < loopMax; y++) {
                let blockType = BLOCK.AIR;
                
                if (y <= groundHeight) {
                    const depth = groundHeight - y;
                    blockType = getBiomeBlock(biome, depth, y, groundHeight);
                    
                    if (depth === 0) {
                        const detail = noise3D(wx * scaleDetail, y * scaleDetail, wz * scaleDetail);
                        if (biome === 'plains' && detail > 0.6) blockType = BLOCK.MOSS_STONE;
                        if (biome === 'mountain' && groundHeight > 60 && detail < -0.6) blockType = BLOCK.MARBLE;
                    }
                } else if (y > 45) {
                    // Floating islands
                    const islandNoise = noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland);
                    if (islandNoise > 0.45) {
                        if (y > 80) blockType = BLOCK.PACKED_ICE;
                        else if (y > 78) blockType = BLOCK.ICE;
                        else {
                            const islandDetail = noise3D(wx * 0.15, y * 0.15, wz * 0.15);
                            if (islandDetail > 0.3) blockType = BLOCK.MARBLE;
                            else if (islandDetail < -0.3) blockType = BLOCK.GRANITE;
                            else blockType = BLOCK.STONE;
                        }
                        if (y < 70 && islandNoise < 0.5 && noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0) {
                            blockType = BLOCK.MOSS_STONE;
                        }
                    }
                }
                
                if (blockType !== BLOCK.AIR) {
                    data[colBase + y * strideY] = blockType; 
                }
            }
        }
    }

    // 2. VEGETATION PASS (Trees & Plants)
    const treeCheckRange = 3; 
    for (let lx = -treeCheckRange; lx < size + treeCheckRange; lx++) {
        const wx = startX + lx;
        for (let lz = -treeCheckRange; lz < size + treeCheckRange; lz++) {
            const wz = startZ + lz;

            // Simple deterministic noise for tree placement
            const treeNoise = noise3D(wx * 0.8, 999, wz * 0.8);
            if (treeNoise > 0.75) {
                const biome = getBiome(wx, wz);
                if (biome === 'plains' || biome === 'tundra' || biome === 'mountain') {
                    // Calculate ground height
                    let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
                    const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
                    if (mountain > 0) h += mountain * 35;
                    if (biome === 'mountain') h += noise3D(wx * scaleMount * 0.5, 200, wz * scaleMount * 0.5) * 20;
                    else if (biome === 'tundra') h = h * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;
                    
                    const groundY = Math.floor(h);
                    const surfaceBlock = getBiomeBlock(biome, 0, groundY, groundY);

                    if (groundY > 10 && groundY < height - 10 && surfaceBlock === BLOCK.GRASS) {
                        const treeHeight = 4 + Math.floor((treeNoise - 0.75) * 20); 
                        const leafStart = groundY + treeHeight - 2;
                        const leafEnd = groundY + treeHeight + 1;

                        // Trunk
                        for(let y = groundY + 1; y < groundY + treeHeight; y++) {
                            if (lx >= 0 && lx < size && lz >= 0 && lz < size) {
                                const idx = lx + lz * strideZ + y * strideY;
                                if (data[idx] === BLOCK.AIR || isPlant(data[idx])) {
                                    data[idx] = BLOCK.OAK_LOG;
                                }
                            }
                        }

                        // Leaves
                        for(let ly = leafStart; ly <= leafEnd; ly++) {
                            for(let bx = lx - 2; bx <= lx + 2; bx++) {
                                for(let bz = lz - 2; bz <= lz + 2; bz++) {
                                    if (bx >= 0 && bx < size && bz >= 0 && bz < size && ly >= 0 && ly < height) {
                                        const dist = Math.abs(bx - lx) + Math.abs(bz - lz) + Math.abs(ly - (leafStart + 1));
                                        if (dist <= 3) {
                                            const idx = bx + bz * strideZ + ly * strideY;
                                            if (data[idx] === BLOCK.AIR) {
                                                data[idx] = BLOCK.OAK_LEAVES;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Grass/Flowers/Desert Vegetation
    for (let lx = 0; lx < size; lx++) {
        const wx = startX + lx;
        for (let lz = 0; lz < size; lz++) {
            const wz = startZ + lz;
            
            for (let y = height - 2; y > 0; y--) {
                const idx = lx + lz * strideZ + y * strideY;
                const block = data[idx];
                
                if (block !== BLOCK.AIR && !isTransparent(block)) {
                    const aboveIdx = idx + strideY;
                    if (aboveIdx < data.length && data[aboveIdx] === BLOCK.AIR) {
                        const plantNoise = noise3D(wx * 0.9, y * 0.9, wz * 0.9);

                        if (block === BLOCK.GRASS) {
                            if (plantNoise > 0.2) {
                                if (plantNoise > 0.75) data[aboveIdx] = BLOCK.RED_FLOWER;
                                else if (plantNoise > 0.60) data[aboveIdx] = BLOCK.YELLOW_FLOWER;
                                else data[aboveIdx] = BLOCK.TALL_GRASS;
                            }
                        }
                        else if (block === BLOCK.SAND) {
                            if (plantNoise > 0.3) {
                                if (plantNoise > 0.65) {
                                    // Cactus
                                    let neighborCactus = false;
                                    const offsets = [[0,-1], [-1,0], [-1,-1], [-1,1]];
                                    for(let o of offsets) {
                                        const nx = lx + o[0];
                                        const nz = lz + o[1];
                                        if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                                            const nBase = nx + nz * strideZ;
                                            const minNy = Math.max(0, y - 2);
                                            const maxNy = Math.min(height - 1, y + 2);
                                            for(let ny = minNy; ny <= maxNy; ny++) {
                                                if(data[nBase + ny * strideY] === BLOCK.CACTUS) {
                                                    neighborCactus = true;
                                                    break;
                                                }
                                            }
                                        }
                                        if(neighborCactus) break;
                                    }

                                    if (!neighborCactus) {
                                        const h = (plantNoise > 0.8) ? 3 : 2;
                                        for(let k = 0; k < h; k++) {
                                            const cIdx = idx + strideY * (k + 1);
                                            if (cIdx < data.length && data[cIdx] === BLOCK.AIR) {
                                                data[cIdx] = BLOCK.CACTUS;
                                            }
                                        }
                                    }
                                } else {
                                    data[aboveIdx] = BLOCK.DEAD_BUSH;
                                }
                            }
                        }
                    }
                    break; 
                }
            }
        }
    }
    
    // 3. CARVE TUNNEL
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

    // 4. FORCE SPAWN (Keep spawn clear)
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
                for(let y = 15; y <= 25; y++) { 
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // 5. GREEDY MESHING
    let vertCount = 0;
    let indexCount = 0;
    const rgb = [0,0,0];

    // LOD step
    const step = lod;
    
    // Dimensions based on LOD
    const lSize = Math.ceil(size / step);
    const lHeight = Math.ceil(height / step);

    // Helpers to access data with LOD
    const getLODBlock = (lx, ly, lz) => {
        const x = lx * step;
        const y = ly * step;
        const z = lz * step;
        if (x >= size || y >= height || z >= size) return BLOCK.AIR;
        return data[x + z * strideZ + y * strideY];
    };

    // Mask for greedy meshing
    const mask = new Int32Array(Math.max(lSize, lHeight) * Math.max(lSize, lHeight));

    // Axis: 0=X, 1=Y, 2=Z
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

                    // Note: isPlant() blocks are isTransparent=true, so they won't form faces here
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
                                if (c !== mask[n + k + h * dims[u]]) {
                                    done = true;
                                    break;
                                }
                            }
                            if (done) break;
                        }

                        x[u] = i; 
                        x[v] = j;
                        
                        const du = [0, 0, 0]; du[u] = w;
                        const dv = [0, 0, 0]; dv[v] = h;

                        const vBase = vertCount;
                        const start = [x[0] * step, x[1] * step, x[2] * step];
                        const spanU = [du[0] * step, du[1] * step, du[2] * step];
                        const spanV = [dv[0] * step, dv[1] * step, dv[2] * step];
                        
                        const corners = [
                            [0, 0, 0],
                            spanU,
                            [spanU[0]+spanV[0], spanU[1]+spanV[1], spanU[2]+spanV[2]],
                            spanV
                        ];

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

                        BUFFER_IND[indexCount++] = vBase;
                        BUFFER_IND[indexCount++] = vBase + 1;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 3;
                        BUFFER_IND[indexCount++] = vBase;

                        for (l = 0; l < h; ++l) {
                            for (k = 0; k < w; ++k) {
                                mask[n + k + l * dims[u]] = 0;
                            }
                        }

                        i += w; n += w;
                    } else {
                        i++; n++;
                    }
                }
            }
        }
    }

    // 6. PLANT MESHING (Standard Cross Geometry, separate pass)
    // Only perform for detailed LOD to reduce noise/geometry at distance
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

                        const vBase = vertCount;
                        
                        const pushVert = (vx, vy, vz, nx, ny, nz) => {
                            const dst = vertCount * 3;
                            BUFFER_POS[dst] = startX + lx + vx;
                            BUFFER_POS[dst+1] = ly + vy;
                            BUFFER_POS[dst+2] = startZ + lz + vz;
                            
                            BUFFER_NORM[dst] = nx;
                            BUFFER_NORM[dst+1] = ny;
                            BUFFER_NORM[dst+2] = nz;
                            
                            fastColor(type, rand, rgb, vy); 
                            BUFFER_COL[dst] = rgb[0];
                            BUFFER_COL[dst+1] = rgb[1];
                            BUFFER_COL[dst+2] = rgb[2];
                            
                            vertCount++;
                        };

                        // Diagonal 1
                        pushVert(0.15, 0, 0.15, 0.7, 0, 0.7);
                        pushVert(0.85, 0, 0.85, 0.7, 0, 0.7);
                        pushVert(0.85, 0.8, 0.85, 0.7, 0, 0.7);
                        pushVert(0.15, 0.8, 0.15, 0.7, 0, 0.7);
                        
                        // Diagonal 2
                        pushVert(0.15, 0, 0.85, 0.7, 0, -0.7);
                        pushVert(0.85, 0, 0.15, 0.7, 0, -0.7);
                        pushVert(0.85, 0.8, 0.15, 0.7, 0, -0.7);
                        pushVert(0.15, 0.8, 0.85, 0.7, 0, -0.7);

                        // Double sided indices (2 faces * 2 sides = 4 draws, but simplified here to 2 faces double-drawn or just cull disabled in shader/material)
                        // In main.js material uses default (CullFaceBack). 
                        // To make plants visible from both sides without changing material, we can add reverse faces.
                        
                        for(let i=0; i<2; i++) {
                            const base = vBase + i * 4;
                            // Front
                            BUFFER_IND[indexCount++] = base;
                            BUFFER_IND[indexCount++] = base + 1;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 3;
                            BUFFER_IND[indexCount++] = base;
                            
                            // Back (Reverse Winding)
                            BUFFER_IND[indexCount++] = base;
                            BUFFER_IND[indexCount++] = base + 3;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 1;
                            BUFFER_IND[indexCount++] = base;
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
        geometry: {
            position: posOut,
            normal: normOut,
            color: colOut,
            index: indOut
        }
    }, [data.buffer, posOut.buffer, normOut.buffer, colOut.buffer, indOut.buffer]);
};
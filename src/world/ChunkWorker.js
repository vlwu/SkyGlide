import { BLOCK, FACE_DIRS, FACE_CORNERS, isTransparent, isPlant } from './BlockDefs.js';
import { fastColor, getBiome, getBiomeBlock, noise3D } from './BiomeUtils.js';

let MAX_VERTICES = 40000;
let BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
let BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
let BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
let BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

// Helper for smooth interpolation
function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

// Helper to mix values based on t (0..1)
function mix(a, b, t) {
    return a * (1 - t) + b * t;
}

self.onmessage = (e) => {
    const { x, z, size, height, pathSegments, lod = 1 } = e.data;
    
    const data = new Uint8Array(size * height * size);
    const startX = x * size;
    const startZ = z * size;
    
    const strideY = size;          
    const strideZ = size * height; 
    
    // 1. GENERATE TERRAIN
    const scaleBase = 0.02;
    const scaleMount = 0.015; 
    const scaleDetail = 0.1;
    
    // Island parameters
    const islandBaseScale = 0.012; 
    const islandCenterY = 100;
    const islandBand = 50; 

    // Biome Noise Constants (Must match BiomeUtils roughly for consistency)
    const biomeScale = 0.002;

    for (let lx = 0; lx < size; lx++) {
        const wx = startX + lx;
        for (let lz = 0; lz < size; lz++) {
            const wz = startZ + lz;

            // --- 1a. Biome & Height Blending ---
            
            // Raw noise values for biome determination
            const bVal = noise3D(wx * biomeScale, 0, wz * biomeScale);
            const tVal = noise3D(wx * biomeScale * 0.5, 500, wz * biomeScale * 0.5);

            // Calculate Biome Weights using smooth transitions
            // Mountain: bVal > 0.4
            const wMount = smoothstep(0.2, 0.6, bVal);
            
            // Tundra: tVal < -0.5
            // We mask it slightly so it doesn't override mountains completely if they overlap
            const wTundraRaw = smoothstep(-0.3, -0.7, tVal);
            const wTundra = wTundraRaw * (1.0 - wMount * 0.5);

            // Desert: bVal < -0.4 && tVal < 0
            const wDesertRaw = smoothstep(-0.2, -0.6, bVal) * smoothstep(0.2, -0.2, tVal);
            const wDesert = wDesertRaw * (1.0 - wMount);

            // Base Terrain (Plains/Default)
            let hBase = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
            const mNoise = noise3D(wx * scaleMount, 100, wz * scaleMount);
            
            // Apply Plains variation (slight hills) to base
            if (mNoise > 0.3) hBase += (mNoise - 0.3) * 30;

            // -- Height Variations --

            // 1. Mountain Height
            // Ridged Multifractal
            const ridge = 1.0 - Math.abs(noise3D(wx * 0.03, 200, wz * 0.03));
            const hMountVal = hBase + (mNoise > 0 ? mNoise * 50 : 0) + (ridge * ridge * 60);

            // 2. Desert Height (Dunes)
            const dunes = Math.abs(noise3D(wx * 0.05, 300, wz * 0.05));
            const hDesertVal = hBase * 0.6 + dunes * 15;

            // 3. Tundra Height (Smoother)
            const hTundraVal = hBase * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;

            // Blend Heights
            // Start with Base, blend others on top based on weights
            let h = hBase;
            
            // We use a hierarchical blend or additive mix? 
            // Lerp is safer to prevent explosion.
            if (wDesert > 0) h = mix(h, hDesertVal, wDesert);
            if (wTundra > 0) h = mix(h, hTundraVal, wTundra);
            if (wMount > 0)  h = mix(h, hMountVal, wMount);

            const groundHeight = Math.floor(h);

            // --- 1b. Block Selection with Dithering ---
            // Jitter the coordinates for getBiome to create jagged/dithered block transitions
            // instead of straight lines.
            const jitterScale = 0.1;
            const jitterAmt = 8.0;
            const jx = noise3D(wx * jitterScale, 50, wz * jitterScale) * jitterAmt;
            const jz = noise3D(wx * jitterScale, -50, wz * jitterScale) * jitterAmt;
            
            const biome = getBiome(wx + jx, wz + jz);

            // Fill loop
            for (let y = 0; y < height; y++) {
                let blockType = BLOCK.AIR;
                
                // --- Ground Layer ---
                if (y <= groundHeight) {
                    const depth = groundHeight - y;
                    blockType = getBiomeBlock(biome, depth, y, groundHeight);
                    
                    if (depth === 0) {
                        const detail = noise3D(wx * scaleDetail, y * scaleDetail, wz * scaleDetail);
                        if (biome === 'plains' && detail > 0.6) blockType = BLOCK.MOSS_STONE;
                        if (biome === 'mountain' && groundHeight > 80 && detail < -0.5) blockType = BLOCK.SNOW;
                    }
                } 
                
                // --- Floating Islands (Sky Layer) ---
                if (y > 70) {
                    const dist = Math.abs(y - islandCenterY);
                    const densityGradient = Math.max(0, 1.0 - (dist / islandBand));
                    
                    if (densityGradient > 0) {
                        const n1 = noise3D(wx * islandBaseScale, y * 0.02, wz * islandBaseScale);
                        const n2 = noise3D(wx * 0.05, y * 0.05, wz * 0.05) * 0.15;
                        
                        const noiseVal = n1 + n2;
                        const threshold = 0.2 + (1.0 - densityGradient) * 0.6;
                        
                        if (noiseVal > threshold) {
                            if (y > 130) blockType = BLOCK.SNOW;
                            else if (y > 125) blockType = BLOCK.PACKED_ICE;
                            else if (noiseVal > threshold + 0.15 && densityGradient > 0.8) {
                                blockType = BLOCK.GRASS;
                            } else {
                                blockType = BLOCK.STONE;
                                if (noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0.3) blockType = BLOCK.MOSS_STONE;
                            }
                        }
                    }
                }

                if (blockType !== BLOCK.AIR) {
                    data[lx + lz * strideZ + y * strideY] = blockType; 
                }
            }
        }
    }

    // 2. VEGETATION PASS
    const treeCheckRange = 3; 
    for (let lx = -treeCheckRange; lx < size + treeCheckRange; lx++) {
        const wx = startX + lx;
        for (let lz = -treeCheckRange; lz < size + treeCheckRange; lz++) {
            const wz = startZ + lz;

            const treeNoise = noise3D(wx * 0.8, 999, wz * 0.8);
            if (treeNoise > 0.75) {
                // Re-calculate h for tree placement (simplified for perf)
                // Use simplified logic or the main biome noise to guess roughly
                // For trees, we just check the ground layer we just generated.
                // Since we can't easily query neighboring chunks' exact height without data,
                // we'll stick to the safe "inside chunk" check we had, but we must use the generated data to find Y.
                
                if (lx >= 0 && lx < size && lz >= 0 && lz < size) {
                     // Find top block
                     let groundY = -1;
                     for (let y = height - 1; y > 0; y--) {
                         const idx = lx + lz * strideZ + y * strideY;
                         if (data[idx] !== BLOCK.AIR && !isTransparent(data[idx])) {
                             // Ignore islands for trees? Or allow them?
                             // Let's filter out very high blocks if we only want ground trees
                             if (y < 100) {
                                 groundY = y;
                                 break;
                             }
                         }
                     }

                     if (groundY > 10) {
                         const b = data[lx + lz * strideZ + groundY * strideY];
                         // Allow trees on Grass/Dirt/Snow
                         if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.SNOW) {
                             const treeHeight = 4 + Math.floor((treeNoise - 0.75) * 20); 
                             const leafStart = groundY + treeHeight - 2;
                             const leafEnd = groundY + treeHeight + 1;

                             // Trunk
                             for(let y = groundY + 1; y < groundY + treeHeight; y++) {
                                 const tIdx = lx + lz * strideZ + y * strideY;
                                 if (tIdx < data.length) data[tIdx] = BLOCK.OAK_LOG;
                             }

                             // Leaves
                             for(let ly = leafStart; ly <= leafEnd; ly++) {
                                 for(let bx = lx - 2; bx <= lx + 2; bx++) {
                                     for(let bz = lz - 2; bz <= lz + 2; bz++) {
                                         if (bx >= 0 && bx < size && bz >= 0 && bz < size && ly < height) {
                                             const dist = Math.abs(bx - lx) + Math.abs(bz - lz) + Math.abs(ly - (leafStart + 1));
                                             if (dist <= 3) {
                                                 const lIdx = bx + bz * strideZ + ly * strideY;
                                                 if (data[lIdx] === BLOCK.AIR) data[lIdx] = BLOCK.OAK_LEAVES;
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

    // Grass/Flowers/Desert Vegetation Pass
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
                        } else if (block === BLOCK.SAND) {
                            // Desert Vegetation
                            if (plantNoise > 0.6) {
                                if (plantNoise > 0.85) {
                                    // Cactus Base
                                    data[aboveIdx] = BLOCK.CACTUS;
                                    
                                    // 2nd Block
                                    if (plantNoise > 0.88 && aboveIdx + strideY < data.length) {
                                        data[aboveIdx + strideY] = BLOCK.CACTUS;
                                        
                                        // 3rd Block (New Logic)
                                        if (plantNoise > 0.94 && aboveIdx + strideY * 2 < data.length) {
                                            data[aboveIdx + strideY * 2] = BLOCK.CACTUS;
                                        }
                                    }
                                } else if (plantNoise > 0.70) {
                                    data[aboveIdx] = BLOCK.DEAD_BUSH;
                                }
                            }
                        }
                    }
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

    // 4. FORCE SPAWN
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

    // 5. GREEDY MESHING (Standard)
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
            
            const newPos = new Float32Array(MAX_VERTICES * 3);
            newPos.set(BUFFER_POS);
            BUFFER_POS = newPos;

            const newNorm = new Float32Array(MAX_VERTICES * 3);
            newNorm.set(BUFFER_NORM);
            BUFFER_NORM = newNorm;

            const newCol = new Float32Array(MAX_VERTICES * 3);
            newCol.set(BUFFER_COL);
            BUFFER_COL = newCol;

            const newInd = new Uint16Array(MAX_VERTICES * 1.5);
            newInd.set(BUFFER_IND);
            BUFFER_IND = newInd;
        }
    };

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

    // 6. PLANT MESHING (LOD 1 only)
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

                        pushVert(0.15, 0, 0.15, 0.7, 0, 0.7);
                        pushVert(0.85, 0, 0.85, 0.7, 0, 0.7);
                        pushVert(0.85, 0.8, 0.85, 0.7, 0, 0.7);
                        pushVert(0.15, 0.8, 0.15, 0.7, 0, 0.7);
                        
                        pushVert(0.15, 0, 0.85, 0.7, 0, -0.7);
                        pushVert(0.85, 0, 0.15, 0.7, 0, -0.7);
                        pushVert(0.85, 0.8, 0.15, 0.7, 0, -0.7);
                        pushVert(0.15, 0.8, 0.85, 0.7, 0, -0.7);

                        for(let i=0; i<2; i++) {
                            const base = vBase + i * 4;
                            BUFFER_IND[indexCount++] = base;
                            BUFFER_IND[indexCount++] = base + 1;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 2;
                            BUFFER_IND[indexCount++] = base + 3;
                            BUFFER_IND[indexCount++] = base;
                            
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
import { BLOCK, FACE_DIRS, FACE_CORNERS, isTransparent, isPlant } from './BlockDefs.js';
import { fastColor, getBiome, getBiomeBlock, noise3D } from './BiomeUtils.js';

const MAX_VERTICES = 40000;
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

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
    // Trees need to be checked in a wider range to handle canopy overhang
    const treeCheckRange = 3; 
    for (let lx = -treeCheckRange; lx < size + treeCheckRange; lx++) {
        const wx = startX + lx;
        for (let lz = -treeCheckRange; lz < size + treeCheckRange; lz++) {
            const wz = startZ + lz;

            // Simple deterministic noise for tree placement
            // Use a high frequency noise to pick sparse points
            const treeNoise = noise3D(wx * 0.8, 999, wz * 0.8);
            if (treeNoise > 0.75) {
                // Potential tree spot. Check biome.
                const biome = getBiome(wx, wz);
                if (biome === 'plains' || biome === 'tundra' || biome === 'mountain') {
                    // Calculate ground height again for this spot
                    let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
                    const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
                    if (mountain > 0) h += mountain * 35;
                    if (biome === 'mountain') h += noise3D(wx * scaleMount * 0.5, 200, wz * scaleMount * 0.5) * 20;
                    else if (biome === 'tundra') h = h * 0.8 + noise3D(wx * 0.03, 400, wz * 0.03) * 5;
                    
                    const groundY = Math.floor(h);

                    // Check if the surface block is actually Grass before placing a tree
                    const surfaceBlock = getBiomeBlock(biome, 0, groundY, groundY);

                    // Tree Constraints
                    if (groundY > 10 && groundY < height - 10 && surfaceBlock === BLOCK.GRASS) {
                        // Place Tree
                        const treeHeight = 4 + Math.floor((treeNoise - 0.75) * 20); // 4 to 6
                        const leafStart = groundY + treeHeight - 2;
                        const leafEnd = groundY + treeHeight + 1;

                        // Place Trunk
                        for(let y = groundY + 1; y < groundY + treeHeight; y++) {
                            // Only write if within this chunk
                            if (lx >= 0 && lx < size && lz >= 0 && lz < size) {
                                const idx = lx + lz * strideZ + y * strideY;
                                if (data[idx] === BLOCK.AIR || isPlant(data[idx])) {
                                    data[idx] = BLOCK.OAK_LOG;
                                }
                            }
                        }

                        // Place Leaves (Simple Sphere/Blob)
                        for(let ly = leafStart; ly <= leafEnd; ly++) {
                            for(let bx = lx - 2; bx <= lx + 2; bx++) {
                                for(let bz = lz - 2; bz <= lz + 2; bz++) {
                                    // Check Bounds
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

    // Grass/Flowers (Strictly inside chunk)
    for (let lx = 0; lx < size; lx++) {
        const wx = startX + lx;
        for (let lz = 0; lz < size; lz++) {
            const wz = startZ + lz;
            
            // Scan for surface
            for (let y = height - 2; y > 0; y--) {
                const idx = lx + lz * strideZ + y * strideY;
                const block = data[idx];
                
                // Found top block?
                if (block !== BLOCK.AIR && !isTransparent(block)) {
                    // If grass, chance to spawn plant above
                    if (block === BLOCK.GRASS) {
                        const aboveIdx = idx + strideY;
                        if (aboveIdx < data.length && data[aboveIdx] === BLOCK.AIR) {
                            const plantNoise = noise3D(wx * 0.9, y * 0.9, wz * 0.9);
                            if (plantNoise > 0.2) {
                                if (plantNoise > 0.75) data[aboveIdx] = BLOCK.RED_FLOWER;
                                else if (plantNoise > 0.60) data[aboveIdx] = BLOCK.YELLOW_FLOWER;
                                else data[aboveIdx] = BLOCK.TALL_GRASS;
                            }
                        }
                    }
                    break; // Stop scanning this column
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
                for(let y = 15; y <= 25; y++) { // Increased clearance height
                    data[lx + strideY * y + zOffset] = BLOCK.AIR;
                }
            }
        }
    }

    // 5. MESH GENERATION
    let vertCount = 0;
    let indexCount = 0;
    const rgb = [0,0,0];

    const OFFSETS = [1, -1, strideY, -strideY, strideZ, -strideZ];
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

                // --- PLANT MESHING (CROSS GEOMETRY) ---
                if (isPlant(type)) {
                    const wx = startX + lx;
                    const wz = startZ + lz;
                    
                    let h = (wx * 374761393) ^ (y * 668265263) ^ (wz * 963469177);
                    h = (h ^ (h >> 13)) * 1274124933;
                    const rand = ((h >>> 0) / 4294967296); 

                    // Cross has 2 planes -> 4 faces (double sided simulated by quads)
                    const vBase = vertCount;
                    
                    // Vertex generation helper
                    const pushVert = (vx, vy, vz, u, v, nx, ny, nz) => {
                        const dst = vertCount * 3;
                        BUFFER_POS[dst] = startX + lx + vx;
                        BUFFER_POS[dst+1] = y + vy;
                        BUFFER_POS[dst+2] = startZ + lz + vz;
                        
                        BUFFER_NORM[dst] = nx;
                        BUFFER_NORM[dst+1] = ny;
                        BUFFER_NORM[dst+2] = nz;
                        
                        // Vertex Color with Gradient (Bottom darker/stem, Top lighter/flower)
                        fastColor(type, rand, rgb, vy); // Pass Y-ratio (0 or 1)
                        BUFFER_COL[dst] = rgb[0];
                        BUFFER_COL[dst+1] = rgb[1];
                        BUFFER_COL[dst+2] = rgb[2];
                        
                        vertCount++;
                    };

                    // Diagonal 1 (Front-Left to Back-Right)
                    // Face A
                    pushVert(0.15, 0, 0.15, 0, 0, 0.7, 0, 0.7);
                    pushVert(0.85, 0, 0.85, 1, 0, 0.7, 0, 0.7);
                    pushVert(0.85, 0.8, 0.85, 1, 1, 0.7, 0, 0.7);
                    pushVert(0.15, 0.8, 0.15, 0, 1, 0.7, 0, 0.7);
                    
                    // Face B (Reverse)
                    pushVert(0.15, 0.8, 0.15, 0, 1, -0.7, 0, -0.7);
                    pushVert(0.85, 0.8, 0.85, 1, 1, -0.7, 0, -0.7);
                    pushVert(0.85, 0, 0.85, 1, 0, -0.7, 0, -0.7);
                    pushVert(0.15, 0, 0.15, 0, 0, -0.7, 0, -0.7);

                    // Diagonal 2 (Front-Right to Back-Left)
                    // Face C
                    pushVert(0.15, 0, 0.85, 0, 0, 0.7, 0, -0.7);
                    pushVert(0.85, 0, 0.15, 1, 0, 0.7, 0, -0.7);
                    pushVert(0.85, 0.8, 0.15, 1, 1, 0.7, 0, -0.7);
                    pushVert(0.15, 0.8, 0.85, 0, 1, 0.7, 0, -0.7);

                    // Face D (Reverse)
                    pushVert(0.15, 0.8, 0.85, 0, 1, -0.7, 0, 0.7);
                    pushVert(0.85, 0.8, 0.15, 1, 1, -0.7, 0, 0.7);
                    pushVert(0.85, 0, 0.15, 1, 0, -0.7, 0, 0.7);
                    pushVert(0.15, 0, 0.85, 0, 0, -0.7, 0, 0.7);

                    // Indices
                    for(let i=0; i<4; i++) { // 4 Faces
                        const base = vBase + i * 4;
                        BUFFER_IND[indexCount++] = base;
                        BUFFER_IND[indexCount++] = base + 1;
                        BUFFER_IND[indexCount++] = base + 2;
                        BUFFER_IND[indexCount++] = base + 2;
                        BUFFER_IND[indexCount++] = base + 3;
                        BUFFER_IND[indexCount++] = base;
                    }
                    continue; // Skip standard cube meshing
                }

                // --- STANDARD CUBE MESHING ---

                const cacheBase = idx * 6;
                let hasExposedFace = false;

                for (let f = 0; f < 6; f++) {
                    const nx = lx + FACE_DIRS[f*3];
                    const ny = y + FACE_DIRS[f*3+1];
                    const nz = lz + FACE_DIRS[f*3+2];

                    let exposed = false;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                        const neighbor = data[idx + OFFSETS[f]];
                        // Updated: Check transparency
                        if (isTransparent(neighbor)) exposed = true;
                    } else {
                        exposed = true;
                    }

                    neighborCache[cacheBase + f] = exposed ? 1 : 0;
                    if (exposed) hasExposedFace = true;
                }

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
                        
                        BUFFER_POS[dst] = startX + lx + corner[0];
                        BUFFER_POS[dst+1] = y + corner[1];
                        BUFFER_POS[dst+2] = startZ + lz + corner[2];

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
                    
                    if (vertCount >= MAX_VERTICES - 8) break; 
                }
                if (vertCount >= MAX_VERTICES - 8) break;
            }
            if (vertCount >= MAX_VERTICES - 8) break;
        }
        if (vertCount >= MAX_VERTICES - 8) break;
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
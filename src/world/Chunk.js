import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

// Geometry lookup tables
const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, // Right
    { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }, // Left
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, // Top
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }, // Bottom
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, // Front
    { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }  // Back
];

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

// --- Memory Optimization: Reusable Scratchpad Buffers ---
// Prevents allocating thousands of arrays/objects per chunk generation.
// 32k vertices is enough for a standard 16x16x96 chunk surface.
const MAX_VERTICES = 32000; 
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5); // Indices count is roughly 1.5x vertices (6 indices per 4 verts)

export class Chunk {
    constructor(x, z, scene, racePath, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        this.material = material;
        
        this.size = 16;
        this.height = 96;
        
        this.data = new Uint8Array(this.size * this.height * this.size);
        this.mesh = null;

        this.generate();
    }

    getBlock(x, y, z) {
        if (x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        return this.data[x + this.size * (y + this.height * z)];
    }

    setBlock(x, y, z, val) {
        this.data[x + this.size * (y + this.height * z)] = val;
    }

    generate() {
        const startX = this.x * this.size;
        const startZ = this.z * this.size;
        
        const scaleBase = 0.02;
        const scaleMount = 0.04;
        const scaleIsland = 0.04;
        
        // Pre-calculate path proximity once per column to save cycles
        const pathCheckCache = new Float32Array(this.size * this.size);
        // Using -1 to indicate "not calculated" or "far"
        
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const wx = startX + x;
                const wz = startZ + z;

                // 1. Terrain Height
                let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
                
                const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
                if (mountain > 0) {
                    h += mountain * 35;
                }

                const groundHeight = Math.floor(h);

                // Path Proximity Logic
                const pathPos = this.racePath.getPointAtZ(wz);
                let pathY = -999;
                let isNearPath = false;
                
                if (pathPos) {
                    const dx = wx - pathPos.x;
                    if (Math.abs(dx) < 15) {
                        isNearPath = true;
                        pathY = pathPos.y;
                    }
                }

                // Fill Column
                // Optimization: Loop mostly mostly upwards, but logic is distinct by height
                // We access array directly for speed
                const colOffset = this.size * (this.height * z); // base offset for column

                for (let y = 0; y < this.height; y++) {
                    let blockType = BLOCK.AIR;
                    
                    // A. Ground
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
                        
                        // PERFORMANCE: Removed Cave Noise check. 
                        // Caves are invisible during flight and cost 20k+ noise calls per chunk.
                    }

                    // B. Islands (Only check noise if we are in island altitude)
                    else if (y > 45 && y < 90) {
                        // Check cheap bounding box before expensive noise
                        // Only generate islands every few blocks to save noise calls? 
                        // No, just trust the y-range limiter.
                        const islandNoise = noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland);
                        if (islandNoise > 0.45) {
                            if (y > 80) blockType = BLOCK.ICE;
                            else if (y > 78) blockType = BLOCK.SNOW;
                            else blockType = BLOCK.STONE;
                            
                            // Top grass
                            if (y < 70 && islandNoise < 0.5 && noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0) {
                                blockType = BLOCK.GRASS;
                            }
                        }
                    }

                    // C. Path Tunnel
                    if (isNearPath && blockType !== BLOCK.AIR) {
                        const dy = y - pathY;
                        // Simple circular distance check squared
                        const dx = wx - pathPos.x;
                        if (dx*dx + dy*dy < 64) {
                            blockType = BLOCK.AIR;
                        }
                    }

                    // D. Spawn Platform
                    if (blockType === BLOCK.AIR && wx >= -2 && wx <= 2 && wz >= -2 && wz <= 2 && y === 14) {
                        blockType = BLOCK.SPAWN;
                    }

                    if (blockType !== BLOCK.AIR) {
                        this.data[x + this.size * y + z * this.size * this.height] = blockType; // Fixed indexing: x + width * (y + height * z) is standard, but check getBlock usage
                        // getBlock: x + size * (y + height * z)
                        // This matches.
                    }
                }
            }
        }

        this.buildMesh(startX, startZ);
    }

    buildMesh(startX, startZ) {
        let vertCount = 0;
        let indexCount = 0;

        const colorObj = new THREE.Color();
        const size = this.size;
        const height = this.height;
        const strideY = size;          
        const strideZ = size * height; 

        // Iterate volume
        for (let z = 0; z < size; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < size; x++) {
                    const type = this.data[x + y * strideY + z * strideZ];
                    if (type === BLOCK.AIR) continue;

                    // Deterministic texture variation
                    const wx = startX + x;
                    const wz = startZ + z;
                    const rand = Math.sin(wx * 12.9898 + y * 78.233 + wz * 43.123) * 0.5 + 0.5;

                    // Palette lookup
                    this.setColor(colorObj, type, rand);
                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    // Check neighbors to cull faces
                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        let neighborType = BLOCK.AIR;
                        if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                            neighborType = this.data[nx + ny * strideY + nz * strideZ];
                        }

                        if (neighborType !== BLOCK.AIR) continue; // Face is occluded

                        // Face visible, add to buffer
                        // AO / Shading
                        let shade = 1.0;
                        if (face.dir[1] < 0) shade = 0.6;
                        else if (face.dir[1] > 0) shade = 1.1;
                        else if (face.dir[0] !== 0) shade = 0.85;
                        else shade = 0.9;

                        const vBase = vertCount;

                        for (const corner of face.corners) {
                            // Position
                            BUFFER_POS[vertCount * 3] = x + corner[0] + startX;
                            BUFFER_POS[vertCount * 3 + 1] = y + corner[1];
                            BUFFER_POS[vertCount * 3 + 2] = z + corner[2] + startZ;
                            
                            // Normal
                            BUFFER_NORM[vertCount * 3] = face.dir[0];
                            BUFFER_NORM[vertCount * 3 + 1] = face.dir[1];
                            BUFFER_NORM[vertCount * 3 + 2] = face.dir[2];

                            // Color
                            BUFFER_COL[vertCount * 3] = r * shade;
                            BUFFER_COL[vertCount * 3 + 1] = g * shade;
                            BUFFER_COL[vertCount * 3 + 2] = b * shade;

                            vertCount++;
                        }

                        // Indices (0,1,2, 2,3,0 relative to vBase)
                        BUFFER_IND[indexCount++] = vBase;
                        BUFFER_IND[indexCount++] = vBase + 1;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 3;
                        BUFFER_IND[indexCount++] = vBase;

                        // Safety break to prevent buffer overflow
                        if (vertCount >= MAX_VERTICES - 4) break;
                    }
                }
            }
        }

        if (vertCount === 0) return;

        const geometry = new THREE.BufferGeometry();
        // Slice the buffers to the exact size needed.
        // This creates copies, but it's much faster than pushing to arrays 20,000 times.
        // It drastically reduces GC thrashing because we are only creating TypedArray views/copies 
        // rather than thousands of dynamic objects.
        
        geometry.setAttribute('position', new THREE.BufferAttribute(BUFFER_POS.slice(0, vertCount * 3), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(BUFFER_NORM.slice(0, vertCount * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(BUFFER_COL.slice(0, vertCount * 3), 3));
        geometry.setIndex(new THREE.BufferAttribute(BUFFER_IND.slice(0, indexCount), 1));

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        this.mesh.frustumCulled = true;
        // Optimization: Mark matrix as static if we don't move chunks (we don't)
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
    }

    setColor(colorObj, type, rand) {
        switch (type) {
            case BLOCK.GRASS: colorObj.setHSL(0.25 + rand * 0.05, 0.6, 0.4 + rand * 0.1); break;
            case BLOCK.DIRT: colorObj.setHSL(0.08, 0.4, 0.3 + rand * 0.1); break;
            case BLOCK.STONE: colorObj.setHSL(0.6, 0.05, 0.4 + rand * 0.1); break;
            case BLOCK.SNOW: colorObj.setHSL(0.6, 0.2, 0.9 + rand * 0.1); break;
            case BLOCK.SAND: colorObj.setHSL(0.12, 0.5, 0.7 + rand * 0.1); break;
            case BLOCK.ICE: colorObj.setHSL(0.5, 0.7, 0.8); break;
            case BLOCK.SPAWN: colorObj.setHex(0xFFD700); break;
            default: colorObj.setHex(0xFF00FF);
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }
        this.data = null;
    }
}
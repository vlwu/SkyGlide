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

// Block Definitions
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

    // Safe access for external calls
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
        const caveScale = 0.05;

        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const wx = startX + x;
                const wz = startZ + z;

                // 1. Terrain Height
                // Base rolling hills
                let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
                
                // Mountains/Ridges
                const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
                if (mountain > 0) {
                    h += mountain * 35;
                }

                const groundHeight = Math.floor(h);

                // Race Path Proximity
                const pathPos = this.racePath.getPointAtZ(wz);
                let isNearPath = false;
                let pathY = 0;
                
                if (pathPos) {
                    const dx = wx - pathPos.x;
                    if (Math.abs(dx) < 15) {
                        isNearPath = true;
                        pathY = pathPos.y;
                    }
                }

                // Fill Column
                for (let y = 0; y < this.height; y++) {
                    let blockType = BLOCK.AIR;
                    
                    // A. Ground
                    if (y <= groundHeight) {
                        blockType = BLOCK.STONE; // Default interior

                        // Surface & Sub-surface Layers
                        const depth = groundHeight - y;
                        
                        // Altitude-based Biomes
                        if (groundHeight > 58) {
                            // Mountain / Snow
                            if (depth === 0) blockType = BLOCK.SNOW;
                            else if (depth < 3) blockType = BLOCK.STONE; // Stone under snow
                        } else if (groundHeight < 22) {
                            // Lowlands / Beach
                            if (depth < 3) blockType = BLOCK.SAND;
                        } else {
                            // Standard Hills
                            if (depth === 0) blockType = BLOCK.GRASS;
                            else if (depth < 3) blockType = BLOCK.DIRT;
                        }
                        
                        // Cave Check (Simple 3D noise worm)
                        if (y > 1 && y < groundHeight - 2) {
                            const caveNoise = noise3D(wx * caveScale, y * caveScale, wz * caveScale);
                            if (caveNoise > 0.5) blockType = BLOCK.AIR;
                        }
                    }

                    // B. Islands
                    else if (y > 45 && y < 90) {
                        const islandNoise = noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland);
                        if (islandNoise > 0.45) {
                            // Island Biomes (Ice clouds or Stone)
                            if (y > 80) blockType = BLOCK.ICE;
                            else if (y > 78) blockType = BLOCK.SNOW;
                            else blockType = BLOCK.STONE;
                            
                            // Top grass for lower islands
                            if (y < 70 && islandNoise < 0.5 && noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0) {
                                blockType = BLOCK.GRASS;
                            }
                        }
                    }

                    // C. Path Carving (Tunnel)
                    if (isNearPath && blockType !== BLOCK.AIR) {
                        const dy = y - pathY;
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
                        this.data[x + this.size * (y + this.height * z)] = blockType;
                    }
                }
            }
        }

        this.buildMesh(startX, startZ);
    }

    buildMesh(startX, startZ) {
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];

        const colorObj = new THREE.Color();
        const size = this.size;
        const height = this.height;
        const strideY = size;          
        const strideZ = size * height; 

        for (let z = 0; z < size; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < size; x++) {
                    const type = this.data[x + y * strideY + z * strideZ];
                    if (type === BLOCK.AIR) continue;

                    // Deterministic random for texture variation
                    const wx = startX + x;
                    const wz = startZ + z;
                    const rand = Math.sin(wx * 12.9898 + y * 78.233 + wz * 43.123) * 0.5 + 0.5; // 0..1
                    
                    // Palette
                    switch (type) {
                        case BLOCK.GRASS:
                            // Vibrant Green with slight yellow/blue variation
                            colorObj.setHSL(0.25 + rand * 0.05, 0.6, 0.4 + rand * 0.1);
                            break;
                        case BLOCK.DIRT:
                            // Reddish Brown
                            colorObj.setHSL(0.08, 0.4, 0.3 + rand * 0.1);
                            break;
                        case BLOCK.STONE:
                            // Cool Grey
                            colorObj.setHSL(0.6, 0.05, 0.4 + rand * 0.1);
                            break;
                        case BLOCK.SNOW:
                            // White with tiny blue tint
                            colorObj.setHSL(0.6, 0.2, 0.9 + rand * 0.1);
                            break;
                        case BLOCK.SAND:
                            // Sandy Beige
                            colorObj.setHSL(0.12, 0.5, 0.7 + rand * 0.1);
                            break;
                        case BLOCK.ICE:
                            // Cyan/Ice
                            colorObj.setHSL(0.5, 0.7, 0.8);
                            break;
                        case BLOCK.SPAWN:
                            colorObj.setHex(0xFFD700);
                            break;
                        default:
                            colorObj.setHex(0xFF00FF);
                    }

                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    // Face Construction
                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        // Simple boundary check for neighbors within chunk
                        let neighborType = BLOCK.AIR;
                        if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                            neighborType = this.data[nx + ny * strideY + nz * strideZ];
                        }

                        // Optimization: Skip faces between transparent blocks (like leaves) if we had them,
                        // but for solid blocks, if neighbor exists, skip face.
                        if (neighborType !== BLOCK.AIR) continue;

                        // AO / Shading (Directional)
                        let shade = 1.0;
                        if (face.dir[1] < 0) shade = 0.6; // Bottom darkest
                        else if (face.dir[1] > 0) shade = 1.1; // Top brightest
                        else if (face.dir[0] !== 0) shade = 0.85; // Sides
                        else shade = 0.9; // Front/Back

                        const ndx = positions.length / 3;

                        for (const corner of face.corners) {
                            positions.push(x + corner[0] + startX, y + corner[1], z + corner[2] + startZ);
                            normals.push(face.dir[0], face.dir[1], face.dir[2]);
                            colors.push(r * shade, g * shade, b * shade);
                        }

                        indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 3, ndx);
                    }
                }
            }
        }

        if (positions.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);

        geometry.dispose(); 

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        this.mesh.frustumCulled = true;

        this.scene.add(this.mesh);
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
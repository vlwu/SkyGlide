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

export class Chunk {
    constructor(x, z, scene, racePath, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        this.material = material;
        
        this.size = 16;
        this.height = 96;
        
        // Flattened array: x + size * (y + height * z)
        // Optimization: y is the inner-most coordinate in stride calculation usually, 
        // but here we used: x + size * (y + height * z) -> index = x + 16*y + 16*96*z? 
        // Checking previous file: data[x + this.size * (y + this.height * z)]
        // That means stride is: X changes by 1, Y changes by 16, Z changes by 1536.
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
        const scaleMount = 0.05;
        const scaleIsland = 0.04;
        const caveScale = 0.05;

        // Pre-calculate world positions to avoid recalc inside inner loops
        // Optimization: Loop Z then X to minimize cache misses if we fill linearly, 
        // but our data structure is Y-major in the middle. 
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const wx = startX + x;
                const wz = startZ + z;

                // 1. Terrain Height (2D Noise) - Calculated once per column
                let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 20 + 20;
                const ridge = Math.abs(noise3D(wx * scaleMount, 100, wz * scaleMount));
                h += ridge * 30;
                const groundHeight = Math.floor(h);

                // Race Path Proximity Optimization
                // Calculate 2D distance once per column to skip heavy math
                const pathPos = this.racePath.getPointAtZ(wz);
                let isNearPath = false;
                let pathY = 0;
                
                if (pathPos) {
                    const dx = wx - pathPos.x;
                    // We only care if horizontal distance is close enough to matter
                    if (Math.abs(dx) < 15) {
                        isNearPath = true;
                        pathY = pathPos.y;
                    }
                }

                // Fill Column
                for (let y = 0; y < this.height; y++) {
                    let blockType = 0;
                    
                    // A. Ground
                    if (y <= groundHeight) {
                        blockType = 2; // Stone
                        
                        // Cave Check (Only if not bottom layer to prevent void holes)
                        if (y > 0) {
                            const caveNoise = noise3D(wx * caveScale, y * caveScale, wz * caveScale);
                            if (caveNoise > 0.4) blockType = 0;
                        }
                        
                        // Grass
                        if (blockType !== 0 && y === groundHeight) blockType = 1;
                    }

                    // B. Islands (Only check between 40 and 90)
                    else if (y > 40 && y < 90) {
                        if (noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland) > 0.45) {
                            blockType = (y > 85) ? 1 : 2; 
                        }
                    }

                    // C. Path Carving (Tunnel)
                    if (isNearPath && blockType !== 0) {
                        const dy = y - pathY;
                        // Simple distance check (squared to avoid sqrt)
                        const dx = wx - pathPos.x;
                        if (dx*dx + dy*dy < 64) { // radius 8 squared
                            blockType = 0;
                        }
                    }

                    // D. Spawn Platform
                    if (blockType === 0 && wx >= -2 && wx <= 2 && wz >= -2 && wz <= 2 && y === 14) {
                        blockType = 3;
                    }

                    if (blockType !== 0) {
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
        const strideY = size;          // 16
        const strideZ = size * height; // 16 * 96 = 1536

        // Pre-allocate large arrays isn't easy in JS without knowing exact count, 
        // but simple array push is usually optimized by V8 engine.
        
        let i = 0;
        for (let z = 0; z < size; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < size; x++) {
                    // Direct array access using the strides
                    const type = this.data[x + y * strideY + z * strideZ];
                    
                    if (type === 0) continue;

                    // Color Logic
                    if (type === 1) { // Grass
                        const gVar = (y / height) * 0.2;
                        colorObj.setRGB(0.2, 0.7 - gVar, 0.2); 
                    } else if (type === 2) { // Stone
                        // Deterministic random for color variation based on position
                        const sVar = ((x + y + z) % 5) * 0.02; 
                        colorObj.setRGB(0.5 + sVar, 0.5 + sVar, 0.5 + sVar);
                    } else if (type === 3) { // Spawn
                        colorObj.setHex(0xFFD700);
                    } else {
                        colorObj.setHex(0xFF00FF);
                    }

                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    // Face Culling
                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        let neighborType = 0;

                        // Check Bounds
                        if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                            // Fast internal access
                            neighborType = this.data[nx + ny * strideY + nz * strideZ];
                        } 
                        // Note: We deliberately treat chunk boundaries as "Empty" (0) for now.
                        // This causes faces to be drawn at chunk edges. This is desired behavior 
                        // unless we implement global world neighbor checking, which is slower.

                        if (neighborType !== 0) continue; // Face is occluded

                        // AO / Shading (Simple directional)
                        let shade = 1.0;
                        if (face.dir[1] < 0) shade = 0.5; // Bottom
                        else if (face.dir[0] !== 0 || face.dir[2] !== 0) shade = 0.85; // Sides

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

        // Keep geometry uploaded, don't keep CPU copy
        geometry.dispose(); 

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        
        // Frustum culling is enabled by default in Three.js, ensuring we don't draw chunks behind us
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
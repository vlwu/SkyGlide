import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

// Geometry lookup tables to avoid runtime calculations
const FACES = [
    { // Right
        dir: [1, 0, 0],
        corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]
    },
    { // Left
        dir: [-1, 0, 0],
        corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]
    },
    { // Top
        dir: [0, 1, 0],
        corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]
    },
    { // Bottom
        dir: [0, -1, 0],
        corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]
    },
    { // Front
        dir: [0, 0, 1],
        corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    },
    { // Back
        dir: [0, 0, -1],
        corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]
    }
];

export class Chunk {
    constructor(x, z, scene, racePath, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        this.material = material; // Use shared material
        
        this.size = 16;
        // Increased height to allow for floating islands and deeper valleys
        this.height = 96; 
        
        this.mesh = null;
        this.data = new Uint8Array(this.size * this.height * this.size);

        this.generate();
    }

    // Helper to access flattened array
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
        
        // Settings
        const scaleBase = 0.02;
        const scaleMount = 0.05;
        const scaleIsland = 0.04;

        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const wx = startX + x;
                const wz = startZ + z;

                // --- 1. Heightmap Calculation (Ground) ---
                // Base rolling hills
                let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 20 + 20;
                
                // Add sharp ridges (Mountains)
                // Using Math.abs creates sharp "creases"
                const ridge = Math.abs(noise3D(wx * scaleMount, 100, wz * scaleMount));
                h += ridge * 30;

                const groundHeight = Math.floor(h);

                // --- 2. 3D Noise (Caves & Islands) ---
                for (let y = 0; y < this.height; y++) {
                    const wy = y;
                    
                    let blockType = 0;

                    // A. Base Terrain Logic
                    if (y <= groundHeight) {
                        blockType = 2; // Stone by default
                        
                        // Cave carving (Cheese noise)
                        const caveNoise = noise3D(wx * 0.05, wy * 0.05, wz * 0.05);
                        if (caveNoise > 0.4) {
                            blockType = 0; // Air
                        } else if (y === groundHeight) {
                            blockType = 1; // Grass on top
                        }
                    }

                    // B. Floating Islands Logic (High Altitude)
                    // Only check above a certain height to save processing
                    if (y > 40 && y < 90) {
                        const islandNoise = noise3D(wx * scaleIsland, wy * scaleIsland, wz * scaleIsland);
                        // Make islands rarer and clumped
                        if (islandNoise > 0.45) {
                            blockType = (y > 85 || noise3D(wx*0.1, (wy+1)*0.1, wz*0.1) < 0.45) ? 1 : 2; 
                        }
                    }

                    // C. Race Path Carving (Ensure tunnel is clear)
                    const pathPos = this.racePath.getPointAtZ(wz);
                    if (pathPos) {
                        // Horizontal distance
                        const dx = wx - pathPos.x;
                        const dy = wy - pathPos.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        
                        // Safe zone radius around path
                        if (dist < 8) {
                            blockType = 0;
                        }
                    }

                    // D. Spawn Platform (Safe zone at start)
                    if (wx >= -2 && wx <= 2 && wz >= -2 && wz <= 2 && wy === 14) {
                        blockType = 3; // Gold/Spawn block
                    }

                    if (blockType !== 0) {
                        this.setBlock(x, y, z, blockType);
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

        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    const type = this.getBlock(x, y, z);
                    if (type === 0) continue;

                    // Block Colors
                    if (type === 1) { // Grass
                        // Vary grass color slightly by height for visual interest
                        const gVar = (y / this.height) * 0.2;
                        colorObj.setRGB(0.2, 0.7 - gVar, 0.2); 
                    } else if (type === 2) { // Stone
                        const sVar = Math.random() * 0.1;
                        colorObj.setRGB(0.5 + sVar, 0.5 + sVar, 0.5 + sVar);
                    } else if (type === 3) { // Spawn
                        colorObj.setHex(0xFFD700);
                    } else {
                        colorObj.setHex(0xFF00FF); // Error pink
                    }

                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    // Check all 6 faces
                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        // Occlusion Culling
                        if (this.getBlock(nx, ny, nz) !== 0) continue;

                        // Shading: Dim bottom and side faces slightly
                        let shade = 1.0;
                        if (face.dir[1] < 0) shade = 0.5; // Bottom
                        else if (face.dir[0] !== 0 || face.dir[2] !== 0) shade = 0.8; // Sides

                        const ndx = positions.length / 3;

                        // Add Vertices
                        for (const corner of face.corners) {
                            positions.push(
                                x + corner[0] + startX, 
                                y + corner[1], 
                                z + corner[2] + startZ
                            );
                            normals.push(...face.dir);
                            colors.push(r * shade, g * shade, b * shade);
                        }

                        // Add Indices
                        indices.push(
                            ndx, ndx + 1, ndx + 2,
                            ndx + 2, ndx + 3, ndx
                        );
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

        // Use the shared material passed from WorldManager
        this.mesh = new THREE.Mesh(geometry, this.material);
        
        // Re-enable shadows for depth
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        
        this.scene.add(this.mesh);
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            // Do not dispose the material as it is shared
            this.mesh = null;
        }
        this.data = null;
    }
}
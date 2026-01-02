import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

// Geometry lookup tables to avoid runtime calculations
const FACES = [
    { // Right
        dir: [1, 0, 0],
        corners: [
            [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]
        ]
    },
    { // Left
        dir: [-1, 0, 0],
        corners: [
            [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]
        ]
    },
    { // Top
        dir: [0, 1, 0],
        corners: [
            [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]
        ]
    },
    { // Bottom
        dir: [0, -1, 0],
        corners: [
            [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]
        ]
    },
    { // Front
        dir: [0, 0, 1],
        corners: [
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
        ]
    },
    { // Back
        dir: [0, 0, -1],
        corners: [
            [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]
        ]
    }
];

export class Chunk {
    constructor(x, z, scene, racePath) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        
        this.size = 16;
        this.height = 64; 
        this.scale = 0.08; 
        
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
        const spawnRadius = 20;

        // Pass 1: Generate voxel data
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // 1. Spawn Platform
                    if (wy === 14 && Math.abs(wx) <= 1 && Math.abs(wz) <= 1) {
                        this.setBlock(x, y, z, 1);
                        continue;
                    }

                    // 2. Spawn Safety
                    const distToSpawn = Math.sqrt(wx**2 + (wy - 14)**2 + wz**2);
                    if (distToSpawn < spawnRadius) {
                        continue; // 0
                    }

                    // 3. Tunnel / Path carving
                    const pathPos = this.racePath.getPointAtZ(wz);
                    let tunnelRadius = 12;

                    if (pathPos) {
                        const dist = Math.sqrt((wx - pathPos.x) ** 2 + (wy - pathPos.y) ** 2);
                        const rNoise = noise3D(wx * 0.1, wy * 0.1, wz * 0.1);
                        tunnelRadius += rNoise * 4;

                        if (dist < tunnelRadius) {
                            continue; // 0
                        }
                    }

                    // 4. Terrain Noise
                    const d1 = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);
                    const d2 = noise3D(wx * 0.2, wy * 0.2, wz * 0.2) * 0.5;
                    const density = d1 + d2;
                    const heightFactor = Math.sin((y / this.height) * Math.PI); 
                    
                    if (density * heightFactor > 0.15) {
                        this.setBlock(x, y, z, 2);
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

                    // Calculate Color once per block
                    if (type === 1) {
                        colorObj.setHex(0xFFD700);
                    } else {
                        const h = y / this.height;
                        colorObj.setHSL(0.6 - (h * 0.1), 0.4, 0.2 + (h * 0.4));
                    }
                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    // Check all 6 faces
                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        // If neighbor is solid (non-zero), skip face (Occlusion Culling)
                        if (this.getBlock(nx, ny, nz) !== 0) continue;

                        const ndx = positions.length / 3;

                        // Add Vertices
                        for (const corner of face.corners) {
                            positions.push(
                                x + corner[0] + startX, 
                                y + corner[1], 
                                z + corner[2] + startZ
                            );
                            normals.push(...face.dir);
                            colors.push(r, g, b);
                        }

                        // Add Indices (Two triangles per face)
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

        // Using Vertex Colors material
        const material = new THREE.MeshLambertMaterial({ 
            vertexColors: true 
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Frustum culling optimization:
        // Three.js calculates bounding sphere automatically, ensuring 
        // this chunk is skipped if not in camera view.
        
        this.scene.add(this.mesh);
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        this.data = null; // Clear memory
    }
}
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

export class Chunk {
    constructor(x, z, scene) {
        this.x = x; // Chunk coordinate X
        this.z = z; // Chunk coordinate Z
        this.scene = scene;
        
        this.size = 16;   // Width/Depth of a chunk
        this.height = 32; // Height of the world for now
        this.scale = 0.1; // Noise scale (smaller = smoother terrain)
        
        this.mesh = null;
        
        // Generate immediately upon creation
        this.generate();
    }

    generate() {
        const blockPositions = [];

        // 1. Calculate world position offset
        const startX = this.x * this.size;
        const startZ = this.z * this.size;

        // 2. Loop through every block in the chunk
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    
                    // Get the absolute world position
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // 3. Generate 3D Noise value (-1 to 1)
                    const density = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);

                    // 4. Threshold: If density > 0.2, place a block
                    // We also force a floor at y=0 so you don't fall forever yet
                    if (density > 0.2 || y === 0) {
                        blockPositions.push({ x: wx, y: wy, z: wz });
                    }
                }
            }
        }

        this.buildMesh(blockPositions);
    }

    buildMesh(positions) {
        if (positions.length === 0) return;

        // Geometry: Reuse the same box for every block
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Material: Basic gray for now (Lambert responds to light)
        const material = new THREE.MeshLambertMaterial({ color: 0x888888 });

        // InstancedMesh: The magic performance booster
        this.mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();

        // Position every instance
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        // Add to scene
        this.scene.add(this.mesh);
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
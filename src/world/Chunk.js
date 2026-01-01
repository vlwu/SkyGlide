import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

export class Chunk {
    constructor(x, z, scene, racePath) {
        this.x = x; // Chunk coordinate X
        this.z = z; // Chunk coordinate Z
        this.scene = scene;
        this.racePath = racePath;
        
        this.size = 16;   // Width/Depth of a chunk
        this.height = 64; 
        this.scale = 0.1; // Noise scale (smaller = smoother terrain)
        
        this.mesh = null;
        
        // Generate immediately upon creation
        this.generate();
    }

    generate() {
        const blockPositions = [];
        const startX = this.x * this.size;
        const startZ = this.z * this.size;

        // TUNNEL CONFIG
        const tunnelRadius = 8;

        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // TUNNEL CARVING
                    // 1. Get the track position at this Z
                    const pathPos = this.racePath.getPointAtZ(wz);

                    // 2. Calculate distance to the track (if it exists here)
                    if (pathPos) {
                        const dist = Math.sqrt(
                            (wx - pathPos.x) ** 2 + 
                            (wy - pathPos.y) ** 2
                        );
                        
                        // 3. If too close, force AIR (skip this block)
                        if (dist < tunnelRadius) continue;
                    }
                    // ---------------------------

                    const density = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);

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
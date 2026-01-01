import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

export class Chunk {
    constructor(x, z, scene, racePath) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        
        this.size = 16;
        this.height = 64; 
        this.scale = 0.1; 
        
        this.mesh = null;
        
        // Voxel data: [x][y][z]
        this.data = []; 

        this.generate();
    }

    generate() {
        const startX = this.x * this.size;
        const startZ = this.z * this.size;
        const tunnelRadius = 8;

        // Pass 1: Generate voxel data
        for (let x = 0; x < this.size; x++) {
            this.data[x] = [];
            for (let y = 0; y < this.height; y++) {
                this.data[x][y] = [];
                for (let z = 0; z < this.size; z++) {
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // 1. Generate Spawn Platform (3x3 at 0,14,0)
                    if (wy === 14 && Math.abs(wx) <= 1 && Math.abs(wz) <= 1) {
                        this.data[x][y][z] = true;
                        continue;
                    }

                    // 2. Check tunnel proximity
                    let isPathClear = false;
                    const pathPos = this.racePath.getPointAtZ(wz);

                    if (pathPos) {
                        const dist = Math.sqrt(
                            (wx - pathPos.x) ** 2 + 
                            (wy - pathPos.y) ** 2
                        );
                        if (dist < tunnelRadius) isPathClear = true;
                    }

                    if (isPathClear) {
                        this.data[x][y][z] = false;
                        continue;
                    }

                    // 3. Noise generation
                    const density = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);
                    this.data[x][y][z] = (density > 0.2 || y === 0);
                }
            }
        }

        // Pass 2: Build mesh with face culling
        const visiblePositions = [];
        
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    if (!this.data[x][y][z]) continue;

                    if (this.isVisible(x, y, z)) {
                        visiblePositions.push({
                            x: startX + x,
                            y: y,
                            z: startZ + z
                        });
                    }
                }
            }
        }

        this.buildMesh(visiblePositions);
    }

    isVisible(x, y, z) {
        if (x === 0 || x === this.size - 1) return true;
        if (y === 0 || y === this.height - 1) return true;
        if (z === 0 || z === this.size - 1) return true;

        if (!this.data[x+1][y][z]) return true;
        if (!this.data[x-1][y][z]) return true;
        if (!this.data[x][y+1][z]) return true;
        if (!this.data[x][y-1][z]) return true;
        if (!this.data[x][y][z+1]) return true;
        if (!this.data[x][y][z-1]) return true;

        return false;
    }

    buildMesh(positions) {
        if (positions.length === 0) return;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        // Use a default white material so instance colors show up correctly
        const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

        this.mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);

            // Color logic: Gold for platform, Gray for terrain
            if (pos.y === 14 && Math.abs(pos.x) <= 1 && Math.abs(pos.z) <= 1) {
                color.setHex(0xFFD700); // Gold
            } else {
                color.setHex(0x888888); // Gray
            }
            this.mesh.setColorAt(i, color);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

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
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
        this.scale = 0.08; 
        
        this.mesh = null;
        this.data = []; 

        this.generate();
    }

    generate() {
        const startX = this.x * this.size;
        const startZ = this.z * this.size;
        const spawnRadius = 20;

        // Pass 1: Generate voxel data
        for (let x = 0; x < this.size; x++) {
            this.data[x] = [];
            for (let y = 0; y < this.height; y++) {
                this.data[x][y] = [];
                for (let z = 0; z < this.size; z++) {
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // 1. Spawn Platform
                    if (wy === 14 && Math.abs(wx) <= 1 && Math.abs(wz) <= 1) {
                        this.data[x][y][z] = 1;
                        continue;
                    }

                    // 2. Spawn Safety
                    const distToSpawn = Math.sqrt(wx**2 + (wy - 14)**2 + wz**2);
                    if (distToSpawn < spawnRadius) {
                        this.data[x][y][z] = 0;
                        continue;
                    }

                    // 3. Tunnel / Path carving
                    const pathPos = this.racePath.getPointAtZ(wz);
                    let tunnelRadius = 12;

                    if (pathPos) {
                        const dist = Math.sqrt((wx - pathPos.x) ** 2 + (wy - pathPos.y) ** 2);
                        const rNoise = noise3D(wx * 0.1, wy * 0.1, wz * 0.1);
                        tunnelRadius += rNoise * 4;

                        if (dist < tunnelRadius) {
                            this.data[x][y][z] = 0;
                            continue;
                        }
                    }

                    // 4. Terrain Noise
                    const d1 = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);
                    const d2 = noise3D(wx * 0.2, wy * 0.2, wz * 0.2) * 0.5;
                    const density = d1 + d2;
                    const heightFactor = Math.sin((y / this.height) * Math.PI); 
                    
                    this.data[x][y][z] = (density * heightFactor > 0.15) ? 2 : 0;
                }
            }
        }

        // Pass 2: Visible set
        const visiblePositions = [];
        
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    if (!this.data[x][y][z]) continue;

                    if (this.isVisible(x, y, z)) {
                        visiblePositions.push({
                            x: startX + x,
                            y: y,
                            z: startZ + z,
                            type: this.data[x][y][z]
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
        const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

        this.mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            // OFFSET +0.5 to align center with 0..1 voxel grid
            dummy.position.set(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);

            if (pos.type === 1) {
                color.setHex(0xFFD700);
            } else {
                const h = pos.y / this.height;
                color.setHSL(0.6 - (h * 0.1), 0.4, 0.2 + (h * 0.4));
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
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
        
        // Generate on creation
        this.generate();
    }

    generate() {
        const blockPositions = [];
        const startX = this.x * this.size;
        const startZ = this.z * this.size;

        // Tunnel configuration
        const tunnelRadius = 8;

        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.size; z++) {
                    
                    const wx = startX + x;
                    const wy = y;
                    const wz = startZ + z;

                    // Tunnel carving logic
                    const pathPos = this.racePath.getPointAtZ(wz);

                    if (pathPos) {
                        const dist = Math.sqrt(
                            (wx - pathPos.x) ** 2 + 
                            (wy - pathPos.y) ** 2
                        );
                        
                        // Skip block if too close to tunnel
                        if (dist < tunnelRadius) continue;
                    }

                    const density = noise3D(wx * this.scale, wy * this.scale, wz * this.scale);

                    // Threshold density for block placement; ensure floor at y=0
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

        // Geometry: reused box
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Material: basic Lambert
        const material = new THREE.MeshLambertMaterial({ color: 0x888888 });

        // InstancedMesh for performance
        this.mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();

        // Position instances
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

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
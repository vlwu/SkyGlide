import * as THREE from 'three';

export class TerrainChunk {
    constructor(scene, xOffset, zOffset) {
        this.scene = scene;
        this.xOffset = xOffset;
        this.zOffset = zOffset;
        this.mesh = null;
        this.waterMesh = null;
    }

    buildMeshes({ positions, colors, foliageLeavesMatrix, foliageTrunksMatrix }) {
        const segments = Math.sqrt(positions.length / 3) - 1;
        const size = 200; // CHUNK_SIZE from World.js
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        const posAttribute = new THREE.BufferAttribute(positions, 3);
        geometry.setAttribute('position', posAttribute);


        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            metalness: 0.1,
            roughness: 0.9,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.xOffset, -25, this.zOffset);
        this.scene.add(this.mesh);

        this.generateFoliage(foliageLeavesMatrix, foliageTrunksMatrix);
        this.generateWater(size);
    }

    generateWater(size) {
        const waterGeometry = new THREE.PlaneGeometry(size, size, 50, 50);

        // Replaced the expensive Reflector with a standard Mesh and Material
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x5599ff,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.2
        });

        this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

        const waterLevel = -25 + (0.22 * 160); // base_y + WATER_LEVEL
        this.waterMesh.position.set(this.xOffset, waterLevel, this.zOffset);
        this.waterMesh.rotation.x = -Math.PI / 2;

        // Store original vertices for animation
        this.waterMesh.geometry.userData.originalPositions = this.waterMesh.geometry.attributes.position.array.slice();

        this.scene.add(this.waterMesh);
    }

    generateFoliage(leavesPositions, trunksPositions) {
        const instanceCount = leavesPositions.length / 3;
        if (instanceCount === 0) return;

        const treeLeavesGeo = new THREE.IcosahedronGeometry(1.5, 0);
        const treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.2, 2, 5);

        const treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, flatShading: true });
        const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, flatShading: true });

        const foliageMesh = new THREE.InstancedMesh(treeLeavesGeo, treeLeavesMat, instanceCount);
        const trunkMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, instanceCount);

        const dummy = new THREE.Object3D();

        for (let i = 0; i < instanceCount; i++) {
            dummy.position.set(leavesPositions[i*3], leavesPositions[i*3+1], leavesPositions[i*3+2]);
            dummy.updateMatrix();
            foliageMesh.setMatrixAt(i, dummy.matrix);

            dummy.position.set(trunksPositions[i*3], trunksPositions[i*3+1], trunksPositions[i*3+2]);
            dummy.updateMatrix();
            trunkMesh.setMatrixAt(i, dummy.matrix);
        }

        foliageMesh.instanceMatrix.needsUpdate = true;
        trunkMesh.instanceMatrix.needsUpdate = true;

        this.mesh.add(foliageMesh);
        this.mesh.add(trunkMesh);
    }

    dispose() {
        if (this.mesh) {
            this.mesh.traverse(object => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(mat => mat.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
        if (this.waterMesh) {
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.scene.remove(this.waterMesh);
            this.waterMesh = null;
        }
    }
}
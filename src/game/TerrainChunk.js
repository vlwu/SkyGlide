import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// --- TERRAIN CONFIGURATION ---
const MAX_HEIGHT = 40;
const ELEVATION_NOISE_SCALE = 0.02;
const MOISTURE_NOISE_SCALE = 0.05;

// --- BIOME SETUP ---
const BIOMES = {
    OCEAN: { color: new THREE.Color(0x4682b4) },
    SAND: { color: new THREE.Color(0xf0e68c) },
    GRASSLAND: { color: new THREE.Color(0x4caf50), foliage: true, foliageDensity: 0.05 },
    FOREST: { color: new THREE.Color(0x228B22), foliage: true, foliageDensity: 0.3 },
    ROCK: { color: new THREE.Color(0x808080) },
    SNOW: { color: new THREE.Color(0xffffff) },
};

// --- NOISE GENERATORS ---
const elevationNoise = createNoise2D();
const moistureNoise = createNoise2D();

// Function to determine biome based on height and moisture
function getBiome(e, m) {
    if (e < 0.2) return BIOMES.OCEAN;
    if (e < 0.25) return BIOMES.SAND;

    if (e > 0.75) {
        if (m < 0.5) return BIOMES.ROCK;
        return BIOMES.SNOW;
    }

    if (e > 0.5) {
        if (m < 0.5) return BIOMES.GRASSLAND;
        return BIOMES.FOREST;
    }

    if (m < 0.33) return BIOMES.SAND; // Drier areas become sandy
    if (m < 0.66) return BIOMES.GRASSLAND;
    return BIOMES.FOREST;
}


export class TerrainChunk {
    constructor(scene, size, segments, xOffset, zOffset) {
        this.scene = scene;
        this.size = size;
        this.segments = segments;
        this.xOffset = xOffset;
        this.zOffset = zOffset;
        this.mesh = null;
        this.foliageMesh = null; // To hold our instanced trees
        this.generate();
    }

    generate() {
        const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position;
        const colors = [];

        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + this.xOffset;
            const z = vertices.getZ(i) + this.zOffset;

            // Generate elevation and normalize to 0-1 range
            const elevation = (elevationNoise(x * ELEVATION_NOISE_SCALE, z * ELEVATION_NOISE_SCALE) + 1) / 2;
            const moisture = (moistureNoise(x * MOISTURE_NOISE_SCALE, z * MOISTURE_NOISE_SCALE) + 1) / 2;

            vertices.setY(i, elevation * MAX_HEIGHT);

            const biome = getBiome(elevation, moisture);
            colors.push(biome.color.r, biome.color.g, biome.color.b);
        }

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
        
        this.generateFoliage();
    }

    generateFoliage() {
        const treeCount = 500; // Max trees per chunk
        const instances = [];

        const treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.2, 2, 5);
        const treeLeavesGeo = new THREE.IcosahedronGeometry(1.5, 0);
        const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, flatShading: true });
        const treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x006400, flatShading: true });
        
        this.foliageMesh = new THREE.InstancedMesh(treeLeavesGeo, treeLeavesMat, treeCount);
        const trunkMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, treeCount);
        
        // Use a raycaster to place trees on the terrain surface
        const raycaster = new THREE.Raycaster();
        const dummy = new THREE.Object3D();
        let instanceCount = 0;

        for (let i = 0; i < treeCount; i++) {
            // Get a random position within the chunk
            const x = Math.random() * this.size - this.size / 2;
            const z = Math.random() * this.size - this.size / 2;
            
            const worldX = x + this.xOffset;
            const worldZ = z + this.zOffset;
            
            // Get biome at this position
            const e = (elevationNoise(worldX * ELEVATION_NOISE_SCALE, worldZ * ELEVATION_NOISE_SCALE) + 1) / 2;
            const m = (moistureNoise(worldX * MOISTURE_NOISE_SCALE, worldZ * MOISTURE_NOISE_SCALE) + 1) / 2;
            const biome = getBiome(e, m);

            if (biome.foliage && Math.random() < biome.foliageDensity) {
                raycaster.set(new THREE.Vector3(x, MAX_HEIGHT, z), new THREE.Vector3(0, -1, 0));
                const intersects = raycaster.intersectObject(this.mesh);

                if (intersects.length > 0) {
                    const y = intersects[0].point.y;

                    // Position the dummy and apply the matrix to the instanced mesh
                    // Leaves
                    dummy.position.set(x, y + 2, z);
                    dummy.updateMatrix();
                    this.foliageMesh.setMatrixAt(instanceCount, dummy.matrix);

                    // Trunk
                    dummy.position.set(x, y + 1, z);
                    dummy.updateMatrix();
                    trunkMesh.setMatrixAt(instanceCount, dummy.matrix);

                    instanceCount++;
                }
            }
        }

        if (instanceCount > 0) {
            this.foliageMesh.count = instanceCount;
            trunkMesh.count = instanceCount;

            // Add the instanced meshes to the main chunk mesh group
            this.mesh.add(this.foliageMesh);
            this.mesh.add(trunkMesh);
        }
    }


    dispose() {
        if (this.mesh) {
            // Note: InstancedMeshes are children and will be removed with the parent
            this.mesh.traverse(object => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    object.material.dispose();
                }
            });
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }
}
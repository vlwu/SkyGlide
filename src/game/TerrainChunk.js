import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Biome colors
const BIOMES = {
    SNOW: new THREE.Color(0xffffff),
    ROCK: new THREE.Color(0x808080),
    GRASS: new THREE.Color(0x4caf50),
    SAND: new THREE.Color(0xf0e68c),
    WATER: new THREE.Color(0x4682b4),
};

const noise2D = createNoise2D();

export class TerrainChunk {
    constructor(scene, size, segments, xOffset, zOffset) {
        this.scene = scene;
        this.size = size;
        this.segments = segments;
        this.xOffset = xOffset;
        this.zOffset = zOffset;
        this.mesh = null;
        this.generate();
    }

    generate() {
        const maxHeight = 40;
        const noiseScale = 0.02;

        const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position;

        // Modify vertices based on noise, using the chunk's offset for seamlessness
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + this.xOffset;
            const z = vertices.getZ(i) + this.zOffset;
            const noiseValue = (noise2D(x * noiseScale, z * noiseScale) + 1) / 2;
            vertices.setY(i, noiseValue * maxHeight);
        }

        geometry.computeVertexNormals();

        const colors = [];
        for (let i = 0; i < vertices.count; i++) {
            const y = vertices.getY(i);
            let color;

            if (y > maxHeight * 0.8) color = BIOMES.SNOW;
            else if (y > maxHeight * 0.6) color = BIOMES.ROCK;
            else if (y > maxHeight * 0.3) color = BIOMES.GRASS;
            else if (y > maxHeight * 0.2) color = BIOMES.SAND;
            else color = BIOMES.WATER;
            
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            metalness: 0.1,
            roughness: 0.9,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        // Position the chunk in the world
        this.mesh.position.set(this.xOffset, -25, this.zOffset);
        this.scene.add(this.mesh);
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }
}
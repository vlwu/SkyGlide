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

export class Terrain {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.generate();
    }

    generate() {
        const size = 500;
        const segments = 100;
        const maxHeight = 40;
        const noiseScale = 0.02;

        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        // We rotate the plane to be our ground
        geometry.rotateX(-Math.PI / 2);

        const noise2D = createNoise2D();
        const vertices = geometry.attributes.position;

        // Modify vertices based on noise
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const z = vertices.getZ(i);
            const noiseValue = (noise2D(x * noiseScale, z * noiseScale) + 1) / 2; // Normalize to 0-1
            vertices.setY(i, noiseValue * maxHeight);
        }

        geometry.computeVertexNormals(); // Recalculate normals for correct lighting

        // Apply colors based on height
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
        
        // Use a material that supports vertex colors and flat shading for low-poly look
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            metalness: 0.1,
            roughness: 0.9,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = -25; // Lower the whole terrain
        this.scene.add(this.mesh);
    }
}
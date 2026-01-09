import * as THREE from 'three';

export class Chunk {
    constructor(x, z, scene, racePath, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.material = material;
        
        this.size = 16;
        this.height = 96;
        
        this.data = null;
        this.mesh = null;
        this.isLoaded = false;
    }

    getBlock(x, y, z) {
        if (!this.data || x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        return this.data[x + this.size * (y + this.height * z)];
    }

    applyMesh(payload) {
        this.data = payload.data;
        const geoData = payload.geometry;

        // If no vertices (empty chunk), stop here
        if (geoData.position.length === 0) {
            this.isLoaded = true;
            return;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(geoData.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(geoData.normal, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(geoData.color, 3));
        geometry.setIndex(new THREE.BufferAttribute(geoData.index, 1));

        // Create Mesh
        this.mesh = new THREE.Mesh(geometry, this.material);
        
        // Correctly position the mesh in the world
        this.mesh.position.set(this.x * this.size, 0, this.z * this.size);
        
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        this.mesh.frustumCulled = true;
        
        // Matrices don't need auto update for static terrain
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }
        this.data = null;
        this.isLoaded = false;
    }
}
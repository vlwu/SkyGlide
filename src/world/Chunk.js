import * as THREE from 'three';

export class Chunk {
    constructor(x, z, scene, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.material = material;
        
        this.size = 16;
        this.height = 96;
        
        this.data = null;
        this.mesh = null;
        this.isLoaded = false;
        
        // Cache center position for distance checks
        this.worldX = x * 16 + 8;
        this.worldZ = z * 16 + 8;
    }

    getBlock(x, y, z) {
        if (!this.data || x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        return this.data[x + this.size * (y + this.height * z)];
    }

    applyMesh(payload) {
        this.data = payload.data;
        const geoData = payload.geometry;

        if (geoData.position.length === 0) {
            this.isLoaded = true;
            return;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(geoData.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(geoData.normal, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(geoData.color, 3));
        geometry.setIndex(new THREE.BufferAttribute(geoData.index, 1));

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(this.x * this.size, 0, this.z * this.size);
        
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        this.mesh.frustumCulled = true;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    // Optimization: Disable shadows for distant chunks
    update(playerX, playerZ) {
        if (!this.mesh) return;

        const dx = this.worldX - playerX;
        const dz = this.worldZ - playerZ;
        const distSq = dx*dx + dz*dz;

        // 60 units * 60 units = 3600
        // If chunk is further than 60 units, disable shadow casting
        // This keeps the shadow map update extremely cheap
        if (distSq > 3600) {
            if (this.mesh.castShadow) this.mesh.castShadow = false;
        } else {
            if (!this.mesh.castShadow) this.mesh.castShadow = true;
        }
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
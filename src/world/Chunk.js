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

        // Bounding box for manual culling
        this.bbox = new THREE.Box3();
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

        // Compute bounding box for optimized culling
        geometry.computeBoundingBox();
        this.bbox.copy(geometry.boundingBox);
        // Translate bbox to world position
        this.bbox.translate(new THREE.Vector3(this.x * this.size, 0, this.z * this.size));

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(this.x * this.size, 0, this.z * this.size);
        
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        
        // We handle culling manually in WorldManager for better efficiency
        this.mesh.frustumCulled = false;
        
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    // Optimization: Disable shadows and handle visibility
    update(distSq) {
        if (!this.mesh) return;

        // Shadow Culling: 60^2 = 3600
        const shadowDistSq = 3600;

        if (distSq > shadowDistSq) {
            if (this.mesh.castShadow) this.mesh.castShadow = false;
        } else {
            if (!this.mesh.castShadow) this.mesh.castShadow = true;
        }
    }

    setVisible(visible) {
        if (this.mesh) this.mesh.visible = visible;
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
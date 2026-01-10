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
        
        // Shadow state cache
        this._lastShadowState = false;
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

        geometry.computeBoundingBox();
        this.bbox.copy(geometry.boundingBox);
        this.bbox.translate(new THREE.Vector3(this.x * this.size, 0, this.z * this.size));

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(this.x * this.size, 0, this.z * this.size);
        
        // Performance: Shadows default to false, enabled only when close
        this.mesh.castShadow = false; 
        this.mesh.receiveShadow = true; 
        
        this.mesh.frustumCulled = false;
        
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    update(distSq) {
        if (!this.mesh) return;

        // Performance: Strict Shadow Culling with state caching
        // Only cast shadows if within 35 units (35^2 = 1225)
        const shadowDistSq = 1225;
        const shouldCastShadow = distSq <= shadowDistSq;

        // Only update if state changed (avoid redundant GPU updates)
        if (shouldCastShadow !== this._lastShadowState) {
            this.mesh.castShadow = shouldCastShadow;
            this._lastShadowState = shouldCastShadow;
        }
    }

    setVisible(visible) {
        if (this.mesh && this.mesh.visible !== visible) {
            this.mesh.visible = visible;
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
        this._lastShadowState = false;
    }
}
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
        this.lod = 1; // 1 = Full Detail, 2 = Half, 4 = Quarter
        
        // Cache center position for distance checks
        this.worldX = x * 16 + 8;
        this.worldZ = z * 16 + 8;

        // Bounding box for manual culling
        this.bbox = new THREE.Box3();
        
        // Shadow state cache
        this._lastShadowState = false;
    }

    getBlock(x, y, z) {
        // LOD Handling: If LOD > 1, coordinate precision is lost
        // We map input coord to the nearest stored voxel
        if (!this.data || x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        
        // Ensure we read from the correct index in the full resolution data
        // Note: Currently we store full res data even at low LOD for physics accuracy
        return this.data[x + this.size * (y + this.height * z)];
    }

    applyMesh(payload) {
        // If we received an update for a different LOD than requested, arguably we should ignore it,
        // but for now we accept it to ensure something renders.
        this.lod = payload.lod;
        this.data = payload.data;
        const geoData = payload.geometry;

        // Clean up old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }

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

        this.mesh = new THREE.Mesh(geometry, this.material);
        
        // Performance: Shadows default to false, enabled only when close
        this.mesh.castShadow = false; 
        this.mesh.receiveShadow = true; 
        
        // Disable frustum culling on the mesh itself because we handle it in WorldManager
        this.mesh.frustumCulled = false;
        
        this.mesh.matrixAutoUpdate = false;
        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    update(distSq) {
        if (!this.mesh) return;

        // Performance: Strict Shadow Culling with state caching
        // Only cast shadows if within 35 units (35^2 = 1225)
        // Disable shadows entirely for Low LOD chunks
        const shadowDistSq = 1225;
        const shouldCastShadow = (this.lod === 1) && (distSq <= shadowDistSq);

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
import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class Chunk {
    constructor(x, z, scene, material, waterMaterial) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.material = material;
        this.waterMaterial = waterMaterial;
        
        this.size = CONFIG.WORLD.CHUNK_SIZE;
        this.height = CONFIG.WORLD.CHUNK_HEIGHT;
        
        this.data = null;
        this.mesh = null;
        this.waterMesh = null;
        this.isLoaded = false;
        this.lod = 1; 
        
        // Center for distance checks
        this.worldX = x * 16 + 8;
        this.worldZ = z * 16 + 8;

        // OPTIMIZATION: Analytic BBox instead of geometry.computeBoundingBox()
        this.bbox = new THREE.Box3();
        const minX = x * this.size;
        const minZ = z * this.size;
        this.bbox.min.set(minX, 0, minZ);
        this.bbox.max.set(minX + this.size, this.height, minZ + this.size);
        
        this._lastShadowState = false;
    }

    getBlock(x, y, z) {
        if (!this.data || x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        return this.data[x + this.size * (y + this.height * z)];
    }

    applyMesh(payload) {
        this.lod = payload.lod;
        this.data = payload.data;
        const geoData = payload.geometry;
        const waterGeoData = payload.waterGeometry;

        // Clean up old meshes
        this.disposeMeshes();

        if (geoData.position.length === 0 && waterGeoData.position.length === 0) {
            this.isLoaded = true;
            return;
        }

        // --- Opaque Mesh ---
        if (geoData.position.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(geoData.position, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(geoData.normal, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(geoData.color, 3));
            geometry.setIndex(new THREE.BufferAttribute(geoData.index, 1));

            // OPTIMIZATION: Skipped computeBoundingBox, using fixed this.bbox

            this.mesh = new THREE.Mesh(geometry, this.material);
            this.mesh.castShadow = false; 
            this.mesh.receiveShadow = true; 
            this.mesh.frustumCulled = false;
            this.mesh.matrixAutoUpdate = false;
            this.scene.add(this.mesh);
        }

        // --- Water Mesh ---
        if (waterGeoData && waterGeoData.position.length > 0) {
            const wGeometry = new THREE.BufferGeometry();
            wGeometry.setAttribute('position', new THREE.BufferAttribute(waterGeoData.position, 3));
            wGeometry.setAttribute('normal', new THREE.BufferAttribute(waterGeoData.normal, 3));
            wGeometry.setAttribute('color', new THREE.BufferAttribute(waterGeoData.color, 3));
            wGeometry.setIndex(new THREE.BufferAttribute(waterGeoData.index, 1));

            this.waterMesh = new THREE.Mesh(wGeometry, this.waterMaterial);
            this.waterMesh.castShadow = false;
            this.waterMesh.receiveShadow = true;
            this.waterMesh.frustumCulled = false;
            this.waterMesh.matrixAutoUpdate = false;
            
            // Render Order: Water should be rendered after opaque
            this.waterMesh.renderOrder = 1; 
            
            this.scene.add(this.waterMesh);
        }

        this.isLoaded = true;
    }

    update(distSq) {
        if (!this.mesh) return;

        const shadowDistSq = CONFIG.WORLD.SHADOW_DIST_SQ;
        const shouldCastShadow = (this.lod === 1) && (distSq <= shadowDistSq);

        if (shouldCastShadow !== this._lastShadowState) {
            this.mesh.castShadow = shouldCastShadow;
            this._lastShadowState = shouldCastShadow;
        }
    }

    setVisible(visible) {
        if (this.mesh && this.mesh.visible !== visible) {
            this.mesh.visible = visible;
        }
        if (this.waterMesh && this.waterMesh.visible !== visible) {
            this.waterMesh.visible = visible;
        }
    }

    disposeMeshes() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh = null;
        }
    }

    dispose() {
        this.disposeMeshes();
        this.data = null;
        this.isLoaded = false;
        this._lastShadowState = false;
    }
}
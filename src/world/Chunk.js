import * as THREE from 'three';

const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, 
    { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }, 
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, 
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }, 
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, 
    { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }  
];

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7
};

// Scratchpad Buffers (Global to reduce GC)
const MAX_VERTICES = 32000; 
const BUFFER_POS = new Float32Array(MAX_VERTICES * 3);
const BUFFER_NORM = new Float32Array(MAX_VERTICES * 3);
const BUFFER_COL = new Float32Array(MAX_VERTICES * 3);
const BUFFER_IND = new Uint16Array(MAX_VERTICES * 1.5);

export class Chunk {
    constructor(x, z, scene, racePath, material) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.racePath = racePath;
        this.material = material;
        
        this.size = 16;
        this.height = 96;
        
        // Data is now initially null, waiting for Worker
        this.data = null;
        this.mesh = null;
        this.isLoaded = false;
    }

    getBlock(x, y, z) {
        if (!this.data || x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) return 0;
        return this.data[x + this.size * (y + this.height * z)];
    }

    applyTerrainData(data) {
        this.data = data;
        this.carveTunnel();
        this.buildMesh();
        this.isLoaded = true;
    }

    carveTunnel() {
        const startX = this.x * this.size;
        const startZ = this.z * this.size;
        
        // 1. Carve Tunnel
        for (let z = 0; z < this.size; z++) {
            const wz = startZ + z;
            const pathPoints = this.racePath.getPointsAtZ(wz);
            
            if (!pathPoints) continue;

            for (let x = 0; x < this.size; x++) {
                const wx = startX + x;
                
                let tunnelMinY = 999;
                let tunnelMaxY = -999;

                for (const point of pathPoints) {
                    const dx = wx - point.x;
                    const dxSq = dx * dx;
                    if (dxSq < 81) {
                        const dySpan = Math.sqrt(81 - dxSq);
                        const top = point.y + dySpan;
                        const bottom = point.y - dySpan;
                        if (bottom < tunnelMinY) tunnelMinY = bottom;
                        if (top > tunnelMaxY) tunnelMaxY = top;
                    }
                }

                if (tunnelMaxY > tunnelMinY) {
                    const iMin = Math.max(0, Math.floor(tunnelMinY));
                    const iMax = Math.min(this.height, Math.ceil(tunnelMaxY));
                    
                    const strideY = this.size;
                    const strideZ = this.size * this.height;
                    const colBase = x + z * strideZ;

                    for (let y = iMin; y < iMax; y++) {
                        this.data[colBase + y * strideY] = BLOCK.AIR;
                    }
                }
            }
        }
        
        // 2. Force Spawn Platform (Post-Carve)
        // This ensures the spawn block exists even if the tunnel tried to delete it.
        // We calculate the intersection of this chunk with the spawn area [-2, 2].
        const minWx = -2, maxWx = 2;
        const minWz = -2, maxWz = 2;
        
        const loopMinX = Math.max(0, minWx - startX);
        const loopMaxX = Math.min(this.size - 1, maxWx - startX);
        const loopMinZ = Math.max(0, minWz - startZ);
        const loopMaxZ = Math.min(this.size - 1, maxWz - startZ);

        if (loopMinX <= loopMaxX && loopMinZ <= loopMaxZ) {
            for(let z = loopMinZ; z <= loopMaxZ; z++) {
                for(let x = loopMinX; x <= loopMaxX; x++) {
                     // Set Spawn Block at Y=14
                     const idx = x + this.size * (14 + this.height * z);
                     this.data[idx] = BLOCK.SPAWN;
                }
            }
        }
    }

    buildMesh() {
        if (!this.data) return;

        const startX = this.x * this.size;
        const startZ = this.z * this.size;
        
        let vertCount = 0;
        let indexCount = 0;

        const colorObj = new THREE.Color();
        const size = this.size;
        const height = this.height;
        const strideY = size;          
        const strideZ = size * height; 

        for (let z = 0; z < size; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < size; x++) {
                    const type = this.data[x + y * strideY + z * strideZ];
                    if (type === BLOCK.AIR) continue;

                    const wx = startX + x;
                    const wz = startZ + z;
                    
                    let h = (wx * 374761393) ^ (y * 668265263) ^ (wz * 963469177);
                    h = (h ^ (h >> 13)) * 1274124933;
                    const rand = ((h >>> 0) / 4294967296); 

                    this.setColor(colorObj, type, rand);
                    const r = colorObj.r;
                    const g = colorObj.g;
                    const b = colorObj.b;

                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        let neighborType = BLOCK.AIR;
                        if (nx >= 0 && nx < size && ny >= 0 && ny < height && nz >= 0 && nz < size) {
                            neighborType = this.data[nx + ny * strideY + nz * strideZ];
                        }

                        if (neighborType !== BLOCK.AIR) continue;

                        let shade = 1.0;
                        if (face.dir[1] < 0) shade = 0.6;
                        else if (face.dir[1] > 0) shade = 1.1;
                        else if (face.dir[0] !== 0) shade = 0.85;
                        else shade = 0.9;

                        const vBase = vertCount;

                        for (const corner of face.corners) {
                            BUFFER_POS[vertCount * 3] = x + corner[0] + startX;
                            BUFFER_POS[vertCount * 3 + 1] = y + corner[1];
                            BUFFER_POS[vertCount * 3 + 2] = z + corner[2] + startZ;
                            
                            BUFFER_NORM[vertCount * 3] = face.dir[0];
                            BUFFER_NORM[vertCount * 3 + 1] = face.dir[1];
                            BUFFER_NORM[vertCount * 3 + 2] = face.dir[2];

                            BUFFER_COL[vertCount * 3] = r * shade;
                            BUFFER_COL[vertCount * 3 + 1] = g * shade;
                            BUFFER_COL[vertCount * 3 + 2] = b * shade;

                            vertCount++;
                        }

                        BUFFER_IND[indexCount++] = vBase;
                        BUFFER_IND[indexCount++] = vBase + 1;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 2;
                        BUFFER_IND[indexCount++] = vBase + 3;
                        BUFFER_IND[indexCount++] = vBase;

                        if (vertCount >= MAX_VERTICES - 4) break;
                    }
                }
            }
        }

        if (vertCount === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(BUFFER_POS.slice(0, vertCount * 3), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(BUFFER_NORM.slice(0, vertCount * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(BUFFER_COL.slice(0, vertCount * 3), 3));
        geometry.setIndex(new THREE.BufferAttribute(BUFFER_IND.slice(0, indexCount), 1));

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.castShadow = true; 
        this.mesh.receiveShadow = true; 
        this.mesh.frustumCulled = true;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.updateMatrix();

        this.scene.add(this.mesh);
    }

    setColor(colorObj, type, rand) {
        switch (type) {
            case BLOCK.GRASS: colorObj.setHSL(0.25 + rand * 0.05, 0.6, 0.4 + rand * 0.1); break;
            case BLOCK.DIRT: colorObj.setHSL(0.08, 0.4, 0.3 + rand * 0.1); break;
            case BLOCK.STONE: colorObj.setHSL(0.6, 0.05, 0.4 + rand * 0.1); break;
            case BLOCK.SNOW: colorObj.setHSL(0.6, 0.2, 0.9 + rand * 0.1); break;
            case BLOCK.SAND: colorObj.setHSL(0.12, 0.5, 0.7 + rand * 0.1); break;
            case BLOCK.ICE: colorObj.setHSL(0.5, 0.7, 0.8); break;
            case BLOCK.SPAWN: colorObj.setHex(0xFFD700); break;
            default: colorObj.setHex(0xFF00FF);
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
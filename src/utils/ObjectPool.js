import * as THREE from 'three';

export class Vector3Pool {
    constructor(initialSize = 10) {
        this.pool = [];
        this.index = 0;
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new THREE.Vector3());
        }
    }

    get() {
        if (this.index >= this.pool.length) {
            this.pool.push(new THREE.Vector3());
        }
        return this.pool[this.index++];
    }

    reset() {
        this.index = 0;
    }
}

export const vec3Pool = new Vector3Pool(20);
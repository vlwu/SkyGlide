import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { HOOP_CONFIG } from './config.js';

export class HoopManager {
    constructor(scene) {
        this.scene = scene;
        this.activeHoops = [];
        this.hoopGroup = new THREE.Group();
        this.scene.add(this.hoopGroup);

        this.noise = createNoise3D();
        this.pathSeed = Math.random() * 1000;
        this.lastNodePosition = new THREE.Vector3(0, HOOP_CONFIG.PATH_START_HEIGHT, -50);
        this.pathDirection = new THREE.Vector3(0, 0, -1);

        this.hoopGeometry = new THREE.TorusGeometry(HOOP_CONFIG.RADIUS, HOOP_CONFIG.TUBE_RADIUS, 8, HOOP_CONFIG.SEGMENTS);
        this.hoopMaterial = new THREE.MeshStandardMaterial({
            color: HOOP_CONFIG.COLOR,
            emissive: HOOP_CONFIG.EMISSIVE_COLOR,
            emissiveIntensity: 0,
            metalness: 0.2,
            roughness: 0.5,
            transparent: true,
            opacity: 0.7
        });

        this.init();
    }

    init() {
        // Generate initial path
        for(let i = 0; i < HOOP_CONFIG.PATH_NODES * 2; i++) {
            this.generateNextHoop();
        }
    }

    generateNextHoop() {
        const noiseX = this.noise(this.lastNodePosition.x * HOOP_CONFIG.PATH_JITTER_SCALE, this.lastNodePosition.z * HOOP_CONFIG.PATH_JITTER_SCALE, this.pathSeed);
        const noiseY = this.noise(this.lastNodePosition.z * HOOP_CONFIG.PATH_JITTER_SCALE, this.pathSeed, this.lastNodePosition.x * HOOP_CONFIG.PATH_JITTER_SCALE);

        this.pathDirection.x += noiseX * 0.1;
        this.pathDirection.z += -0.1; // Ensure it generally moves forward
        this.pathDirection.y += noiseY * 0.1;
        this.pathDirection.normalize();

        const nextPosition = this.lastNodePosition.clone().add(this.pathDirection.clone().multiplyScalar(HOOP_CONFIG.NODE_DISTANCE));
        
        // Clamp height
        nextPosition.y = Math.max(30, nextPosition.y); // Don't go into the ground

        const hoopMesh = new THREE.Mesh(this.hoopGeometry, this.hoopMaterial);
        hoopMesh.position.copy(nextPosition);
        hoopMesh.lookAt(this.lastNodePosition);

        const hoop = {
            mesh: hoopMesh,
            passed: false,
            baseOpacity: this.hoopMaterial.opacity,
        };

        this.activeHoops.push(hoop);
        this.hoopGroup.add(hoopMesh);
        this.lastNodePosition.copy(nextPosition);
    }

    update(playerPosition, nightFactor) {
        // Generate new hoops if player is close to the end
        if (this.activeHoops.length > 0) {
            const lastHoop = this.activeHoops[this.activeHoops.length - 1];
            if (playerPosition.distanceTo(lastHoop.mesh.position) < HOOP_CONFIG.NODE_DISTANCE * HOOP_CONFIG.GENERATION_THRESHOLD) {
                for (let i = 0; i < HOOP_CONFIG.PATH_NODES; i++) {
                    this.generateNextHoop();
                }
            }
        }

        // Remove old hoops
        while (this.activeHoops.length > 0 && playerPosition.z < this.activeHoops[0].mesh.position.z - 100) {
            const oldHoop = this.activeHoops.shift();
            this.hoopGroup.remove(oldHoop.mesh);
            // No need to dispose geometry/material as they are shared
        }

        // Update visuals
        const emissiveIntensity = THREE.MathUtils.smoothstep(nightFactor, 0.0, 0.5) * 2.0; // More intense glow as it gets dark
        if (this.hoopMaterial.emissiveIntensity !== emissiveIntensity) {
            this.hoopMaterial.emissiveIntensity = emissiveIntensity;
        }

        // Animate passed hoops
        this.activeHoops.forEach(hoop => {
            if (hoop.passed && hoop.mesh.material.opacity > 0) {
                hoop.mesh.material.opacity -= 0.05;
                hoop.mesh.scale.multiplyScalar(1.02);
            }
        });
    }

    checkCollisions(playerPosition) {
        for (const hoop of this.activeHoops) {
            if (!hoop.passed) {
                const distance = playerPosition.distanceTo(hoop.mesh.position);
                if (distance < HOOP_CONFIG.RADIUS) {
                    return hoop;
                }
            }
        }
        return null;
    }

    handleCollision(hoop) {
        if (hoop.passed) return;
        hoop.passed = true;
        
        // Create a new material instance to animate opacity independently
        hoop.mesh.material = this.hoopMaterial.clone();
        hoop.mesh.material.color.set(0x00ff88);
    }

    reset() {
        this.activeHoops.forEach(hoop => this.hoopGroup.remove(hoop.mesh));
        this.activeHoops = [];
        this.lastNodePosition.set(0, HOOP_CONFIG.PATH_START_HEIGHT, -50);
        this.pathDirection.set(0, 0, -1);
        this.init();
    }
}
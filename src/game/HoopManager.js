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

        this.comboCount = 0;

        this.init();
    }

    init() {

        for(let i = 0; i < HOOP_CONFIG.PATH_NODES * 2; i++) {
            this.generateNextHoop();
        }
    }

    generateNextHoop() {
        const noiseX = this.noise(this.lastNodePosition.x * 0.02, this.lastNodePosition.z * 0.02, this.pathSeed);
        const noiseY = this.noise(this.lastNodePosition.z * 0.02, this.pathSeed, this.lastNodePosition.x * 0.02);

        this.pathDirection.x += noiseX * 0.8;
        this.pathDirection.y += noiseY * 0.5;
        this.pathDirection.z += -0.2;

        this.pathDirection.normalize();

        const nextPosition = this.lastNodePosition.clone().add(this.pathDirection.clone().multiplyScalar(HOOP_CONFIG.NODE_DISTANCE));


        nextPosition.y = THREE.MathUtils.clamp(nextPosition.y, 30, 250);

        const hoopMesh = new THREE.Mesh(this.hoopGeometry, this.hoopMaterial.clone());
        hoopMesh.position.copy(nextPosition);
        hoopMesh.lookAt(this.lastNodePosition);
        
        const rollAngle = (Math.random() - 0.5) * 0.5;
        hoopMesh.rotateZ(rollAngle);

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

        if (this.activeHoops.length > 0) {
            const lastHoop = this.activeHoops[this.activeHoops.length - 1];
            if (playerPosition.distanceTo(lastHoop.mesh.position) < HOOP_CONFIG.NODE_DISTANCE * HOOP_CONFIG.GENERATION_THRESHOLD) {
                for (let i = 0; i < HOOP_CONFIG.PATH_NODES; i++) {
                    this.generateNextHoop();
                }
            }
        }


        while (this.activeHoops.length > 0 && playerPosition.z < this.activeHoops[0].mesh.position.z - 100) {
            const oldHoop = this.activeHoops.shift();
            this.hoopGroup.remove(oldHoop.mesh);

        }

        const firstUnpassedHoop = this.activeHoops.find(h => !h.passed);
        if (firstUnpassedHoop && playerPosition.z < firstUnpassedHoop.mesh.position.z) {
            this.resetCombo();
        }


        const emissiveIntensity = THREE.MathUtils.smoothstep(nightFactor, 0.0, 0.5) * 2.0;
        this.hoopMaterial.emissiveIntensity = emissiveIntensity;


        this.activeHoops.forEach(hoop => {
            if (!hoop.passed) {
                hoop.mesh.material.emissiveIntensity = emissiveIntensity;
            }
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
        if (hoop.passed) return -1;
        hoop.passed = true;

        this.comboCount++;

        const comboColors = [
            0x00ffff,
            0x00ff88,
            0xffff00,
            0xff8800,
            0xff00ff,
        ];
        let color = comboColors[0];
        if (this.comboCount >= 15) color = comboColors[4];
        else if (this.comboCount >= 10) color = comboColors[3];
        else if (this.comboCount >= 5) color = comboColors[2];
        else if (this.comboCount >= 1) color = comboColors[1];

        hoop.mesh.material.color.set(color);
        hoop.mesh.material.emissive.set(color);

        return this.comboCount;
    }

    resetCombo() {
        if (this.comboCount > 0) {
            this.comboCount = 0;
        }
    }

    reset() {
        this.activeHoops.forEach(hoop => this.hoopGroup.remove(hoop.mesh));
        this.activeHoops = [];
        this.lastNodePosition.set(0, HOOP_CONFIG.PATH_START_HEIGHT, -50);
        this.pathDirection.set(0, 0, -1);
        this.comboCount = 0;
        this.init();
    }
}
import * as THREE from 'three';
import { HOOP_CONFIG } from './config.js';

export class HoopManager {
    constructor(scene) {
        this.scene = scene;
        this.activeHoops = [];
        this.hoopGroup = new THREE.Group();
        this.scene.add(this.hoopGroup);

        this.hoopGeometry = new THREE.TorusGeometry(HOOP_CONFIG.RADIUS, HOOP_CONFIG.TUBE_RADIUS, 8, HOOP_CONFIG.SEGMENTS);
        this.hoopMaterial = new THREE.MeshStandardMaterial({
            color: HOOP_CONFIG.COLOR,
            emissive: HOOP_CONFIG.EMISSIVE_COLOR,
            emissiveIntensity: 2.0, // Always glow brightly
            metalness: 0.2,
            roughness: 0.5,
            transparent: true,
            opacity: 0.7
        });

        this.comboCount = 0;
        this.addedHoops = new Set();
    }

    addHoopLocations(locations) {
        for (let i = 0; i < locations.length; i += 3) {
            const x = locations[i];
            const y = locations[i + 1];
            const z = locations[i + 2];

            const pos = new THREE.Vector3(x, y, z);
            const key = `${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}`;

            if (!this.addedHoops.has(key)) {
                this.addedHoops.add(key);
                this.createHoopAt(pos);
            }
        }
    }

    createHoopAt(position) {
        const hoopMesh = new THREE.Mesh(this.hoopGeometry, this.hoopMaterial.clone());
        hoopMesh.position.copy(position);

        const randomYaw = Math.random() * Math.PI * 2;
        const randomPitch = (Math.random() - 0.5) * 0.4;
        const randomRoll = (Math.random() - 0.5) * 0.8;
        hoopMesh.rotation.set(randomPitch, randomYaw, randomRoll);

        const hoop = {
            mesh: hoopMesh,
            passed: false,
            baseOpacity: this.hoopMaterial.opacity,
            key: `${Math.round(position.x)},${Math.round(position.y)},${Math.round(position.z)}`
        };

        this.activeHoops.push(hoop);
        this.hoopGroup.add(hoopMesh);
    }

    update(playerPosition, nightFactor) {
        const hoopsToKeep = [];
        for (const hoop of this.activeHoops) {
            if (playerPosition.z < hoop.mesh.position.z - 200) {
                this.hoopGroup.remove(hoop.mesh);
                this.addedHoops.delete(hoop.key);
            } else {
                hoopsToKeep.push(hoop);
            }
        }
        this.activeHoops = hoopsToKeep;

        const unpassedHoopBehind = this.activeHoops.find(h => !h.passed && playerPosition.z < h.mesh.position.z);
        if (unpassedHoopBehind) {
            this.resetCombo();
        }

        // The emissive intensity is now constant, so no per-frame update is needed.

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
        let color = comboColors;
        if (this.comboCount >= 15) color = comboColors;
        else if (this.comboCount >= 10) color = comboColors;
        else if (this.comboCount >= 5) color = comboColors;
        else if (this.comboCount >= 1) color = comboColors;

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
        this.addedHoops.clear();
        this.comboCount = 0;
    }
}
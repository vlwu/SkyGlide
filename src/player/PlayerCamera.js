import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class PlayerCamera {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.baseFOV = camera.fov;
        
        this._lookDir = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        this._centerPos = new THREE.Vector3();
        this._viewTarget = new THREE.Vector3();
        this._idealPos = new THREE.Vector3();
        this._camDir = new THREE.Vector3();
        this._viewOffset = CONFIG.PLAYER.CAMERA.OFFSET.clone();

        // Animation State
        this._currentRoll = 0;
        this._currentWingAngle = 0;
    }

    reset() {
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
        this._currentRoll = 0;
        this._currentWingAngle = 0;
    }

    update(dt, player) {
        this._centerPos.copy(player.position);
        this._centerPos.y += player.dims.height / 2;

        player.mesh.position.copy(this._centerPos);
        player.mesh.rotation.order = 'YXZ'; // Yaw, Pitch, Roll
        
        // 1. Base Heading (Visual Correction: +PI so nose points forward)
        player.mesh.rotation.y = player.yaw + Math.PI;

        // 2. Pitch & Roll (Banking)
        let targetRoll = 0;
        let targetWingAngle = 0;

        if (player.state === 'FLYING') {
            // Pitch: Align directly with look direction
            player.mesh.rotation.x = player.pitch;

            // Roll: Bank based on input
            const maxBank = 0.6; // ~35 degrees
            if (player.keys.left) targetRoll = maxBank;
            if (player.keys.right) targetRoll = -maxBank;

            // Wing Sweep: Collapse when diving (pitch < 0)
            // If pitch is -PI/2 (-1.57), max sweep
            if (player.pitch < 0) {
                targetWingAngle = -player.pitch * 0.8; // e.g. 1.2 rad sweep at nosedive
            }
        } else {
            // Walking/Falling
            player.mesh.rotation.x = 0;
            targetRoll = 0;
            targetWingAngle = 0; 
        }

        // Smooth animations
        const rollSpeed = 3.0;
        const wingSpeed = 5.0;
        
        this._currentRoll += (targetRoll - this._currentRoll) * rollSpeed * dt;
        this._currentWingAngle += (targetWingAngle - this._currentWingAngle) * wingSpeed * dt;

        player.mesh.rotation.z = this._currentRoll;

        if (player.leftWingPivot) {
            // Left Wing Pivot: +Y rotates leading edge backwards
            player.leftWingPivot.rotation.y = this._currentWingAngle;
        }
        if (player.rightWingPivot) {
            // Right Wing Pivot: -Y rotates leading edge backwards
            player.rightWingPivot.rotation.y = -this._currentWingAngle;
        }

        // --- Camera Logic (Unchanged) ---
        const speed = player.velocity.length();
        let desiredFOV = this.baseFOV;
        
        if (player.state === 'FLYING') {
            const minS = CONFIG.PHYSICS.SPEED_FLY_MIN;
            const range = CONFIG.PHYSICS.SPEED_FLY_MAX - minS;
            const t = Math.max(0, Math.min(1, (speed - minS) / range));
            desiredFOV = this.baseFOV + (t * 35); 
        }

        this.camera.fov += (desiredFOV - this.camera.fov) * 5.0 * dt;
        this.camera.updateProjectionMatrix();

        this._lookDir.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        ).normalize();

        this._viewTarget.copy(this._centerPos).add(this._viewOffset);

        const baseDist = CONFIG.PLAYER.CAMERA.BASE_DIST;
        const extraDist = (this.camera.fov - this.baseFOV) * 0.05; 
        const cameraDist = baseDist + extraDist;

        this._idealPos.copy(this._centerPos).sub(this._lookDir.multiplyScalar(cameraDist));
        this._idealPos.y += 1.5;

        this._camDir.subVectors(this._idealPos, this._viewTarget);
        const maxDist = this._camDir.length();
        this._camDir.normalize();

        let actualDist = maxDist;
        const step = CONFIG.PLAYER.CAMERA.COLLISION_STEP; 

        for (let d = 0; d <= maxDist; d += step) {
            this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, d);
            if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
                actualDist = Math.max(0.5, d - 0.2); 
                break;
            }
        }

        this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, actualDist);
        this.camera.position.copy(this._tempVec);
        this.camera.lookAt(this._viewTarget);
    }
}
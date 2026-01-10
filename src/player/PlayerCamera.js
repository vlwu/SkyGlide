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
        this._previousYaw = Math.PI; 
    }

    reset() {
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
        this._currentRoll = 0;
        this._currentWingAngle = 0;
        this._previousYaw = Math.PI;
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

        // Calculate yaw delta (turn rate)
        let yawDelta = player.yaw - this._previousYaw;
        
        // Handle potential wrapping (standard safety for rotation arithmetic)
        if (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        
        this._previousYaw = player.yaw;

        if (player.state === 'FLYING') {
            // Pitch: Align directly with look direction
            player.mesh.rotation.x = player.pitch;

            // Roll: Bank based on mouse turn
            // If braking, banking is more aggressive
            const mouseBankFactor = player.keys.brake ? 25.0 : 15.0;
            const mouseRoll = Math.max(-1.0, Math.min(1.0, yawDelta * mouseBankFactor));
            
            targetRoll += mouseRoll;

            // Clamp combined roll to reasonable limits (~70 degrees)
            targetRoll = Math.max(-1.2, Math.min(1.2, targetRoll));

            // Wing Sweep
            if (player.pitch < 0) {
                const diveThreshold = 0.87; 
                const diveRatio = Math.min(1.0, Math.abs(player.pitch) / diveThreshold);
                targetWingAngle = diveRatio * 1.6;
            } else if (player.keys.brake) {
                // Flaps/Air Brake visual? Flare wings out or up?
                // Let's sweep them forward slightly (-0.5) to act as brakes
                targetWingAngle = -0.5; 
            }
        } else {
            // Walking/Falling
            player.mesh.rotation.x = 0;
            targetRoll = 0;
            targetWingAngle = 0; 
        }

        // Smooth animations
        const rollSpeed = 5.0; 
        const wingSpeed = 8.0; 
        
        if (Math.abs(targetRoll - this._currentRoll) > 0.001) {
            this._currentRoll += (targetRoll - this._currentRoll) * rollSpeed * dt;
            player.mesh.rotation.z = this._currentRoll;
        }

        if (Math.abs(targetWingAngle - this._currentWingAngle) > 0.001) {
            this._currentWingAngle += (targetWingAngle - this._currentWingAngle) * wingSpeed * dt;
            
            if (player.leftWingPivot) {
                player.leftWingPivot.rotation.y = this._currentWingAngle;
            }
            if (player.rightWingPivot) {
                player.rightWingPivot.rotation.y = -this._currentWingAngle;
            }
        }

        // --- Camera Logic ---
        const speed = player.velocity.length();
        let desiredFOV = this.baseFOV;
        
        if (player.state === 'FLYING') {
            const minS = CONFIG.PHYSICS.SPEED_FLY_MIN;
            // Use cap to determine FOV stretch
            const range = CONFIG.PHYSICS.SPEED_BOOST_CAP - minS;
            const t = Math.max(0, Math.min(1, (speed - minS) / range));
            desiredFOV = this.baseFOV + (t * 35); 
            
            if (player.isBoosting) {
                desiredFOV += CONFIG.PHYSICS.BOOST.FOV_ADD;
            }
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

        // Binary Search for Collision
        let low = 0;
        let high = maxDist;
        let actualDist = maxDist;
        let hitFound = false;
        
        const iterations = 4;
        
        this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, maxDist);
        if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
            hitFound = true;
            for (let i = 0; i < iterations; i++) {
                const mid = (low + high) * 0.5;
                this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, mid);
                if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
                    high = mid;
                    hitFound = true;
                } else {
                    low = mid;
                }
            }
        }

        if (hitFound) {
            actualDist = Math.max(0.5, low - 0.2);
        }

        this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, actualDist);
        this.camera.position.copy(this._tempVec);
        this.camera.lookAt(this._viewTarget);
    }
}
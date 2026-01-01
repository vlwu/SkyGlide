import * as THREE from 'three';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        // Physics state
        this.position = new THREE.Vector3(0, 15, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Orientation
        this.pitch = 0;
        this.yaw = Math.PI; 
        
        // Dynamic banking
        this.roll = 0;
        this.targetRoll = 0;

        // Settings
        this.sensitivity = 0.002;
        this.gravity = 9.8;
        this.glideRatio = 1.5;
        this.drag = 0.99;
        this.liftFactor = 0.02;
        
        this.initInput();
    }

    initInput() {
        // We only care about mouse movement. 
        // Pointer lock status is handled by main.js, but we check it here for safety.
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    handleMouseMove(e) {
        if (document.pointerLockElement !== document.body) return;

        // Pitch (Up/Down) - Invert Y for natural "pull back to go up" feel?
        // Standard FPS: Up is Up. 
        // Flight Sim: Down is Up.
        // Let's stick to Standard FPS for web accessibility, or "Look where you want to go".
        this.pitch -= e.movementY * this.sensitivity;
        
        // Yaw (Left/Right)
        this.yaw -= e.movementX * this.sensitivity;

        // Calculate Banking (Roll) based on horizontal intensity
        // -0.5 max roll to left, +0.5 max roll to right
        this.targetRoll = -e.movementX * 0.1; 
        
        // Clamp Pitch (Avoid flipping upside down for now)
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }

    update(dt) {
        // Calculate direction vector
        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // --- Physics Forces ---
        
        // 1. Gravity
        this.velocity.y -= this.gravity * dt;

        // 2. Gliding (Diving gains speed)
        if (this.pitch < 0) {
            const diveForce = -this.pitch * this.glideRatio * dt * 10;
            this.velocity.add(direction.clone().multiplyScalar(diveForce));
        }

        // 3. Lift (Speed keeps you up)
        const speed = this.velocity.length();
        const lift = speed * speed * this.liftFactor * dt;
        
        // Only apply lift if not diving strictly
        if (this.pitch > -0.5) {
             this.velocity.y += lift; 
        }

        // 4. Drag
        this.velocity.multiplyScalar(this.drag);

        // --- Position Update ---
        const moveStep = this.velocity.clone().multiplyScalar(dt);
        const nextPos = this.position.clone().add(moveStep);

        // --- Collision ---
        if (this.world.getBlock(Math.round(nextPos.x), Math.round(nextPos.y), Math.round(nextPos.z))) {
            this.velocity.set(0, 0, 0);
            console.log("CRASH!");
        } else {
            this.position.copy(nextPos);
        }

        // --- Camera Sync ---
        this.camera.position.copy(this.position);
        
        const lookTarget = this.position.clone().add(direction);
        this.camera.lookAt(lookTarget);

        // Smoothly interpolate roll
        // targetRoll decays to 0 if mouse stops moving (handled in handleMouseMove logic?)
        // Actually, movementX is 0 when mouse stops.
        // So we need to constantly decay targetRoll in update if no input?
        // Better approach: handleMouseMove sets targetRoll.
        // But if mouse stops, handleMouseMove doesn't fire.
        // So we need to decay targetRoll manually every frame.
        
        this.targetRoll = THREE.MathUtils.lerp(this.targetRoll, 0, 5 * dt);
        this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, 5 * dt);

        this.camera.rotation.z = this.roll;
    }
}
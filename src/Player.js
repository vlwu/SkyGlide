import * as THREE from 'three';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        // Physics state
        // Start at (0, 15, 0) to match RacePath generation safe zone
        this.position = new THREE.Vector3(0, 15, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Rotation state (radians)
        this.pitch = 0;
        this.yaw = Math.PI; 
        this.roll = 0;

        // Physics constants
        this.gravity = 9.8;
        this.glideRatio = 1.5;
        this.drag = 0.99;
        this.liftFactor = 0.02;
        this.turnSpeed = 2.0;
        
        this.inputs = {
            up: false,
            down: false,
            left: false,
            right: false
        };

        this.initInput();
    }

    initInput() {
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(e, isPressed) {
        switch(e.code) {
            case 'ArrowUp':
            case 'KeyW': this.inputs.up = isPressed; break;
            case 'ArrowDown':
            case 'KeyS': this.inputs.down = isPressed; break;
            case 'ArrowLeft':
            case 'KeyA': this.inputs.left = isPressed; break;
            case 'ArrowRight':
            case 'KeyD': this.inputs.right = isPressed; break;
        }
    }

    update(dt) {
        // Update orientation
        if (this.inputs.up) this.pitch += this.turnSpeed * dt;
        if (this.inputs.down) this.pitch -= this.turnSpeed * dt;
        if (this.inputs.left) this.yaw += this.turnSpeed * dt;
        if (this.inputs.right) this.yaw -= this.turnSpeed * dt;

        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // Physics Forces
        this.velocity.y -= this.gravity * dt;

        if (this.pitch < 0) {
            const diveForce = -this.pitch * this.glideRatio * dt * 10;
            this.velocity.add(direction.clone().multiplyScalar(diveForce));
        }

        const speed = this.velocity.length();
        const lift = speed * speed * this.liftFactor * dt;
        
        if (this.pitch > -0.5) {
             this.velocity.y += lift; 
        }

        this.velocity.multiplyScalar(this.drag);

        // Calculate potential new position
        const moveStep = this.velocity.clone().multiplyScalar(dt);
        const nextPos = this.position.clone().add(moveStep);

        // Collision Detection
        // Check the integer voxel at the target position
        if (this.world.getBlock(Math.round(nextPos.x), Math.round(nextPos.y), Math.round(nextPos.z))) {
            // Collision response: Stop immediately (Crash)
            // In a real game, this would trigger "Game Over"
            this.velocity.set(0, 0, 0);
            console.log("CRASH!");
        } else {
            // Safe to move
            this.position.copy(nextPos);
        }

        // Camera Sync
        this.camera.position.copy(this.position);
        const lookTarget = this.position.clone().add(direction);
        this.camera.lookAt(lookTarget);

        const targetRoll = (this.inputs.left ? 0.3 : 0) + (this.inputs.right ? -0.3 : 0);
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, targetRoll, 0.1);
    }
}
import * as THREE from 'three';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Physics state
        this.position = new THREE.Vector3(0, 30, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Rotation state (radians)
        this.pitch = 0;
        this.yaw = Math.PI; // Fix: Face Negative Z (into the screen)
        this.roll = 0;

        // Physics constants
        this.gravity = 9.8;
        this.glideRatio = 1.5;
        this.drag = 0.99;
        this.liftFactor = 0.02;
        this.turnSpeed = 2.0;
        
        // Input state
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
        // Update orientation from input
        if (this.inputs.up) this.pitch += this.turnSpeed * dt;
        if (this.inputs.down) this.pitch -= this.turnSpeed * dt;
        if (this.inputs.left) this.yaw += this.turnSpeed * dt;
        if (this.inputs.right) this.yaw -= this.turnSpeed * dt;

        // Clamp pitch
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

        // Calculate direction vector
        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // Apply forces
        
        // Gravity
        this.velocity.y -= this.gravity * dt;

        // Gliding mechanics
        if (this.pitch < 0) {
            // Accelerate when diving
            const diveForce = -this.pitch * this.glideRatio * dt * 10;
            this.velocity.add(direction.clone().multiplyScalar(diveForce));
        }

        // Lift mechanics
        const speed = this.velocity.length();
        const lift = speed * speed * this.liftFactor * dt;
        
        // Disable lift during steep dives
        if (this.pitch > -0.5) {
             this.velocity.y += lift; 
        }

        // Apply drag
        this.velocity.multiplyScalar(this.drag);

        // Update position
        this.position.add(this.velocity.clone().multiplyScalar(dt));

        // Sync camera
        this.camera.position.copy(this.position);
        
        const lookTarget = this.position.clone().add(direction);
        this.camera.lookAt(lookTarget);

        // Apply roll during turns
        const targetRoll = (this.inputs.left ? 0.3 : 0) + (this.inputs.right ? -0.3 : 0);
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, targetRoll, 0.1);
    }
}
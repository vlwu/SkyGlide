import * as THREE from 'three';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        // State
        // Initialize position in safe zone
        this.position = new THREE.Vector3(0, 15, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Orientation (radians)
        this.pitch = 0;
        this.yaw = Math.PI; 
        
        // Roll mechanics
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
        // Mouse input listener
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    handleMouseMove(e) {
        if (document.pointerLockElement !== document.body) return;

        // Pitch control
        this.pitch -= e.movementY * this.sensitivity;
        
        // Yaw control
        this.yaw -= e.movementX * this.sensitivity;

        // Calculate roll target from mouse velocity
        this.targetRoll = -e.movementX * 0.1; 
        
        // Clamp pitch
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }

    update(dt) {
        // Compute direction
        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // Physics
        
        // Apply gravity
        this.velocity.y -= this.gravity * dt;

        // Dive acceleration
        if (this.pitch < 0) {
            const diveForce = -this.pitch * this.glideRatio * dt * 10;
            this.velocity.add(direction.clone().multiplyScalar(diveForce));
        }

        // Lift generation
        const speed = this.velocity.length();
        const lift = speed * speed * this.liftFactor * dt;
        
        // Apply lift unless diving steep
        if (this.pitch > -0.5) {
             this.velocity.y += lift; 
        }

        // Apply drag
        this.velocity.multiplyScalar(this.drag);

        // Integration
        const moveStep = this.velocity.clone().multiplyScalar(dt);
        const nextPos = this.position.clone().add(moveStep);

        // Collision detection
        if (this.world.getBlock(Math.round(nextPos.x), Math.round(nextPos.y), Math.round(nextPos.z))) {
            // Halt on collision
            this.velocity.set(0, 0, 0);
            console.log("CRASH!");
        } else {
            this.position.copy(nextPos);
        }

        // Camera synchronization
        this.camera.position.copy(this.position);
        
        const lookTarget = this.position.clone().add(direction);
        this.camera.lookAt(lookTarget);

        // Interpolate roll
        this.targetRoll = THREE.MathUtils.lerp(this.targetRoll, 0, 5 * dt);
        this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, 5 * dt);

        this.camera.rotation.z = this.roll;
    }
}
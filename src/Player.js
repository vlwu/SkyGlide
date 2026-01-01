import * as THREE from 'three';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Position & Velocity
        this.position = new THREE.Vector3(0, 30, 0); // Start high
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Rotation (Euler angles in radians)
        this.pitch = 0; // Up/Down
        this.yaw = 0;   // Left/Right
        this.roll = 0;  // Banking effect

        // Physics Constants (The "Feel" of the game)
        this.gravity = 9.8;
        this.glideRatio = 1.5;   // How much forward speed we get from diving
        this.drag = 0.99;        // Air resistance (1.0 = no drag)
        this.liftFactor = 0.02;  // How easy it is to pull up
        this.turnSpeed = 2.0;
        
        // Input State
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
        // 1. INPUT: Change Pitch (Up/Down) and Yaw (Left/Right)
        if (this.inputs.up) this.pitch += this.turnSpeed * dt;
        if (this.inputs.down) this.pitch -= this.turnSpeed * dt;
        if (this.inputs.left) this.yaw += this.turnSpeed * dt;
        if (this.inputs.right) this.yaw -= this.turnSpeed * dt;

        // Clamp Pitch (Prevent doing loops for now, keep it simple)
        // Limit to looking straight up (+1.5) or straight down (-1.5)
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

        // 2. PHYSICS: Calculate Direction Vector from Angles
        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // 3. APPLY FORCES
        
        // Gravity (Always Down Y)
        this.velocity.y -= this.gravity * dt;

        // Gliding Mechanic:
        // If we are looking down (negative pitch), add speed
        if (this.pitch < 0) {
            const diveForce = -this.pitch * this.glideRatio * dt * 10;
            // Add force in the direction we are facing
            this.velocity.add(direction.clone().multiplyScalar(diveForce));
        }

        // Lift Mechanic:
        // If we are moving fast, counteract gravity slightly
        const speed = this.velocity.length();
        const lift = speed * speed * this.liftFactor * dt;
        // Only apply lift if we aren't diving straight down
        if (this.pitch > -0.5) {
             this.velocity.y += lift; 
        }

        // Drag (Air Resistance)
        this.velocity.multiplyScalar(this.drag);

        // 4. MOVE PLAYER
        this.position.add(this.velocity.clone().multiplyScalar(dt));

        // 5. SYNC CAMERA
        this.camera.position.copy(this.position);
        
        // Calculate where to look (position + direction)
        const lookTarget = this.position.clone().add(direction);
        this.camera.lookAt(lookTarget);

        // Add "Roll" when turning for immersion
        // We manually rotate the camera Z axis based on Yaw input
        const targetRoll = (this.inputs.left ? 0.3 : 0) + (this.inputs.right ? -0.3 : 0);
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, targetRoll, 0.1);
    }
}
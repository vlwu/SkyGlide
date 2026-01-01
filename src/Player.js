import * as THREE from 'three';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        // State Machine: WALKING, FALLING, FLYING
        this.state = 'WALKING';

        // Physics vectors
        this.position = new THREE.Vector3(0, 16, 0); // Start slightly above platform
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Orientation (radians)
        this.pitch = 0; // X axis rotation (Up/Down)
        this.yaw = Math.PI; // Y axis rotation (Left/Right) - Face -Z start

        // Input State
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };

        // Constants
        this.dims = { height: 1.8, radius: 0.3 };
        
        this.initInput();
    }

    initInput() {
        // Mouse Look
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;
            const sensitivity = 0.002;
            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            // Clamp pitch straight up/down
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });

        // Keyboard
        const setKey = (code, pressed) => {
            switch(code) {
                case 'KeyW': this.keys.forward = pressed; break;
                case 'KeyS': this.keys.backward = pressed; break;
                case 'KeyA': this.keys.left = pressed; break;
                case 'KeyD': this.keys.right = pressed; break;
                case 'Space': this.keys.jump = pressed; break;
            }
        };

        document.addEventListener('keydown', (e) => setKey(e.code, true));
        document.addEventListener('keyup', (e) => setKey(e.code, false));
    }

    update(dt) {
        // 1. Process Logic based on State
        switch(this.state) {
            case 'WALKING':
                this.handleWalking(dt);
                break;
            case 'FALLING':
                this.handleFalling(dt);
                break;
            case 'FLYING':
                this.handleFlying(dt);
                break;
        }

        // 2. Integration
        this.position.add(this.velocity.clone().multiplyScalar(dt));

        // 3. Collision Resolution (Simple)
        this.resolveCollision();

        // 4. Update Camera
        this.camera.position.copy(this.position);
        // Eye level offset
        if (this.state === 'WALKING') this.camera.position.y += 1.6; 
        
        // Look direction
        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );
        const lookTarget = this.camera.position.clone().add(lookDir);
        this.camera.lookAt(lookTarget);
    }

    handleWalking(dt) {
        const speed = 10;
        const friction = 10;
        const jumpForce = 8;
        const gravity = 20;

        // Apply friction
        this.velocity.x -= this.velocity.x * friction * dt;
        this.velocity.z -= this.velocity.z * friction * dt;

        // Input Vector
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        const right = new THREE.Vector3(Math.sin(this.yaw - Math.PI/2), 0, Math.cos(this.yaw - Math.PI/2)).normalize();
        
        const inputDir = new THREE.Vector3(0,0,0);
        if (this.keys.forward) inputDir.add(forward);
        if (this.keys.backward) inputDir.sub(forward);
        if (this.keys.right) inputDir.sub(right); // WASD standard
        if (this.keys.left) inputDir.add(right);

        if (inputDir.length() > 0) inputDir.normalize();

        // Accelerate
        this.velocity.add(inputDir.multiplyScalar(speed * friction * dt));

        // Gravity
        this.velocity.y -= gravity * dt;

        // Jump
        if (this.keys.jump && this.onGround) {
            this.velocity.y = jumpForce;
            this.onGround = false;
        }

        // Check for falling
        if (this.velocity.y < -0.1 && !this.onGround) {
            this.state = 'FALLING';
        }
    }

    handleFalling(dt) {
        const gravity = 20;
        this.velocity.y -= gravity * dt;

        // Air control (minimal)
        const airSpeed = 2;
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        
        if (this.keys.forward) this.velocity.add(forward.multiplyScalar(airSpeed * dt));

        // Activate Elytra
        if (this.keys.jump && !this.onGround) {
            // Need debouncing or check if pressed fresh? 
            // For now, simple transition: if falling and space held/pressed.
            this.state = 'FLYING';
            // Slight boost to forward momentum to start glide
            const lookDir = new THREE.Vector3(
                Math.sin(this.yaw) * Math.cos(this.pitch),
                Math.sin(this.pitch),
                Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this.velocity.add(lookDir.multiplyScalar(10));
        }
    }

    handleFlying(dt) {
        // Minecraft Elytra Physics Model
        
        // Direction vectors
        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();

        const horizontalSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
        
        // 1. Gravity (Weaker than normal falling)
        // Minecraft uses ~0.08/tick. We scale for dt.
        this.velocity.y -= 5.0 * dt; 

        // 2. Pitch-based Lift & Drag calculations
        // Pitch in MC: 0=Horizon, +90=Down, -90=Up.
        // Here: pitch > 0 is Up, pitch < 0 is Down (Three.js standard).
        // Let's invert pitch for calculation to match logic:
        // angleOfAttack: 0 = horizon. + = Down. - = Up.
        const angleOfAttack = -this.pitch; 

        const cosPitch = Math.cos(angleOfAttack);
        const cosPitchSq = cosPitch * cosPitch;

        // 3. Lift (Convert horizontal speed to vertical)
        // Only if not stalling (stalling happens if looking too far up)
        if (cosPitchSq > 0) {
            const lift = horizontalSpeed * horizontalSpeed * 0.05 * cosPitchSq * dt;
            // Apply lift upward
            this.velocity.y += lift;
        }

        // 4. Dive Acceleration (Convert Potential to Kinetic)
        // If looking down (angleOfAttack > 0), add speed
        if (angleOfAttack > 0) {
            const diveForce = angleOfAttack * 20 * dt;
            this.velocity.add(lookDir.clone().multiplyScalar(diveForce));
        }

        // 5. Drag
        const dragCoeff = 0.99 ** (dt * 60); // Scale 0.99/tick to dt
        this.velocity.x *= dragCoeff;
        this.velocity.z *= dragCoeff;
        this.velocity.y *= 0.98 ** (dt * 60); // Vertical drag slightly higher

        // 6. Minimum Glide (Prevent hover)
        // If vertical velocity is positive (going up), drag it down faster
        if (this.velocity.y > 0) {
             this.velocity.y -= 2.0 * dt;
        }
    }

    resolveCollision() {
        // Reset ground flag
        this.onGround = false;

        // Check feet position
        const feetX = Math.round(this.position.x);
        const feetY = Math.round(this.position.y - 1.5); // Check below feet
        const feetZ = Math.round(this.position.z);

        // Ground collision
        if (this.world.getBlock(feetX, feetY, feetZ)) {
            // If moving down, land
            if (this.velocity.y < 0) {
                // Snap to block top
                this.position.y = feetY + 1.5; 
                this.velocity.y = 0;
                this.onGround = true;
                this.state = 'WALKING';
            }
        }

        // Horizontal collision (Wall smack)
        // Check head level for forward collision
        const headX = Math.round(this.position.x + this.velocity.x * 0.1);
        const headZ = Math.round(this.position.z + this.velocity.z * 0.1);
        const currY = Math.round(this.position.y);

        if (this.world.getBlock(headX, currY, headZ)) {
            // Simple stop
            this.velocity.x = 0;
            this.velocity.z = 0;
            
            // If flying fast, this is where damage would happen
            if (this.state === 'FLYING') {
                this.state = 'FALLING'; // Drop out of flight
            }
        }
    }
}
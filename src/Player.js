import * as THREE from 'three';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        // State Machine: WALKING, FALLING, FLYING
        this.state = 'WALKING';

        // Physics vectors
        this.position = new THREE.Vector3(0, 16, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Orientation
        this.pitch = 0; 
        this.yaw = Math.PI; 

        // Camera smoothing
        this.currentEyeHeight = 1.6;
        this.targetEyeHeight = 1.6;

        // Input State
        this.keys = {
            forward: false, backward: false,
            left: false, right: false,
            jump: false
        };
        // Track the frame the key was pressed
        this.jumpPressedThisFrame = false; 

        this.dims = { height: 1.8, radius: 0.3 };
        this.onGround = false;
        
        this.initInput();
    }

    initInput() {
        // Mouse Look
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;
            const sensitivity = 0.002;
            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });

        // Keyboard
        const setKey = (code, pressed) => {
            switch(code) {
                case 'KeyW': this.keys.forward = pressed; break;
                case 'KeyS': this.keys.backward = pressed; break;
                case 'KeyA': this.keys.left = pressed; break;
                case 'KeyD': this.keys.right = pressed; break;
                case 'Space': 
                    if (pressed && !this.keys.jump) {
                        this.jumpPressedThisFrame = true;
                    }
                    this.keys.jump = pressed; 
                    break;
            }
        };

        document.addEventListener('keydown', (e) => setKey(e.code, true));
        document.addEventListener('keyup', (e) => setKey(e.code, false));
    }

    update(dt) {
        // 0. Explicit Ground Check
        this.checkGrounded();

        // 1. Process Logic based on State
        switch(this.state) {
            case 'WALKING': this.handleWalking(dt); break;
            case 'FALLING': this.handleFalling(dt); break;
            case 'FLYING': this.handleFlying(dt); break;
        }

        // Reset one-shot input
        this.jumpPressedThisFrame = false;

        // 2. Physics & Collision
        this.resolvePhysics(dt);

        // 3. Update Camera with Smooth Transition
        this.updateCamera(dt);
    }

    updateCamera(dt) {
        // Determine target height based on state
        if (this.state === 'WALKING' || this.state === 'FALLING') {
            this.targetEyeHeight = 1.6;
        } else if (this.state === 'FLYING') {
            this.targetEyeHeight = 0.4; // Lower eye level when horizontal
        }

        // Smoothly interpolate current height to target
        const lerpSpeed = 5.0;
        this.currentEyeHeight += (this.targetEyeHeight - this.currentEyeHeight) * lerpSpeed * dt;

        this.camera.position.copy(this.position);
        this.camera.position.y += this.currentEyeHeight;

        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );
        this.camera.lookAt(this.camera.position.clone().add(lookDir));
    }

    checkGrounded() {
        // Check slightly below feet
        const checkY = this.position.y - 0.05;
        // Check area below feet for ground status (using same radius as physics)
        const feetPoint = new THREE.Vector3(this.position.x, checkY, this.position.z);
        
        if (this.velocity.y <= 0 && this.checkPoints([feetPoint])) {
            this.onGround = true;
            if (this.state === 'FALLING') this.state = 'WALKING';
        } else {
            this.onGround = false;
        }
    }

    handleWalking(dt) {
        const speed = 10;
        const friction = 10;
        const jumpForce = 11;
        const gravity = 25;

        // Apply friction
        this.velocity.x -= this.velocity.x * friction * dt;
        this.velocity.z -= this.velocity.z * friction * dt;

        // Input
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        const right = new THREE.Vector3(Math.sin(this.yaw - Math.PI/2), 0, Math.cos(this.yaw - Math.PI/2)).normalize();
        
        const inputDir = new THREE.Vector3(0,0,0);
        if (this.keys.forward) inputDir.add(forward);
        if (this.keys.backward) inputDir.sub(forward);
        if (this.keys.right) inputDir.add(right);
        if (this.keys.left) inputDir.sub(right);

        if (inputDir.length() > 0) inputDir.normalize();

        this.velocity.add(inputDir.multiplyScalar(speed * friction * dt));

        // Jitter Fix: Stop gravity if strictly on ground and not jumping
        if (this.onGround) {
            this.velocity.y = 0;
            
            // Jump Logic: Only if on ground
            if (this.jumpPressedThisFrame) {
                this.velocity.y = jumpForce;
                this.onGround = false;
                this.position.y += 0.1; // Lift slightly to break ground contact
                this.state = 'FALLING'; // Immediate state switch
            }
        } else {
            // Apply gravity if we walked off a ledge
            this.velocity.y -= gravity * dt;
            // Switch to falling if moving down fast enough
            if (this.velocity.y < -1.0) this.state = 'FALLING';
        }
    }

    handleFalling(dt) {
        const gravity = 25;
        this.velocity.y -= gravity * dt;

        // Air control
        const airSpeed = 5;
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        if (this.keys.forward) this.velocity.add(forward.multiplyScalar(airSpeed * dt));

        // Flight Activation: Only if Jump key pressed THIS frame while in air
        if (this.jumpPressedThisFrame && !this.onGround) {
            this.state = 'FLYING';
            // Boost forward
            const lookDir = new THREE.Vector3(
                Math.sin(this.yaw) * Math.cos(this.pitch),
                Math.sin(this.pitch),
                Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this.velocity.add(lookDir.multiplyScalar(15));
            this.velocity.y = Math.max(this.velocity.y, 2); // Small vertical bump
        }
    }

    handleFlying(dt) {
        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        const speed = this.velocity.length();
        
        this.velocity.y -= 5.0 * dt; 

        const angleOfAttack = -this.pitch; 
        const cosPitch = Math.cos(angleOfAttack);
        
        if (cosPitch > 0) {
            const lift = speed * speed * 0.05 * (cosPitch * cosPitch) * dt;
            this.velocity.y += lift;
        }

        if (angleOfAttack > 0) {
            const diveForce = angleOfAttack * 30 * dt;
            this.velocity.add(lookDir.clone().multiplyScalar(diveForce));
        }

        this.velocity.multiplyScalar(0.995 ** (dt * 60));

        if (speed < 5) this.state = 'FALLING';
    }

    resolvePhysics(dt) {
        // X Axis
        let nextPos = this.position.clone();
        nextPos.x += this.velocity.x * dt;
        if (this.checkCollisionBody(nextPos)) {
            this.velocity.x = 0;
            if (this.state === 'FLYING') this.crash();
        } else {
            this.position.x = nextPos.x;
        }

        // Z Axis
        nextPos = this.position.clone();
        nextPos.z += this.velocity.z * dt;
        if (this.checkCollisionBody(nextPos)) {
            this.velocity.z = 0;
            if (this.state === 'FLYING') this.crash();
        } else {
            this.position.z = nextPos.z;
        }

        // Y Axis
        nextPos = this.position.clone();
        nextPos.y += this.velocity.y * dt;
        
        // Only check Y collision if actually moving vertically
        if (Math.abs(this.velocity.y) > 0.001) {
            if (this.checkCollisionBody(nextPos)) {
                if (this.velocity.y < 0) {
                    // Landing
                    // Snap to top of the block hit.
                    // Block is at floor(feet_y). Top is floor(feet_y) + 1.
                    this.position.y = Math.floor(nextPos.y + 0.1) + 1; 
                    this.velocity.y = 0;
                    this.onGround = true;
                    if(this.state === 'FLYING' || this.state === 'FALLING') this.state = 'WALKING';
                } else {
                    // Ceiling
                    this.position.y = Math.floor(nextPos.y) - 0.2; 
                    this.velocity.y = 0;
                }
            } else {
                this.position.y = nextPos.y;
            }
        }
    }

    checkCollisionBody(pos) {
        const points = [
            pos.clone().setY(pos.y + 0.1),
            pos.clone().setY(pos.y + this.dims.height * 0.5),
            pos.clone().setY(pos.y + this.dims.height - 0.1)
        ];
        return this.checkPoints(points);
    }

    checkIntersection(pos) {
        return this.world.getBlock(pos.x, pos.y, pos.z);
    }

    checkPoints(points) {
        const r = this.dims.radius;
        const offsets = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(r, 0, 0), new THREE.Vector3(-r, 0, 0),
            new THREE.Vector3(0, 0, r), new THREE.Vector3(0, 0, -r)
        ];

        for (let p of points) {
            for (let off of offsets) {
                const checkPos = p.clone().add(off);
                if (this.world.getBlock(checkPos.x, checkPos.y, checkPos.z)) {
                    return true;
                }
            }
        }
        return false;
    }

    crash() {
        this.state = 'FALLING';
        this.velocity.multiplyScalar(0.2);
    }
}
import * as THREE from 'three';
import { settingsManager } from './settings/SettingsManager.js';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        this.state = 'WALKING';

        this.position = new THREE.Vector3(0, 16, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        this.pitch = 0; 
        this.yaw = Math.PI; 
        
        // For physics & camera roll calculation
        this.lastYaw = this.yaw;
        this.roll = 0;

        this.currentEyeHeight = 1.6;
        this.targetEyeHeight = 1.6;

        this.keys = {
            forward: false, backward: false,
            left: false, right: false,
            jump: false
        };
        this.jumpPressedThisFrame = false; 

        this.dims = { height: 1.8, radius: 0.3 };
        this.onGround = false;
        
        // REUSABLE VECTORS FOR PHYSICS (GC Optimization)
        this._lookDir = new THREE.Vector3();
        this._inputDir = new THREE.Vector3();
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._nextPos = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        this._checkOffsets = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(this.dims.radius, 0, 0), 
            new THREE.Vector3(-this.dims.radius, 0, 0),
            new THREE.Vector3(0, 0, this.dims.radius), 
            new THREE.Vector3(0, 0, -this.dims.radius)
        ];

        this.initInput();
    }

    initInput() {
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;
            const sensitivity = 0.002;
            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });

        const updateKey = (code, pressed) => {
            const keys = settingsManager.settings.keys;
            if (code === keys.forward) this.keys.forward = pressed;
            if (code === keys.backward) this.keys.backward = pressed;
            if (code === keys.left) this.keys.left = pressed;
            if (code === keys.right) this.keys.right = pressed;
            if (code === keys.jump) {
                if (pressed && !this.keys.jump) {
                    this.jumpPressedThisFrame = true;
                }
                this.keys.jump = pressed;
            }
        };

        document.addEventListener('keydown', (e) => updateKey(e.code, true));
        document.addEventListener('keyup', (e) => updateKey(e.code, false));
    }

    update(dt) {
        this.checkGrounded();

        switch(this.state) {
            case 'WALKING': this.handleWalking(dt); break;
            case 'FALLING': this.handleFalling(dt); break;
            case 'FLYING': this.handleFlying(dt); break;
        }

        this.jumpPressedThisFrame = false;
        this.resolvePhysics(dt);
        this.updateCamera(dt);
        
        this.lastYaw = this.yaw;
    }
    
    updateCamera(dt) {
        if (this.state === 'WALKING' || this.state === 'FALLING') {
            this.targetEyeHeight = 1.6;
        } else if (this.state === 'FLYING') {
            this.targetEyeHeight = 0.4;
        }

        // Smooth eye height transition
        const lerpSpeed = 5.0;
        this.currentEyeHeight += (this.targetEyeHeight - this.currentEyeHeight) * lerpSpeed * dt;

        this.camera.position.copy(this.position);
        this.camera.position.y += this.currentEyeHeight;

        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );
        
        const target = this.camera.position.clone().add(this._lookDir);
        this.camera.lookAt(target);

        // --- Camera Tilt (Banking) Logic ---
        // Calculate turn rate (yaw velocity)
        // We handle wrapping loosely here, assuming normal mouse movement doesn't snap 360 degrees in one frame
        const yawDelta = this.yaw - this.lastYaw;
        const yawVelocity = yawDelta / dt;

        // Target roll based on turn rate. 
        // Negative coefficient because turning Left (positive yaw change) should bank Left (positive Roll in Z-back view? No, CCW).
        // Let's tune: Turning Left (Yaw increases) -> Should Roll Left (Z rotation increases/decreases?)
        // In Three.js camera looking -Z (default) or arbitrary... 
        // Usually: Turn Left -> Bank Left.
        const bankAmount = -yawVelocity * 0.1; 
        
        // Limit to 45 degrees (0.78 radians)
        const maxTilt = 0.78; 
        let targetRoll = Math.max(-maxTilt, Math.min(maxTilt, bankAmount));
        
        // If walking, force upright
        if (this.state !== 'FLYING') targetRoll = 0;

        // Smoothly interpolate roll
        this.roll += (targetRoll - this.roll) * 10.0 * dt;

        // Apply roll in local space
        if (Math.abs(this.roll) > 0.001) {
            const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
            this.camera.quaternion.multiply(rollQ);
        }
    }

    checkGrounded() {
        const feetY = this.position.y - 0.05;
        this._tempVec.set(this.position.x, feetY, this.position.z);
        if (this.velocity.y <= 0 && this.checkPoints([this._tempVec])) {
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

        this.velocity.x -= this.velocity.x * friction * dt;
        this.velocity.z -= this.velocity.z * friction * dt;

        this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        this._right.set(Math.sin(this.yaw - Math.PI/2), 0, Math.cos(this.yaw - Math.PI/2)).normalize();
        
        this._inputDir.set(0,0,0);
        if (this.keys.forward) this._inputDir.add(this._forward);
        if (this.keys.backward) this._inputDir.sub(this._forward);
        if (this.keys.right) this._inputDir.add(this._right);
        if (this.keys.left) this._inputDir.sub(this._right);

        if (this._inputDir.lengthSq() > 0) this._inputDir.normalize();

        this.velocity.add(this._inputDir.multiplyScalar(speed * friction * dt));

        if (this.onGround) {
            this.velocity.y = 0;
            if (this.jumpPressedThisFrame) {
                this.velocity.y = jumpForce;
                this.onGround = false;
                this.position.y += 0.1; 
                this.state = 'FALLING'; 
            }
        } else {
            this.velocity.y -= gravity * dt;
            if (this.velocity.y < -1.0) this.state = 'FALLING';
        }
    }

    handleFalling(dt) {
        const gravity = 25;
        this.velocity.y -= gravity * dt;

        const airSpeed = 5;
        this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
        if (this.keys.forward) this.velocity.add(this._forward.multiplyScalar(airSpeed * dt));

        if (this.jumpPressedThisFrame && !this.onGround) {
            this.state = 'FLYING';
            // Boost initial speed if just starting to glide
            const speed = this.velocity.length();
            if (speed < 15) {
                this._lookDir.set(
                    Math.sin(this.yaw) * Math.cos(this.pitch),
                    Math.sin(this.pitch),
                    Math.cos(this.yaw) * Math.cos(this.pitch)
                );
                this.velocity.add(this._lookDir.multiplyScalar(15 - speed));
            }
        }
    }

    handleFlying(dt) {
        // Break long frames into smaller physics steps for stability
        // Minecraft runs at 20 ticks/sec (0.05s per tick)
        const stepSize = 0.05;
        let remaining = dt;
        
        while (remaining > 0) {
            const currentDt = Math.min(remaining, stepSize);
            this.simulateElytraPhysics(currentDt);
            remaining -= currentDt;
        }

        // If speed drops too low, stall
        if (this.velocity.length() < 1.0) {
            this.state = 'FALLING';
        }
    }

    simulateElytraPhysics(dt) {
        // Calculate Look Vector
        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        
        const look = this._lookDir;
        const hlook = Math.sqrt(look.x * look.x + look.z * look.z); // ~ cos(pitch)
        const sqrpitchcos = hlook * hlook;

        // Constants derived from Minecraft source logic scaled to SI units (approximate)
        // MC Gravity ~ 0.08 blocks/tick^2 -> ~ 32 m/s^2
        const GRAVITY = 32.0;
        const LIFT_COEFF = 24.0; 
        const DIVE_ACCEL = 2.0; 
        const CLIMB_BOOST = 0.8;
        const STEER_SPEED = 2.0;

        // 1. Gravity and Lift
        // velY += -0.08 + sqrpitchcos * 0.06 (MC)
        const lift = sqrpitchcos * LIFT_COEFF;
        this.velocity.y += (-GRAVITY + lift) * dt;

        // 2. Drag (Air Resistance)
        // MC: 0.99 (xz) and 0.98 (y) per tick
        // To make this framerate independent: Math.pow(rate, dt * 20)
        const ticks = dt * 20;
        const dragXZ = Math.pow(0.99, ticks);
        const dragY = Math.pow(0.98, ticks);

        this.velocity.x *= dragXZ;
        this.velocity.y *= dragY;
        this.velocity.z *= dragXZ;

        // 3. Dive Acceleration (Converting potential energy to kinetic)
        // if (velY < 0 && hlook > 0)
        if (this.velocity.y < 0 && hlook > 0) {
            const diveForce = this.velocity.y * -DIVE_ACCEL * sqrpitchcos * dt;
            this.velocity.y += diveForce;
            this.velocity.x += (look.x / hlook) * diveForce;
            this.velocity.z += (look.z / hlook) * diveForce;
        }

        // 4. Climb Boost (Converting kinetic energy to potential)
        // MC: if (pitch < 0) -> Looking Up
        // My pitch > 0 is Looking Up.
        if (this.pitch > 0) {
            const hvel = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
            // Factor: hvel * sin(pitch) * 0.04 (MC)
            const climbForce = hvel * Math.sin(this.pitch) * CLIMB_BOOST * dt;
            
            this.velocity.y += climbForce * 3.5; // Climb is easier than dive
            this.velocity.x -= (look.x / hlook) * climbForce;
            this.velocity.z -= (look.z / hlook) * climbForce;
        }

        // 5. Steering (Redirecting velocity to look direction)
        if (hlook > 0) {
            const hvel = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
            const targetX = (look.x / hlook) * hvel;
            const targetZ = (look.z / hlook) * hvel;

            this.velocity.x += (targetX - this.velocity.x) * STEER_SPEED * dt;
            this.velocity.z += (targetZ - this.velocity.z) * STEER_SPEED * dt;
        }
    }

    resolvePhysics(dt) {
        this._nextPos.copy(this.position);
        this._nextPos.x += this.velocity.x * dt;
        if (this.checkCollisionBody(this._nextPos)) {
            this.velocity.x = 0;
            if (this.state === 'FLYING') this.crash();
        } else {
            this.position.x = this._nextPos.x;
        }

        this._nextPos.copy(this.position);
        this._nextPos.z += this.velocity.z * dt;
        if (this.checkCollisionBody(this._nextPos)) {
            this.velocity.z = 0;
            if (this.state === 'FLYING') this.crash();
        } else {
            this.position.z = this._nextPos.z;
        }

        this._nextPos.copy(this.position);
        this._nextPos.y += this.velocity.y * dt;
        
        if (Math.abs(this.velocity.y) > 0.001) {
            if (this.checkCollisionBody(this._nextPos)) {
                if (this.velocity.y < 0) {
                    this.position.y = Math.floor(this._nextPos.y + 0.1) + 1; 
                    this.velocity.y = 0;
                    this.onGround = true;
                    if(this.state === 'FLYING' || this.state === 'FALLING') this.state = 'WALKING';
                } else {
                    this.position.y = Math.floor(this._nextPos.y) - 0.2; 
                    this.velocity.y = 0;
                }
            } else {
                this.position.y = this._nextPos.y;
            }
        }
    }

    checkCollisionBody(pos) {
        this._tempVec.copy(pos).setY(pos.y + 0.1);
        if(this.checkPoint(this._tempVec)) return true;
        this._tempVec.copy(pos).setY(pos.y + this.dims.height * 0.5);
        if(this.checkPoint(this._tempVec)) return true;
        this._tempVec.copy(pos).setY(pos.y + this.dims.height - 0.1);
        if(this.checkPoint(this._tempVec)) return true;
        return false;
    }

    checkPoint(p) {
        for (let off of this._checkOffsets) {
            const cx = p.x + off.x;
            const cy = p.y + off.y;
            const cz = p.z + off.z;
            if (this.world.getBlock(cx, cy, cz)) {
                return true;
            }
        }
        return false;
    }

    checkPoints(points) {
        for (let p of points) {
            if (this.checkPoint(p)) return true;
        }
        return false;
    }

    crash() {
        this.state = 'FALLING';
        this.velocity.multiplyScalar(0.2);
    }
}
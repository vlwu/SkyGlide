import * as THREE from 'three';
import { settingsManager } from './settings/SettingsManager.js';

// Duplicate block IDs locally to avoid circular imports or complex file structures
const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7
};

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;

        this.baseFOV = camera.fov;
        this.targetFOV = this.baseFOV;

        this.state = 'WALKING';

        this.position = new THREE.Vector3(0, 16, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        this.pitch = 0; 
        this.yaw = Math.PI; 
        
        this.keys = {
            forward: false, backward: false,
            left: false, right: false,
            jump: false,
            reset: false
        };
        this.jumpPressedThisFrame = false; 
        this.resetPressedThisFrame = false;

        this.dims = { height: 1.8, radius: 0.4 }; 
        this.onGround = false;
        this.groundBlock = BLOCK.AIR; // Track what we are standing on
        
        // REUSABLE VECTORS
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

        // --- Visual Representation ---
        const geometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x88ccff,        
            metalness: 0.0,
            roughness: 0.15,        
            transmission: 1.0,      
            thickness: 1.5,         
            ior: 1.5,               
            opacity: 1.0,
            transparent: false      
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        this.initInput();
    }

    initInput() {
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;

            if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;

            const baseSensitivity = 0.002;
            const userSensitivity = settingsManager.get('sensitivity');
            const sensitivity = baseSensitivity * userSensitivity;

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
            if (code === keys.reset) {
                if (pressed && !this.keys.reset) {
                    this.resetPressedThisFrame = true;
                }
                this.keys.reset = pressed;
            }
        };

        document.addEventListener('keydown', (e) => updateKey(e.code, true));
        document.addEventListener('keyup', (e) => updateKey(e.code, false));
    }

    reset() {
        this.position.set(0, 16, 0);
        this.velocity.set(0, 0, 0);
        this.pitch = 0;
        this.yaw = Math.PI;
        this.state = 'WALKING';
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
        this.onGround = false;
        this.groundBlock = BLOCK.AIR;
        this.keys.reset = false;
        this.resetPressedThisFrame = false;
    }

    // Helper for main loop to check if reset was requested
    consumeResetInput() {
        if (this.resetPressedThisFrame) {
            this.resetPressedThisFrame = false;
            return true;
        }
        return false;
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
    }

    updateCamera(dt) {
        const centerPos = this.position.clone();
        centerPos.y += this.dims.height / 2;
        
        this.mesh.position.copy(centerPos);

        // Rotate Mesh
        this.mesh.rotation.order = 'YXZ';
        this.mesh.rotation.y = this.yaw;

        if (this.state === 'FLYING') {
            this.mesh.rotation.x = this.pitch - (Math.PI / 2);
        } else {
            this.mesh.rotation.x = 0;
        }

        // --- Dynamic FOV ---
        const speed = this.velocity.length();
        let desiredFOV = this.baseFOV;
        
        if (this.state === 'FLYING') {
            const t = Math.max(0, Math.min(1, (speed - 20) / 60));
            desiredFOV = this.baseFOV + (t * 45); 
        }

        this.camera.fov += (desiredFOV - this.camera.fov) * 5.0 * dt;
        this.camera.updateProjectionMatrix();

        // Calculate look vector
        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();

        const viewTarget = centerPos.clone().add(new THREE.Vector3(0, 0.5, 0));

        const baseDist = 6.0;
        const extraDist = (this.camera.fov - this.baseFOV) * 0.05; 
        const cameraDist = baseDist + extraDist;

        const idealPos = centerPos.clone()
            .sub(this._lookDir.clone().multiplyScalar(cameraDist));
        idealPos.y += 1.5;

        // Camera Collision Raycast
        const camDir = new THREE.Vector3().subVectors(idealPos, viewTarget);
        const maxDist = camDir.length();
        camDir.normalize();

        let actualDist = maxDist;
        const step = 0.2; 

        for (let d = 0; d <= maxDist; d += step) {
            this._tempVec.copy(viewTarget).addScaledVector(camDir, d);
            if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
                actualDist = Math.max(0.5, d - 0.2); 
                break;
            }
        }

        const finalPos = viewTarget.clone().addScaledVector(camDir, actualDist);
        this.camera.position.copy(finalPos);
        this.camera.lookAt(viewTarget);
    }

    applyBoost(speedIncrease) {
        if (this.state !== 'FLYING') {
            this.state = 'FLYING';
            this.position.y += 2.0;
        }

        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();

        this.velocity.add(this._lookDir.multiplyScalar(speedIncrease));
    }

    checkGrounded() {
        const feetY = this.position.y - 0.05;
        this._tempVec.set(this.position.x, feetY, this.position.z);
        
        // Find specifically what block we are on
        const blockBelow = this.getWorldBlock(this._tempVec);
        
        if (this.velocity.y <= 0 && blockBelow !== BLOCK.AIR) {
            this.onGround = true;
            this.groundBlock = blockBelow;
            if (this.state === 'FALLING') this.state = 'WALKING';
        } else {
            this.onGround = false;
            this.groundBlock = BLOCK.AIR;
        }
    }

    // Helper to check multiple points for collision but return boolean
    getWorldBlock(pos) {
        for (let off of this._checkOffsets) {
            const val = this.world.getBlock(pos.x + off.x, pos.y + off.y, pos.z + off.z);
            if (val) return val;
        }
        return 0;
    }

    handleWalking(dt) {
        // --- Physics Material Logic ---
        let friction = 10.0;
        let moveSpeed = 10.0;

        if (this.groundBlock === BLOCK.ICE) {
            friction = 0.5; // Slippery!
            moveSpeed = 15.0; // Can build up more speed
        } else if (this.groundBlock === BLOCK.SAND) {
            friction = 15.0; // Sluggish
            moveSpeed = 7.0;
        } else if (this.groundBlock === BLOCK.SNOW) {
            friction = 8.0;
            moveSpeed = 9.0;
        }

        const jumpForce = 11;
        const gravity = 25;

        // Apply Friction
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

        // Acceleration
        this.velocity.add(this._inputDir.multiplyScalar(moveSpeed * friction * dt));

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
        const stepSize = 0.05;
        let remaining = dt;
        
        while (remaining > 0) {
            const currentDt = Math.min(remaining, stepSize);
            this.simulateElytraPhysics(currentDt);
            remaining -= currentDt;
        }

        if (this.velocity.length() < 1.0) {
            this.state = 'FALLING';
        }
    }

    simulateElytraPhysics(dt) {
        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        
        const look = this._lookDir;
        const hlook = Math.sqrt(look.x * look.x + look.z * look.z); 
        const sqrpitchcos = hlook * hlook;

        const GRAVITY = 32.0;
        const LIFT_COEFF = 24.0; 
        const DIVE_ACCEL = 2.0; 
        const CLIMB_BOOST = 0.8;
        const STEER_SPEED = 2.0;

        // 1. Gravity and Lift
        const lift = sqrpitchcos * LIFT_COEFF;
        this.velocity.y += (-GRAVITY + lift) * dt;

        // 2. Drag
        const ticks = dt * 20;
        const dragXZ = Math.pow(0.99, ticks);
        const dragY = Math.pow(0.98, ticks);

        this.velocity.x *= dragXZ;
        this.velocity.y *= dragY;
        this.velocity.z *= dragXZ;

        // 3. Dive Acceleration
        if (this.velocity.y < 0 && hlook > 0) {
            const diveForce = this.velocity.y * -DIVE_ACCEL * sqrpitchcos * dt;
            this.velocity.y += diveForce;
            this.velocity.x += (look.x / hlook) * diveForce;
            this.velocity.z += (look.z / hlook) * diveForce;
        }

        // 4. Climb Boost
        if (this.pitch > 0) {
            const hvel = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
            const climbForce = hvel * Math.sin(this.pitch) * CLIMB_BOOST * dt;
            
            this.velocity.y += climbForce * 3.5;
            this.velocity.x -= (look.x / hlook) * climbForce;
            this.velocity.z -= (look.z / hlook) * climbForce;
        }

        // 5. Steering
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
                    this.onGround = true; // Will be verified by checkGrounded next frame
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

    crash() {
        this.state = 'FALLING';
        this.velocity.multiplyScalar(0.2);
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
    }
}
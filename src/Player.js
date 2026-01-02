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

    // ... [Rest of the file remains exactly the same as previous optimizations] ...
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
        if (this.state === 'WALKING' || this.state === 'FALLING') {
            this.targetEyeHeight = 1.6;
        } else if (this.state === 'FLYING') {
            this.targetEyeHeight = 0.4;
        }

        const lerpSpeed = 5.0;
        this.currentEyeHeight += (this.targetEyeHeight - this.currentEyeHeight) * lerpSpeed * dt;

        this.camera.position.copy(this.position);
        this.camera.position.y += this.currentEyeHeight;

        this._lookDir.set(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );
        this.camera.lookAt(this.camera.position.clone().add(this._lookDir));
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
            this._lookDir.set(
                Math.sin(this.yaw) * Math.cos(this.pitch),
                Math.sin(this.pitch),
                Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this.velocity.add(this._lookDir.multiplyScalar(15));
            this.velocity.y = Math.max(this.velocity.y, 2); 
        }
    }

    handleFlying(dt) {
        this._lookDir.set(
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
            this.velocity.add(this._lookDir.clone().multiplyScalar(diveForce));
        }
        const decay = Math.pow(0.995, dt * 60);
        this.velocity.multiplyScalar(decay);
        if (speed < 5) this.state = 'FALLING';
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
import * as THREE from 'three';
import { settingsManager } from './settings/SettingsManager.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { PlayerPhysics } from './player/PlayerPhysics.js';
import { WindManager } from './player/WindManager.js';
import { CONFIG } from './config/Config.js';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.world = world;
        this.cameraObj = camera; 

        // Components
        this.playerCamera = new PlayerCamera(camera, world);
        this.physics = new PlayerPhysics(world);
        this.windManager = new WindManager(scene);

        // State
        this.state = 'WALKING';
        this.position = new THREE.Vector3(0, 36, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Active Abilities State
        this.energy = CONFIG.PLAYER.MAX_ENERGY;
        this.isBoosting = false;
        this.isNearTerrain = false;
        
        this.pitch = 0; 
        this.yaw = Math.PI; 
        
        this.keys = {
            forward: false, backward: false,
            left: false, right: false,
            jump: false,
            reset: false,
            boost: false,
            brake: false
        };
        this.jumpPressedThisFrame = false; 
        this.resetPressedThisFrame = false;

        this.dims = { height: 1.8, radius: 0.4 }; 
        this.onGround = false;
        this.groundBlock = 0; 
        
        // --- Visual Representation ---
        this.mesh = new THREE.Group();
        
        // Materials
        const matBody = new THREE.MeshPhongMaterial({ 
            color: 0x00d2ff, 
            emissive: 0x002244,
            shininess: 30,
            flatShading: true 
        });
        const matWing = new THREE.MeshPhongMaterial({ 
            color: 0x0088bb, 
            emissive: 0x001133,
            shininess: 10,
            side: THREE.DoubleSide,
            flatShading: true 
        });

        // 1. Body
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.2, 1.0);
        this.bodyPart = new THREE.Mesh(bodyGeo, matBody);
        this.bodyPart.castShadow = true;
        this.bodyPart.receiveShadow = true;
        this.mesh.add(this.bodyPart);

        // 2. Left Wing Pivot
        this.leftWingPivot = new THREE.Group();
        this.leftWingPivot.position.set(-0.2, 0, 0);
        this.mesh.add(this.leftWingPivot);

        // OPTIMIZATION: Remove geometry translation, use mesh position
        const lWingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.6);
        this.leftWing = new THREE.Mesh(lWingGeo, matWing);
        this.leftWing.position.set(-0.7, 0, 0.1); // Applied here
        this.leftWing.castShadow = true;
        this.leftWing.receiveShadow = true;
        this.leftWingPivot.add(this.leftWing);

        // 3. Right Wing Pivot
        this.rightWingPivot = new THREE.Group();
        this.rightWingPivot.position.set(0.2, 0, 0);
        this.mesh.add(this.rightWingPivot);

        const rWingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.6);
        this.rightWing = new THREE.Mesh(rWingGeo, matWing);
        this.rightWing.position.set(0.7, 0, 0.1); // Applied here
        this.rightWing.castShadow = true;
        this.rightWing.receiveShadow = true;
        this.rightWingPivot.add(this.rightWing);

        this.scene.add(this.mesh);

        this._lastMouseTime = 0;
        this._mouseThrottle = 8; 

        this.initInput();
    }

    initInput() {
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;

            const now = performance.now();
            if (now - this._lastMouseTime < this._mouseThrottle) return;
            this._lastMouseTime = now;

            if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;

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
            if (code === keys.boost) this.keys.boost = pressed;
            if (code === keys.brake) this.keys.brake = pressed;
            
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
        this.position.set(0, 36, 0);
        this.velocity.set(0, 0, 0);
        this.pitch = 0;
        this.yaw = Math.PI;
        this.state = 'WALKING';
        this.onGround = false;
        this.groundBlock = 0;
        this.keys.reset = false;
        this.resetPressedThisFrame = false;
        
        // Reset Energy
        this.energy = CONFIG.PLAYER.MAX_ENERGY;
        this.isBoosting = false;
        this.isNearTerrain = false;
        
        this.playerCamera.reset();
        this.windManager.reset();
    }

    consumeResetInput() {
        if (this.resetPressedThisFrame) {
            this.resetPressedThisFrame = false;
            return true;
        }
        return false;
    }

    update(dt) {
        this.physics.update(dt, this);
        this.jumpPressedThisFrame = false;
        
        // Active Abilities Energy Logic
        if (this.state === 'FLYING') {
            // Drain energy if boosting
            if (this.isBoosting) {
                this.energy -= CONFIG.PHYSICS.BOOST.COST * dt;
                if (this.energy < 0) this.energy = 0;
            } 
            // Gain energy if near terrain (Proximity Risk/Reward)
            else if (this.isNearTerrain) {
                this.energy += CONFIG.PLAYER.ENERGY_GAIN.PROXIMITY * dt;
                if (this.energy > CONFIG.PLAYER.MAX_ENERGY) this.energy = CONFIG.PLAYER.MAX_ENERGY;
            }
        }
        
        this.playerCamera.update(dt, this);
        this.windManager.update(dt, this, this.cameraObj);
    }
    
    addEnergy(amount) {
        this.energy += amount;
        if (this.energy > CONFIG.PLAYER.MAX_ENERGY) this.energy = CONFIG.PLAYER.MAX_ENERGY;
    }

    applyBoost(amount) {
        if (this.state !== 'FLYING') {
            this.state = 'FLYING';
            this.position.y += 2.0;
        }

        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        
        // Apply immediate velocity from ring (scaled)
        // amount varies ~20 to 50
        const speedBoost = amount * 0.5; 

        this.velocity.add(lookDir.multiplyScalar(speedBoost));
        
        // Restore Energy
        this.addEnergy(CONFIG.PLAYER.ENERGY_GAIN.RING);
    }
}